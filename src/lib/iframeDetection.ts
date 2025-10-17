import React from 'react';

/**
 * Utility functions for detecting if the app is running in an iframe
 */

/**
 * Detects if the current window is running inside an iframe
 * @returns boolean - true if running in iframe, false if accessed directly
 */
export const isRunningInIframe = (): boolean => {
  try {
    // Method 1: Check if window.self !== window.top
    // This is the most reliable method for iframe detection
    if (window.self !== window.top) {
      return true;
    }

    // Method 2: Check if window.parent !== window.self
    // Additional check for nested iframes
    if (window.parent !== window.self) {
      return true;
    }

    // Method 3: Check for iframe-specific URL parameters
    // Your app already uses sessionId parameter for iframe sessions
    const urlParams = new URLSearchParams(window.location.search);
    const iframeSessionId = urlParams.get('sessionId');
    
    // If sessionId is present, it's likely being used in an iframe
    if (iframeSessionId) {
      return true;
    }

    // Method 4: Check for other iframe indicators
    // Some iframe implementations add specific parameters
    const iframeIndicators = ['embed', 'iframe', 'widget'];
    for (const indicator of iframeIndicators) {
      if (urlParams.has(indicator)) {
        return true;
      }
    }

    return false;
  } catch (error) {
    // If we can't access window.top due to cross-origin restrictions,
    // it's likely we're in an iframe
    console.log('🔍 Iframe detection: Cross-origin access blocked, likely in iframe');
    return true;
  }
};

/**
 * Gets additional context about the iframe environment
 * @returns object with iframe context information
 */
export const getIframeContext = () => {
  const urlParams = new URLSearchParams(window.location.search);
  
  return {
    isIframe: isRunningInIframe(),
    sessionId: urlParams.get('sessionId'),
    embedMode: urlParams.get('embed') === 'true',
    widgetMode: urlParams.get('widget') === 'true',
    showChat: urlParams.get('showChat') === 'true',
    chatOnly: urlParams.get('chatOnly') === 'true', // NEW: Add chatOnly parameter
    allParams: Object.fromEntries(urlParams.entries())
  };
};

/**
 * Hook to use iframe detection in React components
 * @returns object with iframe detection state and context
 */
export const useIframeDetection = () => {
  const [iframeContext, setIframeContext] = React.useState(() => getIframeContext());

  React.useEffect(() => {
    // Update context if URL parameters change
    const handleUrlChange = () => {
      setIframeContext(getIframeContext());
    };

    // Listen for URL changes (though this is rare in SPAs)
    window.addEventListener('popstate', handleUrlChange);
    
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
    };
  }, []);

  return iframeContext;
};
