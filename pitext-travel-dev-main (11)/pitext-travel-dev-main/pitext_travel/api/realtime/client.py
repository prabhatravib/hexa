"""realtime/client.py: OpenAI Realtime WebSocket client with built-in VAD event handling."""

from __future__ import annotations

import base64
import json
import logging
import ssl
from queue import Queue
from typing import Any, Callable, Dict, Optional

import eventlet
from eventlet.event import Event
import websocket
from tenacity import retry, stop_after_attempt, wait_exponential

from pitext_travel.api.config import get_openai_api_key, get_realtime_config

logger = logging.getLogger(__name__)


class RealtimeClient:
    """Thin wrapper around the OpenAI Realtime WebSocket API.
    
    Handles OpenAI's server-side VAD events.
    This version is fully compatible with eventlet.
    """

    REALTIME_API_URL = "wss://api.openai.com/v1/realtime"

    def __init__(self, session_id: str):
        try:
            logger.info(f"🔧 Initializing RealtimeClient for session {session_id}...")
            
            self.session_id = session_id
            logger.info(f"🔧 Session ID set: {self.session_id}")
            
            logger.info(f"🔧 Getting OpenAI API key...")
            self.api_key = get_openai_api_key()
            logger.info(f"🔧 API key obtained: {'Yes' if self.api_key else 'No'}")
            
            logger.info(f"🔧 Getting realtime config...")
            try:
                # Add timeout to prevent hanging
                with eventlet.timeout.Timeout(10):  # 10 second timeout for config loading
                    self.config = get_realtime_config()
                    logger.info(f"🔧 Config obtained: {list(self.config.keys())}")
            except eventlet.timeout.Timeout:
                logger.error(f"❌ Config loading timed out after 10 seconds")
                raise Exception("Configuration loading timed out - possible network or import issue")
            except Exception as config_error:
                logger.error(f"❌ Failed to get realtime config: {config_error}")
                logger.exception("Config loading error:")
                raise

            logger.info(f"🔧 Setting up WebSocket state...")
            # WebSocket state
            self._ws_app: Optional[websocket.WebSocketApp] = None
            self._greenthread: Optional[Any] = None
            self.is_connected: bool = False
            self._lock = eventlet.semaphore.Semaphore(1)
            self._connection_event = Event()

            logger.info(f"🔧 Setting up queues...")
            # Queues for debugging / tracing
            self.outgoing_queue: Queue = Queue()
            self.incoming_queue: Queue = Queue()

            logger.info(f"🔧 Setting up callback hooks...")
            # Callback hooks
            self.on_transcript: Optional[Callable] = None
            self.on_audio_chunk: Optional[Callable] = None
            self.on_function_call: Optional[Callable] = None
            self.on_error: Optional[Callable] = None
            self.on_session_update: Optional[Callable] = None
            
            # OpenAI VAD event callbacks - NEW
            self.on_speech_started: Optional[Callable] = None
            self.on_speech_stopped: Optional[Callable] = None
            self.on_response_started: Optional[Callable] = None
            self.on_response_done: Optional[Callable] = None

            logger.info(f"🔧 Setting up conversation tracking...")
            # Conversation tracking
            self.conversation_id: Optional[str] = None
            self.current_item_id: Optional[str] = None
            self.is_model_speaking: bool = False
            
            logger.info(f"✅ RealtimeClient initialized successfully for session {session_id}")
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize RealtimeClient for session {session_id}: {e}")
            logger.error(f"❌ Error type: {type(e)}")
            logger.error(f"❌ Error args: {e.args}")
            logger.exception("RealtimeClient initialization error:")
            raise

    def connect(self) -> bool:
        """Open the WebSocket in a background greenthread."""
        with self._lock:
            if self.is_connected:
                logger.info(f"Session {self.session_id} already connected")
                return True

            logger.info(f"🚀 Starting OpenAI Realtime API connection for session {self.session_id}")
            
            # Validate API key first
            if not self.api_key:
                logger.error("❌ No OpenAI API key configured")
                return False
                
            if not self.api_key.startswith("sk-"):
                logger.error("❌ Invalid OpenAI API key format")
                return False
            
            logger.info(f"🔧 API key validation passed for session {self.session_id}")
            
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "OpenAI-Beta": "realtime=v1",
            }

            logger.info(f"🔧 Creating WebSocket connection to {self.REALTIME_API_URL}?model={self.config['model']}")
            self._ws_app = websocket.WebSocketApp(
                f"{self.REALTIME_API_URL}?model={self.config['model']}",
                header=headers,
                on_open=self._on_open,
                on_message=self._on_message,
                on_error=self._on_error,
                on_close=self._on_close,
            )

            # Reset the connection event before starting
            # Only reset if the event has been set before (not fresh)
            if self._connection_event.ready():
                self._connection_event.reset()

            try:
                logger.info(f"🔧 Spawning WebSocket greenthread for session {self.session_id}")
                self._greenthread = eventlet.spawn(
                    self._ws_app.run_forever,
                    ping_interval=None,
                    ping_timeout=None,
                    sslopt={
                        "cert_reqs": ssl.CERT_REQUIRED,
                        "ca_certs": ssl.get_default_verify_paths().cafile
                    }
                )
                logger.info(f"📡 WebSocket greenthread spawned for session {self.session_id}")

                # Wait for the connection to be established with a timeout
                try:
                    logger.info("⏱️ Waiting up to 30 seconds for OpenAI connection...")
                    self._connection_event.wait(timeout=30)
                    logger.info(f"🔧 Connection event received for session {self.session_id}")
                except eventlet.timeout.Timeout:
                    logger.error("❌ Realtime API: connection timed out after 30 seconds")
                    self.disconnect()  # Clean up the failed connection
                    return False

                if self.is_connected:
                    logger.info("✅ Realtime API: connection established successfully")
                else:
                    logger.error("❌ Realtime API: connection failed to establish after wait")

                return self.is_connected
                
            except Exception as e:
                logger.error(f"❌ Failed to start WebSocket connection: {e}")
                logger.exception("WebSocket startup error:")
                self.disconnect()
                return False

    def disconnect(self):
        """Close the socket and stop the worker greenthread."""
        with self._lock:
            if self._ws_app:
                try:
                    self._ws_app.close()
                except Exception:
                    pass
                self._ws_app = None
                self.is_connected = False

            if self._greenthread:
                eventlet.kill(self._greenthread)
                self._greenthread = None

    def _send_event(self, event: Dict[str, Any]):
        """Serialize event to JSON and push through the socket."""
        if not self.is_connected or not self._ws_app:
            logger.warning("Tried to send while not connected: %s", event.get("type"))
            return
        try:
            payload = json.dumps(event)
            logger.debug(f"📤 Sending event {event.get('type')} for session {self.session_id}")
            
            # Add a small delay to ensure connection is fully ready
            if hasattr(self, '_ws_app') and self._ws_app and hasattr(self._ws_app, 'sock'):
                if not self._ws_app.sock or not self._ws_app.sock.connected:
                    logger.warning(f"WebSocket not fully ready for {event.get('type')}, skipping")
                    return
            
            self._ws_app.send(payload)
            self.outgoing_queue.put(event)
            logger.debug("▶ %s", event["type"])
        except Exception as exc:
            logger.error(f"❌ Failed to send {event.get('type')} for session {self.session_id}: {exc}")
            logger.exception("Send event error:")
            if self.on_error:
                self.on_error(str(exc))

    def _on_open(self, ws):
        """Initial handshake once the TCP tunnel is up."""
        try:
            logger.info("Realtime API connection established for session %s", self.session_id)
            self.is_connected = True

            # Signal connection success immediately to prevent timeout
            logger.info(f"✅ Signaling connection ready for session {self.session_id}")
            self._connection_event.send(True)
            
            # Configure session after connection is established
            logger.info(f"🔧 Configuring session for {self.session_id}...")
            
            try:
                logger.info(f"🔧 Configuring session with voice: {self.config['voice']}")
                logger.info(f"🔧 Configuring session with temperature: {self.config['temperature']}")
                logger.info(f"🔧 Configuring session with instructions length: {len(self.config['instructions'])}")
                
                self.update_session(
                    instructions=self.config["instructions"],
                    temperature=self.config["temperature"],
                    voice=self.config["voice"],
                    input_audio_format="pcm16",
                    output_audio_format="pcm16",
                    turn_detection={
                        "type": "server_vad",  # Use OpenAI's VAD
                        "threshold": self.config["vad_threshold"],
                        "prefix_padding_ms": self.config["vad_prefix_ms"],
                        "silence_duration_ms": self.config["vad_silence_ms"],
                        "create_response": True,
                        "interrupt_response": True,
                    }
                )
                logger.info(f"✅ Session configuration sent for {self.session_id}")
            except Exception as config_error:
                logger.error(f"❌ Failed to configure session {self.session_id}: {config_error}")
                logger.exception("Session configuration error:")
                # Don't fail the connection for configuration errors
                # The session can still work with default settings
                return
            
        except Exception as e:
            logger.error(f"❌ Error in _on_open for session {self.session_id}: {e}")
            logger.exception("_on_open error:")
            # Signal connection failure
            self._connection_event.send(False)

    def _on_message(self, ws, message):
        """Decode JSON and route to the appropriate handler."""
        try:
            event = json.loads(message)
        except json.JSONDecodeError:
            logger.error("Malformed message: %s", message[:120])
            return

        etype = event.get("type")
        if etype not in {"response.audio.delta", "response.audio_transcript.delta"}:
            logger.info("◀ %s", etype)
        self.incoming_queue.put(event)

        match etype:
            # Session events
            case "session.created":
                self._handle_session_created(event)
            case "session.updated":
                self._handle_session_updated(event)
                
            # OpenAI VAD events - NEW
            case "input_audio_buffer.speech_started":
                self._handle_speech_started(event)
            case "input_audio_buffer.speech_stopped":
                self._handle_speech_stopped(event)
                
            # Conversation events
            case "conversation.item.created":
                self._handle_item_created(event)
                
            # Response events
            case "response.created":
                self._handle_response_created(event)
            case "response.done":
                self._handle_response_done(event)
            case "response.cancelled":
                self._handle_response_cancelled(event)
                
            # Audio/transcript events
            case "response.audio_transcript.delta":
                self._handle_transcript_delta(event)
            case "response.audio_transcript.done":
                self._handle_transcript_done(event)
            case "response.audio.delta":
                self._handle_audio_delta(event)
                
            # Function call events
            case "response.function_call_arguments.done":
                self._handle_function_call(event)
                
            # Error events
            case "error":
                self._handle_error(event)
                
            case _:
                pass  # ignore other events

    def _on_error(self, ws, error):
        logger.error(f"❌ WebSocket error for session {self.session_id}: {error}")
        logger.error(f"❌ Error type: {type(error)}")
        
        # Provide more specific error information
        error_message = str(error)
        if "401" in error_message:
            error_message = "Invalid API key or authentication failed"
        elif "403" in error_message:
            error_message = "Access denied - check API key permissions"
        elif "429" in error_message:
            error_message = "Rate limit exceeded"
        elif "500" in error_message or "502" in error_message or "503" in error_message:
            error_message = "OpenAI service temporarily unavailable"
        elif "timeout" in error_message.lower():
            error_message = "Connection timeout - check network connectivity"
        
        if self.on_error:
            self.on_error(error_message)

        # If an error occurs during connection, signal a failure
        if not self.is_connected:
            self._connection_event.send(False)

    def _on_close(self, ws, code, reason):
        logger.info("Realtime API connection closed: %s – %s", code, reason)
        self.is_connected = False

    # OpenAI VAD event handlers - NEW
    def _handle_speech_started(self, event):
        """Handle when OpenAI detects speech has started."""
        logger.info("OpenAI VAD: Speech started")
        if self.on_speech_started:
            self.on_speech_started(event)

    def _handle_speech_stopped(self, event):
        """Handle when OpenAI detects speech has stopped."""
        logger.info("OpenAI VAD: Speech stopped")
        if self.on_speech_stopped:
            self.on_speech_stopped(event)

    def _handle_response_created(self, event):
        """Handle when response generation starts."""
        self.is_model_speaking = True
        if self.on_response_started:
            self.on_response_started(event)

    def _handle_response_done(self, event):
        """Handle when response generation completes."""
        self.is_model_speaking = False
        if self.on_response_done:
            self.on_response_done(event)

    def _handle_response_cancelled(self, event):
        """Handle when response is cancelled (e.g., user interruption)."""
        self.is_model_speaking = False
        logger.info("Response cancelled (user interruption)")
        if self.on_response_done:
            self.on_response_done(event)

    # Existing event handlers
    def _handle_session_created(self, event):
        self.conversation_id = event.get("session", {}).get("id")
        if self.on_session_update:
            self.on_session_update(event["session"])

    def _handle_session_updated(self, event):
        if self.on_session_update:
            self.on_session_update(event["session"])

    def _handle_item_created(self, event):
        self.current_item_id = event.get("item", {}).get("id")

    def _handle_transcript_delta(self, event):
        if self.on_transcript:
            self.on_transcript(event.get("delta", ""), event.get("item_id"), False)
            
    def _handle_transcript_done(self, event):
        if self.on_transcript:
            self.on_transcript(event.get("transcript", ""), event.get("item_id"), True)

    def _handle_audio_delta(self, event):
        logger.info(f"🎵 Received audio delta event: {event.get('type')}")
        if self.on_audio_chunk:
            try:
                audio_bytes = base64.b64decode(event.get("delta", ""))
                logger.info(f"🎵 Decoded audio chunk, size: {len(audio_bytes)} bytes")
                self.on_audio_chunk(audio_bytes, event.get("item_id"))
            except Exception as e:
                logger.error(f"🎵 Error processing audio delta: {e}")
        else:
            logger.warning("🎵 No audio chunk handler registered")

    def _handle_function_call(self, event):
        if self.on_function_call:
            try:
                args = json.loads(event.get("arguments", "{}"))
            except json.JSONDecodeError:
                args = {}
            self.on_function_call(event.get("call_id"), event.get("name"), args)

    def _handle_error(self, event):
        msg = event.get("error", {}).get("message", "Unknown error")
        logger.error("Realtime API error: %s", msg)
        if self.on_error:
            self.on_error(msg)

    # High-level send helpers
    def send_audio(self, audio_data: bytes):
        """Send audio data continuously (no VAD filtering)."""
        if not self.is_connected:
            return
        self._send_event(
            {
                "type": "input_audio_buffer.append",
                "audio": base64.b64encode(audio_data).decode("ascii"),
            }
        )

    def commit_audio(self):
        """Note: With server-side VAD, OpenAI handles this automatically."""
        self._send_event({"type": "input_audio_buffer.commit"})

    def clear_audio_buffer(self):
        self._send_event({"type": "input_audio_buffer.clear"})

    def send_text(self, text: str):
        self._send_event(
            {
                "type": "conversation.item.create",
                "item": {
                    "type": "message",
                    "role": "user",
                    "content": [{"type": "input_text", "text": text}],
                },
            }
        )
        self._send_event({"type": "response.create"})

    def interrupt(self):
        """Cancel the current response."""
        if self.is_model_speaking:
            self._send_event({"type": "response.cancel"})

    def update_session(
        self,
        *,
        instructions: str | None = None,
        functions: list[dict] | None = None,
        temperature: float | None = None,
        voice: str | None = None,
        turn_detection: dict | None = None,
        input_audio_format: str | None = None,
        output_audio_format: str | None = None,
        **extra: Any,
    ) -> None:
        """Update session configuration."""
        try:
            logger.info(f"🔧 Updating session configuration for {self.session_id}...")
            
            patch: dict[str, Any] = {"type": "session.update", "session": {}}

            if instructions:
                patch["session"]["instructions"] = instructions
                logger.debug(f"🔧 Added instructions to session config")
            if functions is not None:
                patch["session"]["tools"] = functions
                logger.debug(f"🔧 Added {len(functions)} functions to session config")
            if temperature is not None:
                patch["session"]["temperature"] = temperature
                logger.debug(f"🔧 Added temperature {temperature} to session config")
            if voice:
                patch["session"]["voice"] = voice
                logger.debug(f"🔧 Added voice {voice} to session config")
            if turn_detection:
                patch["session"]["turn_detection"] = turn_detection
                logger.debug(f"🔧 Added turn_detection config")

            # Audio format settings
            if input_audio_format:
                patch["session"]["input_audio_format"] = input_audio_format
                logger.debug(f"🔧 Added input_audio_format {input_audio_format}")
            if output_audio_format:
                patch["session"]["output_audio_format"] = output_audio_format
                logger.debug(f"🔧 Added output_audio_format {output_audio_format}")

            if extra:
                for k, v in extra.items():
                    if k not in ["input_audio_format", "output_audio_format"]:
                        patch["session"][k] = v
                        logger.debug(f"🔧 Added extra config {k}: {v}")

            logger.info(f"🔧 Sending session update for {self.session_id} with keys: {', '.join(patch['session'].keys())}")
            logger.info(f"🔧 Full session update payload: {json.dumps(patch, indent=2)}")
            self._send_event(patch)
            logger.info(f"✅ Session update sent successfully for {self.session_id}")
            
        except Exception as e:
            logger.error(f"❌ Failed to update session {self.session_id}: {e}")
            logger.exception("Session update error:")
            raise

    def send_function_result(self, call_id: str, result: Any):
        if not self.is_connected:
            logger.warning("Cannot send function result - not connected")
            return
            
        self._send_event(
            {
                "type": "conversation.item.create",
                "item": {
                    "type": "function_call_output",
                    "call_id": call_id,
                    "output": json.dumps(result) if not isinstance(result, str) else result,
                },
            }
        )

    def test_audio_generation(self):
        """Test if the session can generate audio by sending a simple text message."""
        if not self.is_connected:
            logger.warning("Cannot test audio generation - not connected")
            return False
            
        logger.info("🧪 Testing audio generation with simple text message...")
        
        # Send a simple text message
        self.send_text("Hello, can you hear me? Please respond with a short audio message.")
        
        logger.info("🧪 Text message sent, waiting for audio response...")
        return True