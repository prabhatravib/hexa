# api/config.py
"""Configuration management for the travel planner API."""
import os
from dotenv import load_dotenv
# Remove problematic import that causes hanging
# from openai.types.beta.realtime.session import TurnDetection
import logging

load_dotenv()

logger = logging.getLogger(__name__)


def get_openai_api_key():
    """Get OpenAI API key from environment."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        logger.warning("OPENAI_API_KEY not set - voice and chat features will be disabled")
        return None
    return api_key


def get_google_maps_config():
    """Get Google Maps configuration."""
    return {
        "api_key": os.getenv("GOOGLE_MAPS_API_KEY", ""),
        "client_id": os.getenv("maps_client_id", ""),
        "client_secret": os.getenv("maps_client_secret", "")
    }


def get_port():
    """Get port configuration."""
    return int(os.getenv("PORT", 3000))


def get_render_mode():
    """Get render mode configuration."""
    return os.getenv("RENDER_MODE", "html")

# NEW: Realtime API Configuration
def get_realtime_config():
    """Get OpenAI Realtime API configuration."""
    vad_silence_ms = int(os.getenv("REALTIME_VAD_SILENCE_MS", 1500))  # Reduced to 1.5 seconds
    vad_threshold = float(os.getenv("REALTIME_VAD_THRESHOLD", 0.5))
    
    # Log configuration instead of printing
    logger.info("🔧 VAD CONFIGURATION LOADED")
    logger.info(f"   - Environment Variable: REALTIME_VAD_SILENCE_MS={os.getenv('REALTIME_VAD_SILENCE_MS', 'NOT_SET')}")
    logger.info(f"   - Silence Duration (ms): {vad_silence_ms}")
    logger.info(f"   - Threshold:             {vad_threshold}")

    # Use simple dictionary instead of problematic TurnDetection import
    turn_cfg = {
        "type": "server_vad",
        "threshold": vad_threshold,
        "prefix_padding_ms": 300,
        "silence_duration_ms": vad_silence_ms,
        "create_response": True,
        "interrupt_response": True,
    }

    return {
        # Model configuration
        "model": os.getenv("OPENAI_REALTIME_MODEL", "gpt-4o-realtime-preview-2024-12-17"),
        "voice": os.getenv("REALTIME_VOICE", "alloy"),
        "temperature": float(os.getenv("REALTIME_TEMPERATURE", "0.8")),
        
        # Response configuration
        "max_response_duration_ms": int(os.getenv("REALTIME_MAX_RESPONSE_DURATION_MS", "30000")),
        
        # Voice Activity Detection (VAD) configuration - Conservative settings
        "vad_threshold": vad_threshold,
        "vad_prefix_ms": int(os.getenv("REALTIME_VAD_PREFIX_MS", "300")),
        "vad_silence_ms": vad_silence_ms,
        
        # Session configuration
        "session_timeout_seconds": int(os.getenv("REALTIME_SESSION_TIMEOUT_SECONDS", "600")),
        "max_concurrent_sessions": int(os.getenv("MAX_CONCURRENT_REALTIME_SESSIONS", "50")),
        "rate_limit_per_ip": int(os.getenv("REALTIME_RATE_LIMIT_PER_IP", "10")),
        "turn_detection": turn_cfg,  # Fixed: use local turn_cfg, not global
        
        # Audio configuration
        "audio_format": {
            "input": os.getenv("AUDIO_INPUT_FORMAT", "pcm16"),
            "output": os.getenv("AUDIO_OUTPUT_FORMAT", "pcm16"),
            "sample_rate": int(os.getenv("AUDIO_SAMPLE_RATE", "24000"))
        },
        
        # Instructions for the assistant
        "instructions": """You are a friendly travel planning assistant helping users plan their trips through natural voice conversation.

    IMPORTANT: Always respond verbally to user speech. When you hear the user speaking, you should:
    1. Listen carefully to what they're saying
    2. If they mention a city and number of days, use the plan_trip function
    3. Always speak your response out loud
    4. Be conversational and natural

    Your capabilities:
    - Plan multi-day itineraries for any city when given both city name and days
    - Explain specific days or give overviews of existing itineraries
    - Answer questions about destinations

    Example interactions:
    - User: "Plan a trip to Paris for 3 days" → Use plan_trip function then speak the result
    - User: "I want to visit Rome" → Ask them how many days they'll be there
    - User: "Tell me about day 2" → Use explain_day function then speak the details

    Remember: This is a voice conversation, so always speak your responses!"""
    }


def get_websocket_config():
    """Get WebSocket configuration."""
    return {
        "max_message_size": int(os.getenv("WEBSOCKET_MAX_MESSAGE_SIZE", "10485760")),  # 10MB
        "ping_interval": int(os.getenv("WEBSOCKET_PING_INTERVAL", "25")),
        "ping_timeout": int(os.getenv("WEBSOCKET_PING_TIMEOUT", "60")),
        "cors_allowed_origins": os.getenv("WEBSOCKET_CORS_ORIGINS", "*").split(",")
    }


def validate_realtime_config():
    """Validate Realtime API configuration is properly set."""
    api_key = get_openai_api_key()
    realtime_config = get_realtime_config()
    
    # Check if API key looks valid
    if api_key is None:
        logger.warning("OpenAI API key not configured - voice features will be disabled")
        return False
    
    if not api_key.startswith("sk-"):
        raise ValueError("OpenAI API key appears invalid (should start with 'sk-')")
    
    # Validate voice options
    valid_voices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"]
    if realtime_config["voice"] not in valid_voices:
        raise ValueError(f"Invalid voice. Must be one of: {', '.join(valid_voices)}")
    
    # Validate audio format
    valid_formats = ["pcm16", "g711_ulaw", "g711_alaw"]
    if realtime_config["audio_format"]["input"] not in valid_formats:
        raise ValueError(f"Invalid input audio format. Must be one of: {', '.join(valid_formats)}")
    
    return True

def get_google_maps_api_key():
    return os.getenv("GOOGLE_MAPS_API_KEY", "")
