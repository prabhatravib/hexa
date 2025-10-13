/**
 * Connection Health Check Configuration
 * 
 * Controls only connection-related health checks, not animation or audio monitoring.
 * Set ENABLE_CONNECTION_HEALTH_CHECKS to false to disable connection monitoring
 * that interferes with hexagon worker operations.
 */

export const CONNECTION_HEALTH_CONFIG = {
  // Flag to enable/disable connection health checks only
  ENABLE_CONNECTION_HEALTH_CHECKS: false, // Default: NO (as requested)
};

/**
 * Helper function to check if connection health checks are enabled
 */
export const isConnectionHealthCheckEnabled = (): boolean => {
  return CONNECTION_HEALTH_CONFIG.ENABLE_CONNECTION_HEALTH_CHECKS;
};
