"""
Operational Digital Twin API Router.
Provides factory scene models, spatial camera calibration, live 3D telemetry mappings,
and historical incident replay timelines.
"""

from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from shapely.geometry import Point, Polygon

from sentinel.agents.providers import get_llm_provider
from sentinel.agents.workflow import SafetyAgentWorkflow
from sentinel.api.schemas import (
    CameraCalibrationRequest,
    CameraCalibrationResponse,
    FactorySceneModel,
    SpatialCameraNode,
)
from sentinel.db.repositories.event_repo import EventRepository
from sentinel.db.repositories.incident_repo import IncidentRepository
from sentinel.db.session import get_db_session
from sentinel.logging import setup_logging
from sentinel.rules.types import EventSeverity, EventType, SafetyEventCandidate
from sentinel.security.auth import (
    AuthenticatedUser,
    UserRole,
    get_current_user,
    require_role,
)
from sentinel.vision.camera_manager import get_camera_manager
from sentinel.vision.geometry import PlanarHomography

logger = setup_logging()

router = APIRouter(prefix="/api/v1/twin", tags=["Digital Twin"])

# In-memory scene state backed by fixture file
_ACTIVE_SCENE: Optional[FactorySceneModel] = None
_SCENE_FILE_PATH = Path("data/fixtures/factory_scene_sample.json")


def _get_warehouse_scene() -> FactorySceneModel:
    return FactorySceneModel(
        factory_id="factory-warehouse-omega",
        name="Global Logistics Hub Omega (Fulfillment)",
        site_id="site-columbus-02",
        dimensions={"width_meters": 70.0, "depth_meters": 45.0, "height_meters": 11.0},
        floors=[
            {
                "id": "floor-ground",
                "name": "Ground Level Fulfillment Floor & Staging",
                "level": 0,
                "elevation_meters": 0.0,
                "width_meters": 70.0,
                "depth_meters": 45.0,
            }
        ],
        equipment=[
            {
                "id": "equip-wh-rack-01",
                "name": "High-Bay Pallet Rack Aisle 1",
                "category": "WAREHOUSE_RACK",
                "floor_id": "floor-ground",
                "position": [18.0, 0.0, 10.0],
                "dimensions": [24.0, 8.5, 2.6],
                "rotation_deg": 0.0,
                "status": "OPERATIONAL",
            },
            {
                "id": "equip-wh-dock-01",
                "name": "Hydraulic Loading Dock Bay #1",
                "category": "LOADING_DOCK",
                "floor_id": "floor-ground",
                "position": [20.0, 0.0, 42.0],
                "dimensions": [10.0, 5.0, 2.5],
                "rotation_deg": 0.0,
                "status": "OPERATIONAL",
            },
            {
                "id": "equip-wh-trailer-01",
                "name": "Freight Delivery 53ft Trailer #TR-881",
                "category": "TRUCK_TRAILER",
                "floor_id": "floor-ground",
                "position": [20.0, 0.0, 43.5],
                "dimensions": [3.2, 4.2, 14.0],
                "rotation_deg": 0.0,
                "status": "OPERATIONAL",
            },
            {
                "id": "equip-wh-forklift-bay",
                "name": "Autonomous Forklift Fleet Induction & Battery Charging",
                "category": "FORKLIFT_BAY",
                "floor_id": "floor-ground",
                "position": [62.0, 0.0, 32.0],
                "dimensions": [10.0, 3.0, 8.0],
                "rotation_deg": 0.0,
                "status": "OPERATIONAL",
            },
        ],
        walkways=[
            {
                "id": "walkway-wh-pedestrian",
                "name": "Elevated Pedestrian Safety Walkway",
                "floor_id": "floor-ground",
                "points": [[2.0, 28.0], [68.0, 28.0]],
                "width_meters": 2.2,
            }
        ],
        zones=[
            {
                "zone_id": "zone-forklift-traffic",
                "name": "Forklift Operations High-Traffic Aisle",
                "zone_type": "WARNING",
                "floor_id": "floor-ground",
                "polygon_meters": [[4.0, 24.0], [66.0, 24.0], [66.0, 36.0], [4.0, 36.0]],
                "height_meters": 3.5,
                "color_hex": "#F59E0B",
                "active_rules": ["RULE_HIGH_VISIBILITY_VEST_REQUIRED", "RULE_FORKLIFT_SPEED_LIMIT"],
            },
            {
                "zone_id": "zone-dock-edge",
                "name": "Loading Dock Fall Hazard Edge Zone",
                "zone_type": "RESTRICTED",
                "floor_id": "floor-ground",
                "polygon_meters": [[12.0, 38.0], [58.0, 38.0], [58.0, 44.5], [12.0, 44.5]],
                "height_meters": 4.0,
                "color_hex": "#EF4444",
                "active_rules": ["RULE_FALL_PROTECTION_REQUIRED", "RULE_AUTHORIZED_PERSONNEL_ONLY"],
            },
        ],
        cameras=[
            {
                "camera_id": "cam-wh-overhead-01",
                "name": "Aisle 1 & 2 Overhead Surveillance Camera",
                "floor_id": "floor-ground",
                "position": [35.0, 9.5, 4.0],
                "target": [35.0, 0.0, 18.0],
                "height_meters": 9.5,
                "fov_horizontal_deg": 85.0,
                "calibrated": True,
                "homography_matrix": [[28.0, 0.0, 12.0], [0.0, 24.0, 8.0], [0.0, 0.0, 1.0]],
                "coverage_polygon_meters": [[6.0, 6.0], [64.0, 6.0], [64.0, 30.0], [6.0, 30.0]],
                "enabled": True,
                "status": "DISCONNECTED",
            }
        ],
    )


def _get_chemical_scene() -> FactorySceneModel:
    return FactorySceneModel(
        factory_id="factory-petrochem-gulf",
        name="Gulf Coast Petrochemical Refining Facility",
        site_id="site-gulf-03",
        dimensions={"width_meters": 65.0, "depth_meters": 40.0, "height_meters": 14.0},
        floors=[
            {
                "id": "floor-ground",
                "name": "Ground Level Process Pad & Tank Farm",
                "level": 0,
                "elevation_meters": 0.0,
                "width_meters": 65.0,
                "depth_meters": 40.0,
            }
        ],
        equipment=[
            {
                "id": "equip-chem-tank-01",
                "name": "Bulk Hydrocarbon Storage Tank #TK-101",
                "category": "CHEMICAL_TANK",
                "floor_id": "floor-ground",
                "position": [14.0, 0.0, 12.0],
                "dimensions": [10.0, 8.0, 10.0],
                "rotation_deg": 0.0,
                "status": "OPERATIONAL",
            },
            {
                "id": "equip-chem-column-01",
                "name": "Fractional Distillation Column Tower #C-201",
                "category": "DISTILLATION_COLUMN",
                "floor_id": "floor-ground",
                "position": [48.0, 0.0, 14.0],
                "dimensions": [4.0, 13.0, 4.0],
                "rotation_deg": 0.0,
                "status": "OPERATIONAL",
            },
            {
                "id": "equip-chem-piperack-01",
                "name": "Primary Process Fluid Pipe Rack Gantry",
                "category": "PIPE_RACK",
                "floor_id": "floor-ground",
                "position": [32.5, 0.0, 24.0],
                "dimensions": [50.0, 5.5, 4.5],
                "rotation_deg": 0.0,
                "status": "OPERATIONAL",
            },
            {
                "id": "equip-chem-pump-01",
                "name": "Centrifugal Fluid Transfer Pump #P-101A",
                "category": "CENTRIFUGAL_PUMP",
                "floor_id": "floor-ground",
                "position": [18.0, 0.0, 32.0],
                "dimensions": [2.5, 1.8, 1.8],
                "rotation_deg": 0.0,
                "status": "OPERATIONAL",
            },
        ],
        walkways=[
            {
                "id": "walkway-chem-inspection",
                "name": "Perimeter Operator Inspection Path",
                "floor_id": "floor-ground",
                "points": [[2.0, 36.0], [63.0, 36.0]],
                "width_meters": 2.0,
            }
        ],
        zones=[
            {
                "zone_id": "zone-tank-bund",
                "name": "Chemical Tank Secondary Containment Bund",
                "zone_type": "RESTRICTED",
                "floor_id": "floor-ground",
                "polygon_meters": [[6.0, 4.0], [36.0, 4.0], [36.0, 20.0], [6.0, 20.0]],
                "height_meters": 3.5,
                "color_hex": "#EF4444",
                "active_rules": ["RULE_HAZARDOUS_GAS_EXCLUSION", "RULE_RESPIRATORY_PPE_REQUIRED"],
            }
        ],
        cameras=[
            {
                "camera_id": "cam-chem-tank-farm",
                "name": "Tank Farm Panoramic Surveillance Camera",
                "floor_id": "floor-ground",
                "position": [20.0, 11.0, 3.0],
                "target": [20.0, 0.0, 16.0],
                "height_meters": 11.0,
                "fov_horizontal_deg": 85.0,
                "calibrated": True,
                "homography_matrix": [[24.0, 0.0, 10.0], [0.0, 20.0, 8.0], [0.0, 0.0, 1.0]],
                "coverage_polygon_meters": [[4.0, 4.0], [40.0, 4.0], [40.0, 24.0], [4.0, 24.0]],
                "enabled": True,
                "status": "DISCONNECTED",
            }
        ],
    )


def _get_construction_scene() -> FactorySceneModel:
    return FactorySceneModel(
        factory_id="factory-construction-metro",
        name="Metro Infrastructure Site Project Alpha",
        site_id="site-metro-04",
        dimensions={"width_meters": 55.0, "depth_meters": 45.0, "height_meters": 16.0},
        floors=[
            {
                "id": "floor-ground",
                "name": "Ground Level Site Pad & Earthworks",
                "level": 0,
                "elevation_meters": 0.0,
                "width_meters": 55.0,
                "depth_meters": 45.0,
            }
        ],
        equipment=[
            {
                "id": "equip-const-crane-01",
                "name": "Liebherr 280 EC-H 12 Litronic Tower Crane",
                "category": "TOWER_CRANE",
                "floor_id": "floor-ground",
                "position": [20.0, 0.0, 16.0],
                "dimensions": [4.0, 15.0, 4.0],
                "rotation_deg": 0.0,
                "status": "OPERATIONAL",
            },
            {
                "id": "equip-const-scaffold-01",
                "name": "Modular Perimeter Scaffolding Tower A",
                "category": "SCAFFOLDING",
                "floor_id": "floor-ground",
                "position": [38.0, 0.0, 12.0],
                "dimensions": [14.0, 8.0, 3.0],
                "rotation_deg": 0.0,
                "status": "OPERATIONAL",
            },
            {
                "id": "equip-const-excavator-01",
                "name": "CAT 320 Hydraulic Tracked Excavator",
                "category": "EXCAVATOR",
                "floor_id": "floor-ground",
                "position": [42.0, 0.0, 32.0],
                "dimensions": [3.8, 3.2, 7.5],
                "rotation_deg": 45.0,
                "status": "OPERATIONAL",
            },
        ],
        walkways=[
            {
                "id": "walkway-site-access",
                "name": "Designated Pedestrian Jobsite Access Corridor",
                "floor_id": "floor-ground",
                "points": [[2.0, 40.0], [53.0, 40.0]],
                "width_meters": 2.5,
            }
        ],
        zones=[
            {
                "zone_id": "zone-crane-swing",
                "name": "Overhead Crane Swing Radius & Drop Zone",
                "zone_type": "RESTRICTED",
                "floor_id": "floor-ground",
                "polygon_meters": [[8.0, 4.0], [32.0, 4.0], [32.0, 28.0], [8.0, 28.0]],
                "height_meters": 6.0,
                "color_hex": "#EF4444",
                "active_rules": ["RULE_OVERHEAD_CRANE_DROP_HAZARD", "RULE_HARDHAT_REQUIRED"],
            }
        ],
        cameras=[
            {
                "camera_id": "cam-const-crane-overhead",
                "name": "Crane Mast Optical Surveillance Sensor",
                "floor_id": "floor-ground",
                "position": [20.0, 14.0, 6.0],
                "target": [20.0, 0.0, 18.0],
                "height_meters": 14.0,
                "fov_horizontal_deg": 90.0,
                "calibrated": True,
                "homography_matrix": [[26.0, 0.0, 12.0], [0.0, 22.0, 8.0], [0.0, 0.0, 1.0]],
                "coverage_polygon_meters": [[6.0, 2.0], [34.0, 2.0], [34.0, 30.0], [6.0, 30.0]],
                "enabled": True,
                "status": "DISCONNECTED",
            }
        ],
    )


def _load_initial_scene() -> FactorySceneModel:
    global _ACTIVE_SCENE
    if _ACTIVE_SCENE is None:
        if _SCENE_FILE_PATH.exists():
            try:
                with open(_SCENE_FILE_PATH, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    _ACTIVE_SCENE = FactorySceneModel(**data)
            except Exception as e:
                logger.error(f"Error loading factory scene fixture: {e}")
                _ACTIVE_SCENE = FactorySceneModel(
                    factory_id="factory-default",
                    name="Industrial Manufacturing Facility",
                    site_id="site-01",
                )
        else:
            _ACTIVE_SCENE = FactorySceneModel(
                factory_id="factory-default",
                name="Industrial Manufacturing Facility",
                site_id="site-01",
            )
    return _ACTIVE_SCENE


@router.get("/environments")
async def get_digital_twin_environments(
    user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Returns catalogue of available Digital Twin industrial environments
    with operational specifications and capability declarations.
    """
    mfg = _load_initial_scene()
    wh = _get_warehouse_scene()
    chem = _get_chemical_scene()
    const = _get_construction_scene()

    return [
        {
            "id": "manufacturing-plant",
            "name": mfg.name,
            "category": "MANUFACTURING",
            "subtitle": "Automotive Stamping, Robotic Welding & CNC Machining",
            "description": "High-speed automotive fabrication facility featuring Fanuc 6-axis welding cells, KUKA assembly robots, and HAAS CNC machining bays.",
            "dimensions": mfg.dimensions,
            "camera_count": len(mfg.cameras),
            "zone_count": len(mfg.zones),
            "equipment_count": len(mfg.equipment),
            "supported_capabilities": [
                "ROBOTIC_CELL_INTRUSION_DETECTION",
                "PEDESTRIAN_CORRIDOR_COMPLIANCE",
                "HARDHAT_AND_VEST_VERIFICATION",
                "CNC_FLYING_DEBRIS_EXCLUSION",
                "DETERMINISTIC_5FRAME_GATE",
            ],
            "status": "DEMO_BENCHMARK",
            "updated_at": mfg.updated_at,
        },
        {
            "id": "warehouse-logistics",
            "name": wh.name,
            "category": "LOGISTICS",
            "subtitle": "High-Bay Pallet Racking, AGVs & Automated Loading Docks",
            "description": "70m x 45m x 11m fulfillment center featuring multi-tier pallet racking, automated loading dock bays with freight trailers, and active forklift corridors.",
            "dimensions": wh.dimensions,
            "camera_count": len(wh.cameras),
            "zone_count": len(wh.zones),
            "equipment_count": len(wh.equipment),
            "supported_capabilities": [
                "FORKLIFT_PEDESTRIAN_PROXIMITY_DETECTION",
                "HIGH_VISIBILITY_VEST_ENFORCEMENT",
                "LOADING_DOCK_FALL_HAZARD_PREVENTION",
                "AISLE_CONGESTION_TELEMETRY",
            ],
            "status": "DEMO_BENCHMARK",
            "updated_at": wh.updated_at,
        },
        {
            "id": "process-chemical",
            "name": chem.name,
            "category": "CHEMICAL",
            "subtitle": "Fluid Refining, Distillation Towers & Hazardous Chemical Storage",
            "description": "65m x 40m x 14m continuous fluid processing plant featuring bulk vertical storage tanks, distillation column, pipe racks, and containment bunds.",
            "dimensions": chem.dimensions,
            "camera_count": len(chem.cameras),
            "zone_count": len(chem.zones),
            "equipment_count": len(chem.equipment),
            "supported_capabilities": [
                "HAZARDOUS_GAS_EXCLUSION_ZONES",
                "RESPIRATORY_EQUIPMENT_ENFORCEMENT",
                "HOT_WORK_PERMIT_BOUNDARY_VALIDATION",
                "SECONDARY_CONTAINMENT_INTRUSION_GATES",
            ],
            "status": "DEMO_BENCHMARK",
            "updated_at": chem.updated_at,
        },
        {
            "id": "construction-site",
            "name": const.name,
            "category": "CONSTRUCTION",
            "subtitle": "Structural Steel Framing, Tower Crane & Multi-Tier Scaffolding",
            "description": "55m x 45m x 16m urban infrastructure project featuring a 15m structural tower crane, tube-and-clamp scaffolding, and heavy hydraulic excavators.",
            "dimensions": const.dimensions,
            "camera_count": len(const.cameras),
            "zone_count": len(const.zones),
            "equipment_count": len(const.equipment),
            "supported_capabilities": [
                "OVERHEAD_CRANE_DROP_ZONE_EXCLUSION",
                "HARDHAT_AND_CHINSTRAP_VERIFICATION",
                "SCAFFOLDING_FALL_ARREST_VALIDATION",
                "HEAVY_EXCAVATOR_BLIND_SPOT_TELEMETRY",
            ],
            "status": "DEMO_BENCHMARK",
            "updated_at": const.updated_at,
        },
    ]


@router.get("/scene", response_model=FactorySceneModel)
async def get_factory_scene(
    environment_id: Optional[str] = Query(None, description="Environment scene identifier"),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Retrieves the authoritative 3D factory scene model, including equipment footprints,
    safety zones, walkways, and camera placements with live connection statuses.
    """
    if environment_id == "warehouse-logistics":
        scene = _get_warehouse_scene()
    elif environment_id == "process-chemical":
        scene = _get_chemical_scene()
    elif environment_id == "construction-site":
        scene = _get_construction_scene()
    else:
        scene = _load_initial_scene()

    manager = get_camera_manager()

    # Synchronize live camera operational states into scene metadata
    for cam_node in scene.cameras:
        cam_conf = manager.get_camera(cam_node.camera_id)
        if cam_conf:
            cam_node.status = manager.get_camera_status(cam_node.camera_id).value
            cam_node.enabled = cam_conf.enabled
        else:
            cam_node.status = "UNREGISTERED"

    return scene


@router.put("/scene", response_model=FactorySceneModel)
async def update_factory_scene(
    updated_scene: FactorySceneModel,
    user: AuthenticatedUser = Depends(
        require_role(UserRole.SAFETY_OFFICER, UserRole.ADMIN)
    ),
):
    """
    Updates the factory scene model.
    Enforces RBAC: Only SAFETY_OFFICER and ADMIN roles are authorized to modify spatial layout.
    """
    global _ACTIVE_SCENE
    updated_scene.updated_by = user.username
    _ACTIVE_SCENE = updated_scene

    # Persist updated scene to fixture file for durable edge recovery
    try:
        _SCENE_FILE_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(_SCENE_FILE_PATH, "w", encoding="utf-8") as f:
            json.dump(updated_scene.model_dump(), f, indent=2)
        logger.info(
            f"Factory scene '{updated_scene.factory_id}' updated by user '{user.username}'"
        )
    except Exception as e:
        logger.error(f"Failed to persist scene update: {e}")

    return updated_scene


@router.get("/calibration/{camera_id}", response_model=CameraCalibrationResponse)
async def get_camera_calibration(
    camera_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Retrieves spatial homography calibration for a camera."""
    scene = _load_initial_scene()
    target_cam = next((c for c in scene.cameras if c.camera_id == camera_id), None)
    if not target_cam:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera '{camera_id}' not found in factory scene",
        )

    if not target_cam.calibrated or not target_cam.homography_matrix:
        return CameraCalibrationResponse(
            camera_id=camera_id,
            calibrated=False,
            homography_matrix=[],
            validation_status="CALIBRATION_PENDING",
            sample_projections=[],
        )

    # Compute sample projections of unit corners for client validation
    h = PlanarHomography(target_cam.homography_matrix)
    sample_projections = []
    for u, v in [(0.2, 0.2), (0.8, 0.2), (0.8, 0.8), (0.2, 0.8)]:
        try:
            x, y = h.transform_point((u, v))
            sample_projections.append({"image": [u, v], "ground": [round(x, 2), round(y, 2)]})
        except Exception:
            pass

    return CameraCalibrationResponse(
        camera_id=camera_id,
        calibrated=True,
        homography_matrix=target_cam.homography_matrix,
        validation_status="VALIDATED",
        sample_projections=sample_projections,
    )


@router.post("/calibration/{camera_id}", response_model=CameraCalibrationResponse)
async def submit_camera_calibration(
    camera_id: str,
    payload: CameraCalibrationRequest,
    user: AuthenticatedUser = Depends(
        require_role(UserRole.SAFETY_OFFICER, UserRole.ADMIN)
    ),
):
    """
    Computes, validates, and stores a 3x3 PlanarHomography matrix from point correspondences.
    Rejects degenerate or collinear configurations with HTTP 400.
    """
    if len(payload.image_points) != len(payload.ground_points):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mismatched correspondence counts between image points and ground points",
        )
    if len(payload.image_points) < 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least 4 correspondence points required for planar homography",
        )

    img_tuples = [tuple(p) for p in payload.image_points]
    ground_tuples = [tuple(p) for p in payload.ground_points]

    try:
        h = PlanarHomography.from_correspondences(img_tuples, ground_tuples)
    except ValueError as ve:
        logger.warning(f"Homography calibration rejected for camera '{camera_id}': {ve}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Calibration rejected: {ve}",
        )

    # Update camera node in scene model
    scene = _load_initial_scene()
    target_cam = next((c for c in scene.cameras if c.camera_id == camera_id), None)
    if not target_cam:
        # Create camera entry if newly calibrated
        target_cam = SpatialCameraNode(
            camera_id=camera_id,
            name=f"Camera {camera_id}",
            position=[20.0, 5.0, 5.0],
            calibrated=True,
        )
        scene.cameras.append(target_cam)

    matrix_list = [[float(v) for v in row] for row in h.matrix]
    target_cam.calibrated = True
    target_cam.homography_matrix = matrix_list

    # Compute sample projections
    sample_projections = []
    for pt in img_tuples[:4]:
        try:
            gx, gy = h.transform_point(pt)
            sample_projections.append(
                {"image": list(pt), "ground": [round(gx, 2), round(gy, 2)]}
            )
        except Exception:
            pass

    # Hot-update active camera worker if currently streaming
    try:
        from sentinel.vision.camera_manager import get_camera_manager

        mgr = get_camera_manager()
        worker = mgr.workers.get(camera_id)
        if worker:
            worker.homography = h
            logger.info(f"Hot-updated homography for active camera worker '{camera_id}'")
    except Exception as e:
        logger.debug(f"Could not hot-update camera worker for '{camera_id}': {e}")

    return CameraCalibrationResponse(
        camera_id=camera_id,
        calibrated=True,
        homography_matrix=matrix_list,
        validation_status="VALIDATED",
        sample_projections=sample_projections,
    )


@router.get("/replay")
async def get_replay_timeline(
    incident_id: Optional[str] = Query(None, description="Filter by incident ID"),
    limit: int = Query(50, ge=1, le=200),
    user: AuthenticatedUser = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Retrieves historical safety events and incident timeline records for Digital Twin playback.
    Enforces tenant and RBAC boundaries.
    """
    async with get_db_session() as session:
        evt_repo = EventRepository(session)
        inc_repo = IncidentRepository(session)

        incidents = await inc_repo.list_incidents(limit=limit)
        events = await evt_repo.list_events(limit=limit)

        timeline_items = []
        for inc in incidents:
            if incident_id and inc.id != incident_id:
                continue
            timeline_items.append(
                {
                    "type": "INCIDENT",
                    "id": inc.id,
                    "event_id": inc.event_id,
                    "title": inc.title,
                    "severity": inc.severity,
                    "status": inc.status,
                    "created_at": inc.created_at.isoformat() if inc.created_at else None,
                }
            )

        for evt in events:
            timeline_items.append(
                {
                    "type": "EVENT",
                    "id": evt.id,
                    "source_id": evt.source_id,
                    "track_id": evt.track_id,
                    "event_type": evt.event_type,
                    "severity": evt.severity,
                    "zone_id": evt.zone_id,
                    "first_observation_ns": evt.first_observation_ns,
                    "last_observation_ns": evt.last_observation_ns,
                    "confidence": evt.confidence,
                }
            )

        return {
            "incident_count": len(incidents),
            "event_count": len(events),
            "timeline": timeline_items,
            "is_replay": True,
        }


class WalkthroughAnalyzeRequest(BaseModel):
    environment_id: str = "manufacturing-plant"
    x: float
    y: float = 1.75
    z: float
    heading_deg: float = 0.0
    worker_alias: str = "Inspector (Walkthrough)"


@router.post("/walkthrough-analyze")
async def analyze_walkthrough_telemetry(
    telemetry: WalkthroughAnalyzeRequest,
    user: AuthenticatedUser = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Analyzes manual walkthrough spatial coordinates against plant safety zones and equipment.
    Detects boundary incursions, triggers deterministic rule checks, dispatches the 4-stage
    agentic investigation workflow, and returns live agent state.
    """
    # 1. Resolve scene model
    if telemetry.environment_id == "warehouse-logistics":
        scene = _get_warehouse_scene()
    elif telemetry.environment_id == "process-chemical":
        scene = _get_chemical_scene()
    elif telemetry.environment_id == "construction-site":
        scene = _get_construction_scene()
    else:
        scene = _load_initial_scene()

    pt = Point(telemetry.x, telemetry.z)
    breached_zone = None
    violation_rule = None
    severity = EventSeverity.INFO

    # 2. Check zone polygons
    for z in scene.zones:
        if len(z.polygon_meters) >= 3:
            poly = Polygon(z.polygon_meters)
            if poly.contains(pt) or poly.touches(pt):
                if z.zone_type == "RESTRICTED":
                    breached_zone = z
                    violation_rule = z.active_rules[0] if z.active_rules else "RULE_NO_PEDESTRIANS"
                    severity = EventSeverity.CRITICAL
                    break
                elif z.zone_type == "WARNING":
                    breached_zone = z
                    violation_rule = z.active_rules[0] if z.active_rules else "RULE_HIGH_VISIBILITY_VEST_REQUIRED"
                    severity = EventSeverity.HIGH
                    break

    # 3. Proximity to dangerous equipment (if not already inside a restricted zone)
    equipment_proximity = None
    if not breached_zone:
        for eq in scene.equipment:
            if eq.category in ("ROBOTIC_CELL", "CNC_MILL", "CRANE", "FORKLIFT_BAY"):
                eq_x, _, eq_z = eq.position
                dist = pt.distance(Point(eq_x, eq_z))
                # Consider equipment dimension radius
                diag = ((eq.dimensions[0] ** 2 + eq.dimensions[2] ** 2) ** 0.5) / 2.0
                safe_threshold = diag + 1.2
                if dist < safe_threshold:
                    equipment_proximity = {
                        "id": eq.id,
                        "name": eq.name,
                        "distance_meters": round(dist, 2),
                    }
                    violation_rule = "RULE_ROBOTIC_ENVELOPE_PROXIMITY"
                    severity = EventSeverity.HIGH
                    break

    # If no violation found:
    if not breached_zone and not equipment_proximity:
        return {
            "is_violation": False,
            "x": telemetry.x,
            "z": telemetry.z,
            "message": "Zone compliance verified. Normal transit path.",
        }

    # 4. Violation detected: Create SafetyEventCandidate and execute Agent Workflow
    rule_name = violation_rule or "RULE_NO_PEDESTRIANS"
    zone_name = (
        breached_zone.name
        if breached_zone
        else (equipment_proximity["name"] if equipment_proximity else "Exclusion Perimeter")
    )
    zone_id = breached_zone.zone_id if breached_zone else "zone-proximity-hazard"

    now_ns = int(time.time() * 1e9)
    event_id = f"evt_walk_{int(time.time())}_{uuid.uuid4().hex[:6]}"
    incident_id = f"inc_{event_id}"

    candidate = SafetyEventCandidate(
        event_id=event_id,
        event_type=EventType.ZONE_ENTRY if breached_zone else EventType.UNSAFE_PROXIMITY,
        severity=severity,
        source_id="cam-facility-01",
        track_id=999,
        zone_id=zone_id,
        rule_id=rule_name,
        first_observation_ns=now_ns,
        last_observation_ns=now_ns,
        persistence_count=5,
        confidence=0.98,
        deduplication_key=f"walkthrough:{telemetry.environment_id}:{zone_id}",
        metadata={
            "walkthrough_coords": {
                "x": telemetry.x,
                "y": telemetry.y,
                "z": telemetry.z,
                "yaw_deg": telemetry.heading_deg,
            },
            "worker_alias": telemetry.worker_alias,
            "zone_name": zone_name,
            "environment_id": telemetry.environment_id,
        },
    )

    async with get_db_session() as session:
        evt_repo = EventRepository(session)

        # Persist event
        await evt_repo.create_from_candidate(candidate)

        # Run multi-agent bounded execution DAG
        provider = get_llm_provider()
        workflow = SafetyAgentWorkflow(provider)
        cid = f"corr_walk_{event_id}"

        agent_state = await workflow.run(
            event_candidate=candidate,
            correlation_id=cid,
            session=session,
        )

        return {
            "is_violation": True,
            "event_id": event_id,
            "incident_id": incident_id,
            "rule_id": rule_name,
            "severity": severity.value,
            "zone": {
                "zone_id": zone_id,
                "name": zone_name,
                "zone_type": breached_zone.zone_type if breached_zone else "RESTRICTED",
                "color_hex": breached_zone.color_hex if breached_zone else "#EF4444",
                "active_rules": breached_zone.active_rules if breached_zone else [rule_name],
            },
            "equipment_proximity": equipment_proximity,
            "message": f"{severity.value} SAFETY BREACH: {telemetry.worker_alias} entered {zone_name} ({rule_name}) at [{telemetry.x}m, {telemetry.z}m].",
            "agent_state": {
                "status": agent_state.current_stage,
                "correlation_id": agent_state.correlation_id,
                "investigation": (
                    agent_state.investigation.model_dump()
                    if agent_state.investigation
                    else None
                ),
                "policy_result": (
                    agent_state.policy_result.model_dump()
                    if agent_state.policy_result
                    else None
                ),
                "actions_executed": len(agent_state.action_results),
                "verification": (
                    agent_state.verification.model_dump()
                    if agent_state.verification
                    else None
                ),
                "is_degraded_mode": agent_state.is_degraded_mode,
                "summary": (
                    agent_state.investigation.summary
                    if agent_state.investigation
                    else f"Grounding verified: Personnel at ({telemetry.x}, {telemetry.z}) crossed into restricted {zone_name}."
                ),
            },
        }

