"""
Spatial ground-contact and body-region geometric estimation utilities.
"""

from sentinel.vision.types import BoundingBox


def calculate_ground_contact(bbox: BoundingBox) -> tuple[float, float]:
    """
    Calculates the normalized ground-contact point (bottom-center of bounding box).
    Standard reference for industrial safety floor zone containment.

    LIMITATIONS & SAFETY NOTICE (DEF-08):
    - Assumes the tracked subject is an upright pedestrian standing on a flat,
      unobstructed horizontal surface at camera ground level (Z = 0).
    - Monocular Parallax: Oblique camera angles project physical foot contact away from
      the optical center line; objects closer to camera edges experience higher perspective shear.
    - Foot Occlusion: When machinery, railings, or obstacles conceal a worker's feet,
      the bottom of the detected bounding box corresponds to the occlusion boundary,
      not physical ground contact.
    - Non-Upright Postures: Kneeling, crouching, bending, or riding elevated equipment
      displaces the bounding box base from actual floor contact.
    - Elevation Shifts: Stairs, ramps, and elevated platforms violate planar ground assumptions.
    - For calibrated metric coordinates, pair with sentinel.vision.geometry.PlanarHomography.
    """
    return ((bbox.x1 + bbox.x2) / 2.0, bbox.y2)


def calculate_head_region(bbox: BoundingBox) -> BoundingBox:
    """
    Estimates the head region of a worker (top 25% of the bounding box).
    Used for hardhat / safety helmet association.
    """
    head_height = bbox.height * 0.25
    return BoundingBox(
        x1=bbox.x1,
        y1=bbox.y1,
        x2=bbox.x2,
        y2=min(1.0, bbox.y1 + head_height),
    )


def calculate_torso_region(bbox: BoundingBox) -> BoundingBox:
    """
    Estimates the torso region of a worker (20% to 65% of the bounding box height).
    Used for high-visibility safety vest association.
    """
    y1_torso = bbox.y1 + (bbox.height * 0.20)
    y2_torso = bbox.y1 + (bbox.height * 0.65)
    return BoundingBox(
        x1=bbox.x1,
        y1=min(1.0, y1_torso),
        x2=bbox.x2,
        y2=min(1.0, y2_torso),
    )
