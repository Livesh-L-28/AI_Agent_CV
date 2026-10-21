"""
SENTINEL AI Video Sources Package
"""

from sentinel.vision.sources.base import BaseVideoSource, SourceStatus, VideoFrame
from sentinel.vision.sources.buffer import BoundedFrameBuffer
from sentinel.vision.sources.camera import (
    BrowserWebcamSource,
    CameraConfig,
    CameraMetrics,
    CameraStatus,
    CameraType,
    RTSPCameraSource,
    sanitize_camera_uri,
    validate_camera_uri,
)
from sentinel.vision.sources.replay import VideoReplaySource
from sentinel.vision.sources.webcam import WebcamSource

__all__ = [
    "BaseVideoSource",
    "SourceStatus",
    "VideoFrame",
    "BoundedFrameBuffer",
    "VideoReplaySource",
    "WebcamSource",
    "CameraType",
    "CameraStatus",
    "CameraConfig",
    "CameraMetrics",
    "RTSPCameraSource",
    "BrowserWebcamSource",
    "sanitize_camera_uri",
    "validate_camera_uri",
]
