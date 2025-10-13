/**
 * Centralized Voice Error Recovery System
 *
 * Provides automatic recovery from voice connection errors with:
 * - Proper cleanup of stale WebRTC PeerConnections
 * - Smart retry logic with 5-second cooldown
 * - Prevention of concurrent recovery attempts
 * - Visual feedback via toast notifications
 * - Success/failure tracking
 */

import { resetAudioAnalysis } from '../hooks/voiceAudioAnalysis';
import { isConnectionHealthCheckEnabled } from './connectionHealthConfig';

let isRecovering = false;
let recoveryAttempts = 0;
const MAX_RECOVERY_ATTEMPTS = 5;
const RECOVERY_COOLDOWN = 5000; // 5 seconds between attempts
const CLEANUP_DELAY = 1000; // 1 second for cleanup

// Toast notification function (will be injected from UI component)
let showToastFn: ((message: string, type?: 'info' | 'success' | 'error') => void) | null = null;

/**
 * Register a toast notification function from the UI layer
 */
export const registerToastNotification = (fn: (message: string, type?: 'info' | 'success' | 'error') => void) => {
  showToastFn = fn;
  console.log('✅ Toast notification registered for voice recovery');
};

/**
 * Show toast notification (if registered)
 */
const showToast = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
  if (showToastFn) {
    showToastFn(message, type);
  }
  console.log(`🔔 [${type.toUpperCase()}] ${message}`);
};

/**
 * Reset recovery attempt counter (call after successful operation)
 */
export const resetRecoveryAttempts = () => {
  recoveryAttempts = 0;
  console.log('✅ Recovery attempt counter reset');
};

/**
 * Get current recovery status
 */
export const getRecoveryStatus = () => ({
  isRecovering,
  recoveryAttempts,
  maxAttempts: MAX_RECOVERY_ATTEMPTS
});

/**
 * Cleanup old session and WebRTC connection
 */
const cleanupOldSession = async (): Promise<boolean> => {
  try {
    console.log('🧹 Starting session cleanup...');

    // Step 1: Get reference to old session
    const oldSession = (window as any).activeSession;

    if (oldSession) {
      try {
        // Step 1a: Close the WebRTC PeerConnection
        const pc = (oldSession as any)._pc;
        if (pc) {
          console.log('🔌 Closing old WebRTC peer connection...');
          console.log('  Connection state:', pc.connectionState);
          console.log('  ICE connection state:', pc.iceConnectionState);
          pc.close();
          console.log('✅ Old WebRTC peer connection closed');
        } else {
          console.log('⚠️ No peer connection found on old session');
        }

        // Step 1b: Close the session itself
        if (typeof oldSession.close === 'function') {
          console.log('🔌 Closing old OpenAI session...');
          oldSession.close();
          console.log('✅ Old OpenAI session closed');
        }
      } catch (closeError) {
        console.warn('⚠️ Error closing old session:', closeError);
        // Continue anyway - we still want to null out the reference
      }

      // Step 1c: Nullify the global reference
      (window as any).activeSession = null;
      console.log('✅ Cleared global session reference');
    } else {
      console.log('ℹ️ No active session found to clean up');
    }

    // Step 2: Reset audio analysis (clear cached audio contexts)
    console.log('🎵 Resetting audio analysis and clearing cached contexts...');
    resetAudioAnalysis();

    // Step 3: Clear audio element
    const audioEl = (window as any).__hexaAudioEl as HTMLAudioElement | undefined;
    if (audioEl) {
      try {
        // Pause and clear audio
        if (!audioEl.paused) {
          audioEl.pause();
        }
        audioEl.srcObject = null;
        console.log('✅ Cleared audio element');
      } catch (audioError) {
        console.warn('⚠️ Error clearing audio element:', audioError);
      }
    }

    // Step 4: Wait for cleanup to propagate
    console.log(`⏳ Waiting ${CLEANUP_DELAY}ms for cleanup to complete...`);
    await new Promise(resolve => setTimeout(resolve, CLEANUP_DELAY));

    return true;
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    return false;
  }
};

/**
 * Reset the worker session via API
 */
const resetWorkerSession = async (): Promise<boolean> => {
  try {
    console.log('🔄 Resetting worker session...');

    const resetResponse = await fetch('/voice/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!resetResponse.ok) {
      throw new Error(`Reset failed with status ${resetResponse.status}`);
    }

    const result = await resetResponse.json();
    console.log('✅ Worker session reset successful:', result);

    return true;
  } catch (error) {
    console.error('❌ Worker reset failed:', error);
    return false;
  }
};

/**
 * Request new session via connection_ready message
 */
const requestNewSession = async (): Promise<boolean> => {
  try {
    console.log('🔄 Requesting new session...');

    const reconnectResponse = await fetch('/voice/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'connection_ready' })
    });

    if (!reconnectResponse.ok) {
      throw new Error(`Reconnection failed with status ${reconnectResponse.status}`);
    }

    const result = await reconnectResponse.json();
    console.log('✅ New session requested successfully:', result);

    return true;
  } catch (error) {
    console.error('❌ New session request failed:', error);
    return false;
  }
};

/**
 * Main auto-recovery function
 *
 * Automatically recovers from voice connection errors by:
 * 1. Cleaning up old sessions and PeerConnections
 * 2. Resetting the worker session
 * 3. Requesting a new session
 *
 * @returns Promise<boolean> - true if recovery succeeded, false otherwise
 */
export const autoRecoverVoiceConnection = async (): Promise<boolean> => {
  // Prevent multiple simultaneous recovery attempts
  if (isRecovering) {
    console.log('🔄 Recovery already in progress, skipping...');
    return false;
  }

  // Check retry limit
  if (recoveryAttempts >= MAX_RECOVERY_ATTEMPTS) {
    console.error(`❌ Max recovery attempts (${MAX_RECOVERY_ATTEMPTS}) reached`);
    showToast('Voice connection failed. Please reload the page.', 'error');

    // Reset counter after 1 minute to allow future attempts
    setTimeout(() => {
      recoveryAttempts = 0;
      console.log('🔄 Recovery attempt counter reset after cooldown period');
    }, 60000);

    return false;
  }

  isRecovering = true;
  recoveryAttempts++;

  console.log(`🔄 Auto-recovery attempt ${recoveryAttempts}/${MAX_RECOVERY_ATTEMPTS}...`);
  showToast(`Reconnecting voice... (${recoveryAttempts}/${MAX_RECOVERY_ATTEMPTS})`, 'info');

  try {
    // Step 1: Cleanup old session
    console.log('📋 Step 1/3: Cleaning up old session...');
    const cleanupSuccess = await cleanupOldSession();
    if (!cleanupSuccess) {
      throw new Error('Failed to cleanup old session');
    }

    // Step 2: Reset the worker session
    console.log('📋 Step 2/3: Resetting worker session...');
    const resetSuccess = await resetWorkerSession();
    if (!resetSuccess) {
      throw new Error('Failed to reset worker session');
    }

    // Step 3: Request new session
    console.log('📋 Step 3/3: Requesting new session...');
    const reconnectSuccess = await requestNewSession();
    if (!reconnectSuccess) {
      throw new Error('Failed to request new session');
    }

    console.log('✅ Voice connection auto-recovery completed successfully');
    showToast('Voice reconnected successfully!', 'success');

    // Reset attempt counter on success after 30 seconds
    setTimeout(() => {
      recoveryAttempts = 0;
      console.log('✅ Recovery counter reset after successful recovery');
    }, 30000);

    return true;

  } catch (error) {
    console.error(`❌ Auto-recovery attempt ${recoveryAttempts} failed:`, error);

    // If we haven't reached max attempts, schedule next retry
    if (recoveryAttempts < MAX_RECOVERY_ATTEMPTS) {
      showToast(`Recovery failed, retrying in ${RECOVERY_COOLDOWN / 1000}s...`, 'info');
      console.log(`⏳ Waiting ${RECOVERY_COOLDOWN}ms before next attempt...`);
      await new Promise(resolve => setTimeout(resolve, RECOVERY_COOLDOWN));
    } else {
      showToast('Voice connection failed. Please reload the page.', 'error');
    }

    return false;

  } finally {
    isRecovering = false;
  }
};

/**
 * Trigger recovery only if not already recovering
 * Safe to call multiple times - will deduplicate automatically
 */
export const triggerRecoveryIfNeeded = async (): Promise<boolean> => {
  if (isRecovering) {
    console.log('🔄 Recovery already in progress, skipping duplicate trigger');
    return false;
  }

  return autoRecoverVoiceConnection();
};

/**
 * Check if voice connection is healthy
 */
export const isVoiceConnectionHealthy = (): boolean => {
  if (!isConnectionHealthCheckEnabled()) {
    console.log('🔇 Connection health checks disabled - skipping health check');
    return true; // Return true to avoid triggering recovery
  }

  const session = (window as any).activeSession;
  if (!session) {
    console.log('⚠️ Health check: No active session');
    return false;
  }

  const pc = (session as any)._pc;
  if (!pc) {
    console.log('⚠️ Health check: No peer connection');
    return false;
  }

  const connectionState = pc.connectionState;
  const iceConnectionState = pc.iceConnectionState;

  const isHealthy =
    (connectionState === 'connected' || connectionState === 'completed') &&
    (iceConnectionState === 'connected' || iceConnectionState === 'completed');

  if (!isHealthy) {
    console.log('⚠️ Health check failed:', {
      connectionState,
      iceConnectionState
    });
  }

  return isHealthy;
};

/**
 * Manual recovery function - can be called from console
 * Usage: window.__hexaAutoRecover()
 */
if (typeof window !== 'undefined') {
  (window as any).__hexaAutoRecover = autoRecoverVoiceConnection;
  (window as any).__hexaResetRecoveryAttempts = resetRecoveryAttempts;
  (window as any).__hexaCheckVoiceHealth = isVoiceConnectionHealthy;
  (window as any).__hexaGetRecoveryStatus = getRecoveryStatus;

  console.log('🔧 Voice recovery utilities exposed to window:');
  console.log('  - __hexaAutoRecover() - Manual recovery');
  console.log('  - __hexaResetRecoveryAttempts() - Reset counter');
  console.log('  - __hexaCheckVoiceHealth() - Check connection');
  console.log('  - __hexaGetRecoveryStatus() - Get status');
}
