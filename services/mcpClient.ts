import { JsonRpcMessage } from '../types';

export type MessageHandler = (message: JsonRpcMessage, meta?: any) => void;
export type ErrorHandler = (error: string) => void;
export type Unsubscribe = () => void;

export interface ProxyConfig {
  enabled: boolean;
  prefix: string;
}

/**
 * Interface defining the standard behavior for any MCP Client implementation
 * (e.g., SSE, Streamable HTTP, WebSocket).
 */
export interface IMcpClient {
  /**
   * Establishes a connection to the server.
   * @param url The connection URL (e.g., SSE endpoint).
   * @param proxyConfig Configuration for CORS proxy.
   * @param headers Custom headers to send with the connection request.
   */
  connect(url: string, proxyConfig: ProxyConfig, headers: Record<string, string>): Promise<void>;

  /**
   * Disconnects and cleans up resources.
   */
  disconnect(): void;

  /**
   * Sends a JSON-RPC Request and awaits the response.
   */
  sendRequest(method: string, params?: any): Promise<any>;

  /**
   * Sends a JSON-RPC Notification (no response expected).
   */
  sendNotification(method: string, params?: any): Promise<void>;

  /**
   * Registers a callback for incoming messages.
   * Returns an unsubscribe function.
   */
  onMessage(handler: MessageHandler): Unsubscribe;

  /**
   * Registers a callback for errors.
   * Returns an unsubscribe function.
   */
  onError(handler: ErrorHandler): Unsubscribe;
}