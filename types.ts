
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: any;
  id?: number | string;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id: number | string;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: any;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

export interface McpResource {
  uri: string;
  name: string;
  mimeType?: string;
}

export interface LogEntry {
  timestamp: string;
  type: 'info' | 'error' | 'request' | 'response' | 'notification';
  direction: 'in' | 'out' | 'local';
  summary: string;
  details?: any;
}

export enum ConnectionStatus {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR'
}

export type Language = 'en' | 'zh';
export type Theme = 'light' | 'dark';

// --- Configuration Types ---

export interface McpServerConfig {
  url: string;
  type: 'sse'; 
  headers: Record<string, string>;
}

export interface McpExtensionConfig {
  useProxy: boolean;
  proxyPrefix: string;
}

export interface AppAppearanceConfig {
  theme: Theme;
  language: Language;
  defaultProxyUrl?: string;
}

export interface McpPartnerConfig {
  mcpServers: Record<string, McpServerConfig>;
  mcpExtensions?: Record<string, McpExtensionConfig>;
  appConfig?: AppAppearanceConfig;
}