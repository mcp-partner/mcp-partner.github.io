import { JsonRpcMessage, JsonRpcResponse, JsonRpcRequest, JsonRpcNotification } from '../types';

type MessageHandler = (message: JsonRpcMessage) => void;
type ErrorHandler = (error: string) => void;

export interface ProxyConfig {
  enabled: boolean;
  prefix: string;
}

export class McpClient {
  private eventSource: EventSource | null = null;
  private postUrl: string | null = null;
  private messageHandlers: MessageHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private pendingRequests: Map<string | number, { resolve: (val: any) => void; reject: (err: any) => void }> = new Map();
  private requestCounter = 0;
  
  private proxyConfig: ProxyConfig = { enabled: false, prefix: '' };
  private originalSseUrl: string = '';
  private headers: Record<string, string> = {};

  constructor() {}

  connect(sseUrl: string, proxyConfig: ProxyConfig = { enabled: false, prefix: '' }, headers: Record<string, string> = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.proxyConfig = proxyConfig;
        this.originalSseUrl = sseUrl;
        this.headers = headers;

        // Close existing connection if any
        if (this.eventSource) {
          this.eventSource.close();
        }

        // Construct the actual connection URL
        // If proxy is enabled, prepend the prefix.
        // We do NOT encode the target URL by default as simple concatenation is the standard for many proxies (like corsproxy.io/?url=TARGET)
        // unless specific handling is required, but straight concatenation gives user most control via the prefix.
        const connectionUrl = proxyConfig.enabled ? proxyConfig.prefix + sseUrl : sseUrl;

        // Note: Standard EventSource does not support custom headers. 
        // These headers will only be used for the POST requests (sendRequest/sendNotification).
        this.eventSource = new EventSource(connectionUrl);

        this.eventSource.onopen = () => {
          // Wait for the 'endpoint' event to fully consider connected in the logic flow,
          // but strictly speaking, SSE is open here.
        };

        this.eventSource.onerror = (e) => {
          this.emitError('SSE Connection Error. Ensure the server enables CORS and is running.');
          
          // Stop the browser from retrying indefinitely
          if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
          }

          if (this.postUrl === null) {
              // If we fail before getting an endpoint, reject the connection promise
              reject(new Error('Failed to connect to SSE'));
          }
        };

        // Listen for the specific 'endpoint' event defined in MCP Streamable HTTP spec
        this.eventSource.addEventListener('endpoint', (event: MessageEvent) => {
          try {
            const url = event.data;
            
            // Critical: Resolve the endpoint URL relative to the ORIGINAL SSE URL (as the server sees it),
            // not the proxied URL we are actually connected to.
            // new URL('/foo', 'http://original.com/sse') -> 'http://original.com/foo'
            const resolvedUrl = new URL(url, this.originalSseUrl).toString();

            // If proxy is enabled, wrap the resolved POST URL in the proxy as well
            if (this.proxyConfig.enabled) {
                this.postUrl = this.proxyConfig.prefix + resolvedUrl;
            } else {
                this.postUrl = resolvedUrl;
            }
            
            console.log('MCP Post Endpoint received:', this.postUrl);
            resolve();
          } catch (e) {
            this.emitError(`Invalid endpoint URL received: ${event.data}`);
            reject(e);
          }
        });

        // Listen for standard messages (JSON-RPC responses/notifications)
        this.eventSource.onmessage = (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            this.handleIncomingMessage(data);
          } catch (e) {
            this.emitError(`Failed to parse incoming message: ${event.data}`);
          }
        };

      } catch (err) {
        reject(err);
      }
    });
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.postUrl = null;
    this.pendingRequests.clear();
  }

  onMessage(handler: MessageHandler) {
    this.messageHandlers.push(handler);
  }

  onError(handler: ErrorHandler) {
    this.errorHandlers.push(handler);
  }

  private emitError(msg: string) {
    this.errorHandlers.forEach(h => h(msg));
  }

  private handleIncomingMessage(data: JsonRpcMessage) {
    this.messageHandlers.forEach(h => h(data));

    // If it's a response to a request we sent
    if ('id' in data && data.id !== undefined && data.id !== null) {
      const pending = this.pendingRequests.get(data.id);
      if (pending) {
        if ('result' in (data as JsonRpcResponse)) {
          pending.resolve((data as JsonRpcResponse).result);
        } else if ('error' in (data as JsonRpcResponse)) {
          pending.reject((data as JsonRpcResponse).error);
        }
        this.pendingRequests.delete(data.id);
      }
    }
  }

  async sendRequest(method: string, params?: any): Promise<any> {
    if (!this.postUrl) {
      throw new Error("Not connected or POST endpoint not received yet.");
    }

    const id = this.requestCounter++;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id
    };

    // Log the outgoing request locally
    this.messageHandlers.forEach(h => h(request)); // Loop back so UI sees it

    // Setup pending promise
    const responsePromise = new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      // Timeout safety
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error("Request timed out"));
        }
      }, 30000);
    });

    try {
      const res = await fetch(this.postUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.headers // Inject custom headers
        },
        body: JSON.stringify(request)
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP Error ${res.status}: ${text}`);
      }

      // Note: The actual JSON-RPC response usually comes via SSE, 
      // but some implementations might return it in the POST response too.
      // We rely on the SSE listener to resolve the promise usually.
      
    } catch (e: any) {
      this.pendingRequests.delete(id);
      throw e;
    }

    return responsePromise;
  }

  async sendNotification(method: string, params?: any): Promise<void> {
    if (!this.postUrl) {
      throw new Error("Not connected or POST endpoint not received yet.");
    }

    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params
    };

    // Log the outgoing notification locally
    this.messageHandlers.forEach(h => h(notification));

    try {
      const res = await fetch(this.postUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.headers // Inject custom headers
        },
        body: JSON.stringify(notification)
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP Error ${res.status}: ${text}`);
      }
      
    } catch (e: any) {
      throw e;
    }
  }
}