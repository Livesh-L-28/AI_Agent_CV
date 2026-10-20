"""
Bounded frame ring buffer with backpressure management.
Ensures consumers never exhaust memory during slow inference pipelines.
"""

import threading
from collections import deque
from typing import Optional

from sentinel.vision.sources.base import VideoFrame


class BoundedFrameBuffer:
    """
    Thread-safe bounded frame queue.
    Drops oldest frames when capacity is exceeded to guarantee low consumer latency.
    """

    def __init__(self, capacity: int = 15, drop_oldest: bool = True) -> None:
        if capacity <= 0:
            raise ValueError(f"Buffer capacity must be positive: {capacity}")
        self.capacity = capacity
        self.drop_oldest = drop_oldest
        self._buffer: deque[VideoFrame] = deque(maxlen=capacity)
        self._lock = threading.Lock()
        self._not_empty = threading.Condition(self._lock)
        self.dropped_frames: int = 0
        self.total_enqueued: int = 0

    def put(self, frame: VideoFrame) -> bool:
        """
        Puts a frame into the buffer.
        If buffer is full, drops a frame according to backpressure policy.
        """
        with self._lock:
            if len(self._buffer) >= self.capacity:
                self.dropped_frames += 1
                if self.drop_oldest:
                    self._buffer.popleft()  # Drop oldest frame
                else:
                    return False  # Drop current incoming frame

            self._buffer.append(frame)
            self.total_enqueued += 1
            self._not_empty.notify()
            return True

    def get(self, timeout: Optional[float] = None) -> Optional[VideoFrame]:
        """Pops the next available frame, waiting up to timeout seconds."""
        with self._not_empty:
            if not self._buffer:
                if not self._not_empty.wait(timeout):
                    return None
            if self._buffer:
                return self._buffer.popleft()
            return None

    def clear(self) -> None:
        """Flushes all queued frames."""
        with self._lock:
            self._buffer.clear()

    @property
    def size(self) -> int:
        with self._lock:
            return len(self._buffer)

    @property
    def is_empty(self) -> bool:
        with self._lock:
            return len(self._buffer) == 0
