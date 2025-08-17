# pitext_travel/api/realtime/session_manager.py
"""Session lifecycle management for Realtime API connections."""

import time
import eventlet  # Use eventlet for non-blocking operations
import logging
from typing import Dict, Optional, Any
from collections import defaultdict
from datetime import datetime, timedelta
import secrets
import threading

from pitext_travel.api.config import get_realtime_config
from pitext_travel.api.realtime.client import RealtimeClient
from pitext_travel.api.realtime.audio_handler import AudioHandler

logger = logging.getLogger(__name__)


class RealtimeSession:
    """Represents a single Realtime API session."""
    
    def __init__(self, session_id: str, user_ip: str, flask_session_id: str):
        try:
            logger.info(f"🔧 Initializing RealtimeSession {session_id}...")
            logger.info(f"🔧 Parameters: session_id={session_id}, user_ip={user_ip}, flask_session_id={flask_session_id}")
            
            self.session_id = session_id
            self.user_ip = user_ip
            self.flask_session_id = flask_session_id
            
            # Timestamps
            self.created_at = datetime.now()
            self.last_activity = datetime.now()
            self.connected_at: Optional[datetime] = None
            
            # Initialize components to None first
            self.client: Optional['RealtimeClient'] = None
            self.audio_handler: Optional['AudioHandler'] = None
            self.function_handler: Optional[Any] = None
            self.welcome_sent: bool = False
            
            # State
            self.is_active = False
            self.conversation_data = {}
            self.function_results = {}
            
            # Stats
            self.audio_bytes_sent = 0
            self.audio_bytes_received = 0
            self.message_count = 0
            self.function_calls = 0
            
            # Components - with error handling
            try:
                logger.info(f"🔧 Creating RealtimeClient for session {session_id}...")
                from pitext_travel.api.realtime.client import RealtimeClient
                logger.info(f"🔧 RealtimeClient imported successfully")
                
                # Add timeout to prevent hanging
                with eventlet.timeout.Timeout(10):  # 10 second timeout for client creation
                    self.client = RealtimeClient(session_id)
                    logger.info(f"✅ RealtimeClient created successfully")
            except eventlet.timeout.Timeout:
                logger.error(f"❌ RealtimeClient creation timed out after 10 seconds")
                self.client = None
            except Exception as client_error:
                logger.error(f"❌ Failed to create RealtimeClient: {client_error}")
                logger.error(f"❌ Client error type: {type(client_error)}")
                logger.error(f"❌ Client error args: {client_error.args}")
                logger.exception("RealtimeClient creation error:")
                # Don't raise here, let the session be created without client
                self.client = None
            
            try:
                logger.info(f"🔧 Creating AudioHandler for session {session_id}...")
                from pitext_travel.api.realtime.audio_handler import AudioHandler
                logger.info(f"🔧 AudioHandler imported successfully")
                
                # Add timeout to prevent hanging
                with eventlet.timeout.Timeout(5):  # 5 second timeout for audio handler creation
                    self.audio_handler = AudioHandler()
                    logger.info(f"✅ AudioHandler created successfully")
            except eventlet.timeout.Timeout:
                logger.error(f"❌ AudioHandler creation timed out after 5 seconds")
                self.audio_handler = None
            except Exception as audio_error:
                logger.error(f"❌ Failed to create AudioHandler: {audio_error}")
                logger.error(f"❌ Audio error type: {type(audio_error)}")
                logger.error(f"❌ Audio error args: {audio_error.args}")
                logger.exception("AudioHandler creation error:")
                # Don't raise here, let the session be created without audio handler
                self.audio_handler = None
            
            logger.info(f"✅ RealtimeSession {session_id} initialized successfully")
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize RealtimeSession {session_id}: {e}")
            logger.error(f"❌ Error type: {type(e)}")
            logger.error(f"❌ Error args: {e.args}")
            logger.exception("RealtimeSession initialization error:")
            raise


class SessionManager:
    """Manages multiple concurrent Realtime API sessions."""
    
    def __init__(self):
        self.config = get_realtime_config()
        self.sessions: Dict[str, RealtimeSession] = {}
        self.ip_session_count = defaultdict(int)
        
        # Use eventlet semaphore instead of standard threading lock
        self.lock = eventlet.semaphore.Semaphore(1)
        
        # Start cleanup greenthread instead of a standard thread
        self.cleanup_greenthread = eventlet.spawn(self._cleanup_loop)
        
        logger.info("SessionManager initialized with eventlet semaphore")
    
    def create_session(self, user_ip: str, flask_session_id: str) -> Optional[RealtimeSession]:
        """Create a new Realtime API session.
        
        Args:
            user_ip: User's IP address for rate limiting
            flask_session_id: Flask session ID for context sharing
            
        Returns:
            RealtimeSession object or None if rate limited
        """
        try:
            # Use eventlet semaphore with timeout
            with eventlet.timeout.Timeout(5):  # 5 second timeout for lock acquisition
                with self.lock:
                    logger.info(f"🔧 Starting session creation for IP: {user_ip}, Flask session: {flask_session_id}")
                    
                    # Check if there's already a session for this Flask session (active or not)
                    # Don't use get_session_by_flask_id here to avoid deadlock
                    matching_sessions = [
                        s for s in self.sessions.values()
                        if s.flask_session_id == flask_session_id
                    ]
                    
                    if matching_sessions:
                        existing_session = max(matching_sessions, key=lambda s: s.created_at)
                        logger.info(f"Reusing existing session {existing_session.session_id} for Flask session {flask_session_id}")
                        return existing_session
                    
                    # Check rate limit
                    if self.ip_session_count[user_ip] >= self.config["rate_limit_per_ip"]:
                        logger.warning(f"Rate limit exceeded for IP {user_ip}")
                        return None
                    
                    # Check global session limit
                    active_sessions = sum(1 for s in self.sessions.values() if s.is_active)
                    if active_sessions >= self.config["max_concurrent_sessions"]:
                        logger.warning("Maximum concurrent sessions reached")
                        return None
                    
                    # Generate unique session ID
                    session_id = f"rts_{secrets.token_urlsafe(16)}"
                    logger.info(f"🔧 Generated session ID: {session_id}")
                    
                    # Create session with error handling
                    try:
                        logger.info(f"🔧 Creating RealtimeSession object...")
                        logger.info(f"🔧 Session ID: {session_id}")
                        logger.info(f"🔧 User IP: {user_ip}")
                        logger.info(f"🔧 Flask session ID: {flask_session_id}")
                        
                        # Add timeout to prevent hanging
                        with eventlet.timeout.Timeout(15):  # 15 second timeout for session creation
                            session = RealtimeSession(session_id, user_ip, flask_session_id)
                            logger.info(f"✅ RealtimeSession created successfully")
                        
                        # Check if critical components were created
                        if not session.client:
                            logger.error(f"❌ Session {session_id} created without RealtimeClient - this will fail activation")
                            # Still add to tracking but it won't work properly
                        
                        if not session.audio_handler:
                            logger.error(f"❌ Session {session_id} created without AudioHandler - this will fail activation")
                            # Still add to tracking but it won't work properly
                        
                        # Add to tracking
                        self.sessions[session_id] = session
                        self.ip_session_count[user_ip] += 1
                        
                        logger.info(f"✅ Created session {session_id} for IP {user_ip}")
                        return session
                        
                    except eventlet.timeout.Timeout:
                        logger.error(f"❌ Session creation timed out after 15 seconds")
                        return None
                    except Exception as session_error:
                        logger.error(f"❌ Failed to create RealtimeSession: {session_error}")
                        logger.error(f"❌ Error type: {type(session_error)}")
                        logger.error(f"❌ Error args: {session_error.args}")
                        logger.exception("Session creation error:")
                        return None
                        
        except eventlet.timeout.Timeout:
            logger.error("Failed to acquire lock for session creation - timeout")
            return None
    
    def get_session(self, session_id: str) -> Optional[RealtimeSession]:
        """Get an existing session by ID.
        
        Args:
            session_id: Session ID to retrieve
            
        Returns:
            RealtimeSession object or None if not found
        """
        with self.lock:
            session = self.sessions.get(session_id)
            if session:
                session.last_activity = datetime.now()
            return session
    
    def get_session_by_flask_id(self, flask_session_id: str) -> Optional[RealtimeSession]:
        """Get a session by Flask session ID.
        
        Args:
            flask_session_id: Flask session ID
            
        Returns:
            Most recent RealtimeSession for this Flask session or None
        """
        with self.lock:
            matching_sessions = [
                s for s in self.sessions.values()
                if s.flask_session_id == flask_session_id
            ]
            
            if matching_sessions:
                # Return most recent session (active or not)
                return max(matching_sessions, key=lambda s: s.created_at)
            
            return None
    
    def get_active_session_by_flask_id(self, flask_session_id: str) -> Optional[RealtimeSession]:
        """Get an active session by Flask session ID.
        
        Args:
            flask_session_id: Flask session ID
            
        Returns:
            Most recent active RealtimeSession for this Flask session or None
        """
        with self.lock:
            matching_sessions = [
                s for s in self.sessions.values()
                if s.flask_session_id == flask_session_id and s.is_active
            ]
            
            if matching_sessions:
                # Return most recent active session
                return max(matching_sessions, key=lambda s: s.created_at)
            
            return None
    
    def activate_session(self, session_id: str) -> bool:
        """Activate a session by connecting to Realtime API.
        
        Args:
            session_id: Session ID to activate
            
        Returns:
            True if activation successful
        """
        session = self.get_session(session_id)
        if not session:
            logger.error(f"Session {session_id} not found for activation")
            return False
        
        try:
            logger.info(f"🚀 Attempting to connect to OpenAI Realtime API for session {session_id}")
            
            # Validate session components
            if not session.client:
                logger.error(f"Session {session_id} has no client - cannot activate")
                return False
                
            if not session.audio_handler:
                logger.error(f"Session {session_id} has no audio handler - cannot activate")
                return False
            
            # Connect to Realtime API with timeout using eventlet
            start_time = time.time()
            
            # Use eventlet timeout to prevent hanging
            try:
                logger.info(f"🔧 Starting OpenAI connection with 20s timeout...")
                with eventlet.timeout.Timeout(20):  # 20 second timeout for OpenAI connection
                    logger.info(f"🔧 Calling session.client.connect()...")
                    connect_result = session.client.connect()
                    logger.info(f"🔧 connect() returned: {connect_result}")
                    
                    if connect_result:
                        duration = time.time() - start_time
                        session.is_active = True
                        session.connected_at = datetime.now()
                        logger.info(f"✅ Successfully activated session {session_id} in {duration:.2f}s")
                        return True
                    else:
                        duration = time.time() - start_time
                        logger.error(f"❌ Failed to connect session {session_id} after {duration:.2f}s - connect() returned False")
                        return False
                        
            except eventlet.timeout.Timeout:
                duration = time.time() - start_time
                logger.error(f"❌ OpenAI connection timed out after {duration:.2f}s for session {session_id}")
                # Clean up the failed connection
                if session.client:
                    session.client.disconnect()
                return False
                
        except Exception as e:
            duration = time.time() - start_time if 'start_time' in locals() else 0
            logger.error(f"❌ Error activating session {session_id} after {duration:.2f}s: {e}")
            logger.exception("Session activation error:")
            # Clean up on error
            try:
                if session.client:
                    session.client.disconnect()
            except:
                pass
            return False
    
    def deactivate_session(self, session_id: str, reason: str = "manual"):
        """Deactivate a session and clean up resources.
        
        Args:
            session_id: Session ID to deactivate
            reason: Reason for deactivation
        """
        with self.lock:
            session = self.sessions.get(session_id)
            if not session:
                return
            
            # Disconnect client
            if session.client:
                session.client.disconnect()
            
            # Update state
            session.is_active = False
            
            # Update IP count
            if session.user_ip in self.ip_session_count:
                self.ip_session_count[session.user_ip] = max(
                    0, self.ip_session_count[session.user_ip] - 1
                )
            
            # Log stats
            duration = (datetime.now() - session.created_at).total_seconds()
            logger.info(
                f"Deactivated session {session_id} - "
                f"Reason: {reason}, Duration: {duration:.1f}s, "
                f"Messages: {session.message_count}, "
                f"Audio sent: {session.audio_bytes_sent / 1024:.1f}KB, "
                f"Audio received: {session.audio_bytes_received / 1024:.1f}KB"
            )
    
    def remove_session(self, session_id: str):
        """Completely remove a session.
        
        Args:
            session_id: Session ID to remove
        """
        with self.lock:
            if session_id in self.sessions:
                session = self.sessions[session_id]
                
                # Ensure deactivated
                if session.is_active:
                    self.deactivate_session(session_id, "removal")
                
                # Remove from tracking
                del self.sessions[session_id]
                
                logger.info(f"Removed session {session_id}")
    
    def update_session_stats(self, session_id: str, 
                           audio_sent: int = 0,
                           audio_received: int = 0,
                           messages: int = 0,
                           functions: int = 0):
        """Update session statistics.
        
        Args:
            session_id: Session ID to update
            audio_sent: Bytes of audio sent
            audio_received: Bytes of audio received
            messages: Number of messages
            functions: Number of function calls
        """
        session = self.get_session(session_id)
        if session:
            session.audio_bytes_sent += audio_sent
            session.audio_bytes_received += audio_received
            session.message_count += messages
            session.function_calls += functions
            session.last_activity = datetime.now()
    
    def get_active_sessions(self) -> Dict[str, Dict[str, Any]]:
        """Get information about all active sessions.
        
        Returns:
            Dictionary of session info keyed by session ID
        """
        with self.lock:
            active = {}
            
            for sid, session in self.sessions.items():
                if session.is_active:
                    duration = (datetime.now() - session.created_at).total_seconds()
                    active[sid] = {
                        "user_ip": session.user_ip,
                        "created_at": session.created_at.isoformat(),
                        "duration_seconds": duration,
                        "last_activity": session.last_activity.isoformat(),
                        "messages": session.message_count,
                        "function_calls": session.function_calls,
                        "audio_sent_kb": session.audio_bytes_sent / 1024,
                        "audio_received_kb": session.audio_bytes_received / 1024
                    }
            
            return active
    
    def get_stats(self) -> Dict[str, Any]:
        """Get overall session manager statistics.
        
        Returns:
            Dictionary of statistics
        """
        with self.lock:
            total_sessions = len(self.sessions)
            active_sessions = sum(1 for s in self.sessions.values() if s.is_active)
            unique_ips = len(self.ip_session_count)
            
            total_audio_sent = sum(s.audio_bytes_sent for s in self.sessions.values())
            total_audio_received = sum(s.audio_bytes_received for s in self.sessions.values())
            total_messages = sum(s.message_count for s in self.sessions.values())
            total_functions = sum(s.function_calls for s in self.sessions.values())
            
            return {
                "total_sessions": total_sessions,
                "active_sessions": active_sessions,
                "unique_ips": unique_ips,
                "total_audio_sent_mb": total_audio_sent / (1024 * 1024),
                "total_audio_received_mb": total_audio_received / (1024 * 1024),
                "total_messages": total_messages,
                "total_function_calls": total_functions,
                "config": {
                    "max_concurrent": self.config["max_concurrent_sessions"],
                    "rate_limit_per_ip": self.config["rate_limit_per_ip"],
                    "timeout_seconds": self.config["session_timeout_seconds"]
                }
            }
    
    def _cleanup_loop(self):
        """Background greenthread to clean up expired sessions."""
        while True:
            try:
                eventlet.sleep(30)  # Use non-blocking sleep
                self._cleanup_expired_sessions()
            except Exception as e:
                logger.error(f"Error in cleanup loop: {e}")
    
    def _cleanup_expired_sessions(self):
        """Remove sessions that have exceeded timeout."""
        timeout_seconds = self.config["session_timeout_seconds"]
        cutoff_time = datetime.now() - timedelta(seconds=timeout_seconds)
        
        expired_sessions = []
        
        with self.lock:
            for sid, session in self.sessions.items():
                if session.last_activity < cutoff_time:
                    expired_sessions.append(sid)
        
        # Deactivate and remove expired sessions
        for sid in expired_sessions:
            self.deactivate_session(sid, "timeout")
            self.remove_session(sid)
            
        if expired_sessions:
            logger.info(f"Cleaned up {len(expired_sessions)} expired sessions")


# Global session manager instance
_session_manager = None


def get_session_manager() -> SessionManager:
    """Get the global SessionManager instance."""
    global _session_manager
    if _session_manager is None:
        _session_manager = SessionManager()
    return _session_manager