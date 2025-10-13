/**
 * Tab Visibility Monitor for Voice Connection
 *
 * Monitors when the user switches tabs and returns, checking voice connection
 * health and triggering recovery if needed.
 *
 * This solves the "switch tabs and come back to errors" problem.
 */

import { isVoiceConnectionHealthy, triggerRecoveryIfNeeded } from './voiceErrorRecovery';
import { isConnectionHealthCheckEnabled } from './connectionHealthConfig';

let isMonitoring = false;
let wasHidden = false;

/**
 * Check connection health when user returns to the tab
 */
const handleVisibilityChange = async () => {
  const isHidden = document.hidden;

  if (isHidden) {
    // User switched away from the tab
    wasHidden = true;
    console.log('👋 User switched away from tab - voice connection will be monitored');
  } else if (wasHidden) {
    // User returned to the tab
    console.log('👀 User returned to tab - checking voice connection health...');
    wasHidden = false;

    // Wait a moment for the page to settle
    await new Promise(resolve => setTimeout(resolve, 500));

    // Check if voice connection is healthy
    const isHealthy = isVoiceConnectionHealthy();

    if (!isHealthy) {
      console.warn('⚠️ Voice connection unhealthy after returning to tab - triggering recovery');

      // Give a moment for any pending operations to complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Trigger recovery
      await triggerRecoveryIfNeeded();
    } else {
      console.log('✅ Voice connection healthy after returning to tab');
    }
  }
};

/**
 * Start monitoring tab visibility changes
 */
export const startTabVisibilityMonitoring = () => {
  if (!isConnectionHealthCheckEnabled()) {
    console.log('🔇 Connection health checks disabled - skipping tab visibility monitoring');
    return;
  }

  if (isMonitoring) {
    console.log('ℹ️ Tab visibility monitoring already active');
    return;
  }

  if (typeof document === 'undefined') {
    console.warn('⚠️ Document not available - cannot monitor tab visibility');
    return;
  }

  console.log('👁️ Starting tab visibility monitoring for voice connection');
  document.addEventListener('visibilitychange', handleVisibilityChange);
  isMonitoring = true;

  // Expose stop function globally
  (window as any).__stopTabVisibilityMonitoring = stopTabVisibilityMonitoring;
  console.log('🔧 Call __stopTabVisibilityMonitoring() to disable monitoring');
};

/**
 * Stop monitoring tab visibility changes
 */
export const stopTabVisibilityMonitoring = () => {
  if (!isMonitoring) {
    return;
  }

  console.log('⏹️ Stopping tab visibility monitoring');
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  isMonitoring = false;
  wasHidden = false;
};

/**
 * Check if monitoring is currently active
 */
export const isTabVisibilityMonitoringActive = () => isMonitoring;

// Expose utilities globally for debugging
if (typeof window !== 'undefined') {
  (window as any).__startTabVisibilityMonitoring = startTabVisibilityMonitoring;
  (window as any).__stopTabVisibilityMonitoring = stopTabVisibilityMonitoring;
  (window as any).__isTabVisibilityMonitoringActive = isTabVisibilityMonitoringActive;
}
