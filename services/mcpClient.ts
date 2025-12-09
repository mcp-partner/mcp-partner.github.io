import { JsonRpcMessage, McpServerType } from '../types';
// @ts-ignore
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

type MessageHandler = (message: JsonRpcMessage) => void;
type ErrorHandler = (error: string) => void;

export interface ProxyConfig {
  enabled: boolean;
  prefix: string;
}

// Minimal definition of the Transport interface from SDK to avoid import issues in some environments
interface Transport {
    start(): Promise<void>;
    send(message: any): Promise<void>;
    close(): Promise<void>;
    onmessage?: (message: any) => void;
    onclose?: () => void;
    onerror?: (error: Error) => void;
}

// Custom SSE Transport that uses fetch to support headers/proxies better than native EventSource
class FetchSSETransport implements Transport {
    private abortController: AbortController | null = null;
    private postUrl: string | null = null;
    public onmessage?: (message: any) => void;
    public onclose?: () => void;
    public onerror?: (error: Error) => void;

    constructor(
        private url: string,
        private proxyConfig: ProxyConfig,
        private headers: Record<string, string>
    ) {}

    async start(): Promise<void> {
        this.abortController = new AbortController();
        const connectionUrl = this.proxyConfig.enabled ? this.proxyConfig.prefix + this.url : this.url;

        try {
             const response = await fetch(connectionUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'text/event-stream',
                    ...this.headers
                },
                signal: this.abortController.signal
            });

            if (!response.ok) {
                throw new Error(`Connection failed: ${response.status} ${response.statusText}`);
            }

            if (!response.body) {
                throw new Error('No response body received from SSE endpoint');
            }

            // Start reading (non-blocking)
            this.readSseStream(response.body.getReader());
        } catch (e: any) {
            if (this.onerror) this.onerror(e);
            throw e;
        }
    }

    private async readSseStream(reader: ReadableStreamDefaultReader<Uint8Array>) {
        const decoder = new TextDecoder();
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;
                
                while (true) {
                    const match = buffer.match(/(\n\n|\r\n\r\n|\r\r)/);
                    if (!match || match.index === undefined) break;

                    const eventBlock = buffer.substring(0, match.index);
                    buffer = buffer.substring(match.index + match[0].length);

                    if (!eventBlock.trim()) continue;

                    const lines = eventBlock.split(/\r\n|\r|\n/);
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

                    if (eventType === 'endpoint') {
                        const url = data.trim();
                        const resolvedUrl = new URL(url, this.url).toString();
                        if (this.proxyConfig.enabled) {
                            this.postUrl = this.proxyConfig.prefix + resolvedUrl;
                        } else {
                            this.postUrl = resolvedUrl;
                        }
                        // We don't bubble 'endpoint' as a JSONRPC message, handled internally
                    } else if (eventType === 'message') {
                        if (data && this.onmessage) {
                            try {
                                const json = JSON.parse(data);
                                this.onmessage(json);
                            } catch (e) {
                                console.error("Failed to parse SSE JSON", e);
                            }
                        }
                    }
                }
            }
        } catch (error: any) {
            if (error.name !== 'AbortError' && this.onerror) {
                this.onerror(error);
            }
        } finally {
             try { reader.releaseLock(); } catch(e) {}
             if (this.onclose) this.onclose();
        }
    }

    async send(message: any): Promise<void> {
        if (!this.postUrl) {
            throw new Error("Not connected or POST endpoint not received yet.");
        }

        const requestHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json', // Simplified for POST
            ...this.headers 
        };

        const res = await fetch(this.postUrl, {
            method: 'POST',
            headers: requestHeaders,
            body: JSON.stringify(message)
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`HTTP Error ${res.status}: ${text}`);
        }
        
        // Accepted (202) or OK (200). 
        // If the response contains a body, it might be an error or result (for some implementations),
        // but typically SSE handles results. 
        // We do nothing unless we want to handle immediate errors.
    }

    async close(): Promise<void> {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }
}

// Simple HTTP Transport (Stateless/Streamable)
class StreamableHttpTransport implements Transport {
    private postUrl: string;
    public onmessage?: (message: any) => void;
    public onclose?: () => void;
    public onerror?: (error: Error) => void;

    constructor(
        url: string,
        private proxyConfig: ProxyConfig,
        private headers: Record<string, string>
    ) {
         if (this.proxyConfig.enabled) {
            this.postUrl = this.proxyConfig.prefix + url;
        } else {
            this.postUrl = url;
        }
    }

    async start(): Promise<void> {
        // No persistent connection to start
        return Promise.resolve();
    }

    async send(message: any): Promise<void> {
        const requestHeaders: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...this.headers 
        };

        try {
            const res = await fetch(this.postUrl, {
                method: 'POST',
                headers: requestHeaders,
                body: JSON.stringify(message)
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(`HTTP Error ${res.status}: ${text}`);
            }

            const text = await res.text();
            if (text.trim() && this.onmessage) {
                 // Try parsing NDJSON or JSON
                 const lines = text.split('\n');
                 for(const line of lines) {
                     if(line.trim()) {
                         try {
                             this.onmessage(JSON.parse(line));
                         } catch (e) { console.warn("Parse error", e); }
                     }
                 }
            }
        } catch (e: any) {
            if(this.onerror) this.onerror(e);
            throw e;
        }
    }

    async close(): Promise<void> {
        if(this.onclose) this.onclose();
    }
}

export class McpClient {
  private client: any | null = null; // Type: Client
  private transport: Transport | null = null;
  
  private messageHandlers: MessageHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];

  constructor() {}

  async connect(url: string, type: McpServerType, proxyConfig: ProxyConfig = { enabled: false, prefix: '' }, headers: Record<string, string> = {}): Promise<void> {
     // Disconnect existing
     if (this.client) {
         await this.disconnect();
     }

     // 1. Create Transport
     if (type === 'streamable_http') {
         this.transport = new StreamableHttpTransport(url, proxyConfig, headers);
     } else {
         this.transport = new FetchSSETransport(url, proxyConfig, headers);
     }

     // 2. Wrap Transport to intercept logs
     const originalOnMessage = this.transport!.onmessage; // Likely undefined initially
     const originalSend = this.transport!.send.bind(this.transport);

     // Intercept incoming
     this.transport!.onmessage = (msg: any) => {
         this.handleIncomingMessage(msg); // Log it
         // The Client (sdk) sets its own onmessage on the transport via connect().
         // Wait, client.connect() overwrites transport.onmessage. 
         // We need to handle this carefully.
         // Actually, Client.connect(transport) will set transport.onmessage = ...
         // We need to proxy the transport we pass to the client.
     };

     // Create a proxy transport to intercept 'send' and 'onmessage' assignment
     const transportProxy: Transport = {
         start: () => this.transport!.start(),
         close: () => this.transport!.close(),
         send: async (msg: any) => {
             // Log outgoing
             this.handleOutgoingMessage(msg);
             return this.transport!.send(msg);
         },
         set onmessage(handler: (msg: any) => void) {
             // When Client sets onmessage, we wrap it
             this._clientMsgHandler = handler;
             if (this._underlyingTransport) {
                 this._underlyingTransport.onmessage = (msg: any) => {
                     // Log incoming
                     this._logIncoming(msg);
                     // Pass to client
                     handler(msg);
                 };
             }
         },
         // Internal helpers for the proxy closure
         _clientMsgHandler: null as any,
         _underlyingTransport: this.transport,
         _logIncoming: (msg: any) => this.handleIncomingMessage(msg)
     } as any;


     // 3. Create SDK Client
     this.client = new Client({
         name: "mcp-partner-client",
         version: "1.0.0"
     }, {
         capabilities: {
             prompts: {},
             resources: {},
             tools: {}
         }
     });

     try {
         await this.client.connect(transportProxy);
     } catch (e: any) {
         this.emitError(`Connection failed: ${e.message}`);
         throw e;
     }
  }

  async disconnect() {
      if (this.client) {
          await this.client.close(); // This closes transport too
          this.client = null;
      } else if (this.transport) {
          await this.transport.close();
      }
      this.transport = null;
  }

  async listTools() {
      if (!this.client) throw new Error("Not connected");
      return await this.client.listTools();
  }

  async callTool(name: string, args: any) {
      if (!this.client) throw new Error("Not connected");
      return await this.client.callTool({
          name,
          arguments: args
      });
  }

  // Event Listeners for UI Logging
  onMessage(handler: MessageHandler) {
    this.messageHandlers.push(handler);
  }

  onError(handler: ErrorHandler) {
    this.errorHandlers.push(handler);
  }

  private emitError(msg: string) {
    this.errorHandlers.forEach(h => h(msg));
  }

  private handleIncomingMessage(data: any) {
    this.messageHandlers.forEach(h => h(data));
  }

  private handleOutgoingMessage(data: any) {
    this.messageHandlers.forEach(h => h(data));
  }
}
