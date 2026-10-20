"""
Base video source definitions, lifecycle states, and frame schemas.
"""

import time
from abc import ABC, abstractmethod
from enum import Enum
from typing import Optional

import numpy as np
from pydantic import BaseModel, ConfigDict, Field


class SourceStatus(str, Enum):
    CREATED = "CREATED"
    INITIALIZING = "INITIALIZING"
    RUNNING = "RUNNING"
    PAUSED = "PAUSED"
    STOPPED = "STOPPED"
    ERROR = "ERROR"
    COMPLETED = "COMPLETED"


class VideoFrame(BaseModel):
    """Encapsulates a single video frame with metadata."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    source_id: str
    frame_id: int
    timestamp_ns: int
    width: int
    height: int
    data: np.ndarray = Field(exclude=True)  # Don't dump raw image array in json serialization
    is_eof: bool = False

    @property
    def timestamp_sec(self) -> float:
        return self.timestamp_ns / 1_000_000_000.0


class BaseVideoSource(ABC):
    """
    Abstract Base Class for video sources.
    Enforces unified lifecycle management, status reporting, frame sampling, and resource cleanup.
    """

    def __init__(
        self,
        source_id: str,
        frame_sampling_rate: int = 1,
    ) -> None:
        self.source_id = source_id
        self.frame_sampling_rate = max(1, frame_sampling_rate)
        self.status = SourceStatus.CREATED
        self.error_message: Optional[str] = None

        self.frames_read: int = 0
        self.frames_yielded: int = 0
        self.frames_dropped: int = 0
        self.start_time: Optional[float] = None
        self.stop_time: Optional[float] = None

    @abstractmethod
    def start(self) -> None:
        """Initializes hardware or file handles and transitions to RUNNING."""
        pass

    @abstractmethod
    def stop(self) -> None:
        """Releases all open camera handles, threads, and memory."""
        pass

    @abstractmethod
    def read_frame(self) -> Optional[VideoFrame]:
        """Reads the next available frame, respecting sampling rates and EOF."""
        pass

    def get_metrics(self) -> dict:
        """Returns runtime performance metrics for the source."""
        now = time.time()
        uptime = (self.stop_time or now) - (self.start_time or now) if self.start_time else 0.0
        effective_fps = round(self.frames_yielded / uptime, 2) if uptime > 0 else 0.0

        return {
            "source_id": self.source_id,
            "status": self.status.value,
            "error_message": self.error_message,
            "frames_read": self.frames_read,
            "frames_yielded": self.frames_yielded,
            "frames_dropped": self.frames_dropped,
            "uptime_seconds": round(uptime, 2),
            "effective_fps": effective_fps,
            "sampling_rate": self.frame_sampling_rate,
        }
