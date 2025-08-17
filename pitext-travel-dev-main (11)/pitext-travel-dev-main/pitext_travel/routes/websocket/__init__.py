# pitext_travel/routes/websocket/__init__.py
"""WebSocket route handlers initialization."""

import logging

from .connection import ConnectionHandler
from .audio import AudioHandler
from .session import SessionHandler
from .base import NAMESPACE

logger = logging.getLogger(__name__)


def register_websocket_handlers(socketio):
    """Register all WebSocket event handlers with SocketIO.
    
    This replaces the original single large register_websocket_handlers
    function by delegating to specialized handler classes.
    
    Args:
        socketio: Flask-SocketIO instance
    """
    logger.info("Registering enhanced WebSocket handlers...")
    
    try:
        # Initialize handler instances
        logger.info(f"Creating handler instances for namespace: {NAMESPACE}")
        connection_handler = ConnectionHandler(socketio, NAMESPACE)
        audio_handler = AudioHandler(socketio, NAMESPACE)
        session_handler = SessionHandler(socketio, NAMESPACE)
        
        # Register handlers from each module
        logger.info(f"Registering connection handler for namespace: {NAMESPACE}")
        connection_handler.register_handlers()
        
        logger.info(f"Registering audio handler for namespace: {NAMESPACE}")
        audio_handler.register_handlers()
        
        logger.info(f"Registering session handler for namespace: {NAMESPACE}")
        session_handler.register_handlers()
        
        logger.info("✅ Enhanced WebSocket handlers registered successfully")
        
        # Test that the namespace is properly registered
        logger.info(f"Testing namespace registration for: {NAMESPACE}")
        
    except Exception as e:
        logger.error(f"❌ Failed to register WebSocket handlers: {e}")
        logger.exception("WebSocket registration error:")
        # Don't raise the exception - let the app continue without WebSocket handlers
        logger.warning("Application will continue without WebSocket functionality")


# Export for backward compatibility
__all__ = ['register_websocket_handlers', 'NAMESPACE']