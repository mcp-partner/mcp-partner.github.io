import { SdkMcpClient } from './sdkMcpClient';

/** Legacy HTTP+SSE compatibility client backed by the official MCP SDK. */
export class SseMcpClient extends SdkMcpClient {
  constructor() {
    super('sse');
  }
}
