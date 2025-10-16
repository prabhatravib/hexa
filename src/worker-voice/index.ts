/// <reference types="@cloudflare/workers-types" />

import { VoiceSession, Env } from './voice-session';

// Export Durable Objects
export { VoiceSession };

// Main worker
export default {
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle WebSocket upgrade
    if (url.pathname.startsWith('/voice/ws')) {
      const durableObjectId = env.VOICE_SESSION.idFromName('global');
      const durableObject = env.VOICE_SESSION.get(durableObjectId);
      
      return durableObject.fetch(request);
    }
    
    // Handle SSE and HTTP message endpoints
    if (url.pathname === '/voice/sse' || url.pathname === '/voice/message' || url.pathname === '/voice/test' || url.pathname === '/voice/reset') {
      const durableObjectId = env.VOICE_SESSION.idFromName('global');
      const durableObject = env.VOICE_SESSION.get(durableObjectId);
      
      return durableObject.fetch(request);
    }
    
    // Handle external data endpoints
    if (url.pathname === '/api/external-data' || url.pathname === '/api/external-data/status' || url.pathname === '/api/set-base-instructions' || url.pathname === '/api/set-live-session' || url.pathname === '/api/send-email' || url.pathname === '/external-data.md') {
      const durableObjectId = env.VOICE_SESSION.idFromName('global');
      const durableObject = env.VOICE_SESSION.get(durableObjectId);
      
      return durableObject.fetch(request);
    }
    
    // Handle API routes first
    if (url.pathname.startsWith('/voice/') ||
        url.pathname.startsWith('/api/') ||
        url.pathname.startsWith('/external-data.md')) {
      const durableObjectId = env.VOICE_SESSION.idFromName('global');
      const durableObject = env.VOICE_SESSION.get(durableObjectId);
      return durableObject.fetch(request);
    }

    // For SPA routing: serve the React app directly for all non-API routes
    // This handles routes like /enhancedMode, /any-other-route
    return new Response(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <link rel="icon" type="image/svg+xml" href="/favicon.ico" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Hexa Voice Agent</title>
        </head>
        <body>
          <div id="root"></div>
          <script type="module" src="/assets/index-BxuuT1Jk.js"></script>
          <link rel="stylesheet" href="/assets/index-D9zaSw7u.css">
        </body>
      </html>
    `, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'public, max-age=0, must-revalidate'
      }
    });
  }
};
