"""
SENTINEL AI — Live Vision Metrics Provider.
Thread-safe collection and aggregation of real-time computer vision inference latency,
effective throughput (FPS), frame counts, and detection statistics.
Replaces all hardcoded/fake analytics metrics.
"""

from __future__ import annotations

import threading
from collections import deque
from typing import Any


class VisionMetricsProvider:
    """Thread-safe telemetry collector for live computer vision processing."""

    def __init__(self, window_size: int = 100) -> None:
        self.window_size = window_size
        self._latencies: deque[float] = deque(maxlen=window_size)
        self._frames_processed: int = 0
        self._detected_persons: int = 0
        self._active_tracks: int = 0
        self._device: str = "cpu"
        self._is_active: bool = False
        self._lock = threading.Lock()

    def record_inference(
        self,
        latency_ms: float,
        detected_persons: int = 0,
        device: str = "cpu",
        active_tracks: int = 0,
    ) -> None:
        """Records a single real inference pass duration and detection count."""
        with self._lock:
            self._latencies.append(latency_ms)
            self._frames_processed += 1
            self._detected_persons += detected_persons
            self._active_tracks = active_tracks
            self._device = device
            self._is_active = True

    def reset(self) -> None:
        """Resets all metrics to idle state."""
        with self._lock:
            self._latencies.clear()
            self._frames_processed = 0
            self._detected_persons = 0
            self._active_tracks = 0
            self._is_active = False

    def get_metrics(self) -> dict[str, Any]:
        """
        Calculates honest metrics from the active sliding window.
        Returns explicit IDLE state if no inference passes have occurred.
        """
        with self._lock:
            if not self._latencies:
                return {
                    "device": self._device,
                    "status": "IDLE_NO_STREAM",
                    "average_latency_ms": 0.0,
                    "effective_fps": 0.0,
                    "frames_processed": self._frames_processed,
                    "detected_persons": self._detected_persons,
                    "active_tracks": self._active_tracks,
                }

            avg_latency = sum(self._latencies) / len(self._latencies)
            fps = round(1000.0 / avg_latency, 1) if avg_latency > 0 else 0.0

            return {
                "device": self._device,
                "status": "ACTIVE_STREAMING",
                "average_latency_ms": round(avg_latency, 2),
                "effective_fps": fps,
                "frames_processed": self._frames_processed,
                "detected_persons": self._detected_persons,
                "active_tracks": self._active_tracks,
            }


# Global singleton metrics provider
_global_metrics_provider = VisionMetricsProvider()


def get_vision_metrics_provider() -> VisionMetricsProvider:
    """Returns global singleton vision metrics provider."""
    return _global_metrics_provider
