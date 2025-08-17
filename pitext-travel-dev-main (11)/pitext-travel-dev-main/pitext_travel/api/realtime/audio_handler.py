# pitext_travel/api/realtime/audio_handler.py
"""Audio format handling and buffering for Realtime API."""

import io
import wave
import struct
import numpy as np
from typing import Optional, Tuple, List
from collections import deque
import threading
import logging

logger = logging.getLogger(__name__)


class AudioHandler:
    """Handles audio format conversion and buffering for Realtime API."""
    
    def __init__(self, sample_rate: int = 24000, channels: int = 1):
        """Initialize audio handler.
        
        Args:
            sample_rate: Sample rate in Hz (OpenAI uses 24000)
            channels: Number of channels (OpenAI uses mono)
        """
        try:
            logger.info(f"🔧 Initializing AudioHandler...")
            logger.info(f"🔧 Sample rate: {sample_rate}, Channels: {channels}")
            
            self.sample_rate = sample_rate
            self.channels = channels
            self.bytes_per_sample = 2  # 16-bit audio
            
            # Buffers for audio data
            self.input_buffer = deque()  # Raw PCM from browser
            self.output_buffer = deque()  # PCM from OpenAI
            
            # Thread safety
            self.input_lock = threading.Lock()
            self.output_lock = threading.Lock()
            
            logger.info(f"✅ AudioHandler initialized successfully")
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize AudioHandler: {e}")
            logger.error(f"❌ Error type: {type(e)}")
            logger.error(f"❌ Error args: {e.args}")
            logger.exception("AudioHandler initialization error:")
            raise
    
    def append_input_audio(self, audio_data: bytes):
        """Add raw audio data to input buffer.
        
        Args:
            audio_data: Raw PCM16 audio data
        """
        with self.input_lock:
            self.input_buffer.append(audio_data)
    
    def get_input_audio(self, max_bytes: Optional[int] = None) -> bytes:
        """Get audio data from input buffer.
        
        Args:
            max_bytes: Maximum bytes to return (None for all)
            
        Returns:
            PCM16 audio data
        """
        with self.input_lock:
            if not self.input_buffer:
                return b""
            
            if max_bytes is None:
                # Return all buffered audio
                data = b"".join(self.input_buffer)
                self.input_buffer.clear()
                return data
            else:
                # Return up to max_bytes
                collected = b""
                while self.input_buffer and len(collected) < max_bytes:
                    chunk = self.input_buffer.popleft()
                    
                    if len(collected) + len(chunk) <= max_bytes:
                        collected += chunk
                    else:
                        # Split chunk
                        take = max_bytes - len(collected)
                        collected += chunk[:take]
                        self.input_buffer.appendleft(chunk[take:])
                        break
                
                return collected
    
    def clear_input_buffer(self):
        """Clear the input audio buffer."""
        with self.input_lock:
            self.input_buffer.clear()
    
    def append_output_audio(self, audio_data: bytes):
        """Add audio data to output buffer.
        
        Args:
            audio_data: PCM16 audio data from OpenAI
        """
        with self.output_lock:
            self.output_buffer.append(audio_data)
    
    def get_output_audio(self, max_bytes: Optional[int] = None) -> bytes:
        """Get audio data from output buffer.
        
        Args:
            max_bytes: Maximum bytes to return (None for all)
            
        Returns:
            PCM16 audio data
        """
        with self.output_lock:
            if not self.output_buffer:
                return b""
            
            if max_bytes is None:
                # Return all buffered audio
                data = b"".join(self.output_buffer)
                self.output_buffer.clear()
                return data
            else:
                # Return up to max_bytes
                collected = b""
                while self.output_buffer and len(collected) < max_bytes:
                    chunk = self.output_buffer.popleft()
                    
                    if len(collected) + len(chunk) <= max_bytes:
                        collected += chunk
                    else:
                        # Split chunk
                        take = max_bytes - len(collected)
                        collected += chunk[:take]
                        self.output_buffer.appendleft(chunk[take:])
                        break
                
                return collected
    
    def clear_output_buffer(self):
        """Clear the output audio buffer."""
        with self.output_lock:
            self.output_buffer.clear()
    
    def convert_sample_rate(self, audio_data: bytes, 
                          from_rate: int, to_rate: int) -> bytes:
        """Convert audio sample rate.
        
        Args:
            audio_data: PCM16 audio data
            from_rate: Original sample rate
            to_rate: Target sample rate
            
        Returns:
            Resampled PCM16 audio data
        """
        if from_rate == to_rate:
            return audio_data
        
        try:
            # Convert bytes to numpy array
            samples = np.frombuffer(audio_data, dtype=np.int16)
            
            # Simple resampling using numpy
            duration = len(samples) / from_rate
            new_length = int(duration * to_rate)
            
            # Linear interpolation for resampling
            old_indices = np.arange(len(samples))
            new_indices = np.linspace(0, len(samples) - 1, new_length)
            resampled = np.interp(new_indices, old_indices, samples)
            
            # Convert back to int16
            resampled = resampled.astype(np.int16)
            
            return resampled.tobytes()
            
        except Exception as e:
            logger.error(f"Failed to resample audio: {e}")
            return audio_data
    
    def create_wav_header(self, data_size: int) -> bytes:
        """Create WAV file header for PCM16 audio.
        
        Args:
            data_size: Size of audio data in bytes
            
        Returns:
            WAV header bytes
        """
        # WAV header structure
        header = b"RIFF"
        header += struct.pack("<I", data_size + 36)  # File size - 8
        header += b"WAVE"
        header += b"fmt "
        header += struct.pack("<I", 16)  # Subchunk size
        header += struct.pack("<H", 1)   # Audio format (1 = PCM)
        header += struct.pack("<H", self.channels)
        header += struct.pack("<I", self.sample_rate)
        header += struct.pack("<I", self.sample_rate * self.channels * self.bytes_per_sample)
        header += struct.pack("<H", self.channels * self.bytes_per_sample)
        header += struct.pack("<H", self.bytes_per_sample * 8)
        header += b"data"
        header += struct.pack("<I", data_size)
        
        return header
    
    def pcm_to_wav(self, pcm_data: bytes) -> bytes:
        """Convert PCM16 audio to WAV format.
        
        Args:
            pcm_data: Raw PCM16 audio data
            
        Returns:
            Complete WAV file data
        """
        header = self.create_wav_header(len(pcm_data))
        return header + pcm_data
    
    def wav_to_pcm(self, wav_data: bytes) -> bytes:
        """Extract PCM16 audio from WAV format.
        
        Args:
            wav_data: Complete WAV file data
            
        Returns:
            Raw PCM16 audio data
        """
        try:
            # Skip WAV header (44 bytes for standard PCM16 WAV)
            if wav_data.startswith(b"RIFF") and b"WAVE" in wav_data[:12]:
                # Find data chunk
                data_pos = wav_data.find(b"data")
                if data_pos != -1:
                    # Skip "data" tag and size field
                    return wav_data[data_pos + 8:]
            
            # If not valid WAV, return as-is
            return wav_data
            
        except Exception as e:
            logger.error(f"Failed to extract PCM from WAV: {e}")
            return wav_data
    
    def get_buffer_duration(self, buffer_size: int) -> float:
        """Calculate duration of audio buffer in seconds.
        
        Args:
            buffer_size: Size of buffer in bytes
            
        Returns:
            Duration in seconds
        """
        bytes_per_second = self.sample_rate * self.channels * self.bytes_per_sample
        return buffer_size / bytes_per_second
    
    def get_buffer_stats(self) -> dict:
        """Get current buffer statistics.
        
        Returns:
            Dictionary with buffer stats
        """
        with self.input_lock:
            input_size = sum(len(chunk) for chunk in self.input_buffer)
            
        with self.output_lock:
            output_size = sum(len(chunk) for chunk in self.output_buffer)
        
        return {
            "input_buffer_size": input_size,
            "input_buffer_duration": self.get_buffer_duration(input_size),
            "output_buffer_size": output_size,
            "output_buffer_duration": self.get_buffer_duration(output_size),
            "sample_rate": self.sample_rate,
            "channels": self.channels
        }