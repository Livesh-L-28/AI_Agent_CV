"""
Unit tests for sentinel.vision.geometry
"""

import pytest

from sentinel.vision.geometry import (
    compute_iou,
    denormalize_bbox,
    is_point_in_bbox,
    normalize_bbox,
)
from sentinel.vision.types import BoundingBox


def test_bounding_box_validations():
    # Valid box
    box = BoundingBox(x1=0.1, y1=0.2, x2=0.5, y2=0.8)
    assert box.width == pytest.approx(0.4)
    assert box.height == pytest.approx(0.6)
    assert box.area == pytest.approx(0.24)
    assert box.center == (pytest.approx(0.3), pytest.approx(0.5))
    assert box.ground_contact_point == (pytest.approx(0.3), pytest.approx(0.8))

    # Invalid box (x2 < x1)
    with pytest.raises(ValueError):
        BoundingBox(x1=0.6, y1=0.2, x2=0.4, y2=0.8)

    # Invalid box (y2 < y1)
    with pytest.raises(ValueError):
        BoundingBox(x1=0.1, y1=0.9, x2=0.4, y2=0.3)


def test_normalize_bbox():
    # 640x480 image
    bbox = normalize_bbox(px1=64, py1=48, px2=320, py2=240, img_width=640, img_height=480)
    assert bbox.x1 == pytest.approx(0.1)
    assert bbox.y1 == pytest.approx(0.1)
    assert bbox.x2 == pytest.approx(0.5)
    assert bbox.y2 == pytest.approx(0.5)


def test_normalize_bbox_clamping():
    # Coordinates exceeding image boundaries
    bbox = normalize_bbox(px1=-50, py1=-20, px2=800, py2=600, img_width=640, img_height=480)
    assert bbox.x1 == 0.0
    assert bbox.y1 == 0.0
    assert bbox.x2 == 1.0
    assert bbox.y2 == 1.0


def test_denormalize_bbox():
    bbox = BoundingBox(x1=0.25, y1=0.5, x2=0.75, y2=1.0)
    px1, py1, px2, py2 = denormalize_bbox(bbox, img_width=1000, img_height=800)
    assert (px1, py1, px2, py2) == (250, 400, 750, 800)


def test_compute_iou():
    # Exactly identical boxes -> IoU = 1.0
    b1 = BoundingBox(x1=0.0, y1=0.0, x2=0.5, y2=0.5)
    assert compute_iou(b1, b1) == pytest.approx(1.0)

    # Completely disjoint boxes -> IoU = 0.0
    b2 = BoundingBox(x1=0.6, y1=0.6, x2=1.0, y2=1.0)
    assert compute_iou(b1, b2) == 0.0

    # 50% overlap on width, 100% on height
    # box_a: [0, 0, 0.4, 0.4], area = 0.16
    # box_b: [0.2, 0, 0.6, 0.4], area = 0.16
    # intersection: [0.2, 0, 0.4, 0.4], inter_area = 0.2 * 0.4 = 0.08
    # union: 0.16 + 0.16 - 0.08 = 0.24
    # IoU = 0.08 / 0.24 = 1/3
    box_a = BoundingBox(x1=0.0, y1=0.0, x2=0.4, y2=0.4)
    box_b = BoundingBox(x1=0.2, y1=0.0, x2=0.6, y2=0.4)
    assert compute_iou(box_a, box_b) == pytest.approx(1.0 / 3.0)


def test_is_point_in_bbox():
    box = BoundingBox(x1=0.2, y1=0.2, x2=0.8, y2=0.8)
    assert is_point_in_bbox((0.5, 0.5), box) is True
    assert is_point_in_bbox((0.1, 0.5), box) is False
    assert is_point_in_bbox((0.5, 0.9), box) is False
