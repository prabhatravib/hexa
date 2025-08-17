"""
PiText-Travel - main application entry point
"""
import eventlet
eventlet.monkey_patch()

import logging
import os
import sys
from pathlib import Path
import time

from dotenv import load_dotenv
from flask import Flask, render_template, request
from flask_cors import CORS
from flask_socketio import SocketIO

# ------------------------------------------------------------------------------
# Environment & logging
# ------------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))        # make local imports reliable

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Suppress verbose socketio/engineio logs
logging.getLogger('socketio').setLevel(logging.WARNING)
logging.getLogger('engineio').setLevel(logging.WARNING)
logging.getLogger('socketio.server').setLevel(logging.WARNING) 
logging.getLogger('engineio.server').setLevel(logging.WARNING)

# ------------------------------------------------------------------------------
# Flask -- templates & static live under pitext_travel/
# ------------------------------------------------------------------------------
app = Flask(
    __name__,
    template_folder=str(BASE_DIR / "pitext_travel" / "templates"),
    static_folder=str(BASE_DIR / "pitext_travel" / "static"),
)

app.secret_key = os.getenv("FLASK_SECRET_KEY", os.urandom(32).hex())
if "FLASK_SECRET_KEY" not in os.environ:
    logger.warning("No FLASK_SECRET_KEY found. Generated a temporary key.")

app.config.update(
    SESSION_COOKIE_SECURE=False,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    PERMANENT_SESSION_LIFETIME=86400,
)

# CORS for local dev / front-end requests
CORS(app, origins="*", supports_credentials=True)

# ------------------------------------------------------------------------------
# Socket.IO
# ------------------------------------------------------------------------------
logger.info("Initializing Socket.IO...")
socketio = SocketIO(
    app,
    async_mode='eventlet',
    cors_allowed_origins="*",
    logger=True,
    engineio_logger=True,
    path="/socket.io/",
    # Shorter timeouts to prevent hanging connections
    ping_timeout=60,  # Reduced to 60 seconds to prevent hanging
    ping_interval=25,  # Standard 25 seconds interval
    cors_credentials=True,
    # Render-specific configuration
    max_http_buffer_size=100000000,  # 100MB buffer for large messages
    allow_upgrades=True,
    # Session management improvements
    cookie=None  # Disable cookie-based sessions to avoid conflicts
)
logger.info("Socket.IO initialised (async_mode=eventlet)")

# ------------------------------------------------------------------------------
# Load blueprint + websocket handlers
# ------------------------------------------------------------------------------
blueprint_loaded = False
travel_bp = None  # Initialize to None
try:
    from pitext_travel.routes.travel import create_travel_blueprint
    from pitext_travel.routes.websocket import register_websocket_handlers
    from pitext_travel.api.chat import bp_chat

    travel_bp = create_travel_blueprint(str(BASE_DIR / "pitext_travel"))
    app.register_blueprint(travel_bp)

    register_websocket_handlers(socketio)

    blueprint_loaded = True
    logger.info("Successfully loaded routes and websocket handlers")

except ImportError as exc:
    logger.error("Failed to import modules: %s", exc)
    logger.error("Application will run with limited functionality")
except Exception as exc:
    logger.exception("Error setting up routes: %s", exc)

# ------------------------------------------------------------------------------
# Routes
# ------------------------------------------------------------------------------
@app.route("/")
def index():
    """Root route."""
    if blueprint_loaded:
        return render_template("map.html")

    # Fallback HTML if blueprint fails to load
    return (
        f"""<!DOCTYPE html>
        <html>
        <head><title>PiText Travel</title></head>
        <body>
            <h1>PiText Travel Service</h1>
            <p>The service is running but some components failed to load.</p>
            <p>Blueprint loaded: {blueprint_loaded}</p>
            <p>Check the logs for more details.</p>
        </body>
        </html>""",
        200,
        {"Content-Type": "text/html"},
    )


@app.route("/test-socketio")
def test_socketio():
    """Test Socket.IO connection."""
    return """
    <!DOCTYPE html>
    <html>
    <head><title>Socket.IO Test</title></head>
    <body>
        <h1>Socket.IO Connection Test</h1>
        <div id="status">Testing...</div>
        <div id="log"></div>
        
        <script src="https://cdn.socket.io/4.7.4/socket.io.min.js"></script>
        <script>
            const status = document.getElementById('status');
            const log = document.getElementById('log');
            
            function add(msg) {
                log.innerHTML += `<p>${new Date().toISOString()}: ${msg}</p>`;
            }
            
            add('Starting Socket.IO test...');
            
            // Test 1: Default namespace
            add('Testing default namespace...');
            const defaultSocket = io('/', {
                path: '/socket.io/',
                transports: ['polling', 'websocket'],
                timeout: 10000
            });
            
            defaultSocket.on('connect', () => {
                add('✅ Connected to default namespace');
                status.textContent = 'Default namespace working';
            });
            
            defaultSocket.on('connect_error', (error) => {
                add(`❌ Default namespace failed: ${error.message}`);
            });
            
            // Test 2: Travel namespace
            setTimeout(() => {
                add('Testing /travel/ws namespace...');
                const travelSocket = io('/travel/ws', {
                    path: '/socket.io/',
                    transports: ['polling', 'websocket'],
                    timeout: 10000
                });
                
                travelSocket.on('connect', () => {
                    add('✅ Connected to /travel/ws namespace');
                    status.textContent = 'Both namespaces working!';
                    
                    // Test ping
                    travelSocket.emit('ping');
                });
                
                travelSocket.on('pong', (data) => {
                    add(`✅ PING/PONG working: ${JSON.stringify(data)}`);
                });
                
                travelSocket.on('connect_error', (error) => {
                    add(`❌ /travel/ws namespace failed: ${error.message}`);
                    status.textContent = 'Only default namespace working';
                });
            }, 2000);
        </script>
    </body>
    </html>
    """


@app.route("/websocket-health")
def websocket_health():
    """WebSocket health check endpoint."""
    return {
        "status": "ok",
        "socketio_configured": True,
        "namespace": "/travel/ws",
        "configuration": {
            "async_mode": "eventlet",
            "ping_timeout": 60,
            "ping_interval": 25,
            "path": "/socket.io/",
            "cors_allowed_origins": "*",
            "max_http_buffer_size": "100MB"
        },
        "endpoints": {
            "test": "/test-socketio",
            "diagnostics": "/websocket-diagnostics",
            "travel": "/travel/",
            "health": "/health"
        },
        "recommended_client_config": {
            "transports": ["polling"],
            "timeout": 30000,
            "pingTimeout": 60000,
            "pingInterval": 25000,
            "upgrade": False
        },
        "timestamp": time.time()
    }


@app.route("/health")
def health():
    """Health-check endpoint."""
    return {"status": "ok", "blueprint_loaded": blueprint_loaded}


@app.route("/debug")
def debug():
    """Basic JSON diagnostics."""
    return {
        "status": "ok",
        "socketio_initialized": True,
        "blueprint_loaded": blueprint_loaded,
        "endpoints": {
            "websocket_test": "/test-websocket",
            "websocket_diagnostics": "/websocket-diagnostics",
            "socketio_test": "/test-socketio",
            "websocket_health": "/websocket-health",
            "websocket_namespace": "/travel/ws",
            "travel_app": "/travel/",
        },
        "socketio_config": {
            "async_mode": "eventlet",
            "path": "/socket.io/",
            "ping_timeout": 60,
            "ping_interval": 25,
            "cors_allowed_origins": "*"
        }
    }


@app.route("/test-websocket")
def test_websocket():
    """Simple WebSocket test page."""
    return """
    <!DOCTYPE html>
    <html>
    <head><title>WebSocket Test</title></head>
    <body>
        <h1>WebSocket Connection Test</h1>
        <div id="status">Testing...</div>
        <div id="log"></div>
        
        <script src="https://cdn.socket.io/4.7.4/socket.io.min.js"></script>
        <script>
            const status = document.getElementById('status');
            const log = document.getElementById('log');
            
            function add(msg) {
                log.innerHTML += `<p>${new Date().toISOString()}: ${msg}</p>`;
            }
            
            add('Starting WebSocket test...');
            
            // Test travel namespace
            const socket = io('/travel/ws', {
                path: '/socket.io/',
                transports: ['polling'],
                timeout: 30000
            });
            
            socket.on('connect', () => {
                add('✅ Connected to /travel/ws namespace');
                status.textContent = 'WebSocket working!';
                
                // Test ping
                socket.emit('ping');
            });
            
            socket.on('connected', (data) => {
                add(`✅ Received connected event: ${JSON.stringify(data)}`);
            });
            
            socket.on('pong', (data) => {
                add(`✅ PING/PONG working: ${JSON.stringify(data)}`);
            });
            
            socket.on('connect_error', (error) => {
                add(`❌ Connection failed: ${error.message}`);
                status.textContent = 'WebSocket failed';
            });
            
            socket.on('disconnect', (reason) => {
                add(`🔌 Disconnected: ${reason}`);
            });
        </script>
    </body>
    </html>
    """

@app.route("/websocket-diagnostics")
def websocket_diagnostics():
    """WebSocket diagnostic endpoint for troubleshooting."""
    return """
    <!DOCTYPE html>
    <html>
    <head><title>WebSocket Diagnostics</title></head>
    <body>
        <h1>WebSocket Connection Diagnostics</h1>
        <div id="status">Running diagnostics...</div>
        <div id="log"></div>
        
        <script src="https://cdn.socket.io/4.7.4/socket.io.min.js"></script>
        <script>
            const status = document.getElementById('status');
            const log = document.getElementById('log');
            
            function add(msg) {
                log.innerHTML += `<p>${new Date().toISOString()}: ${msg}</p>`;
                console.log(msg);
            }
            
            add('Starting WebSocket diagnostics...');
            
            // Test 1: Basic connection
            add('Test 1: Basic connection to /travel/ws...');
            const socket = io('/travel/ws', {
                path: '/socket.io/',
                transports: ['polling'],
                timeout: 30000,
                pingTimeout: 120000,
                pingInterval: 30000,
                upgrade: false
            });
            
            let testResults = {
                connected: false,
                connectedEvent: false,
                pingPong: false,
                errors: []
            };
            
            socket.on('connect', () => {
                add('✅ Socket.IO connect event received');
                testResults.connected = true;
                status.textContent = 'Connected - testing features...';
                
                // Test ping
                socket.emit('ping');
            });
            
            socket.on('connected', (data) => {
                add(`✅ Server connected event received: ${JSON.stringify(data)}`);
                testResults.connectedEvent = true;
            });
            
            socket.on('pong', (data) => {
                add(`✅ PING/PONG working: ${JSON.stringify(data)}`);
                testResults.pingPong = true;
                
                // Final status
                if (testResults.connected && testResults.connectedEvent && testResults.pingPong) {
                    status.textContent = '✅ All tests passed! WebSocket is working correctly.';
                    add('🎉 All diagnostic tests passed successfully!');
                }
            });
            
            socket.on('connect_error', (error) => {
                add(`❌ Connection error: ${error.message}`);
                testResults.errors.push(error.message);
                status.textContent = '❌ Connection failed';
            });
            
            socket.on('disconnect', (reason) => {
                add(`🔌 Disconnected: ${reason}`);
            });
            
            socket.on('error', (error) => {
                add(`❌ Socket error: ${error}`);
                testResults.errors.push(error);
            });
            
            // Timeout after 30 seconds
            setTimeout(() => {
                if (!testResults.connected) {
                    add('⏰ Diagnostic timeout - connection failed');
                    status.textContent = '❌ Connection timeout';
                }
            }, 30000);
        </script>
    </body>
    </html>
    """

@app.route("/test-502-fix")
def test_502_fix():
    """Test endpoint specifically for 502 error issues."""
    return """
    <!DOCTYPE html>
    <html>
    <head><title>502 Error Fix Test</title></head>
    <body>
        <h1>502 Error Connection Test</h1>
        <div id="status">Testing connection stability...</div>
        <div id="log"></div>
        
        <script src="https://cdn.socket.io/4.7.4/socket.io.min.js"></script>
        <script>
            const status = document.getElementById('status');
            const log = document.getElementById('log');
            
            function add(msg) {
                log.innerHTML += `<p>${new Date().toISOString()}: ${msg}</p>`;
                console.log(msg);
            }
            
            add('Testing 502 error fix with shorter timeouts...');
            
            // Test with shorter timeouts to prevent hanging
            const socket = io('/travel/ws', {
                path: '/socket.io/',
                transports: ['polling'],
                timeout: 30000,  // 30 second timeout
                pingTimeout: 60000,  // 1 minute ping timeout
                pingInterval: 25000,  // 25 second ping interval
                upgrade: false,
                maxRetries: 0,
                retryDelay: 0
            });
            
            let connectionStart = Date.now();
            
            socket.on('connect', () => {
                const duration = Date.now() - connectionStart;
                add(`✅ Connected in ${duration}ms - no hanging detected`);
                status.textContent = 'Connection successful!';
                
                // Test ping
                socket.emit('ping');
            });
            
            socket.on('connected', (data) => {
                add(`✅ Server connected event: ${JSON.stringify(data)}`);
            });
            
            socket.on('pong', (data) => {
                add(`✅ PING/PONG working: ${JSON.stringify(data)}`);
                status.textContent = 'All tests passed - 502 error should be fixed!';
            });
            
            socket.on('connect_error', (error) => {
                const duration = Date.now() - connectionStart;
                add(`❌ Connection failed after ${duration}ms: ${error.message}`);
                status.textContent = 'Connection failed - 502 error still occurring';
            });
            
            socket.on('disconnect', (reason) => {
                add(`🔌 Disconnected: ${reason}`);
            });
            
            // Test timeout after 35 seconds
            setTimeout(() => {
                if (!socket.connected) {
                    add('⏰ Connection timeout - 502 error likely still occurring');
                    status.textContent = 'Connection timeout - 502 error not fixed';
                }
            }, 35000);
        </script>
    </body>
    </html>
    """

# ------------------------------------------------------------------------------
# Default namespace events (removed to avoid conflicts with namespace handlers)
# ------------------------------------------------------------------------------
# Note: Default namespace handlers removed to avoid conflicts with /travel/ws namespace
# The voice functionality uses the /travel/ws namespace exclusively

# ------------------------------------------------------------------------------
# Error handling
# ------------------------------------------------------------------------------
@socketio.on_error_default
def _default_error_handler(e):
    logger.error(f"❌ Default Socket.IO error: {e}")
    logger.error(f"❌ Error type: {type(e)}")
    logger.error(f"❌ Error args: {e.args if hasattr(e, 'args') else 'No args'}")
    
    # Handle specific error types
    if "Invalid session" in str(e):
        logger.warning("🔄 Invalid session detected - this is normal during reconnections")
    elif "transport error" in str(e).lower():
        logger.warning("🌐 Transport error detected - proxy/load balancer issue")
    elif "timeout" in str(e).lower():
        logger.warning("⏰ Connection timeout detected")

@socketio.on_error()
def _socketio_error_handler(e):
    logger.error(f"❌ Socket.IO error: {e}")
    logger.error(f"❌ Error type: {type(e)}")
    logger.error(f"❌ Error args: {e.args if hasattr(e, 'args') else 'No args'}")
    
    # Handle specific error types
    if "Invalid session" in str(e):
        logger.warning("🔄 Invalid session detected - this is normal during reconnections")
    elif "transport error" in str(e).lower():
        logger.warning("🌐 Transport error detected - proxy/load balancer issue")
    elif "timeout" in str(e).lower():
        logger.warning("⏰ Connection timeout detected")

# Add a simple connection test for the default namespace
@socketio.on('connect')
def handle_default_connect():
    logger.info("🔗 Client connected to default namespace")
    return True

@socketio.on('disconnect')
def handle_default_disconnect():
    logger.info("🔌 Client disconnected from default namespace")

# ------------------------------------------------------------------------------
# Entrypoint
# ------------------------------------------------------------------------------
if __name__ == "__main__":
    host  = os.getenv("HOST", "0.0.0.0")
    port  = int(os.getenv("PORT", 5000))
    is_debug = os.getenv("FLASK_ENV") == "development"

    logger.info(f"Starting travel app on {host}:{port}")
    logger.info(f"Debug mode: {is_debug}")
    logger.info(f"Blueprint loaded: {travel_bp is not None}")

    socketio.run(app, host=host, port=port, debug=is_debug)

# For ASGI servers
__all__ = ["app", "socketio"]
