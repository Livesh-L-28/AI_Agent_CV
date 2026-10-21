"""
Unit tests for sentinel.vision.geometry
"""

import pytest

from sentinel.vision.geometry import (
    PlanarHomography,
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


def test_planar_homography_from_correspondences_and_roundtrip():
    # 4 known points in normalized image space: perspective trapezoid representing a rectangle on floor
    image_pts = [(0.2, 0.8), (0.8, 0.8), (0.6, 0.4), (0.4, 0.4)]
    # Calibrated floor metric coords (meters):
    ground_pts = [(0.0, 0.0), (10.0, 0.0), (10.0, 20.0), (0.0, 20.0)]

    homography = PlanarHomography.from_correspondences(image_pts, ground_pts)
    assert homography.matrix.shape == (3, 3)

    # Check that each correspondence maps back accurately
    for img_p, gnd_p in zip(image_pts, ground_pts):
        transformed = homography.transform_point(img_p)
        assert transformed[0] == pytest.approx(gnd_p[0], abs=1e-3)
        assert transformed[1] == pytest.approx(gnd_p[1], abs=1e-3)

        # Inverse transform maps back to image space
        inv_pt = homography.inverse_transform_point(gnd_p)
        assert inv_pt[0] == pytest.approx(img_p[0], abs=1e-3)
        assert inv_pt[1] == pytest.approx(img_p[1], abs=1e-3)

    # Batch transformation test
    batch_transformed = homography.transform_points(image_pts)
    assert len(batch_transformed) == 4
    assert batch_transformed[0][0] == pytest.approx(0.0, abs=1e-3)


def test_planar_homography_validation_errors():
    valid_img = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]
    valid_gnd = [(0.0, 0.0), (5.0, 0.0), (5.0, 5.0), (0.0, 5.0)]

    # Fewer than 4 points
    with pytest.raises(ValueError, match="At least 4 point correspondences"):
        PlanarHomography.from_correspondences(valid_img[:3], valid_gnd[:3])

    # Mismatched lengths
    with pytest.raises(ValueError, match="Mismatched correspondence count"):
        PlanarHomography.from_correspondences(valid_img, valid_gnd[:3])

    # Non-finite coordinates (NaN)
    nan_img = [(float("nan"), 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]
    with pytest.raises(ValueError, match="finite non-NaN"):
        PlanarHomography.from_correspondences(nan_img, valid_gnd)

    # Degenerate collinear points (3 points on the same line)
    collinear_img = [(0.0, 0.0), (0.5, 0.0), (1.0, 0.0), (0.5, 1.0)]
    with pytest.raises(ValueError, match="Degenerate point configuration"):
        PlanarHomography.from_correspondences(collinear_img, valid_gnd)

    # Singular matrix instantiation
    with pytest.raises(ValueError, match="Degenerate homography matrix"):
        PlanarHomography([[0.0, 0.0, 0.0], [0.0, 0.0, 0.0], [0.0, 0.0, 0.0]])

    # Invalid matrix shape
    with pytest.raises(ValueError, match="Homography matrix must be 3x3"):
        PlanarHomography([[1.0, 0.0], [0.0, 1.0]])
