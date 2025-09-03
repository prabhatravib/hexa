/// <reference types="@cloudflare/workers-types" />

export interface Env {
  OPENAI_API_KEY: string;
  OPENAI_VOICE_MODEL: string;
  VOICE_SESSION: DurableObjectNamespace;
  ASSETS: Fetcher;
}

export class VoiceSessionCore {
  private sessionId: string;
  private clients: Set<any> = new Set();
  private isActive: boolean = true;
  private autoRestartInterval: number | null = null;
  private lastActivity: number = Date.now();
  private idleCheckInterval: number | null = null;
  private handlers: any = null; // Will be set by VoiceSession

  constructor(private state: DurableObjectState, private env: Env) {
    this.sessionId = crypto.randomUUID();
    
    // Auto-restart worker every 15 minutes to prevent session expiration
    this.startAutoRestart();
    
    // Start idle detection for smart resets
    this.startIdleDetection();

    // Add cleanup on worker restart
    this.state.blockConcurrencyWhile(async () => {
      await this.performCleanup('stale');
    });

    console.log('🔧 VoiceSessionCore initialized');
  }

  // Helper methods for common response patterns
  getCorsHeaders(): HeadersInit {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };
  }

  createJsonResponse(data: any, status: number = 200): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...this.getCorsHeaders()
      }
    });
  }

  createErrorResponse(message: string, status: number = 500): Response {
    return this.createJsonResponse({
      success: false,
      error: message
    }, status);
  }

  private startAutoRestart(): void {
    // Restart every 15 minutes to prevent OpenAI session expiration (15 * 60 * 1000 ms)
    // OpenAI sessions typically expire after 15-30 minutes of inactivity
    this.autoRestartInterval = setInterval(() => {
      console.log('🔄 Auto-restarting worker after 15 minutes to prevent session expiration...');
      this.performAutoRestart();
    }, 15 * 60 * 1000) as unknown as number;
  }

  private startIdleDetection(): void {
    // Check for idle state every 2 minutes
    this.idleCheckInterval = setInterval(() => {
      // Safety check: Don't run idle detection if session is not active
      if (!this.isActive) {
        return;
      }

      const now = Date.now();
      const idleTime = now - this.lastActivity;
      
      // If idle for more than 5 minutes, reset the session
      if (idleTime > 5 * 60 * 1000) {
        console.log('🔄 Session idle for 5+ minutes, performing smart reset...');
        this.performSmartReset();
      }
    }, 2 * 60 * 1000) as unknown as number;
  }

  private async performSmartReset(): Promise<void> {
    try {
      // Safety check: Only reset if no clients are connected (truly idle)
      if (this.clients.size > 0) {
        console.log('⏭️ Skipping reset - clients still connected');
        return;
      }

      // Additional safety check: Don't reset if we're in the middle of an operation
      if (!this.isActive) {
        console.log('⏭️ Skipping reset - session is not active');
        return;
      }

      console.log('🧹 Performing smart reset due to inactivity...');
      
      // Notify any remaining clients about the reset (though there shouldn't be any)
      this.broadcastToClients({
        type: 'session_idle_reset',
        message: 'Session reset due to inactivity',
        sessionId: this.sessionId
      });

      // Clean up existing connections
      await this.performCleanup('idle');
      
      // Reset session ID
      this.sessionId = crypto.randomUUID();
      
      // Reset activity timer
      this.lastActivity = Date.now();
      
      // Also reset the OpenAI connection through handlers if available
      if (this.handlers) {
        this.handlers.resetSession();
      }
      
      console.log('✅ Smart reset completed - OpenAI session will be refreshed on next connection');
      
    } catch (error) {
      console.error('❌ Smart reset failed:', error);
      // Don't throw - this is a background operation that shouldn't break the session
    }
  }

  private async performAutoRestart(): Promise<void> {
    try {
      // Notify all clients about the restart
      this.broadcastToClients({
        type: 'worker_restarting',
        message: 'Worker is restarting to maintain optimal performance',
        sessionId: this.sessionId
      });

      // Clean up existing connections
      await this.performCleanup('restart');
      
      // Reset session ID
      this.sessionId = crypto.randomUUID();
      
      // Wait a moment for cleanup
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Restart the auto-restart interval
      this.startAutoRestart();
      
      // Notify clients that restart is complete
      this.broadcastToClients({
        type: 'worker_restarted',
        message: 'Worker restart complete',
        newSessionId: this.sessionId
      });

      console.log('✅ Worker auto-restart completed successfully');
      
    } catch (error) {
      console.error('❌ Auto-restart failed:', error);
      // Even if restart fails, continue with new session
      this.startAutoRestart();
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    switch (url.pathname) {
      case '/voice/sse':
        return this.handleSSE(request);
      case '/voice/message':
        return new Response('Not found', { status: 404 }); // Handled by handlers
      case '/voice/test':
        return this.createJsonResponse({ 
          status: 'ok', 
          message: 'Voice service is running',
          sessionId: this.sessionId,
          timestamp: new Date().toISOString()
        });
      case '/voice/reset':
        return new Response('Not found', { status: 404 }); // Handled by handlers
      case '/api/external-data':
        return new Response('Not found', { status: 404 }); // Handled by external data
      case '/api/external-data/status':
        return new Response('Not found', { status: 404 }); // Handled by external data
      case '/api/set-live-session':
        return new Response('Not found', { status: 404 }); // Handled by handlers
      case '/api/set-base-instructions':
        return new Response('Not found', { status: 404 }); // Handled by handlers
      case '/external-data.md':
        return new Response('Not found', { status: 404 }); // Handled by external data
      default:
        return new Response('Not found', { status: 404 });
    }
  }

  private async handleSSE(request: Request): Promise<Response> {
    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
      start: (controller) => {
        const client = {
          controller,
          encoder,
          closed: false,
          send: (data: any) => {
            if (client.closed) return;
            
            try {
              const message = `data: ${JSON.stringify(data)}\n\n`;
              controller.enqueue(encoder.encode(message));
            } catch (error) {
              console.error('Failed to send SSE message:', error);
              // Mark client as closed to avoid repeated errors
              client.closed = true;
              throw error; // Re-throw to trigger removal in broadcastToClients
            }
          }
        };
        
        this.clients.add(client);
        
        // Update activity timestamp on new connection
        this.lastActivity = Date.now();
        
        // Send initial connection message
        client.send({ type: 'connected', sessionId: this.sessionId });
        
        // Send ready message
        client.send({ type: 'ready', sessionId: this.sessionId });
        
        // Clean up when client disconnects
        request.signal.addEventListener('abort', () => {
          client.closed = true;
          this.clients.delete(client);
          console.log('🔌 Client disconnected, cleaning up...');
          
          // If no more clients, reset the session after a delay
          if (this.clients.size === 0) {
            setTimeout(() => {
              if (this.clients.size === 0) {
                this.resetSession();
              }
            }, 5000); // Wait 5 seconds before resetting
          }
        });
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Cache-Control'
      }
    });
  }

  private async performCleanup(reason: 'restart' | 'stale' | 'idle'): Promise<void> {
    try {
      console.log(`🧹 Cleaning up for ${reason}...`);
      
      // Stop intervals if it's a restart
      if (reason === 'restart') {
        if (this.autoRestartInterval !== null) {
          clearInterval(this.autoRestartInterval);
          this.autoRestartInterval = null;
        }
        if (this.idleCheckInterval !== null) {
          clearInterval(this.idleCheckInterval);
          this.idleCheckInterval = null;
        }
      }
      
      // Clear any stored session state
      await this.state.storage.delete('openai_session');
      await this.state.storage.delete('webrtc_state');
      
      // Clear external data file
      await this.state.storage.delete('external_data_file');
      console.log('🧹 Cleared external data file');
      
      // Clear all client connections
      this.clients.clear();
      
      console.log(`✅ Cleanup for ${reason} completed`);
    } catch (error) {
      console.error(`❌ Cleanup for ${reason} failed:`, error);
    }
  }

  private resetSession(): void {
    if (!this.isActive) return;
    
    console.log('🔄 Resetting session due to inactivity...');
    
    // Clear storage
    this.state.storage.delete('openai_session');
    this.state.storage.delete('webrtc_state');
    
    // Reset session ID
    this.sessionId = crypto.randomUUID();
    
    console.log('✅ Session reset complete');
  }

  // Public methods for other components
  getSessionId(): string {
    return this.sessionId;
  }

  getClients(): Set<any> {
    return this.clients;
  }

  getState(): DurableObjectState {
    return this.state;
  }

  getEnv(): Env {
    return this.env;
  }

  setHandlers(handlers: any): void {
    this.handlers = handlers;
  }

  broadcastToClients(message: any): void {
    console.log('📤 Broadcasting message to clients:', message);
    
    // Update activity timestamp on any message broadcast
    this.lastActivity = Date.now();
    
    const clientsToRemove: any[] = [];
    
    this.clients.forEach(client => {
      try {
        // Skip closed clients
        if (client.closed) {
          clientsToRemove.push(client);
          return;
        }
        
        client.send(message);
      } catch (error) {
        console.error('Failed to send to client:', error);
        // Mark for removal to avoid repeated errors
        clientsToRemove.push(client);
      }
    });
    
    // Remove failed/closed clients
    clientsToRemove.forEach(client => {
      this.clients.delete(client);
      console.log('🗑️ Removed failed/closed SSE client');
    });
    
    console.log(`✅ Sent to ${this.clients.size} SSE clients`);
  }
}
