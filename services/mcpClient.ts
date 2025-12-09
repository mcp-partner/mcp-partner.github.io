import { JsonRpcMessage, JsonRpcResponse, JsonRpcRequest, JsonRpcNotification } from '../types';

type MessageHandler = (message: JsonRpcMessage) => void;
type ErrorHandler = (error: string) => void;

export interface ProxyConfig {
  enabled: boolean;
  prefix: string;
}

export class McpClient {
  private abortController: AbortController | null = null;
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
    return new Promise(async (resolve, reject) => {
      try {
        this.proxyConfig = proxyConfig;
        this.originalSseUrl = sseUrl;
        this.headers = headers;

        // Close existing connection if any
        this.disconnect();

        this.abortController = new AbortController();

        // Construct the actual connection URL
        const connectionUrl = proxyConfig.enabled ? proxyConfig.prefix + sseUrl : sseUrl;

        // Use fetch instead of EventSource to support headers
        // REMOVED 'Cache-Control': 'no-cache' to prevent CORS errors with strict servers
        const response = await fetch(connectionUrl, {
            method: 'GET',
            headers: {
                'Accept': 'text/event-stream',
                ...this.headers
            },
            signal: this.abortController.signal
        });

        if (!response.ok) {
            const msg = `Connection failed: ${response.status} ${response.statusText}`;
            this.emitError(msg);
            reject(new Error(msg));
            return;
        }

        if (!response.body) {
            reject(new Error('No response body received from SSE endpoint'));
            return;
        }

        // Start reading the stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        // We resolve the promise only when we receive the 'endpoint' event
        this.readSseStream(reader, decoder, resolve, reject);

      } catch (err: any) {
        if (err.name === 'AbortError') {
            reject(new Error('Connection aborted'));
        } else {
            reject(err);
        }
      }
    });
  }

  private async readSseStream(
      reader: ReadableStreamDefaultReader<Uint8Array>, 
      decoder: TextDecoder,
      resolve: () => void,
      reject: (reason?: any) => void
  ) {
      let buffer = '';
      let resolved = false;

      try {
          while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              const chunk = decoder.decode(value, { stream: true });
              buffer += chunk;
              
              // Robust parsing loop to handle various line endings (CRLF, LF, CR)
              // Standard SSE events are separated by a pair of newlines.
              while (true) {
                  // Find the first occurrence of a double newline sequence
                  // \n\n (LF LF) - Standard/Unix
                  // \r\n\r\n (CRLF CRLF) - Windows/HTTP
                  // \r\r (CR CR) - Old Mac (rare but possible)
                  const match = buffer.match(/(\n\n|\r\n\r\n|\r\r)/);
                  
                  if (!match || match.index === undefined) {
                      // No complete event in buffer yet
                      break;
                  }

                  // Extract the event block
                  const eventBlock = buffer.substring(0, match.index);
                  // Advance buffer past this event and the separator
                  buffer = buffer.substring(match.index + match[0].length);

                  if (!eventBlock.trim()) {
                      // Empty block (e.g. keep-alive or extra newlines), skip
                      continue;
                  }

                  // Process the event lines
                  const lines = eventBlock.split(/\r\n|\r|\n/);
                  let eventType = 'message';
                  let data = '';

                  for (const line of lines) {
                      // Check for 'event:' or 'event: '
                      if (line.startsWith('event:')) {
                          eventType = line.substring(6).trim();
                      } 
                      // Check for 'data:' or 'data: '
                      else if (line.startsWith('data:')) {
                          let d = line.substring(5);
                          // Remove optional leading space
                          if (d.startsWith(' ')) d = d.substring(1);
                          data += d;
                      }
                  }

                  if (eventType === 'endpoint') {
                      try {
                          const url = data.trim();
                          // Resolve relative URLs against the original SSE URL
                          const resolvedUrl = new URL(url, this.originalSseUrl).toString();

                          // Apply proxy prefix if enabled
                          if (this.proxyConfig.enabled) {
                              this.postUrl = this.proxyConfig.prefix + resolvedUrl;
                          } else {
                              this.postUrl = resolvedUrl;
                          }
                          console.log('MCP Post Endpoint received:', this.postUrl);
                          
                          if (!resolved) {
                              resolved = true;
                              resolve();
                          }
                      } catch (e) {
                          console.error("Endpoint parsing error", e);
                          this.emitError(`Invalid endpoint URL: ${data}`);
                          // If we can't parse endpoint, connection is effectively useless for requests
                          if (!resolved) reject(e);
                      }
                  } else if (eventType === 'message') {
                      try {
                          if (data) {
                            const json = JSON.parse(data);
                            this.handleIncomingMessage(json);
                          }
                      } catch (e) {
                          console.error("Failed to parse SSE message JSON", e, data);
                      }
                  }
              }
          }
      } catch (error: any) {
          if (error.name !== 'AbortError') {
              this.emitError(`Stream error: ${error.message}`);
              if (!resolved) reject(error);
          }
      } finally {
          try {
             reader.releaseLock();
          } catch(e) {}
      }
  }

  disconnect() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
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
      // 1. Explicitly send OPTIONS first as requested to support specific proxies (like pancors)
      try {
        await fetch(this.postUrl, {
           method: 'OPTIONS',
           headers: this.headers
        });
      } catch (optErr) {
        // Ignore errors on the manual OPTIONS check; the browser's automatic preflight for the POST might still work
        console.warn("Manual OPTIONS check failed", optErr);
      }

      // 2. Send actual POST with application/json
      const res = await fetch(this.postUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', 
          ...this.headers 
        },
        body: JSON.stringify(request)
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP Error ${res.status}: ${text}`);
      }
      
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
      // 1. Explicitly send OPTIONS first
      try {
        await fetch(this.postUrl, {
           method: 'OPTIONS',
           headers: this.headers
        });
      } catch (optErr) {
        // Ignore errors on the manual OPTIONS check
        console.warn("Manual OPTIONS check failed", optErr);
      }

      // 2. Send actual POST with application/json
      const res = await fetch(this.postUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.headers 
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
