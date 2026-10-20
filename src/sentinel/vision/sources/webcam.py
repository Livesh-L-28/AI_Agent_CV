"""
Webcam video source for live monitoring.
Handles hardware acquisition, macOS AVFoundation permissions, and graceful error recovery.
"""

import time
from typing import Optional

import cv2

from sentinel.logging import setup_logging
from sentinel.vision.sources.base import BaseVideoSource, SourceStatus, VideoFrame

logger = setup_logging()


class WebcamSource(BaseVideoSource):
    """
    Acquires live frames from a local hardware camera or USB capture device.
    """

    def __init__(
        self,
        source_id: str = "webcam-0",
        device_index: int = 0,
        frame_sampling_rate: int = 1,
        target_width: int = 640,
        target_height: int = 480,
    ) -> None:
        super().__init__(source_id=source_id, frame_sampling_rate=frame_sampling_rate)
        self.device_index = device_index
        self.target_width = target_width
        self.target_height = target_height

        self.cap: Optional[cv2.VideoCapture] = None
        self.width: int = 0
        self.height: int = 0

    def start(self) -> None:
        """Attempts to open the camera device."""
        self.status = SourceStatus.INITIALIZING
        logger.info(f"Opening webcam device {self.device_index}...")

        self.cap = cv2.VideoCapture(self.device_index)

        # Attempt to set requested resolution
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.target_width)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.target_height)

        if not self.cap.isOpened():
            self.status = SourceStatus.ERROR
            self.error_message = (
                f"Webcam device {self.device_index} is unavailable or access was denied. "
                "Ensure camera permissions are granted or use recorded-video replay."
            )
            logger.error(self.error_message)
            if self.cap is not None:
                self.cap.release()
                self.cap = None
            raise RuntimeError(self.error_message)

        # Test frame read to confirm operational camera stream
        ret, test_frame = self.cap.read()
        if not ret or test_frame is None or test_frame.size == 0:
            self.status = SourceStatus.ERROR
            self.error_message = (
                f"Webcam device {self.device_index} opened but failed to yield a valid frame."
            )
            logger.error(self.error_message)
            self.cap.release()
            self.cap = None
            raise RuntimeError(self.error_message)

        self.height, self.width = test_frame.shape[:2]
        self.status = SourceStatus.RUNNING
        self.start_time = time.time()
        logger.info(f"Webcam '{self.source_id}' started: {self.width}x{self.height}")

    def read_frame(self) -> Optional[VideoFrame]:
        """Reads the next frame from the camera."""
        if self.status != SourceStatus.RUNNING or self.cap is None:
            return None

        sampled_frame = None
        for _ in range(self.frame_sampling_rate):
            ret, frame = self.cap.read()
            self.frames_read += 1
            if not ret or frame is None:
                self.status = SourceStatus.ERROR
                self.error_message = "Webcam stream disconnected or failed to read frame."
                logger.error(self.error_message)
                return None
            sampled_frame = frame

        self.frames_yielded += 1

        return VideoFrame(
            source_id=self.source_id,
            frame_id=self.frames_yielded,
            timestamp_ns=time.time_ns(),
            width=self.width,
            height=self.height,
            data=sampled_frame,
            is_eof=False,
        )

    def stop(self) -> None:
        """Releases the camera device safely."""
        if self.cap is not None:
            self.cap.release()
            self.cap = None

        self.status = SourceStatus.STOPPED
        self.stop_time = time.time()
        logger.info(f"Webcam '{self.source_id}' stopped.")
