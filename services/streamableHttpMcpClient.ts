

import { IMcpClient, ProxyConfig, MessageHandler, ErrorHandler, Unsubscribe } from './mcpClient';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InitializeResultSchema, InitializedNotificationSchema, ListToolsResultSchema, CallToolResultSchema, ListResourcesResultSchema, ListPromptsResultSchema, GetPromptResultSchema, ReadResourceResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { JsonRpcMessage } from '../types';
import { z } from 'zod';

/**
 * Custom Transport implementation for Streamable HTTP that uses fetch for both
 * GET (SSE) and POST operations, supporting custom headers and proxies.
 * 
 * This replaces the SDK's default StreamableHTTPClientTransport which defaults to
 * EventSource in browser environments.
 */
class CustomStreamableTransport implements Transport {
    private url: string;
    private headers: Record<string, string>;
    private abortController: AbortController | null = null;
    private messageLogger: MessageHandler;
    
    // Changed to public to match Transport interface requirements
    public sessionId?: string;

    public onclose?: () => void;
    public onerror?: (error: Error) => void;
    public onmessage?: (message: any) => void;

    constructor(url: string, headers: Record<string, string>, messageLogger: MessageHandler) {
        this.url = url;
        this.headers = headers;
        this.messageLogger = messageLogger;
    }

    async start(): Promise<void> {
        this.abortController = new AbortController();
        this.sessionId = undefined;
        
        try {
            // Attempt to open SSE stream via GET as per spec "Listening for Messages from the Server"
            const response = await fetch(this.url, {
                method: 'GET',
                headers: {
                    'Accept': 'text/event-stream',
                    ...this.headers
                },
                signal: this.abortController.signal
            });

            if (!response.ok) {
                // If 404 or 405, server might only support POST-based interaction.
                // We log but do not throw, allowing the connection to proceed to the POST phase.
                console.log(`GET SSE stream failed (${response.status}). Proceeding with POST-only mode.`);
                return;
            }

            // Capture session ID from GET response if present (some servers assign it on connection)
            const sessId = this.getMcpSessionId(response.headers);
            if (sessId) {
                this.sessionId = sessId;
            }

            const contentType = response.headers.get('content-type') || '';
            
            // Critical fix: If server returns JSON (e.g. status info) instead of a stream, 
            // we must not try to read it as an infinite SSE stream.
            if (!contentType.includes('text/event-stream')) {
                console.log(`GET endpoint returned '${contentType}', not 'text/event-stream'. Proceeding with POST-only mode.`);
                // Consume body to free resources if possible
                try { await response.text(); } catch {}
                return;
            }

            if (!response.body) {
                throw new Error('No response body received');
            }

            // Start reading the stream in the background
            this.readSseStream(response.body);
        } catch (e: any) {
            if (e.name !== 'AbortError') {
                 // Propagate error if start failed immediately
                 console.warn("Failed to establish GET background stream:", e);
                 // If it is a TypeError (Network Error/CORS), rethrow it so connection fails visibly.
                 // We only suppress http error statuses (handled by response.ok check above) or logic errors, 
                 // but basic fetch failures usually mean we can't talk to the server at all.
                 if (e instanceof TypeError) {
                     throw e;
                 }
            }
        }
    }

    getMcpSessionId(responseHeaders: Headers): string | undefined {
        // 遍历所有响应头
        for (const [key, value] of responseHeaders.entries()) {
            if (key.toLowerCase() === 'mcp-session-id') {
                this.sessionId = value;
                console.log('[HTTP] Session ID captured:', value);
                return value;
            }
        }
        return undefined;
    }

    async send(message: any): Promise<void> {
        this.messageLogger(message); // Log outgoing message
        
        const reqHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            // Spec requires Accept header for both JSON and SSE
            'Accept': 'application/json, text/event-stream',
            ...this.headers
        };

        if (this.sessionId) {
            reqHeaders['Mcp-Session-Id'] = this.sessionId;
        }

        try {
            const response = await fetch(this.url, {
                method: 'POST',
                headers: reqHeaders,
                body: JSON.stringify(message),
                signal: this.abortController?.signal
            });

            // Capture Session ID if presented
            const newSessionId = this.getMcpSessionId(response.headers);
            if (newSessionId) {
                this.sessionId = newSessionId;
            }

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`POST Error ${response.status}: ${text}`);
            }

            // Extract headers to pass to logger
            const responseHeaders: Record<string, string> = {};
            response.headers.forEach((val, key) => responseHeaders[key] = val);

            // Critical fix: Handle the response body.
            // The server might return the JSON-RPC response directly in the POST response.
            const contentType = response.headers.get('content-type') || '';

            if (contentType.includes('application/json')) {
                // Safely handle potentially empty JSON bodies
                const text = await response.text();
                if (text && text.trim().length > 0) {
                    try {
                        const data = JSON.parse(text);
                        this.handleIncoming(data, { 
                            responseHeaders, 
                            statusCode: response.status 
                        });
                    } catch (e: any) {
                        const msg = `Failed to parse JSON response from POST: ${e.message}`;
                        console.error(msg, e);
                        if (this.onerror) {
                            this.onerror(new Error(`${msg}. Body snippet: ${text.substring(0, 200)}`));
                        }
                    }
                }
            } else if (contentType.includes('text/event-stream')) {
                // The server might start a stream specifically for this request
                if (response.body) {
                    this.readSseStream(response.body);
                }
            }
            // If 202 Accepted, the response will come via the separate GET stream (handled in start)

        } catch (e: any) {
             if (this.onerror) this.onerror(e);
             throw e;
        }
    }

    async close(): Promise<void> {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        if (this.onclose) this.onclose();
    }

    private handleIncoming(data: any, meta?: any) {
        if (Array.isArray(data)) {
            data.forEach(d => this.processMessage(d, meta));
        } else {
            this.processMessage(data, meta);
        }
    }

    private processMessage(msg: any, meta?: any) {
        // Log incoming message to UI with extra metadata
        this.messageLogger(msg, meta);
        // Pass to SDK Client
        if (this.onmessage) this.onmessage(msg);
    }

    private async readSseStream(stream: ReadableStream<Uint8Array>) {
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;

                // Process buffer for complete events
                while (true) {
                    // Look for double newline which delimiters events
                    const match = buffer.match(/(\n\n|\r\n\r\n|\r\r)/);
                    if (!match || match.index === undefined) break;

                    const eventBlock = buffer.substring(0, match.index);
                    buffer = buffer.substring(match.index + match[0].length);

                    if (!eventBlock.trim()) continue;

                    this.parseEventBlock(eventBlock);
                }
            }
        } catch (e: any) {
            if (e.name !== 'AbortError' && this.onerror) {
                console.error("SSE Stream Error:", e);
                // Don't kill the whole transport on stream error, as POST might still work
            }
        } finally {
            try {
                reader.releaseLock();
            } catch (e) {}
        }
    }

    private parseEventBlock(block: string) {
        const lines = block.split(/\r\n|\r|\n/);
        let eventType = 'message';
        let data = '';

        for (const line of lines) {
            if (line.startsWith('event:')) {
                eventType = line.substring(6).trim();
            } else if (line.startsWith('data:')) {
                let d = line.substring(5);
                if (d.startsWith(' ')) d = d.substring(1);
                data += d;
            }
        }

        if (eventType === 'message' && data) {
            try {
                const json = JSON.parse(data);
                this.processMessage(json, { source: 'sse-stream' });
            } catch (e) {
                console.error('Failed to parse SSE message', e);
            }
        }
    }
}

export class StreamableHttpMcpClient implements IMcpClient {
    private client: Client | null = null;
    private messageHandlers: MessageHandler[] = [];
    private errorHandlers: ErrorHandler[] = [];
    private transport: CustomStreamableTransport | null = null;

    connect(url: string, proxyConfig: ProxyConfig, headers: Record<string, string>): Promise<void> {
        return new Promise(async (resolve, reject) => {
            try {
                // Construct full URL with proxy if needed
                const finalUrl = proxyConfig.enabled ? proxyConfig.prefix + url : url;

                this.client = new Client(
                    {
                        name: 'mcp-partner-client',
                        version: '1.0.0',
                    },
                    {
                        capabilities: {},
                    }
                );

                // Initialize the custom transport
                this.transport = new CustomStreamableTransport(
                    finalUrl, 
                    headers, 
                    (msg, meta) => this.messageHandlers.forEach(h => h(msg, meta))
                );

                // Handle transport errors (like stream disconnection)
                this.transport.onerror = (err) => {
                    this.emitError(err.message);
                };

                // Connect
                await this.client.connect(this.transport);
                
                resolve();
            } catch (e: any) {
                const msg = `Streamable HTTP Connection failed: ${e.message}`;
                this.emitError(msg);
                reject(new Error(msg));
            }
        });
    }

    disconnect(): void {
        if (this.client) {
            this.client.close().catch(e => console.error("Error closing client", e));
            this.client = null;
        }
        // Ensure transport is closed if client close didn't do it
        if (this.transport) {
            this.transport.close().catch(e => console.error("Error closing transport", e));
            this.transport = null;
        }
        this.messageHandlers = [];
        this.errorHandlers = [];
    }

    async sendRequest(method: string, params?: any): Promise<any> {
        if (!this.client) {
            throw new Error("Client not connected");
        }

        // Determine the appropriate schema based on the method
        let schema: z.ZodSchema<any>;
        let sdkMethod = method;
        
        // Map generic RPC calls to SDK typed methods where possible
        // Note: The SDK's client.request() handles strict schema validation.
        switch (method) {
            case 'initialize':
                schema = InitializeResultSchema;
                break;
            case 'notifications/initialized':
                schema = InitializedNotificationSchema;
                break;
            case 'tools/list':
                schema = ListToolsResultSchema;
                break;
            case 'tools/call':
                schema = CallToolResultSchema;
                break;
            case 'resources/list':
                schema = ListResourcesResultSchema;
                break;
            case 'resources/read':
                schema = ReadResourceResultSchema;
                break;
            case 'prompts/list':
                schema = ListPromptsResultSchema;
                break;
            case 'prompts/get':
                schema = GetPromptResultSchema;
                break;
            default:
                // For unknown methods, use a loose schema that accepts any response
                schema = z.any();
        }

        // @ts-ignore - Generic request with schema
        const result = await this.client.request({
            method: method,
            params: params
        }, schema);

        return result;
    }

    async sendNotification(method: string, params?: any): Promise<void> {
        if (!this.client) {
            throw new Error("Client not connected");
        }

        // @ts-ignore
        await this.client.notification({
            method: method,
            params: params
        });
    }

    onMessage(handler: MessageHandler): Unsubscribe {
        this.messageHandlers.push(handler);
        return () => {
            this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
        };
    }

    onError(handler: ErrorHandler): Unsubscribe {
        this.errorHandlers.push(handler);
        return () => {
            this.errorHandlers = this.errorHandlers.filter(h => h !== handler);
        };
    }

    private emitError(msg: string) {
        this.errorHandlers.forEach(h => h(msg));
    }
}