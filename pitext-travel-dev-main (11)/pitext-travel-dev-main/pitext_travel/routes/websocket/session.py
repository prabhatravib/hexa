# pitext_travel/routes/websocket/session.py
"""WebSocket handlers for session management and map integration."""

import logging
import time
from flask import request, session

from .base import BaseWebSocketHandler, NAMESPACE
from pitext_travel.routes.websocket.callback_helpers import wire_realtime_callbacks

logger = logging.getLogger(__name__)


class SessionHandler(BaseWebSocketHandler):
    """Handles session-related WebSocket events."""
    
    def register_handlers(self):
        """Register session-related event handlers."""
        
        @self.socketio.on("start_session", namespace=NAMESPACE)
        def handle_start_session(data):
            """Start OpenAI Realtime API session with enhanced initialization."""
            client_info = self.get_client_info()
            logger.info(f"🔍 start_session called - client: {client_info['sid']}, session keys: {list(session.keys())}")
            
            # Create or get Realtime session if not exists
            if 'realtime_session_id' not in session:
                try:
                    logger.info("📦 Importing session manager...")
                    from pitext_travel.api.realtime.session_manager import get_session_manager
                    
                    logger.info("🏭 Getting session manager instance...")
                    manager = get_session_manager()
                    logger.info(f"✅ Session manager obtained: {type(manager)}")
                    
                    logger.info(f"🔧 Creating session for IP: {client_info['ip']}, Flask session: {session.get('_id', client_info['flask_session_id'])}")
                    realtime_session = manager.create_session(
                        client_info['ip'], 
                        session.get('_id', client_info['flask_session_id'])
                    )
                    
                    if not realtime_session:
                        logger.error("❌ Failed to create realtime session - rate limited or creation failed")
                        self.emit_to_client("error", {
                            "message": "Failed to create voice session. This might be due to server capacity limits or a configuration issue.",
                            "details": "The server could not create a new voice session. Please try again in a moment."
                        })
                        return
                    
                    # Store session ID in Flask session
                    session['realtime_session_id'] = realtime_session.session_id
                    session.modified = True
                    logger.info(f"✅ Created new realtime session: {realtime_session.session_id}")
                    
                except Exception as e:
                    logger.error(f"❌ Error creating realtime session: {e}")
                    logger.exception("Session creation error:")
                    self.emit_to_client("error", {
                        "message": f"Failed to create voice session: {str(e)}"
                    })
                    return
            
            session_id = session.get("realtime_session_id")
            if not session_id:
                self.emit_to_client("error", {"message": "No session available"})
                logger.error("❌ No realtime_session_id in session")
                return

            try:
                logger.info(f"🔍 Getting session manager for activation...")
                from pitext_travel.api.realtime.session_manager import get_session_manager
                from pitext_travel.api.realtime.function_handler import create_function_handler

                manager = get_session_manager()
                logger.info(f"🔍 Retrieving session {session_id} from manager...")
                realtime_session = manager.get_session(session_id)
                if realtime_session is None:
                    logger.error(f"❌ Session {session_id} not found in manager")
                    self.emit_to_client("error", {"message": "Session not found"})
                    return

                logger.info(f"✅ Session {session_id} retrieved successfully")

                # Check if session is already active
                if realtime_session.is_active:
                    logger.info(f"🔄 Session {session_id} already active, skipping activation")
                    self.emit_to_client(
                        "session_started",
                        {
                            "session_id": session_id,
                            "status": "already_active",
                            "functions_registered": 2,  # Default function count
                            "timestamp": time.time()
                        },
                    )
                    return

                # Check if there's already an active session for this Flask session
                flask_session_id = session.get("_id", "anonymous")
                existing_active = manager.get_active_session_by_flask_id(flask_session_id)
                if existing_active and existing_active.session_id != session_id:
                    logger.warning(f"⚠️ Another active session {existing_active.session_id} exists for Flask session {flask_session_id}")
                    # Deactivate the other session first
                    manager.deactivate_session(existing_active.session_id, "replaced_by_new_session")

                # Activate (ie, open WS to the OpenAI Realtime API)
                logger.info(f"🚀 Activating session {session_id}...")
                logger.info(f"⏱️ Starting OpenAI Realtime API connection...")
                
                activation_start = time.time()
                logger.info(f"🔧 Calling manager.activate_session({session_id})...")
                
                # Add timeout to prevent hanging
                import eventlet
                try:
                    with eventlet.timeout.Timeout(25):  # 25 second timeout for activation
                        activation_result = manager.activate_session(session_id)
                        logger.info(f"🔧 activate_session returned: {activation_result}")
                except eventlet.timeout.Timeout:
                    activation_duration = time.time() - activation_start
                    logger.error(f"❌ Session activation timed out after {activation_duration:.2f}s")
                    self.emit_to_client("error", {
                        "message": "Session activation timed out. The OpenAI Realtime API connection took too long to establish.",
                        "details": "This might be due to network issues, high server load, or OpenAI service being temporarily unavailable."
                    })
                    return
                
                if not activation_result:
                    activation_duration = time.time() - activation_start
                    logger.error(f"❌ Failed to activate session {session_id} after {activation_duration:.2f}s")
                    self.emit_to_client("error", {
                        "message": "Failed to connect to OpenAI's voice service. This might be due to a networking issue on the server or an invalid API key.",
                        "details": "The backend server could not establish a WebSocket connection with the OpenAI Realtime API."
                    })
                    return

                activation_duration = time.time() - activation_start
                logger.info(f"✅ Session {session_id} activated successfully in {activation_duration:.2f}s")

                # Create and attach function handler
                logger.info(f"🔧 Creating function handler for session {session_id}")
                function_handler = create_function_handler(flask_session_id)
                realtime_session.function_handler = function_handler
                
                # Get function definitions
                functions = function_handler.get_function_definitions()
                logger.info(f"🔧 Registering {len(functions)} functions with Realtime API")
                
                # Configure the Realtime session with travel functions
                logger.info(f"🔧 Updating session configuration...")
                realtime_session.client.update_session(
                    instructions=realtime_session.client.config["instructions"],
                    functions=functions,
                    temperature=realtime_session.client.config["temperature"]
                )

                # Bridge callbacks → browser
                logger.info(f"🔗 Wiring callbacks for session {session_id}")
                wire_realtime_callbacks(self.socketio, realtime_session, request.sid, NAMESPACE)  # type: ignore

                logger.info(f"📤 Emitting session_started event...")
                self.emit_to_client(
                    "session_started",
                    {
                        "session_id": session_id,
                        "status": "active",
                        "functions_registered": len(functions),
                        "timestamp": time.time()
                    },
                )
                logger.info("✅ Realtime session %s started with %d functions", session_id, len(functions))

            except Exception as exc:
                logger.error(f"❌ Error in start_session: {exc}")
                logger.exception("Session activation error:")
                
                # Provide more specific error messages based on the exception type
                error_message = "Session activation failed with an unknown error."
                error_details = "An unexpected error occurred while setting up the voice session."
                
                if "timeout" in str(exc).lower():
                    error_message = "Session activation timed out."
                    error_details = "The OpenAI Realtime API connection took too long to establish. This might be due to network issues or high server load."
                elif "connection" in str(exc).lower():
                    error_message = "Failed to connect to OpenAI's voice service."
                    error_details = "The server could not establish a connection with OpenAI's Realtime API. Please check your network connection and try again."
                elif "api" in str(exc).lower() and "key" in str(exc).lower():
                    error_message = "OpenAI API key issue detected."
                    error_details = "There appears to be an issue with the OpenAI API key configuration. Please check your API key settings."
                
                # Emit error event to client with specific details
                self.emit_to_client("error", {
                    "message": error_message,
                    "details": error_details,
                    "error_type": type(exc).__name__,
                    "timestamp": time.time()
                })

        @self.socketio.on("map_ready", namespace=NAMESPACE)
        def handle_map_ready(data=None):
            """Handle map ready event with better integration."""
            session_id = session.get("realtime_session_id")
            if not session_id:
                return
            
            try:
                from pitext_travel.api.realtime.session_manager import get_session_manager
                
                manager = get_session_manager()
                rt_session = manager.get_session(session_id)
                
                if rt_session and rt_session.client:
                    # Check if welcome message already sent
                    if hasattr(rt_session, 'welcome_sent') and rt_session.welcome_sent:
                        logger.info(f"📍 Map ready, welcome already sent for session {session_id}")
                        return
                    
                    # Check if we have a current itinerary to announce
                    flask_session = session
                    if 'current_itinerary' in flask_session:
                        city = flask_session.get('current_city', 'your destination')
                        days = flask_session.get('current_days', 'several')
                        welcome_message = f"Great! I can see your {days}-day itinerary for {city} is displayed on the map. How can I help you with your trip planning?"
                    else:
                        welcome_message = "Hi! I'm ready to help you plan your trip. Just tell me which city you'd like to visit and for how many days."
                    
                    rt_session.client.send_text(welcome_message)
                    rt_session.welcome_sent = True  # Mark as sent
                    logger.info(f"📍 Map ready, sent welcome message for session {session_id}")
                    
            except Exception as exc:
                self.handle_error(exc, "map_ready")

        @self.socketio.on("get_stats", namespace=NAMESPACE)
        def handle_get_stats():
            """Get session statistics for debugging."""
            session_id = session.get("realtime_session_id")
            if session_id is None:
                self.emit_to_client("stats", {"error": "No session"})
                return
                
            try:
                from pitext_travel.api.realtime.session_manager import get_session_manager
                
                manager = get_session_manager()
                realtime_session = manager.get_session(session_id)
                
                if realtime_session:
                    stats = {
                        "session_id": session_id,
                        "is_active": realtime_session.is_active,
                        "created_at": realtime_session.created_at.isoformat(),
                        "last_activity": realtime_session.last_activity.isoformat(),
                        "audio_sent_kb": realtime_session.audio_bytes_sent / 1024,
                        "audio_received_kb": realtime_session.audio_bytes_received / 1024,
                        "message_count": realtime_session.message_count,
                        "function_calls": realtime_session.function_calls,
                        "flask_session_data": {
                            "has_itinerary": 'current_itinerary' in session,
                            "current_city": session.get('current_city'),
                            "current_days": session.get('current_days')
                        }
                    }
                    self.emit_to_client("stats", stats)
                else:
                    self.emit_to_client("stats", {"error": "Session not found"})
                    
            except Exception as exc:
                self.handle_error(exc, "get_stats")