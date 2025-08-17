# pitext_travel/routes/websocket/audio.py
"""WebSocket handlers for audio data and control."""

import base64
import logging
from flask import session

from .base import BaseWebSocketHandler, NAMESPACE

logger = logging.getLogger(__name__)


class AudioHandler(BaseWebSocketHandler):
    """Handles audio-related WebSocket events."""
    
    def register_handlers(self):
        """Register audio-related event handlers."""
        
        @self.socketio.on("audio_data", namespace=NAMESPACE)
        def handle_audio_data(data):
            """Handle audio data from browser with improved error handling."""
            session_id = session.get("realtime_session_id")
            if session_id is None:
                self.emit_to_client("error", {"message": "No session available"})
                return

            try:
                from pitext_travel.api.realtime.session_manager import get_session_manager

                manager = get_session_manager()
                realtime_session = manager.get_session(session_id)
                if realtime_session and realtime_session.client:
                    audio_b64 = data.get("audio")
                    if not audio_b64:
                        logger.warning("⚠️ No audio data in payload")
                        return
                    
                    # Convert base64 to bytes for size calculation
                    try:
                        audio_bytes = base64.b64decode(audio_b64)
                        audio_size = len(audio_bytes)
                        
                        # Only log substantial audio chunks to reduce noise
                        if audio_size > 100:  
                            logger.debug(f"🎤 Sending audio to Realtime API, size: {audio_size} bytes")
                        
                        realtime_session.client.send_audio(audio_bytes)
                        manager.update_session_stats(session_id, audio_sent=audio_size)
                        
                    except Exception as decode_error:
                        logger.error(f"❌ Failed to decode audio data: {decode_error}")
                        self.emit_to_client("error", {"message": "Invalid audio data"})
                    
            except Exception as exc:
                self.handle_error(exc, "audio_data")

        @self.socketio.on("commit_audio", namespace=NAMESPACE)
        def handle_commit_audio():
            """Commit audio buffer and request response."""
            session_id = session.get("realtime_session_id")
            if session_id is None:
                return

            try:
                from pitext_travel.api.realtime.session_manager import get_session_manager

                realtime_session = get_session_manager().get_session(session_id)
                if realtime_session and realtime_session.client:
                    realtime_session.client.commit_audio()
                    logger.debug(f"✅ Audio committed for session {session_id}")
            except Exception as exc:
                self.handle_error(exc, "commit_audio")

        @self.socketio.on("interrupt", namespace=NAMESPACE)
        def handle_interrupt():
            """Handle interrupt request."""
            session_id = session.get("realtime_session_id")
            if session_id is None:
                return

            try:
                from pitext_travel.api.realtime.session_manager import get_session_manager

                realtime_session = get_session_manager().get_session(session_id)
                if realtime_session and realtime_session.client:
                    realtime_session.client.interrupt()
                    self.emit_to_client("interrupted", {"status": "interrupted"})
                    logger.info(f"🛑 Interrupt sent for session {session_id}")
            except Exception as exc:
                self.handle_error(exc, "interrupt")