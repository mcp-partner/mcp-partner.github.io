import { IMcpClient, ProxyConfig, MessageHandler, ErrorHandler, Unsubscribe } from './mcpClient';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { JsonRpcMessage } from '../types';

/**
 * A wrapper Transport that intercepts messages for logging purposes
 * before passing them to/from the actual StreamableHTTPClientTransport.
 */
class InterceptingTransport implements Transport {
    private realTransport: StreamableHTTPClientTransport;
    private messageLogger: MessageHandler;

    public onclose?: () => void;
    public onerror?: (error: Error) => void;
    public onmessage?: (message: any) => void;

    constructor(url: string, headers: Record<string, string>, messageLogger: MessageHandler) {
        // We instantiate the real SDK transport with a custom fetch implementation
        // to ensure custom headers are included in the POST requests.
        this.realTransport = new StreamableHTTPClientTransport(new URL(url), {
            fetch: (input, init) => {
                const finalHeaders = { ...headers, ...(init?.headers || {}) };
                return fetch(input, { ...init, headers: finalHeaders });
            }
        });
        this.messageLogger = messageLogger;

        // Hook into the real transport's callbacks
        this.realTransport.onclose = () => {
            if (this.onclose) this.onclose();
        };

        this.realTransport.onerror = (error) => {
            if (this.onerror) this.onerror(error);
        };

        this.realTransport.onmessage = (message) => {
            // Log the incoming message
            this.messageLogger(message as JsonRpcMessage);
            // Pass it up to the Client
            if (this.onmessage) this.onmessage(message);
        };
    }

    async start(): Promise<void> {
        return this.realTransport.start();
    }

    async send(message: any): Promise<void> {
        // Log the outgoing message
        this.messageLogger(message as JsonRpcMessage);
        return this.realTransport.send(message);
    }

    async close(): Promise<void> {
        return this.realTransport.close();
    }
}

export class StreamableHttpMcpClient implements IMcpClient {
    private client: Client | null = null;
    private messageHandlers: MessageHandler[] = [];
    private errorHandlers: ErrorHandler[] = [];
    private transport: InterceptingTransport | null = null;

    connect(url: string, proxyConfig: ProxyConfig, headers: Record<string, string>): Promise<void> {
        return new Promise(async (resolve, reject) => {
            try {
                // Construct full URL with proxy if needed
                const finalUrl = proxyConfig.enabled ? proxyConfig.prefix + url : url;

                // Create the SDK Client
                this.client = new Client(
                    {
                        name: 'mcp-partner-client',
                        version: '1.0.0',
                    },
                    {
                        capabilities: {},
                    }
                );

                // Initialize the Transport Interceptor
                this.transport = new InterceptingTransport(
                    finalUrl, 
                    headers, 
                    (msg) => this.handleMessageLog(msg)
                );

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
            // We don't await this because disconnect is often synchronous-like in cleanup
            this.client.close().catch(e => console.error("Error closing client", e));
            this.client = null;
        }
        this.transport = null;
        this.messageHandlers = [];
        this.errorHandlers = [];
    }

    async sendRequest(method: string, params?: any): Promise<any> {
        if (!this.client) {
            throw new Error("Client not connected");
        }

        // The SDK abstracts the ID generation, but our InterceptingTransport will capture the full JSON-RPC object
        // so the logs will look correct.
        // @ts-ignore - The SDK types might be strict about what methods are known, cast as any allows generic usage
        const result = await this.client.request({
            method: method,
            params: params
        });

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

    // Helper to broadcast to our logging system
    private handleMessageLog(msg: JsonRpcMessage) {
        this.messageHandlers.forEach(h => h(msg));
    }

    private emitError(msg: string) {
        this.errorHandlers.forEach(h => h(msg));
    }
}