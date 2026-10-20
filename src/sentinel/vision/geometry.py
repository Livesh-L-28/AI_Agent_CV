"""
SENTINEL AI Geometry & Coordinate Utilities
Handles bounding box normalization, denormalization, clamping, IoU, and spatial calculations.
"""

from sentinel.vision.types import BoundingBox


def clamp(val: float, min_val: float = 0.0, max_val: float = 1.0) -> float:
    """Clamps a floating point value to the range [min_val, max_val]."""
    return max(min_val, min(val, max_val))


def normalize_bbox(
    px1: float, py1: float, px2: float, py2: float, img_width: int, img_height: int
) -> BoundingBox:
    """
    Normalizes pixel coordinates into unit space [0.0, 1.0].
    Safely clamps to valid bounds.
    """
    if img_width <= 0 or img_height <= 0:
        raise ValueError(f"Invalid image dimensions: {img_width}x{img_height}")

    x1 = clamp(min(px1, px2) / img_width)
    y1 = clamp(min(py1, py2) / img_height)
    x2 = clamp(max(px1, px2) / img_width)
    y2 = clamp(max(py1, py2) / img_height)

    # Ensure non-zero width/height if original points had non-zero dimensions
    if x2 < x1:
        x2 = x1
    if y2 < y1:
        y2 = y1

    return BoundingBox(x1=x1, y1=y1, x2=x2, y2=y2)


def denormalize_bbox(
    bbox: BoundingBox, img_width: int, img_height: int
) -> tuple[int, int, int, int]:
    """Converts a normalized BoundingBox to integer pixel coordinates [px1, py1, px2, py2]."""
    return bbox.to_pixel(img_width, img_height)


def compute_iou(box_a: BoundingBox, box_b: BoundingBox) -> float:
    """Computes Intersection over Union (IoU) between two normalized bounding boxes."""
    # Intersection coordinates
    ix1 = max(box_a.x1, box_b.x1)
    iy1 = max(box_a.y1, box_b.y1)
    ix2 = min(box_a.x2, box_b.x2)
    iy2 = min(box_a.y2, box_b.y2)

    inter_w = max(0.0, ix2 - ix1)
    inter_h = max(0.0, iy2 - iy1)
    inter_area = inter_w * inter_h

    if inter_area == 0.0:
        return 0.0

    union_area = box_a.area + box_b.area - inter_area
    if union_area <= 0.0:
        return 0.0

    return inter_area / union_area


def is_point_in_bbox(point: tuple[float, float], bbox: BoundingBox) -> bool:
    """Determines whether a normalized (x, y) point lies inside a bounding box."""
    x, y = point
    return bbox.x1 <= x <= bbox.x2 and bbox.y1 <= y <= bbox.y2
