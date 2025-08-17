# pitext_travel/routes/websocket/callback_helpers.py
"""Helper functions for wiring Realtime API callbacks to Socket.IO events."""

import base64
import logging
import time
from typing import Optional

logger = logging.getLogger(__name__)


def wire_realtime_callbacks(socketio, realtime_session, sid: str, namespace: str = "/travel/ws") -> None:
    """
    Enhanced callback wiring for better voice-map integration.
    Bridges Realtime-API callbacks → Socket.IO events.
    """
    client = realtime_session.client
    if client is None:
        return

    # -- audio ----------------------------------------------------------------
    def _on_audio_chunk(chunk: bytes, item_id: Optional[str] = None) -> None:
        try:
            logger.info(f"🎵 _on_audio_chunk called with {len(chunk)} bytes, item_id: {item_id}")
            socketio.emit(
                "audio_chunk",
                {
                    "audio": base64.b64encode(chunk).decode(),
                    "item_id": item_id,
                },
                room=sid,
                namespace=namespace,
            )
            logger.info(f"🎵 Emitted audio_chunk event to client {sid}")
        except Exception as exc:
            logger.exception("Failed emitting audio_chunk: %s", exc)

    # -- transcript -----------------------------------------------------------
    def _on_transcript(text: str, item_id: Optional[str], is_final: bool) -> None:
        try:
            socketio.emit(
                "transcript",
                {
                    "text": text,
                    "item_id": item_id,
                    "is_final": is_final,
                    "role": "assistant"
                },
                room=sid,
                namespace=namespace,
            )
        except Exception as exc:
            logger.exception("Failed emitting transcript: %s", exc)

    def _on_function_call(call_id: str, name: str, args: dict) -> None:
        try:
            logger.info(f"🎤 Processing function call: {name} with args: {args}")
            
            if hasattr(realtime_session, 'function_handler'):
                result = realtime_session.function_handler.handle_function_call(
                    call_id, name, args
                )
                
                # Enhanced handling for plan_trip
                if name == "plan_trip" and result.get("success"):
                    logger.info("✅ Trip planned successfully via voice")
                    
                    # Store in the realtime session's conversation data instead
                    realtime_session.conversation_data['current_itinerary'] = result['itinerary']
                    realtime_session.conversation_data['current_city'] = result['city']
                    realtime_session.conversation_data['current_days'] = result['days']
                    
                    # Emit to frontend with enhanced data
                    socketio.emit(
                        "render_itinerary",
                        {
                            "itinerary": result.get("itinerary"),
                            "city": result.get("city"),
                            "days": result.get("days"),
                            "source": "voice",
                            "timestamp": time.time()
                        },
                        room=sid,
                        namespace=namespace
                    )
                    
                    logger.info(f"🗺️ Emitted render_itinerary for {result.get('city')}")
                    
                # Enhanced handling for explain_day
                elif name == "explain_day" and result.get("needs_session_data"):
                    # Get data from realtime session's conversation data
                    current_itinerary = realtime_session.conversation_data.get('current_itinerary')
                    current_city = realtime_session.conversation_data.get('current_city', 'your destination')
                    
                    if current_itinerary:
                        voice_response = realtime_session.function_handler.format_explain_day_response(
                            current_itinerary,
                            current_city,
                            result.get('day_number', 0)
                        )
                        
                        # Update result with formatted response
                        result['voice_response'] = voice_response
                        result['success'] = True
                        
                        logger.info(f"📝 Explained day {result.get('day_number')} via voice")
                    else:
                        logger.warning("No current itinerary found for explain_day")
                        result = {
                            "success": False,
                            "error": "No current itinerary available",
                            "voice_response": "I don't have a current itinerary to explain. Would you like me to plan a trip first?"
                        }

                # Send final result back to OpenAI
                realtime_session.client.send_function_result(call_id, result)
                        
            else:
                logger.error(f"❌ No function handler available for session {realtime_session.session_id}")
                error_result = {
                    "success": False,
                    "error": "Function handler not available",
                    "call_id": call_id,
                    "function": name
                }
                realtime_session.client.send_function_result(call_id, error_result)
                
        except Exception as exc:
            logger.exception("❌ Failed handling function call: %s", exc)
            error_result = {
                "success": False,
                "error": str(exc),
                "call_id": call_id,
                "function": name
            }
            realtime_session.client.send_function_result(call_id, error_result)
    
    # -- error handling -------------------------------------------------------
    def _on_error(error: str) -> None:
        try:
            logger.error(f"🚫 Realtime API error: {error}")
            socketio.emit(
                "error",
                {"message": error, "source": "realtime_api"},
                room=sid,
                namespace=namespace,
            )
        except Exception as exc:
            logger.exception("Failed emitting error: %s", exc)

    # -- session updates ------------------------------------------------------
    def _on_session_update(session_data: dict) -> None:
        try:
            socketio.emit(
                "session_update",
                session_data,
                room=sid,
                namespace=namespace,
            )
        except Exception as exc:
            logger.exception("Failed emitting session_update: %s", exc)

    # -- Enhanced VAD event handlers ------------------------------------------
    def _on_speech_started(event: dict) -> None:
        try:
            logger.debug("🎤 OpenAI VAD: Speech started")
            socketio.emit(
                "speech_started",
                event,
                room=sid,
                namespace=namespace,
            )
        except Exception as exc:
            logger.exception("Failed emitting speech_started: %s", exc)

    def _on_speech_stopped(event: dict) -> None:
        try:
            logger.debug("🔇 OpenAI VAD: Speech stopped")
            socketio.emit(
                "speech_stopped", 
                event,
                room=sid,
                namespace=namespace,
            )
        except Exception as exc:
            logger.exception("Failed emitting speech_stopped: %s", exc)

    # Wire up all callbacks
    client.on_audio_chunk = _on_audio_chunk
    client.on_transcript = _on_transcript
    client.on_function_call = _on_function_call
    client.on_error = _on_error
    client.on_session_update = _on_session_update
    client.on_speech_started = _on_speech_started
    client.on_speech_stopped = _on_speech_stopped