"""
Unit tests for sentinel.rules.zones (RestrictedZone and ZoneManager)
"""

import pytest

from sentinel.rules.types import EventSeverity
from sentinel.rules.zones import RestrictedZone, ZoneManager, ZoneType


def test_valid_zone_creation_and_containment():
    # Square zone in normalized coordinates [0.3, 0.3] to [0.7, 0.7]
    zone = RestrictedZone(
        zone_id="zone-1",
        name="Chemical Storage Area",
        polygon_points=[(0.3, 0.3), (0.7, 0.3), (0.7, 0.7), (0.3, 0.7)],
        zone_type=ZoneType.RESTRICTED,
        severity=EventSeverity.CRITICAL,
    )

    # Point clearly inside
    assert zone.contains_point((0.5, 0.5)) is True
    assert zone.distance_to_point((0.5, 0.5)) == 0.0

    # Point clearly outside
    assert zone.contains_point((0.1, 0.1)) is False
    assert zone.distance_to_point((0.1, 0.1)) > 0.0

    # Point on boundary edge (should be inclusive via covers)
    assert zone.contains_point((0.3, 0.5)) is True


def test_invalid_polygon_vertices_count():
    # Less than 3 points
    with pytest.raises(ValueError):
        RestrictedZone(
            zone_id="bad-1",
            name="Too few vertices",
            polygon_points=[(0.1, 0.1), (0.5, 0.5)],
        )


def test_out_of_bounds_coordinates():
    # Point with negative coordinate
    with pytest.raises(ValueError):
        RestrictedZone(
            zone_id="bad-2",
            name="Negative coordinate",
            polygon_points=[(-0.1, 0.1), (0.5, 0.1), (0.5, 0.5)],
        )

    # Point > 1.0
    with pytest.raises(ValueError):
        RestrictedZone(
            zone_id="bad-3",
            name="Coordinate > 1.0",
            polygon_points=[(0.1, 0.1), (1.5, 0.1), (0.5, 0.5)],
        )


def test_self_intersecting_polygon_rejected():
    # Hourglass self-intersecting polygon: (0,0) -> (1,1) -> (0,1) -> (1,0)
    with pytest.raises(ValueError) as exc:
        RestrictedZone(
            zone_id="bad-self-intersect",
            name="Hourglass",
            polygon_points=[(0.1, 0.1), (0.9, 0.9), (0.1, 0.9), (0.9, 0.1)],
        )
    assert "invalid" in str(exc.value)


def test_zone_manager():
    z1 = RestrictedZone(
        zone_id="z1",
        name="Zone 1",
        polygon_points=[(0.0, 0.0), (0.4, 0.0), (0.4, 0.4), (0.0, 0.4)],
    )
    z2 = RestrictedZone(
        zone_id="z2",
        name="Zone 2",
        polygon_points=[(0.5, 0.5), (0.9, 0.5), (0.9, 0.9), (0.5, 0.9)],
    )

    manager = ZoneManager([z1, z2])
    assert len(manager.list_zones()) == 2
    assert manager.get_zone("z1") is z1

    # Point in z1
    res1 = manager.check_point((0.2, 0.2))
    assert len(res1) == 1
    assert res1[0].zone_id == "z1"

    # Point in neither
    res_none = manager.check_point((0.45, 0.45))
    assert len(res_none) == 0

    # Remove zone
    removed = manager.remove_zone("z1")
    assert removed is z1
    assert manager.get_zone("z1") is None
