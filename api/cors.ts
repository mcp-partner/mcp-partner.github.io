
export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request) {
  const url = new URL(req.url);
  const targetUrl = url.searchParams.get('url');

  // Basic CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Expose-Headers': '*',
  };

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (!targetUrl) {
    return new Response('Missing "url" query parameter', { status: 400, headers: corsHeaders });
  }

  try {
    // Validate URL
    new URL(targetUrl);
  } catch (e) {
    return new Response('Invalid URL provided', { status: 400, headers: corsHeaders });
  }

  try {
    // Prepare headers for the target request
    const headers = new Headers();
    // Filter out headers that shouldn't be forwarded or might cause issues
    const unsafeHeaders = [
      'host', 
      'connection', 
      'origin', 
      'referer', 
      'content-length', 
      'transfer-encoding', 
      'accept-encoding', // Let the upstream decide or default to identity, prevents double-compression issues
      'sec-fetch-dest',
      'sec-fetch-mode',
      'sec-fetch-site',
      'sec-fetch-user'
    ];
    
    // Copy headers from the incoming request, excluding unsafe ones
    req.headers.forEach((value, key) => {
        if (!unsafeHeaders.includes(key.toLowerCase())) {
            headers.set(key, value);
        }
    });

    // Ensure we have a user agent to avoid being blocked by some servers
    if (!headers.has('user-agent')) {
        headers.set('user-agent', 'mcp-partner-proxy/1.0');
    }

    // Determine if we should pass the body
    // GET/HEAD requests must not have a body to avoid hanging the fetch
    const isWrite = ['POST', 'PUT', 'PATCH'].includes(req.method.toUpperCase());
    const body = isWrite ? req.body : null;

    // Make the request to the target
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: body,
      redirect: 'follow',
      // @ts-ignore: duplex is required for streaming bodies in some fetch implementations
      duplex: isWrite ? 'half' : undefined
    });

    // Create a new response with the target's body and status
    const responseHeaders = new Headers(response.headers);
    
    // Delete headers that cause issues with streaming and compression
    responseHeaders.delete('content-encoding');
    responseHeaders.delete('content-length');
    responseHeaders.delete('transfer-encoding');
    responseHeaders.delete('connection');

    // Overwrite CORS headers to allow access from our app
    Object.entries(corsHeaders).forEach(([key, value]) => {
        responseHeaders.set(key, value);
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error: any) {
    return new Response(`Proxy Error: ${error.message}`, { status: 500, headers: corsHeaders });
  }
}
