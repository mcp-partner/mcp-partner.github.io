
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
    const unsafeHeaders = ['host', 'connection', 'origin', 'referer', 'content-length', 'transfer-encoding'];
    
    // Copy headers from the incoming request, excluding unsafe ones
    req.headers.forEach((value, key) => {
        if (!unsafeHeaders.includes(key.toLowerCase())) {
            headers.set(key, value);
        }
    });

    // Make the request to the target
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: req.body,
      // @ts-ignore: duplex is required for streaming bodies in some fetch implementations
      duplex: 'half' 
    });

    // Create a new response with the target's body and status
    const responseHeaders = new Headers(response.headers);
    
    // CRITICAL FIX: Delete headers that cause issues with streaming and compression.
    // The Edge Runtime `fetch` automatically decompresses the response body. 
    // If we forward `content-encoding: gzip`, the browser tries to decompress it AGAIN,
    // which causes the request to hang or fail because the body is already plain text.
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
