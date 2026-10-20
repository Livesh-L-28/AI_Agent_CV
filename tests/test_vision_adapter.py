"""
Unit and integration tests for sentinel.vision.adapter
"""

from pathlib import Path

import cv2
import numpy as np
import pytest

from sentinel.vision.adapter import YOLOAdapter
from sentinel.vision.types import BoundingBox, Detection


def test_missing_model_weights():
    with pytest.raises(FileNotFoundError):
        YOLOAdapter(model_path="/non/existent/path/custom_weights.pt")


def test_invalid_frame_inference():
    adapter = YOLOAdapter(model_path="yolov8n.pt", device="cpu")

    # None frame
    with pytest.raises(ValueError):
        adapter.infer(None)

    # Empty ndarray
    with pytest.raises(ValueError):
        adapter.infer(np.array([]))

    # 1D array
    with pytest.raises(ValueError):
        adapter.infer(np.zeros((100,)))


def test_model_loading_and_class_validation():
    adapter = YOLOAdapter(model_path="yolov8n.pt", device="cpu")
    assert adapter.metadata is not None
    assert adapter.metadata.total_classes == 80  # COCO 80 classes

    # Person class must be verified
    assert adapter.has_class("person") is True

    # Generic COCO must NOT claim to detect industrial safety PPE
    validation = adapter.validate_classes(["person", "safety_helmet", "high_vis_vest"])
    assert validation["person"] is True
    assert validation["safety_helmet"] is False
    assert validation["high_vis_vest"] is False


def test_real_inference_on_synthetic_frame():
    adapter = YOLOAdapter(model_path="yolov8n.pt", device="cpu")
    frame_path = Path("data/fixtures/synthetic_frame.jpg")
    assert frame_path.is_file(), "Synthetic frame fixture missing"

    frame = cv2.imread(str(frame_path))
    assert frame is not None

    result = adapter.infer(frame, frame_id=1)
    assert result.frame_id == 1
    assert result.image_width == frame.shape[1]
    assert result.image_height == frame.shape[0]
    assert result.latency_ms > 0.0
    assert result.device == "cpu"
    assert isinstance(result.detections, list)


def test_frame_annotation():
    adapter = YOLOAdapter(model_path="yolov8n.pt", device="cpu")
    dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)

    sample_detections = [
        Detection(
            class_id=0,
            class_name="person",
            confidence=0.92,
            bbox=BoundingBox(x1=0.2, y1=0.2, x2=0.5, y2=0.8),
            track_id=101,
        )
    ]

    annotated = adapter.annotate(dummy_frame, sample_detections, draw_ground_point=True)
    assert annotated.shape == dummy_frame.shape
    assert annotated.dtype == np.uint8
    # Ensure drawing modified pixels
    assert np.any(annotated != dummy_frame)
