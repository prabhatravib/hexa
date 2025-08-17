# pitext_travel/routes/websocket/connection.py
"""WebSocket connection and disconnection handlers."""

import time
import logging
from flask import session, request
from flask_socketio import disconnect

from .base import BaseWebSocketHandler, NAMESPACE

logger = logging.getLogger(__name__)


class ConnectionHandler(BaseWebSocketHandler):
    """Handles WebSocket connection lifecycle events."""
    
    def register_handlers(self):
        """Register connection-related event handlers."""
        
        @self.socketio.on('connect', namespace=NAMESPACE)
        def handle_connect(auth):
            """Handle WebSocket connection from browser - NON-BLOCKING."""
            try:
                client_info = self.get_client_info()
                self.log_event('connect', {'auth': auth})
                
                # CRITICAL: Send connected event IMMEDIATELY - no blocking operations
                logger.info(f"🔗 Client connected to /travel/ws namespace: {client_info['sid']}")
                
                connected_data = {
                    'session_id': client_info['sid'],
                    'status': 'connected',
                    'timestamp': time.time()
                }
                
                # Send connected event immediately to prevent timeout
                self.emit_to_client('connected', connected_data)
                logger.info(f"✅ Connected event sent immediately to {client_info['sid']}")
                
                # Initialize basic Flask session info (non-blocking)
                if '_id' not in session:
                    session['_id'] = client_info['flask_session_id']
                    session.modified = True
                    logger.info(f"📝 Created Flask session ID: {session['_id']}")
                
                logger.info(f"✅ WebSocket connection established successfully for {client_info['sid']}")
                
            except Exception as connect_error:
                logger.error(f"❌ Error in handle_connect: {connect_error}")
                logger.exception("Connect handler error:")
                # Try to emit error event
                try:
                    self.emit_to_client('error', {
                        'message': f'Connection setup failed: {str(connect_error)}',
                        'type': 'connect_error'
                    })
                except Exception as emit_error:
                    logger.error(f"❌ Failed to emit error event: {emit_error}")
        
        @self.socketio.on('disconnect', namespace=NAMESPACE)
        def handle_disconnect(reason=None):
            """Handle WebSocket disconnection."""
            session_id = session.get('realtime_session_id')
            
            if session_id:
                try:
                    from pitext_travel.api.realtime.session_manager import get_session_manager
                    manager = get_session_manager()
                    manager.deactivate_session(session_id, 'client_disconnect')
                    logger.info(f"🔌 WebSocket disconnected, session {session_id} deactivated (reason: {reason})")
                except ImportError:
                    logger.warning("Session manager not available during disconnect")
                except Exception as e:
                    self.handle_error(e, 'disconnect')
            else:
                self.log_event('disconnect', {'no_session': True, 'reason': reason})
        
        @self.socketio.on('ping', namespace=NAMESPACE)
        def handle_ping():
            """Handle ping for connection testing."""
            self.emit_to_client('pong', {'timestamp': time.time()})
        
        @self.socketio.on('test', namespace=NAMESPACE)
        def handle_test(data):
            """Handle test event for debugging."""
            logger.info(f"Test event received: {data}")
            self.emit_to_client('test_response', {
                'message': 'Test successful',
                'received_data': data,
                'timestamp': time.time()
            })
        
        @self.socketio.on('test_verification', namespace=NAMESPACE)
        def handle_test_verification(data):
            """Handle test verification event for debugging."""
            logger.info(f"Test verification event received: {data}")
            self.emit_to_client('test_verification_response', {
                'message': 'Test verification successful',
                'received_data': data,
                'timestamp': time.time()
            })
        
        # Add namespace-specific error handler
        @self.socketio.on_error(namespace=NAMESPACE)
        def handle_namespace_error(e):
            """Handle errors in the travel namespace."""
            logger.error(f"❌ Error in {NAMESPACE} namespace: {e}")
            logger.error(f"❌ Error type: {type(e)}")
            logger.error(f"❌ Error args: {e.args if hasattr(e, 'args') else 'No args'}")
            try:
                self.emit_to_client('error', {
                    'message': f'Namespace error: {str(e)}',
                    'type': 'namespace_error'
                })
            except Exception as emit_error:
                logger.error(f"❌ Failed to emit error event: {emit_error}")