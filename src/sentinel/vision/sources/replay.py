"""
Deterministic Video Replay Source.
Reference implementation for reproducible automated testing, CI, and evaluation.
"""

import time
from pathlib import Path
from typing import Optional

import cv2

from sentinel.logging import setup_logging
from sentinel.vision.sources.base import BaseVideoSource, SourceStatus, VideoFrame

logger = setup_logging()


class VideoReplaySource(BaseVideoSource):
    """
    Replays recorded video files with frame-accurate sampling, looping,
    and deterministic timestamps.
    """

    def __init__(
        self,
        source_id: str,
        video_path: str | Path,
        loop: bool = False,
        frame_sampling_rate: int = 1,
        simulated_fps: Optional[float] = None,
    ) -> None:
        super().__init__(source_id=source_id, frame_sampling_rate=frame_sampling_rate)
        self.video_path = Path(video_path)
        self.loop = loop
        self.simulated_fps = simulated_fps

        self.cap: Optional[cv2.VideoCapture] = None
        self.native_fps: float = 25.0
        self.total_frames_in_file: int = 0
        self.width: int = 0
        self.height: int = 0

    def start(self) -> None:
        """Opens the video file and reads stream properties."""
        if not self.video_path.is_file():
            self.status = SourceStatus.ERROR
            self.error_message = f"Video file not found: {self.video_path}"
            raise FileNotFoundError(self.error_message)

        self.status = SourceStatus.INITIALIZING
        self.cap = cv2.VideoCapture(str(self.video_path))

        if not self.cap.isOpened():
            self.status = SourceStatus.ERROR
            self.error_message = f"Failed to open video codec for file: {self.video_path}"
            raise RuntimeError(self.error_message)

        self.width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        self.native_fps = float(self.cap.get(cv2.CAP_PROP_FPS)) or 25.0
        self.total_frames_in_file = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))

        self.status = SourceStatus.RUNNING
        self.start_time = time.time()
        logger.info(
            f"VideoReplaySource '{self.source_id}' started: {self.width}x{self.height} @ "
            f"{self.native_fps:.1f} FPS ({self.total_frames_in_file} frames)"
        )

    def read_frame(self) -> Optional[VideoFrame]:
        """Reads the next sampled frame from the video stream."""
        if self.status != SourceStatus.RUNNING or self.cap is None:
            return None

        sampled_frame = None

        # Sample frames based on frame_sampling_rate
        for _ in range(self.frame_sampling_rate):
            ret, frame = self.cap.read()
            self.frames_read += 1

            if not ret:
                # Reached end-of-file
                if self.loop:
                    self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    ret, frame = self.cap.read()
                    if not ret:
                        self.status = SourceStatus.COMPLETED
                        return None
                else:
                    self.status = SourceStatus.COMPLETED
                    self.stop_time = time.time()
                    logger.info(f"VideoReplaySource '{self.source_id}' reached EOF.")
                    return None

            sampled_frame = frame

        if sampled_frame is None:
            return None

        self.frames_yielded += 1

        # Calculate frame timestamp (simulated monotonic nanoseconds)
        fps = self.simulated_fps or self.native_fps
        timestamp_ns = int((self.frames_yielded / fps) * 1_000_000_000)

        return VideoFrame(
            source_id=self.source_id,
            frame_id=self.frames_yielded,
            timestamp_ns=timestamp_ns,
            width=self.width,
            height=self.height,
            data=sampled_frame,
            is_eof=False,
        )

    def stop(self) -> None:
        """Closes the video capture and releases OS handles."""
        if self.cap is not None:
            self.cap.release()
            self.cap = None

        self.status = SourceStatus.STOPPED
        self.stop_time = time.time()
        logger.info(f"VideoReplaySource '{self.source_id}' stopped.")
