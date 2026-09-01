import { SdkMcpClient } from './sdkMcpClient';

/** Dual-era Streamable HTTP client backed by the official MCP SDK v2. */
export class StreamableHttpMcpClient extends SdkMcpClient {
  constructor() {
    super('streamable_http');
  }
}
