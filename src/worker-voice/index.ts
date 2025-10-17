/// <reference types="@cloudflare/workers-types" />

import { VoiceSession, Env } from './voice-session';
import { indexHtml } from './generated-index';

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

    // For SPA routing: serve the React app for all non-API routes
    // This handles routes like /enhancedMode, /any-other-route
    // Serve the built index.html with correct asset references (injected at build time)
    return new Response(indexHtml, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'public, max-age=0, must-revalidate'
      }
    });
  }
};
