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
    if (url.pathname === '/voice/sse' || url.pathname === '/voice/message' || url.pathname === '/voice/test') {
      const durableObjectId = env.VOICE_SESSION.idFromName('global');
      const durableObject = env.VOICE_SESSION.get(durableObjectId);
      
      return durableObject.fetch(request);
    }
    
    // Serve static assets
    try {
      const asset = await env.ASSETS.fetch(request);
      if (asset.status !== 404) {
        return asset;
      }
    } catch (e) {
      // Asset not found
    }
    
    // SPA fallback
    try {
      const indexUrl = new URL('/index.html', request.url);
      const indexRequest = new Request(indexUrl.toString());
      const indexResponse = await env.ASSETS.fetch(indexRequest);
      return new Response(indexResponse.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/html',
          'Cache-Control': 'public, max-age=0, must-revalidate'
        }
      });
    } catch (e) {
      return new Response('Not Found', { status: 404 });
    }
  }
};
