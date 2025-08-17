// static/js/utils/socketio-loader.js
// Socket.IO loader with multiple CDN fallbacks and promise-based loading

window.SocketIOLoader = {
    loading: false,
    loaded: false,
    error: null,
    loadPromise: null
};

(function loadSocketIO() {
    // Multiple CDN sources for better reliability
    const CDN_SOURCES = [
        'https://cdn.socket.io/4.7.4/socket.io.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.7.4/socket.io.min.js',
        'https://unpkg.com/socket.io-client@4.7.4/dist/socket.io.min.js'
    ];
    
    // Create a promise for loading
    window.SocketIOLoader.loadPromise = new Promise((resolve, reject) => {
        // Check if already loaded
        if (typeof io !== 'undefined') {
            window.SocketIOLoader.loaded = true;
            console.log('[IO] Socket.IO already loaded');
            resolve();
            return;
        }
        
        // Check if already loading
        if (window.SocketIOLoader.loading) {
            console.log('[IO] Socket.IO already loading, waiting...');
            // Wait for the existing load to complete
            const checkLoaded = setInterval(() => {
                if (window.SocketIOLoader.loaded) {
                    clearInterval(checkLoaded);
                    resolve();
                } else if (window.SocketIOLoader.error) {
                    clearInterval(checkLoaded);
                    reject(new Error(window.SocketIOLoader.error));
                }
            }, 100);
            return;
        }
        
        window.SocketIOLoader.loading = true;
        console.log('[IO] Loading Socket.IO client from CDN...');
        
        // Try each CDN source
        let currentSourceIndex = 0;
        
        function tryNextSource() {
            if (currentSourceIndex >= CDN_SOURCES.length) {
                const error = 'All Socket.IO CDN sources failed to load';
                window.SocketIOLoader.error = error;
                window.SocketIOLoader.loading = false;
                console.error('[IO]', error, '- voice features will be disabled');
                
                // Disable voice button
                const voiceBtn = document.getElementById('voice-button');
                if (voiceBtn) voiceBtn.classList.add('disabled');
                
                reject(new Error(error));
                return;
            }
            
            const cdnSrc = CDN_SOURCES[currentSourceIndex];
            console.log(`[IO] Trying CDN source ${currentSourceIndex + 1}/${CDN_SOURCES.length}: ${cdnSrc}`);
            
            const script = document.createElement('script');
            script.src = cdnSrc;
            script.async = true;
            
            script.onload = () => {
                // Wait a bit for io to be available
                setTimeout(() => {
                    if (typeof io !== 'undefined') {
                        window.SocketIOLoader.loaded = true;
                        window.SocketIOLoader.loading = false;
                        console.log(`[IO] Socket.IO client loaded successfully from ${cdnSrc}`);
                        resolve();
                    } else {
                        console.warn(`[IO] Socket.IO client failed to initialize from ${cdnSrc}, trying next source...`);
                        currentSourceIndex++;
                        tryNextSource();
                    }
                }, 200); // Increased timeout for better reliability
            };
            
            script.onerror = () => {
                console.warn(`[IO] Failed to load from ${cdnSrc}, trying next source...`);
                currentSourceIndex++;
                tryNextSource();
            };
            
            document.head.appendChild(script);
        }
        
        // Start with the first source
        tryNextSource();
    });
})();

// Helper function to wait for Socket.IO
window.waitForSocketIO = function(timeout = 15000) {
    return Promise.race([
        window.SocketIOLoader.loadPromise,
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Socket.IO loading timeout')), timeout)
        )
    ]);
};

// Alternative loading method for manual retry
window.retrySocketIOLoading = function() {
    if (window.SocketIOLoader.loaded) {
        return Promise.resolve();
    }
    
    // Reset state
    window.SocketIOLoader.loading = false;
    window.SocketIOLoader.error = null;
    window.SocketIOLoader.loadPromise = null;
    
    // Re-run the loader
    const script = document.createElement('script');
    script.src = '/static/js/utils/socketio-loader.js';
    document.head.appendChild(script);
    
    return window.waitForSocketIO();
};