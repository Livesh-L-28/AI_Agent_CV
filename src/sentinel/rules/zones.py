"""
Restricted Safety Zone Definitions and Polygon Spatial Geometry.
Utilizes Shapely for robust point-in-polygon and boundary validation.
"""

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator
from shapely.geometry import Point, Polygon

from sentinel.rules.types import EventSeverity


class ZoneType(str, Enum):
    RESTRICTED = "RESTRICTED"
    CAUTION = "CAUTION"
    PPE_REQUIRED = "PPE_REQUIRED"
    SAFE_WALKWAY = "SAFE_WALKWAY"


class RestrictedZone(BaseModel):
    """
    Configurable safety zone defined by a normalized polygon.
    Coordinates must be in unit space [0.0, 1.0].
    """

    zone_id: str
    name: str
    polygon_points: list[tuple[float, float]] = Field(
        min_length=3, description="List of (x, y) normalized coordinates forming a closed polygon"
    )
    zone_type: ZoneType = ZoneType.RESTRICTED
    severity: EventSeverity = EventSeverity.HIGH
    required_ppe: list[str] = Field(default_factory=list)
    enabled: bool = True

    # Cached internal shapely polygon
    _shapely_polygon: Optional[Polygon] = None

    @field_validator("polygon_points")
    @classmethod
    def validate_points(cls, points: list[tuple[float, float]]) -> list[tuple[float, float]]:
        if len(points) < 3:
            raise ValueError(f"Polygon must have at least 3 vertices, got {len(points)}")

        for idx, (x, y) in enumerate(points):
            if not (0.0 <= x <= 1.0 and 0.0 <= y <= 1.0):
                raise ValueError(
                    f"Point {idx} ({x}, {y}) is outside unit coordinate bounds [0.0, 1.0]"
                )

        # Validate non-self-intersecting polygon using Shapely
        poly = Polygon(points)
        if not poly.is_valid:
            raise ValueError("Polygon is geometrically invalid (e.g., self-intersecting edges)")
        if poly.area <= 0.0:
            raise ValueError("Polygon has zero area")

        return points

    def _get_polygon(self) -> Polygon:
        """Returns or initializes the cached Shapely polygon."""
        if self._shapely_polygon is None:
            self._shapely_polygon = Polygon(self.polygon_points)
        return self._shapely_polygon

    def contains_point(self, point: tuple[float, float]) -> bool:
        """
        Determines whether the point (e.g. worker ground contact point) lies
        inside or on the boundary of this zone.
        """
        if not self.enabled:
            return False
        pt = Point(point)
        # Using covers() to treat the boundary edge as inclusive
        return bool(self._get_polygon().covers(pt))

    def distance_to_point(self, point: tuple[float, float]) -> float:
        """Calculates Euclidean normalized distance from the point to the zone boundary."""
        pt = Point(point)
        poly = self._get_polygon()
        if poly.covers(pt):
            return 0.0
        return float(poly.distance(pt))


class ZoneManager:
    """Manages an active collection of configured safety zones."""

    def __init__(self, zones: Optional[list[RestrictedZone]] = None) -> None:
        self.zones: dict[str, RestrictedZone] = {}
        if zones:
            for z in zones:
                self.add_zone(z)

    def add_zone(self, zone: RestrictedZone) -> None:
        self.zones[zone.zone_id] = zone

    def remove_zone(self, zone_id: str) -> Optional[RestrictedZone]:
        return self.zones.pop(zone_id, None)

    def get_zone(self, zone_id: str) -> Optional[RestrictedZone]:
        return self.zones.get(zone_id)

    def list_zones(self) -> list[RestrictedZone]:
        return list(self.zones.values())

    def check_point(self, point: tuple[float, float]) -> list[RestrictedZone]:
        """Returns all enabled zones that contain the specified point."""
        return [z for z in self.zones.values() if z.enabled and z.contains_point(point)]
