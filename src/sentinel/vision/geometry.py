"""
SENTINEL AI Geometry & Coordinate Utilities
Handles bounding box normalization, denormalization, clamping, IoU, and spatial calculations.
"""

from typing import Optional, Sequence

import numpy as np

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


class PlanarHomography:
    """
    Projective planar transformation mapping 2D camera coordinates (image space)
    to a calibrated 2D ground plane (e.g., factory floor metric coordinates).

    SAFETY & GEOMETRIC LIMITATION WARNING (DEF-08):
    - Planar homography assumes that all points lie strictly on a single flat surface (Z = 0).
    - It does NOT eliminate 3D parallax for objects extending above the ground plane.
    - Foot occlusion or non-upright worker posture displaces detected bottom-center from
      actual floor contact.
    - Does not claim universal parallax-free accuracy across varying elevations.
    """

    def __init__(self, matrix: "np.ndarray | Sequence[Sequence[float]]") -> None:
        import numpy as np

        mat = np.array(matrix, dtype=np.float64)
        if mat.shape != (3, 3):
            raise ValueError(f"Homography matrix must be 3x3, got shape {mat.shape}")
        det = float(np.linalg.det(mat))
        if abs(det) < 1e-12 or not np.isfinite(det):
            raise ValueError("Degenerate homography matrix: singular or non-finite determinant")
        self.matrix = mat
        self._inv_matrix: Optional[np.ndarray] = None

    @property
    def inv_matrix(self) -> "np.ndarray":
        import numpy as np

        if self._inv_matrix is None:
            self._inv_matrix = np.linalg.inv(self.matrix)
        return self._inv_matrix

    @classmethod
    def from_correspondences(
        cls,
        image_points: "Sequence[tuple[float, float]]",
        ground_points: "Sequence[tuple[float, float]]",
    ) -> "PlanarHomography":
        """
        Computes the planar homography matrix from at least 4 corresponding point pairs.

        Args:
            image_points: 2D coordinates in camera space [(u_1, v_1), ...]
            ground_points: 2D coordinates in floor metric space [(X_1, Y_1), ...]
        """
        import cv2
        import numpy as np

        if len(image_points) != len(ground_points):
            raise ValueError(
                f"Mismatched correspondence count: {len(image_points)} image points "
                f"vs {len(ground_points)} ground points"
            )
        if len(image_points) < 4:
            raise ValueError(
                f"At least 4 point correspondences required for planar homography, got {len(image_points)}"
            )

        src_pts = np.array(image_points, dtype=np.float64)
        dst_pts = np.array(ground_points, dtype=np.float64)

        if not np.all(np.isfinite(src_pts)) or not np.all(np.isfinite(dst_pts)):
            raise ValueError("Point correspondences must contain only finite non-NaN coordinates")

        # Validate collinearity: check that 3 points are not collinear
        def _has_collinear_triplet(pts: np.ndarray) -> bool:
            n = len(pts)
            for i in range(n):
                for j in range(i + 1, n):
                    for k in range(j + 1, n):
                        cross = (pts[j, 0] - pts[i, 0]) * (pts[k, 1] - pts[i, 1]) - (
                            pts[j, 1] - pts[i, 1]
                        ) * (pts[k, 0] - pts[i, 0])
                        if abs(cross) < 1e-7:
                            return True
            return False

        if len(image_points) == 4 and (
            _has_collinear_triplet(src_pts) or _has_collinear_triplet(dst_pts)
        ):
            raise ValueError("Degenerate point configuration: 3 or more points are collinear")

        h_matrix, _ = cv2.findHomography(src_pts, dst_pts, method=0)
        if h_matrix is None or h_matrix.shape != (3, 3):
            raise ValueError("Failed to compute valid planar homography from provided points")

        det = float(np.linalg.det(h_matrix))
        if abs(det) < 1e-12 or not np.isfinite(det):
            raise ValueError("Computed homography is degenerate (singular matrix)")

        return cls(h_matrix)

    def transform_point(self, point: tuple[float, float]) -> tuple[float, float]:
        """Maps an image point (u, v) to calibrated ground plane (X, Y)."""
        import numpy as np

        u, v = point
        if not (np.isfinite(u) and np.isfinite(v)):
            raise ValueError(f"Invalid non-finite input point: ({u}, {v})")
        vec = np.array([u, v, 1.0], dtype=np.float64)
        proj = self.matrix @ vec
        w = float(proj[2])
        if abs(w) < 1e-9:
            raise ValueError("Projective singularity: point maps to infinity or optical horizon")
        return (float(proj[0] / w), float(proj[1] / w))

    def transform_points(
        self, points: "Sequence[tuple[float, float]]"
    ) -> list[tuple[float, float]]:
        """Maps a sequence of image points to calibrated ground coordinates."""
        return [self.transform_point(pt) for pt in points]

    def inverse_transform_point(self, point: tuple[float, float]) -> tuple[float, float]:
        """Maps a calibrated ground plane point (X, Y) back to image coordinate (u, v)."""
        import numpy as np

        X, Y = point
        if not (np.isfinite(X) and np.isfinite(Y)):
            raise ValueError(f"Invalid non-finite ground point: ({X}, {Y})")
        vec = np.array([X, Y, 1.0], dtype=np.float64)
        proj = self.inv_matrix @ vec
        w = float(proj[2])
        if abs(w) < 1e-9:
            raise ValueError(
                "Projective singularity: ground point maps to infinity in image plane"
            )
        return (float(proj[0] / w), float(proj[1] / w))
