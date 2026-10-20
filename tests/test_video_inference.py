"""
Integration test verifying recorded-video inference end-to-end.
"""

from pathlib import Path

import cv2

from sentinel.vision.adapter import YOLOAdapter


def test_recorded_video_inference():
    video_path = Path("data/fixtures/synthetic_safety_video.mp4")
    assert video_path.is_file(), "Fixture video missing"

    adapter = YOLOAdapter(model_path="yolov8n.pt", device="cpu", confidence_threshold=0.25)
    cap = cv2.VideoCapture(str(video_path))
    assert cap.isOpened(), "Could not open video file"

    frame_count = 0
    total_latency_ms = 0.0
    frames_with_detections = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        frame_count += 1
        result = adapter.infer(frame, frame_id=frame_count)
        total_latency_ms += result.latency_ms

        if len(result.detections) > 0:
            frames_with_detections += 1

        # Process first 25 frames for fast reproducible test verification
        if frame_count >= 25:
            break

    cap.release()

    assert frame_count == 25
    avg_latency = total_latency_ms / frame_count
    effective_fps = 1000.0 / avg_latency if avg_latency > 0 else 0

    # Verify latency meets requirements (< 100ms on CPU, typically < 30ms)
    assert avg_latency < 100.0
    assert effective_fps > 10.0
