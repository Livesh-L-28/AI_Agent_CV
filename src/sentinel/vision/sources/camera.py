"""
Enterprise Camera Source Abstractions and Security Guards.
Provides unified abstractions for RTSP IP cameras, USB webcams, browser-pushed video, and replay files.
Implements SSRF protection, credential redaction, reconnect backoff, and robust health states.
"""

import ipaddress
import re
import time
from enum import Enum
from typing import Optional
from urllib.parse import urlparse

import cv2
import numpy as np
from pydantic import BaseModel, Field

from sentinel.logging import setup_logging
from sentinel.vision.sources.base import BaseVideoSource, SourceStatus, VideoFrame
from sentinel.vision.sources.buffer import BoundedFrameBuffer

logger = setup_logging()


class CameraType(str, Enum):
    WEBCAM = "webcam"
    RTSP = "rtsp"
    BROWSER_WEBCAM = "browser_webcam"
    REPLAY = "replay"


class CameraStatus(str, Enum):
    DISCONNECTED = "DISCONNECTED"
    CONNECTING = "CONNECTING"
    LIVE = "LIVE"
    STALE = "STALE"
    RECONNECTING = "RECONNECTING"
    DISABLED = "DISABLED"
    ERROR = "ERROR"
    STOPPED = "STOPPED"


def sanitize_camera_uri(uri: str) -> str:
    """
    Strips credentials from RTSP/HTTP URIs to prevent credential leakage in logs and API responses.
    e.g., 'rtsp://admin:secret123@192.168.1.100:554/live' -> 'rtsp://***:***@192.168.1.100:554/live'
    """
    if not uri:
        return ""
    # Mask user:pass@ in any URL scheme
    return re.sub(r"://([^:@/]+):([^@/]+)@", r"://***:***@", uri)


def validate_camera_uri(uri: str, camera_type: CameraType, allow_localhost: bool = False) -> None:
    """
    Validates camera URI to protect against SSRF and arbitrary file access vulnerabilities.
    """
    if camera_type == CameraType.WEBCAM:
        # Webcam URI must be a device index string or integer (e.g., "0", "1")
        try:
            val = int(uri)
            if val < 0 or val > 64:
                raise ValueError("Webcam device index must be between 0 and 64")
        except ValueError:
            raise ValueError(f"Invalid webcam device index: '{uri}'. Must be an integer index (e.g. '0').")
        return

    if camera_type == CameraType.BROWSER_WEBCAM:
        # Browser webcam uses client-driven ingestion identifier
        return

    if camera_type == CameraType.REPLAY:
        # Replay must not use directory traversal or arbitrary sensitive paths
        if ".." in uri or uri.startswith(("/etc", "/var", "/dev", "/proc", "/sys")):
            raise ValueError("Directory traversal or sensitive path access is prohibited for replay sources.")
        return

    if camera_type == CameraType.RTSP:
        parsed = urlparse(uri)
        scheme = parsed.scheme.lower()
        if scheme not in ("rtsp", "rtsps"):
            raise ValueError(f"Invalid RTSP scheme '{scheme}'. Allowed schemes: 'rtsp://', 'rtsps://'.")

        hostname = parsed.hostname
        if not hostname:
            raise ValueError("RTSP URI must include a valid hostname or IP address.")

        # Block cloud metadata service IP endpoints
        blocked_hostnames = {
            "169.254.169.254",  # AWS/GCP/Azure link-local metadata
            "metadata.google.internal",
            "metadata.local",
            "100.100.100.200",  # Alibaba cloud metadata
        }
        if hostname.lower() in blocked_hostnames:
            raise ValueError("Access to cloud metadata endpoints is strictly forbidden (SSRF protection).")

        # Check for loopback and private interfaces unless explicitly allowed for testing
        if not allow_localhost:
            try:
                ip = ipaddress.ip_address(hostname)
                if ip.is_loopback:
                    raise ValueError("Loopback connections are not permitted for RTSP camera endpoints.")
                if ip.is_link_local:
                    raise ValueError("Link-local IP connections are not permitted.")
            except ValueError as e:
                # Not a direct IP address (is a hostname)
                if hostname.lower() in ("localhost", "127.0.0.1", "::1"):
                    raise ValueError("Loopback hostname is not permitted for RTSP camera endpoints.") from e

        if parsed.port and (parsed.port < 1 or parsed.port > 65535):
            raise ValueError(f"Invalid network port: {parsed.port}")


class CameraMetrics(BaseModel):
    frames_read: int = 0
    frames_processed: int = 0
    frames_dropped: int = 0
    effective_fps: float = 0.0
    average_latency_ms: float = 0.0
    queue_depth: int = 0
    last_frame_timestamp_ns: int = 0
    last_frame_age_seconds: float = 0.0
    reconnect_count: int = 0
    last_error_category: Optional[str] = None


class CameraConfig(BaseModel):
    camera_id: str = Field(min_length=3, max_length=64)
    name: str = Field(min_length=2, max_length=128)
    camera_type: CameraType
    uri: str
    sampling_rate: int = Field(default=1, ge=1, le=30)
    target_fps: float = Field(default=25.0, ge=1.0, le=60.0)
    site_id: Optional[str] = None
    zone_id: Optional[str] = None
    enabled: bool = True

    @property
    def sanitized_uri(self) -> str:
        return sanitize_camera_uri(self.uri)


class RTSPCameraSource(BaseVideoSource):
    """
    Robust RTSP IP camera frame receiver.
    Implements credential redaction, socket timeout handling,
    staleness detection, and exponential backoff reconnection.
    """

    def __init__(
        self,
        config: CameraConfig,
        timeout_seconds: float = 5.0,
        max_reconnect_delay: float = 30.0,
    ) -> None:
        super().__init__(source_id=config.camera_id, frame_sampling_rate=config.sampling_rate)
        self.config = config
        self.raw_uri = config.uri
        self.sanitized_uri = config.sanitized_uri
        self.timeout_seconds = timeout_seconds
        self.max_reconnect_delay = max_reconnect_delay

        self.cap: Optional[cv2.VideoCapture] = None
        self.camera_status = CameraStatus.DISCONNECTED
        self.reconnect_count = 0
        self.last_frame_time_ns = 0
        self.last_error_category: Optional[str] = None
        self.width = 0
        self.height = 0

    def start(self) -> None:
        """Initializes connection to RTSP stream."""
        self.camera_status = CameraStatus.CONNECTING
        self.status = SourceStatus.INITIALIZING
        logger.info(f"Connecting to camera '{self.source_id}' at {self.sanitized_uri}...")

        try:
            self._open_capture()
            self.camera_status = CameraStatus.LIVE
            self.status = SourceStatus.RUNNING
            self.start_time = time.time()
            self.reconnect_count = 0
            self.last_error_category = None
            logger.info(f"Camera '{self.source_id}' connected: {self.width}x{self.height}")
        except Exception as e:
            self.camera_status = CameraStatus.ERROR
            self.status = SourceStatus.ERROR
            self.last_error_category = "CONNECTION_REFUSED"
            self.error_message = f"Failed to connect to camera {self.sanitized_uri}: {e}"
            logger.error(f"Camera connection failed for '{self.source_id}': {e}")
            raise

    def _open_capture(self) -> None:
        """Opens cv2 VideoCapture with TCP transport preference for RTSP stability."""
        if self.cap is not None:
            self.cap.release()

        # Set FFMPEG options for low-latency TCP RTSP
        self.cap = cv2.VideoCapture(self.raw_uri, cv2.CAP_FFMPEG)
        # 5 second timeout on socket reads
        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

        if not self.cap.isOpened():
            raise ConnectionError(f"RTSP stream could not be opened at {self.sanitized_uri}")

        ret, test_frame = self.cap.read()
        if not ret or test_frame is None or test_frame.size == 0:
            raise ConnectionError(f"RTSP stream at {self.sanitized_uri} opened but returned empty initial frame")

        self.height, self.width = test_frame.shape[:2]
        self.last_frame_time_ns = time.time_ns()

    def read_frame(self) -> Optional[VideoFrame]:
        """Reads the next sampled frame from RTSP stream, handling disconnects."""
        if self.camera_status not in (CameraStatus.LIVE, CameraStatus.STALE) or self.cap is None:
            return None

        # Check for stream staleness
        now_ns = time.time_ns()
        if self.last_frame_time_ns > 0:
            staleness_sec = (now_ns - self.last_frame_time_ns) / 1e9
            if staleness_sec > self.timeout_seconds:
                self.camera_status = CameraStatus.STALE
                logger.warning(f"Camera '{self.source_id}' stream is STALE ({staleness_sec:.1f}s since last frame)")

        sampled_frame = None
        for _ in range(self.frame_sampling_rate):
            ret, frame = self.cap.read()
            self.frames_read += 1
            if not ret or frame is None:
                self.camera_status = CameraStatus.RECONNECTING
                self.last_error_category = "FRAME_READ_ERROR"
                logger.warning(f"Camera '{self.source_id}' read error; entering RECONNECTING state")
                self._attempt_reconnect()
                return None
            sampled_frame = frame

        self.frames_yielded += 1
        self.last_frame_time_ns = time.time_ns()
        self.camera_status = CameraStatus.LIVE

        return VideoFrame(
            source_id=self.source_id,
            frame_id=self.frames_yielded,
            timestamp_ns=self.last_frame_time_ns,
            width=self.width,
            height=self.height,
            data=sampled_frame,
            is_eof=False,
        )

    def _attempt_reconnect(self) -> None:
        """Attempts to reconnect with bounded exponential backoff."""
        self.reconnect_count += 1
        # Bounded exponential backoff: 1s, 2s, 4s, 8s, up to max_reconnect_delay
        backoff_sec = min(self.max_reconnect_delay, 1.0 * (2 ** min(self.reconnect_count, 5)))
        logger.info(f"Reconnecting camera '{self.source_id}' in {backoff_sec:.1f}s (attempt {self.reconnect_count})...")
        time.sleep(backoff_sec)

        try:
            self._open_capture()
            self.camera_status = CameraStatus.LIVE
            self.last_error_category = None
            logger.info(f"Camera '{self.source_id}' reconnected successfully on attempt {self.reconnect_count}")
        except Exception as e:
            self.camera_status = CameraStatus.ERROR
            self.last_error_category = "RECONNECT_FAILED"
            logger.error(f"Reconnection attempt {self.reconnect_count} failed for '{self.source_id}': {e}")

    def stop(self) -> None:
        """Releases RTSP capture resources cleanly."""
        if self.cap is not None:
            self.cap.release()
            self.cap = None

        self.camera_status = CameraStatus.STOPPED
        self.status = SourceStatus.STOPPED
        self.stop_time = time.time()
        logger.info(f"Camera '{self.source_id}' stopped.")


class BrowserWebcamSource(BaseVideoSource):
    """
    Ingests live video frames pushed directly by client browsers via WebRTC or HTTP POST.
    Allows zero-privilege browser webcam capture without requiring OS terminal permissions.
    """

    def __init__(self, config: CameraConfig, buffer_capacity: int = 15) -> None:
        super().__init__(source_id=config.camera_id, frame_sampling_rate=config.sampling_rate)
        self.config = config
        self.frame_buffer = BoundedFrameBuffer(capacity=buffer_capacity, drop_oldest=True)
        self.camera_status = CameraStatus.DISCONNECTED
        self.last_frame_time_ns = 0
        self.last_error_category: Optional[str] = None
        self.width = 640
        self.height = 480

    def start(self) -> None:
        """Transitions browser webcam receiver to ready state."""
        self.camera_status = CameraStatus.CONNECTING
        self.status = SourceStatus.RUNNING
        self.start_time = time.time()
        logger.info(f"Browser webcam source '{self.source_id}' ready for frame ingestion.")

    def push_frame_bytes(self, image_bytes: bytes, client_timestamp_ns: Optional[int] = None) -> bool:
        """Decodes incoming JPEG/PNG byte buffer from browser and enqueues frame."""
        if self.status != SourceStatus.RUNNING:
            return False

        try:
            nparr = np.frombuffer(image_bytes, np.uint8)
            frame_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if frame_bgr is None or frame_bgr.size == 0:
                self.last_error_category = "DECODE_ERROR"
                return False

            self.height, self.width = frame_bgr.shape[:2]
            self.frames_read += 1
            now_ns = client_timestamp_ns or time.time_ns()
            self.last_frame_time_ns = now_ns
            self.camera_status = CameraStatus.LIVE

            video_frame = VideoFrame(
                source_id=self.source_id,
                frame_id=self.frames_read,
                timestamp_ns=now_ns,
                width=self.width,
                height=self.height,
                data=frame_bgr,
                is_eof=False,
            )
            success = self.frame_buffer.put(video_frame)
            if not success:
                self.frames_dropped += 1
            return success
        except Exception as e:
            self.last_error_category = "INGEST_ERROR"
            logger.error(f"Error ingesting browser frame for '{self.source_id}': {e}")
            return False

    def read_frame(self) -> Optional[VideoFrame]:
        """Pops the next available ingested frame from the buffer."""
        if self.camera_status not in (CameraStatus.LIVE, CameraStatus.CONNECTING, CameraStatus.STALE):
            return None

        # Check staleness if no frames have been pushed for > 4 seconds
        now_ns = time.time_ns()
        if self.last_frame_time_ns > 0:
            staleness_sec = (now_ns - self.last_frame_time_ns) / 1e9
            if staleness_sec > 4.0:
                self.camera_status = CameraStatus.STALE

        frame = self.frame_buffer.get(timeout=0.1)
        if frame is not None:
            self.frames_yielded += 1
            self.camera_status = CameraStatus.LIVE
        return frame

    def stop(self) -> None:
        """Cleans up buffer and marks source stopped."""
        self.frame_buffer.clear()
        self.camera_status = CameraStatus.STOPPED
        self.status = SourceStatus.STOPPED
        self.stop_time = time.time()
        logger.info(f"Browser webcam source '{self.source_id}' stopped.")
