"""
Unit and lifecycle tests for sentinel.vision.sources (VideoReplaySource, WebcamSource, BoundedFrameBuffer).
"""

from pathlib import Path

import numpy as np
import pytest

from sentinel.vision.sources.base import SourceStatus, VideoFrame
from sentinel.vision.sources.buffer import BoundedFrameBuffer
from sentinel.vision.sources.replay import VideoReplaySource
from sentinel.vision.sources.webcam import WebcamSource


def test_replay_source_lifecycle():
    video_path = Path("data/fixtures/synthetic_safety_video.mp4")
    assert video_path.is_file()

    source = VideoReplaySource(
        source_id="test-replay-1",
        video_path=video_path,
        loop=False,
        frame_sampling_rate=1,
    )

    assert source.status == SourceStatus.CREATED
    source.start()
    assert source.status == SourceStatus.RUNNING
    assert source.width == 640
    assert source.height == 480

    frame = source.read_frame()
    assert frame is not None
    assert frame.source_id == "test-replay-1"
    assert frame.frame_id == 1
    assert frame.width == 640
    assert frame.height == 480
    assert isinstance(frame.data, np.ndarray)

    metrics = source.get_metrics()
    assert metrics["source_id"] == "test-replay-1"
    assert metrics["frames_yielded"] == 1
    assert metrics["status"] == "RUNNING"

    source.stop()
    assert source.status == SourceStatus.STOPPED
    assert source.cap is None


def test_replay_source_sampling():
    video_path = Path("data/fixtures/synthetic_safety_video.mp4")
    source = VideoReplaySource(
        source_id="test-sampling",
        video_path=video_path,
        frame_sampling_rate=3,
    )
    source.start()
    f1 = source.read_frame()
    assert f1 is not None
    assert f1.frame_id == 1
    assert source.frames_read == 3
    source.stop()


def test_replay_source_eof():
    video_path = Path("data/fixtures/synthetic_safety_video.mp4")
    # Synthetic video is 125 frames (5 sec * 25 fps)
    source = VideoReplaySource(
        source_id="test-eof",
        video_path=video_path,
        loop=False,
        frame_sampling_rate=10,  # Fast forward
    )
    source.start()

    frames = []
    while True:
        f = source.read_frame()
        if f is None:
            break
        frames.append(f)

    assert len(frames) > 0
    assert source.status == SourceStatus.COMPLETED
    assert source.read_frame() is None
    source.stop()


def test_replay_source_looping():
    video_path = Path("data/fixtures/synthetic_safety_video.mp4")
    source = VideoReplaySource(
        source_id="test-loop",
        video_path=video_path,
        loop=True,
        frame_sampling_rate=20,
    )
    source.start()

    # Read more frames than the total file frames / 20
    count = 0
    for _ in range(15):
        f = source.read_frame()
        assert f is not None
        count += 1

    assert count == 15
    assert source.status == SourceStatus.RUNNING
    source.stop()


def test_replay_missing_file():
    source = VideoReplaySource(
        source_id="test-missing",
        video_path="/non/existent/path/video.mp4",
    )
    with pytest.raises(FileNotFoundError):
        source.start()
    assert source.status == SourceStatus.ERROR


def test_bounded_frame_buffer_backpressure():
    buffer = BoundedFrameBuffer(capacity=3, drop_oldest=True)
    assert buffer.size == 0
    assert buffer.is_empty is True

    # Put 5 frames into capacity 3 buffer
    for i in range(5):
        frame = VideoFrame(
            source_id="test",
            frame_id=i + 1,
            timestamp_ns=i * 1000,
            width=640,
            height=480,
            data=np.zeros((480, 640, 3), dtype=np.uint8),
        )
        buffer.put(frame)

    assert buffer.size == 3
    assert buffer.dropped_frames == 2
    assert buffer.total_enqueued == 5

    # Oldest frames (1 and 2) should have been dropped; next should be frame 3
    f_out = buffer.get()
    assert f_out is not None
    assert f_out.frame_id == 3

    buffer.clear()
    assert buffer.size == 0


def test_webcam_unavailable_handling():
    # Attempting to open device 9999 (invalid index)
    source = WebcamSource(source_id="test-invalid-webcam", device_index=9999)
    with pytest.raises(RuntimeError) as exc_info:
        source.start()

    assert "unavailable" in str(exc_info.value)
    assert source.status == SourceStatus.ERROR
    assert source.error_message is not None
    assert source.cap is None
