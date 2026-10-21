/**
 * SENTINEL AI — Interactive 3D & 2D Operational Digital Twin
 * Real-time spatial plant visualization, calibrated camera coverage cones,
 * live tracking mapping, authoritative safety event alerts, historical incident replay,
 * and Cinematic Interactive Demo Experience.
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import {
  Layers,
  Video,
  Play,
  Pause,
  Compass,
  X,
  Activity,
  Radio,
  Clock,
  ShieldAlert,
  RotateCcw,
  Maximize,
  Minimize,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Shield,
  Eye,
  Sparkles,
  Info,
  AlertTriangle,
  Footprints,
  Camera,
  Crosshair,
  Zap,
  Flame,
  Volume2,
  VolumeX,
  Bot,
  ShieldCheck,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';
import { audioAlertEngine } from '../services/audioAlerts';
import {
  FactorySceneModel,
  SpatialCameraNode,
  SpatialSafetyZone,
  EquipmentAsset,
  fetchFactoryScene,
  getCameraLiveStreamUrl,
  getValidAuthToken,
  createStreamConnection,
  fetchReplayTimeline,
  analyzeWalkthroughPosition,
  WalkthroughAnalyzeResponse,
} from '../services/api';
import {
  ALL_ENVIRONMENTS,
  getEnvironmentById,
} from './digitaltwin/environments';
import {
  createWarehousePalletRack,
  createLoadingDockBay,
  createDockedTruckTrailer,
  createChemicalStorageTank,
  createDistillationColumn,
  createPipeRackGantry,
  createCentrifugalPump,
  createTowerCrane,
  createConstructionScaffolding,
  createHydraulicExcavator,
  createStructuralSteelFrame,
} from './digitaltwin/environmentGeometry';
import {
  DEMO_SCENES,
  DEMO_TOTAL_DURATION,
  getSyntheticWorkerPosition,
  getDemoCameraTransform,
  getDemoIncidentPayload,
  DemoScene,
} from './digitaltwin/demoScenarios';
import {
  createRoboticCell,
  createCncMillingCenter,
  createConveyorSystem,
  createStorageRack,
  createForkliftStation,
  createFactoryBuildingShell,
  createIndustrialCamera,
  createIndustrialWorkerAvatar,
  createIndustrialFloorTexture,
  createSafetyGuardrail,
  createWorkstationBench,
  createElectricalCabinet,
  createSuspendedHighBayLight,
} from './digitaltwin/factoryGeometry';

export type TwinLifecycleState =
  | 'initializing_renderer'
  | 'loading_scene'
  | 'connecting_backend'
  | 'ready_live'
  | 'ready_disconnected'
  | 'error';



interface LiveTrackMarker {
  track_id: number;
  class_name: string;
  confidence: number;
  world_x: number;
  world_z: number;
  camera_id: string;
  last_updated: number;
  in_violation: boolean;
  trail: Array<[number, number]>;
}

interface ActiveAlert {
  event_id: string;
  camera_id: string;
  zone_id: string;
  event_type: string;
  severity: string;
  timestamp: string;
}

interface HoveredObjectInfo {
  name: string;
  type: string;
  details?: string;
  screenX: number;
  screenY: number;
}

export interface DigitalTwinProps {
  environmentId?: string;
  initialEnvironmentId?: string;
  onNavigateToCenter?: () => void;
  onEnvironmentChange?: (envId: string) => void;
  onNavigate?: (tab: string) => void;
}

export const DigitalTwin: React.FC<DigitalTwinProps> = ({
  environmentId,
  initialEnvironmentId,
  onNavigateToCenter,
  onEnvironmentChange,
  onNavigate,
}) => {
  const initial = initialEnvironmentId || environmentId || 'manufacturing-plant';
  const [activeEnvId, setActiveEnvId] = useState<string>(initial);

  useEffect(() => {
    const target = initialEnvironmentId || environmentId;
    if (target && target !== activeEnvId) {
      setActiveEnvId(target);
    }
  }, [environmentId, initialEnvironmentId, activeEnvId]);

  const currentEnvConfig = getEnvironmentById(activeEnvId);

  // Scene Model State initialized to robust offline baseline
  const [sceneModel, setSceneModel] = useState<FactorySceneModel>(currentEnvConfig.sceneModel);
  const [lifecycleState, setLifecycleState] = useState<TwinLifecycleState>('connecting_backend');
  const [isOfflineFallback, setIsOfflineFallback] = useState<boolean>(true);
  const [retryCounter, setRetryCounter] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string>('');

  // View & Layer Controls
  const [viewMode, setViewMode] = useState<'3D' | '2D'>('3D');
  const [selectedFloor, setSelectedFloor] = useState<string>('floor-ground');
  const [showZones, setShowZones] = useState<boolean>(true);
  const [showCoverage, setShowCoverage] = useState<boolean>(true);
  const [showEquipment, setShowEquipment] = useState<boolean>(true);
  const [showTracks, setShowTracks] = useState<boolean>(true);
  const [showDensityHeatmap, setShowDensityHeatmap] = useState<boolean>(false);
  const [isAudioMuted, setIsAudioMuted] = useState<boolean>(() => audioAlertEngine.isMuted());
  const [reducedMotion, setReducedMotion] = useState<boolean>(false);

  // Selection & Details Drawer
  const [selectedCamera, setSelectedCamera] = useState<SpatialCameraNode | null>(null);
  const [selectedZone, setSelectedZone] = useState<SpatialSafetyZone | null>(null);
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentAsset | null>(null);

  // Hover Tooltip Info
  const [hoveredInfo, setHoveredInfo] = useState<HoveredObjectInfo | null>(null);

  // Live Telemetry & Events
  const [liveTracks, setLiveTracks] = useState<Map<number, LiveTrackMarker>>(new Map());
  const [activeAlerts, setActiveAlerts] = useState<ActiveAlert[]>([]);
  const [violatedZoneIds, setViolatedZoneIds] = useState<Set<string>>(new Set());

  // Historical Replay Timeline State
  const [isReplayMode, setIsReplayMode] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [replayProgress, setReplayProgress] = useState<number>(0);
  const [replayEvents, setReplayEvents] = useState<any[]>([]);

  // ==========================================
  // CINEMATIC DEMO STATE MACHINE
  // ==========================================
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [demoStatus, setDemoStatus] = useState<'playing' | 'paused' | 'completed'>('playing');
  const [demoSpeed, setDemoSpeed] = useState<number>(1.0);
  const [demoElapsed, setDemoElapsed] = useState<number>(0.0);
  const [demoAcknowledged, setDemoAcknowledged] = useState<boolean>(false);
  const [demoEscalated, setDemoEscalated] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Refs for animation loop synchronization
  const isDemoModeRef = useRef<boolean>(false);
  const demoStatusRef = useRef<'playing' | 'paused' | 'completed'>('playing');
  const demoSpeedRef = useRef<number>(1.0);
  const demoElapsedRef = useRef<number>(0.0);
  const lastFrameTimeRef = useRef<number>(performance.now());

  // Keep refs in sync with state
  useEffect(() => {
    isDemoModeRef.current = isDemoMode;
  }, [isDemoMode]);
  useEffect(() => {
    demoStatusRef.current = demoStatus;
  }, [demoStatus]);
  useEffect(() => {
    demoSpeedRef.current = demoSpeed;
  }, [demoSpeed]);

  // Three.js Mount Container & Scene Graph
  const containerRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Groups
  const objectsGroupRef = useRef<THREE.Group | null>(null);
  const workersGroupRef = useRef<THREE.Group | null>(null);
  const zonesGroupRef = useRef<THREE.Group | null>(null);
  const cameraConesGroupRef = useRef<THREE.Group | null>(null);
  const demoGroupRef = useRef<THREE.Group | null>(null);
  const densityGroupRef = useRef<THREE.Group | null>(null);

  // Demo Mesh Specific Refs
  const demoWorkerMeshRef = useRef<THREE.Group | null>(null);
  const demoTrailLineRef = useRef<THREE.Line | null>(null);
  const demoScanFrustumRef = useRef<THREE.Mesh | null>(null);
  const demoBeaconRingRef = useRef<THREE.Mesh | null>(null);

  // Raycasting & Interaction
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseNDCRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Camera Orbit Controls State
  const isDraggingRef = useRef<boolean>(false);
  const prevMouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const sphericalRef = useRef<{ radius: number; theta: number; phi: number }>({
    radius: 70,
    theta: Math.PI / 4,
    phi: Math.PI / 3,
  });
  const targetRef = useRef<THREE.Vector3>(new THREE.Vector3(30, 0, 20));
  const targetSphericalRef = useRef<{ radius: number; theta: number; phi: number }>({
    radius: 70,
    theta: Math.PI / 4,
    phi: Math.PI / 3,
  });
  const desiredTargetRef = useRef<THREE.Vector3>(new THREE.Vector3(30, 0, 20));

  // First-Person Walkthrough State
  const [isWalkthrough, setIsWalkthrough] = useState<boolean>(false);
  const isWalkthroughRef = useRef<boolean>(false);
  useEffect(() => {
    isWalkthroughRef.current = isWalkthrough;
  }, [isWalkthrough]);

  const walkthroughPosRef = useRef<THREE.Vector3>(new THREE.Vector3(10.0, 1.75, 20.0));
  const walkthroughYawRef = useRef<number>(Math.PI / 2);
  const walkthroughPitchRef = useRef<number>(0.0);
  const keysPressedRef = useRef<{ [key: string]: boolean }>({});

  // Pointer lock state & Dev Diagnostics
  const [isPointerLocked, setIsPointerLocked] = useState<boolean>(false);
  const isPointerLockedRef = useRef<boolean>(false);
  useEffect(() => {
    isPointerLockedRef.current = isPointerLocked;
  }, [isPointerLocked]);

  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);
  const [walkthroughCoords, setWalkthroughCoords] = useState<{ x: number; y: number; z: number; yawDeg: number }>({ x: 10, y: 1.75, z: 20, yawDeg: 90 });

  // Walkthrough Real-Time Spatial Safety & AI Agent State
  interface WalkthroughSafetyState {
    isViolating: boolean;
    severity: 'CRITICAL' | 'HIGH' | 'NONE';
    ruleId: string;
    zoneName: string;
    zoneType: string;
    zoneId: string;
    equipmentName?: string;
    distance?: number;
    agentRunning: boolean;
    agentResponse: WalkthroughAnalyzeResponse | null;
    agentError: string | null;
    lastAnalyzedAt: number;
  }

  const [walkthroughSafety, setWalkthroughSafety] = useState<WalkthroughSafetyState>({
    isViolating: false,
    severity: 'NONE',
    ruleId: '',
    zoneName: '',
    zoneType: '',
    zoneId: '',
    agentRunning: false,
    agentResponse: null,
    agentError: null,
    lastAnalyzedAt: 0,
  });

  const lastAnalysisTimestampRef = useRef<number>(0);
  const lastBreachedKeyRef = useRef<string>('');
  const isAnalyzingRef = useRef<boolean>(false);

  // Camera-to-Camera POV Navigation
  const [cameraPovId, setCameraPovId] = useState<string | null>(null);
  const cameraPovIdRef = useRef<string | null>(null);
  useEffect(() => {
    cameraPovIdRef.current = cameraPovId;
  }, [cameraPovId]);

  // Dynamic Performance & Low-Power Telemetry
  const [isLowPower, setIsLowPower] = useState<boolean>(false);
  const isLowPowerRef = useRef<boolean>(false);
  useEffect(() => {
    isLowPowerRef.current = isLowPower;
  }, [isLowPower]);

  const reducedMotionRef = useRef<boolean>(reducedMotion);
  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);

  const showEquipmentRef = useRef<boolean>(showEquipment);
  useEffect(() => {
    showEquipmentRef.current = showEquipment;
  }, [showEquipment]);

  const showZonesRef = useRef<boolean>(showZones);
  useEffect(() => {
    showZonesRef.current = showZones;
  }, [showZones]);

  const showCoverageRef = useRef<boolean>(showCoverage);
  useEffect(() => {
    showCoverageRef.current = showCoverage;
  }, [showCoverage]);

  const violatedZoneIdsRef = useRef<Set<string>>(violatedZoneIds);
  useEffect(() => {
    violatedZoneIdsRef.current = violatedZoneIds;
  }, [violatedZoneIds]);

  const [fps, setFps] = useState<number>(60);
  const [renderMs, setRenderMs] = useState<number>(1.8);

  // 1. Asynchronously Synchronize with Backend (Non-Blocking)
  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    // Immediately apply local baseline config so 3D scene renders without network latency
    setSceneModel(currentEnvConfig.sceneModel);
    setLifecycleState('connecting_backend');

    Promise.all([fetchFactoryScene(activeEnvId, controller.signal), getValidAuthToken()])
      .then(([remoteScene, token]) => {
        if (!isMounted) return;
        setSceneModel(remoteScene);
        setAuthToken(token);
        setIsOfflineFallback(false);
        setLifecycleState('ready_live');
        setError(null);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.warn('Backend sync unavailable, retaining local baseline plant model:', err);
        setIsOfflineFallback(true);
        setLifecycleState('ready_disconnected');
        setError(null);
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [activeEnvId, retryCounter]);


  // 2. Connect to Authoritative Real-Time WebSocket Telemetry
  useEffect(() => {
    if (isReplayMode || isDemoMode) return;

    let ws: WebSocket | null = null;

    createStreamConnection((msg) => {
      if (msg.type === 'CAMERA_TELEMETRY' && msg.detections) {
        setLiveTracks((prev) => {
          const updated = new Map(prev);
          const now = Date.now();

          for (const det of msg.detections) {
            if (det.world_point && Array.isArray(det.world_point)) {
              const [wx, wz] = det.world_point;
              const existing = updated.get(det.track_id);
              const trail = existing
                ? [...existing.trail.slice(-12), [wx, wz] as [number, number]]
                : [[wx, wz] as [number, number]];

              let inViol = false;
              if (sceneModel) {
                for (const z of sceneModel.zones) {
                  if (z.zone_type === 'RESTRICTED' && isPointInPolygon(wx, wz, z.polygon_meters)) {
                    inViol = true;
                    break;
                  }
                }
              }

              updated.set(det.track_id, {
                track_id: det.track_id,
                class_name: det.class_name || 'person',
                confidence: det.confidence,
                world_x: wx,
                world_z: wz,
                camera_id: msg.camera_id,
                last_updated: now,
                in_violation: inViol,
                trail,
              });
            }
          }

          for (const [id, marker] of updated.entries()) {
            if (now - marker.last_updated > 2500) {
              updated.delete(id);
            }
          }
          return updated;
        });
      } else if (msg.type === 'SAFETY_EVENT') {
        const newAlert: ActiveAlert = {
          event_id: msg.event_id,
          camera_id: msg.camera_id,
          zone_id: msg.zone_id,
          event_type: msg.event_type,
          severity: msg.severity,
          timestamp: new Date().toLocaleTimeString(),
        };

        setActiveAlerts((prev) => [newAlert, ...prev.slice(0, 9)]);
        setViolatedZoneIds((prev) => new Set([...prev, msg.zone_id]));
        audioAlertEngine.playAlert(msg.severity === 'CRITICAL' ? 'CRITICAL' : 'WARNING');

        setTimeout(() => {
          setViolatedZoneIds((prev) => {
            const next = new Set(prev);
            next.delete(msg.zone_id);
            return next;
          });
        }, 6000);
      }
    }).then((socket) => {
      ws = socket;
    });

    return () => {
      if (ws) ws.close();
    };
  }, [isReplayMode, isDemoMode, sceneModel]);

  function isPointInPolygon(x: number, z: number, poly: [number, number][]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0],
        zi = poly[i][1];
      const xj = poly[j][0],
        zj = poly[j][1];
      const intersect = zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  const exitWalkthroughMode = () => {
    setIsWalkthrough(false);
    if (document.pointerLockElement) {
      try {
        document.exitPointerLock();
      } catch {
        // Ignore pointer lock release exception
      }
    }
    lastBreachedKeyRef.current = '';
    setWalkthroughSafety({
      isViolating: false,
      severity: 'NONE',
      ruleId: '',
      zoneName: '',
      zoneType: '',
      zoneId: '',
      agentRunning: false,
      agentResponse: null,
      agentError: null,
      lastAnalyzedAt: 0,
    });
  };

  const checkWalkthroughSpatialSafety = (px: number, pz: number, yawDeg: number) => {
    const scene = sceneModelRef.current;
    if (!scene || !isWalkthroughRef.current) return;

    // 1. Check zone containment
    let detectedZone: SpatialSafetyZone | null = null;
    let detectedRule = '';
    let severity: 'CRITICAL' | 'HIGH' = 'HIGH';

    if (scene.zones) {
      for (const z of scene.zones) {
        if ((z.zone_type === 'RESTRICTED' || z.zone_type === 'WARNING') && isPointInPolygon(px, pz, z.polygon_meters)) {
          detectedZone = z;
          if (z.zone_type === 'RESTRICTED') {
            detectedRule = z.active_rules?.[0] || 'RULE_NO_PEDESTRIANS';
            severity = 'CRITICAL';
          } else {
            detectedRule = z.active_rules?.[0] || 'RULE_HIGH_VISIBILITY_VEST_REQUIRED';
            severity = 'HIGH';
          }
          break;
        }
      }
    }

    // 2. Check proximity to high-hazard equipment if not in restricted zone
    let detectedEquipment: EquipmentAsset | null = null;
    let eqDistance = 0;
    if (!detectedZone && scene.equipment) {
      for (const eq of scene.equipment) {
        if (['ROBOTIC_CELL', 'CNC_MILL', 'CRANE', 'FORKLIFT_BAY'].includes(eq.category)) {
          const dist = Math.hypot(px - eq.position[0], pz - eq.position[2]);
          const diag = Math.hypot(eq.dimensions[0], eq.dimensions[2]) / 2.0;
          if (dist < diag + 1.2) {
            detectedEquipment = eq;
            eqDistance = Math.round(dist * 10) / 10;
            detectedRule = 'RULE_ROBOTIC_ENVELOPE_PROXIMITY';
            severity = 'HIGH';
            break;
          }
        }
      }
    }

    const isViolating = Boolean(detectedZone || detectedEquipment);
    const breachKey = detectedZone ? detectedZone.zone_id : (detectedEquipment ? detectedEquipment.id : '');

    if (isViolating) {
      const now = Date.now();
      const isNewBreach = breachKey !== lastBreachedKeyRef.current;
      const cooldownElapsed = now - lastAnalysisTimestampRef.current > 3500;

      // Update violated zone visual pulsing in 3D scene
      if (detectedZone && !violatedZoneIdsRef.current.has(detectedZone.zone_id)) {
        setViolatedZoneIds((prev) => new Set([...prev, detectedZone.zone_id]));
      }

      // If new breach or cooldown elapsed, trigger sound and AI Agent dispatch
      if (isNewBreach || (!isAnalyzingRef.current && cooldownElapsed)) {
        lastBreachedKeyRef.current = breachKey;
        lastAnalysisTimestampRef.current = now;

        if (isNewBreach) {
          audioAlertEngine.playAlert(severity === 'CRITICAL' ? 'CRITICAL' : 'WARNING');
        }

        // Set initial analyzing state for HUD
        setWalkthroughSafety((prev) => ({
          ...prev,
          isViolating: true,
          severity,
          ruleId: detectedRule,
          zoneName: detectedZone ? detectedZone.name : (detectedEquipment ? detectedEquipment.name : 'Exclusion Zone'),
          zoneType: detectedZone ? detectedZone.zone_type : 'RESTRICTED',
          zoneId: detectedZone ? detectedZone.zone_id : (detectedEquipment ? detectedEquipment.id : ''),
          equipmentName: detectedEquipment?.name,
          distance: eqDistance || undefined,
          agentRunning: true,
          agentError: null,
          lastAnalyzedAt: now,
        }));

        isAnalyzingRef.current = true;
        analyzeWalkthroughPosition({
          environment_id: activeEnvId,
          x: px,
          y: 1.75,
          z: pz,
          heading_deg: yawDeg,
          worker_alias: 'Walkthrough Operator',
        })
          .then((res) => {
            isAnalyzingRef.current = false;
            setWalkthroughSafety((prev) => ({
              ...prev,
              agentRunning: false,
              agentResponse: res,
              lastAnalyzedAt: Date.now(),
            }));

            if (res.is_violation && res.incident_id) {
              const alertItem: ActiveAlert = {
                event_id: res.event_id || `walk_${Date.now()}`,
                camera_id: 'cam-facility-01',
                zone_id: detectedZone?.zone_id || 'zone-proximity-hazard',
                event_type: res.rule_id || 'ZONE_ENTRY',
                severity: (res.severity as any) || severity,
                timestamp: new Date().toLocaleTimeString(),
              };
              setActiveAlerts((prev) => [alertItem, ...prev.filter((a) => a.event_id !== alertItem.event_id).slice(0, 8)]);
            }
          })
          .catch((err) => {
            isAnalyzingRef.current = false;
            setWalkthroughSafety((prev) => ({
              ...prev,
              agentRunning: false,
              agentError: err.message || 'Analysis communication error',
            }));
          });
      }
    } else {
      // User is in a compliant safe area
      if (lastBreachedKeyRef.current !== '') {
        const prevKey = lastBreachedKeyRef.current;
        lastBreachedKeyRef.current = '';
        if (violatedZoneIdsRef.current.has(prevKey)) {
          setViolatedZoneIds((prev) => {
            const next = new Set(prev);
            next.delete(prevKey);
            return next;
          });
        }
        setWalkthroughSafety((prev) => ({
          ...prev,
          isViolating: false,
          severity: 'NONE',
          agentRunning: false,
        }));
      }
    }
  };

  const sceneModelRef = useRef<FactorySceneModel>(sceneModel);
  useEffect(() => {
    sceneModelRef.current = sceneModel;
  }, [sceneModel]);

  // Validated Spawn Points for First-Person Walkthrough
  const getEnvironmentSpawnPoint = (category: string, model: FactorySceneModel) => {
    const d = model.dimensions.depth_meters;
    if (category === 'LOGISTICS') {
      return {
        position: new THREE.Vector3(8.0, 1.75, Math.min(22.5, d / 2)),
        yaw: Math.PI / 2,
        pitch: -0.05,
      };
    }
    if (category === 'CHEMICAL') {
      return {
        position: new THREE.Vector3(12.0, 1.75, Math.min(36.5, d - 3.5)),
        yaw: 0.0,
        pitch: 0.02,
      };
    }
    if (category === 'CONSTRUCTION') {
      return {
        position: new THREE.Vector3(8.0, 1.75, Math.min(36.0, d - 4.0)),
        yaw: Math.PI / 6,
        pitch: 0.08,
      };
    }
    return {
      position: new THREE.Vector3(10.0, 1.75, Math.min(20.0, d / 2)),
      yaw: Math.PI / 2,
      pitch: 0.0,
    };
  };

  // Machinery & Equipment AABB Collision Detection
  const isPositionBlockedByEquipment = (
    px: number,
    pz: number,
    equipmentList: FactorySceneModel['equipment']
  ): boolean => {
    const avatarRadius = 0.55;
    if (!equipmentList) return false;
    for (const eq of equipmentList) {
      if (!eq.position || !eq.dimensions) continue;
      const [ex, , ez] = eq.position;
      const [ew, , ed] = eq.dimensions;
      const minX = ex - ew / 2 - avatarRadius;
      const maxX = ex + ew / 2 + avatarRadius;
      const minZ = ez - ed / 2 - avatarRadius;
      const maxZ = ez + ed / 2 + avatarRadius;

      if (px >= minX && px <= maxX && pz >= minZ && pz <= maxZ) {
        return true;
      }
    }
    return false;
  };

  // Reusable Scene Graph Builders
  const populateEnvironmentObjects = (
    group: THREE.Group,
    model: FactorySceneModel,
    showEq: boolean,
    category: string
  ) => {
    group.traverse((c) => {
      if (c instanceof THREE.Mesh) {
        if (c.geometry) c.geometry.dispose();
        if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
        else if (c.material) c.material.dispose();
      }
    });
    group.clear();

    const floorW = model.dimensions.width_meters;
    const floorD = model.dimensions.depth_meters;
    const floorH = model.dimensions.height_meters || 8.5;

    // Building Shell
    const buildingShell = createFactoryBuildingShell(floorW, floorD, floorH);
    buildingShell.name = 'buildingShell';
    group.add(buildingShell);

    // Industrial Concrete Floor Texture
    const floorTexture = createIndustrialFloorTexture(floorW, floorD);
    const floorGeo = new THREE.PlaneGeometry(floorW, floorD);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: floorTexture || null,
      roughness: 0.65,
      metalness: 0.2,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(floorW / 2, -0.01, floorD / 2);
    floorMesh.receiveShadow = true;
    group.add(floorMesh);

    // Grid lines
    const gridHelper = new THREE.GridHelper(
      Math.max(floorW, floorD),
      Math.max(floorW, floorD) / 4,
      0x0284c7,
      0x1e293b
    );
    gridHelper.position.set(floorW / 2, 0.01, floorD / 2);
    group.add(gridHelper);

    // Manufacturing-Specific Architectural Features
    if (category === 'MANUFACTURING') {
      const railN1 = createSafetyGuardrail(22.0);
      railN1.position.set(13.0, 0, 18.6);
      group.add(railN1);

      const railN2 = createSafetyGuardrail(28.0);
      railN2.position.set(44.0, 0, 18.6);
      group.add(railN2);

      const railS1 = createSafetyGuardrail(22.0);
      railS1.position.set(13.0, 0, 21.4);
      group.add(railS1);

      const railS2 = createSafetyGuardrail(28.0);
      railS2.position.set(44.0, 0, 21.4);
      group.add(railS2);

      const workstationCnc = createWorkstationBench(2.4, 1.2, 0.95);
      workstationCnc.position.set(24.0, 0, 32.0);
      workstationCnc.traverse((c) => {
        if (c instanceof THREE.Mesh) {
          c.userData = {
            type: 'equipment',
            item: {
              id: 'ws-qc-01',
              name: 'QC & Metrology Inspection Bench #1',
              category: 'WORKSTATION',
              status: 'OPERATIONAL',
            },
          };
          c.castShadow = true;
        }
      });
      group.add(workstationCnc);

      const workstationAsm = createWorkstationBench(2.4, 1.2, 0.95);
      workstationAsm.position.set(46.0, 0, 16.0);
      workstationAsm.traverse((c) => {
        if (c instanceof THREE.Mesh) {
          c.userData = {
            type: 'equipment',
            item: {
              id: 'ws-sup-02',
              name: 'Assembly Cell Supervisory Console #2',
              category: 'WORKSTATION',
              status: 'OPERATIONAL',
            },
          };
          c.castShadow = true;
        }
      });
      group.add(workstationAsm);

      const elecCabinet1 = createElectricalCabinet(1.2, 2.1, 0.6);
      elecCabinet1.position.set(0.6, 0, 14.0);
      elecCabinet1.traverse((c) => {
        if (c instanceof THREE.Mesh) {
          c.userData = {
            type: 'equipment',
            item: {
              id: 'elec-pnl-01',
              name: '480V Primary Power Distribution Panel #1',
              category: 'ELECTRICAL',
              status: 'OPERATIONAL',
            },
          };
          c.castShadow = true;
        }
      });
      group.add(elecCabinet1);

      const elecCabinet2 = createElectricalCabinet(1.2, 2.1, 0.6);
      elecCabinet2.position.set(59.4, 0, 28.0);
      elecCabinet2.rotation.y = Math.PI;
      elecCabinet2.traverse((c) => {
        if (c instanceof THREE.Mesh) {
          c.userData = {
            type: 'equipment',
            item: {
              id: 'elec-pnl-02',
              name: 'AGV Fast-Charging Substation Panel #2',
              category: 'ELECTRICAL',
              status: 'OPERATIONAL',
            },
          };
          c.castShadow = true;
        }
      });
      group.add(elecCabinet2);
    }

    // Suspended High-Bay LED Lights
    const lightPositions: Array<[number, number, number]> = [
      [floorW * 0.25, 7.8, floorD * 0.3],
      [floorW * 0.5, 7.8, floorD * 0.3],
      [floorW * 0.75, 7.8, floorD * 0.3],
      [floorW * 0.25, 7.8, floorD * 0.7],
      [floorW * 0.5, 7.8, floorD * 0.7],
      [floorW * 0.75, 7.8, floorD * 0.7],
    ];
    lightPositions.forEach(([lx, ly, lz]) => {
      const fixture = createSuspendedHighBayLight(lx, ly, lz, floorH);
      group.add(fixture);
    });

    // Realistic Industrial Equipment
    if (showEq && model.equipment) {
      model.equipment.forEach((eq) => {
        const [w, h, d] = eq.dimensions;
        const [x, y, z] = eq.position;

        let assetGroup: THREE.Group;
        if (eq.category === 'ROBOTIC_CELL') {
          assetGroup = createRoboticCell(w, h, d);
        } else if (eq.category === 'CNC_MILL') {
          assetGroup = createCncMillingCenter(w, h, d);
        } else if (eq.category === 'CONVEYOR') {
          assetGroup = createConveyorSystem(w, h, d);
        } else if (eq.category === 'FORKLIFT_BAY') {
          assetGroup = createForkliftStation(w, h, d);
        } else if (eq.category === 'WAREHOUSE_RACK') {
          assetGroup = createWarehousePalletRack(w, h, d);
        } else if (eq.category === 'LOADING_DOCK') {
          assetGroup = createLoadingDockBay(w, h, d);
        } else if (eq.category === 'TRUCK_TRAILER') {
          assetGroup = createDockedTruckTrailer(w, h, d);
        } else if (eq.category === 'CHEMICAL_TANK') {
          assetGroup = createChemicalStorageTank(w, h, d);
        } else if (eq.category === 'DISTILLATION_COLUMN') {
          assetGroup = createDistillationColumn(w, h, d);
        } else if (eq.category === 'PIPE_RACK') {
          assetGroup = createPipeRackGantry(w, h, d);
        } else if (eq.category === 'CENTRIFUGAL_PUMP') {
          assetGroup = createCentrifugalPump(w, h, d);
        } else if (eq.category === 'TOWER_CRANE') {
          assetGroup = createTowerCrane(w, h, d);
        } else if (eq.category === 'SCAFFOLDING') {
          assetGroup = createConstructionScaffolding(w, h, d);
        } else if (eq.category === 'EXCAVATOR') {
          assetGroup = createHydraulicExcavator(w, h, d);
        } else if (eq.category === 'STEEL_FRAME') {
          assetGroup = createStructuralSteelFrame(w, h, d);
        } else {
          assetGroup = createStorageRack(w, h, d);
        }

        assetGroup.position.set(x, y, z);
        assetGroup.rotation.y = (eq.rotation_deg * Math.PI) / 180;

        assetGroup.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.userData = { type: 'equipment', item: eq };
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        assetGroup.userData = { type: 'equipment', item: eq };
        group.add(assetGroup);
      });
    }
  };

  const populateSafetyZones = (
    group: THREE.Group,
    model: FactorySceneModel,
    showZ: boolean,
    violatedIds: Set<string>
  ) => {
    group.traverse((c) => {
      if (c instanceof THREE.Mesh) {
        if (c.geometry) c.geometry.dispose();
        if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
        else if (c.material) c.material.dispose();
      }
    });
    group.clear();

    if (!showZ || !model.zones) return;

    model.zones.forEach((zone) => {
      const isViolated = violatedIds.has(zone.zone_id);
      const shape = new THREE.Shape();
      zone.polygon_meters.forEach(([x, z], i) => {
        if (i === 0) shape.moveTo(x, z);
        else shape.lineTo(x, z);
      });

      const extrudeSettings = {
        depth: zone.height_meters || 3.0,
        bevelEnabled: false,
      };

      const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      geom.rotateX(Math.PI / 2);

      const color = isViolated
        ? 0xff0044
        : zone.zone_type === 'RESTRICTED'
        ? 0xef4444
        : zone.zone_type === 'WARNING'
        ? 0xf59e0b
        : 0x10b981;

      const mat = new THREE.MeshStandardMaterial({
        color,
        transparent: true,
        opacity: isViolated ? 0.45 : 0.22,
        roughness: 0.6,
      });

      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(0, 0, 0);
      mesh.userData = { type: 'zone', item: zone, isViolated };
      group.add(mesh);
    });
  };

  const populateCameraCones = (
    group: THREE.Group,
    model: FactorySceneModel,
    showCov: boolean
  ) => {
    group.traverse((c) => {
      if (c instanceof THREE.Mesh) {
        if (c.geometry) c.geometry.dispose();
        if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
        else if (c.material) c.material.dispose();
      }
    });
    group.clear();

    if (!model.cameras) return;

    model.cameras.forEach((cam) => {
      const [cx, cy, cz] = cam.position;
      const [tx, ty, tz] = cam.target;

      const camAsset = createIndustrialCamera(cx, cy, cz, tx, ty, tz, cam.status);
      camAsset.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.userData = { type: 'camera', item: cam };
        }
      });
      camAsset.userData = { type: 'camera', item: cam };
      group.add(camAsset);

      // Coverage polygon only rendered if camera has calibrated homography
      if (showCov && cam.calibrated && cam.coverage_polygon_meters && cam.coverage_polygon_meters.length >= 3) {
        const shape = new THREE.Shape();
        cam.coverage_polygon_meters.forEach(([px, pz], i) => {
          if (i === 0) shape.moveTo(px, pz);
          else shape.lineTo(px, pz);
        });

        const fovGeom = new THREE.ShapeGeometry(shape);
        fovGeom.rotateX(Math.PI / 2);
        const fovMat = new THREE.MeshBasicMaterial({
          color: cam.status === 'LIVE' ? 0x00f5d4 : 0x64748b,
          transparent: true,
          opacity: 0.14,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const fovMesh = new THREE.Mesh(fovGeom, fovMat);
        fovMesh.position.set(0, 0.05, 0);
        fovMesh.userData = { type: 'camera', item: cam };
        group.add(fovMesh);

        const linePoints = cam.coverage_polygon_meters.map(([px, pz]) => new THREE.Vector3(px, 0.06, pz));
        linePoints.push(linePoints[0]);
        const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
        const lineMat = new THREE.LineBasicMaterial({
          color: cam.status === 'LIVE' ? 0x00f5d4 : 0x64748b,
          transparent: true,
          opacity: 0.45,
        });
        const lineMesh = new THREE.Line(lineGeo, lineMat);
        group.add(lineMesh);
      }
    });
  };

  // Keyboard & Pointer Event Listeners for First-Person Walkthrough
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept typing in input fields
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      keysPressedRef.current[e.code] = true;
      keysPressedRef.current[e.key.toLowerCase()] = true;

      if (e.code === 'Escape') {
        if (isWalkthroughRef.current) {
          setIsWalkthrough(false);
          if (document.pointerLockElement) {
            document.exitPointerLock?.();
          }
          const floorW = sceneModelRef.current?.dimensions.width_meters || 60;
          const floorD = sceneModelRef.current?.dimensions.depth_meters || 40;
          desiredTargetRef.current = new THREE.Vector3(floorW / 2, 0, floorD / 2);
          targetSphericalRef.current = { radius: Math.max(floorW, floorD) * 1.15, theta: Math.PI / 4, phi: Math.PI / 3 };
        }
        if (cameraPovIdRef.current) {
          setCameraPovId(null);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressedRef.current[e.code] = false;
      keysPressedRef.current[e.key.toLowerCase()] = false;
    };

    const handlePointerLockChange = () => {
      const isLocked = document.pointerLockElement === mountRef.current;
      setIsPointerLocked(isLocked);
    };

    const handlePointerLockMove = (e: MouseEvent) => {
      if (!isWalkthroughRef.current || document.pointerLockElement !== mountRef.current) return;
      const sensitivity = reducedMotionRef.current ? 0.0015 : 0.0024;
      walkthroughYawRef.current -= e.movementX * sensitivity;
      walkthroughPitchRef.current = Math.max(
        -1.3,
        Math.min(1.3, walkthroughPitchRef.current - e.movementY * sensitivity)
      );
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    document.addEventListener('pointerlockchange', handlePointerLockChange);
    document.addEventListener('mousemove', handlePointerLockMove);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('pointerlockchange', handlePointerLockChange);
      document.removeEventListener('mousemove', handlePointerLockMove);
    };
  }, []);

  // Low-Power / Constrained Edge Hardware Optimization Effect
  useEffect(() => {
    if (!rendererRef.current) return;
    if (isLowPower) {
      rendererRef.current.setPixelRatio(1.0);
      rendererRef.current.shadowMap.enabled = false;
    } else {
      rendererRef.current.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      rendererRef.current.shadowMap.enabled = true;
    }
  }, [isLowPower]);

  // 3. Initialize Three.js WebGL Scene Graph
  useEffect(() => {
    if (viewMode !== '3D' || !mountRef.current) return;

    let isDisposed = false;

    const width = mountRef.current.clientWidth || mountRef.current.parentElement?.clientWidth || window.innerWidth;
    const height = mountRef.current.clientHeight || mountRef.current.parentElement?.clientHeight || (window.innerHeight - 72);
    const safeWidth = Math.max(width, 10);
    const safeHeight = Math.max(height, 10);

    const getThemeBgColor = () => {
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-main').trim();
      try {
        return bg ? new THREE.Color(bg) : new THREE.Color(0x060913);
      } catch {
        return new THREE.Color(0x060913);
      }
    };

    // A. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    const initialBg = getThemeBgColor();
    scene.background = initialBg;
    scene.fog = new THREE.FogExp2(initialBg, 0.006);
    sceneRef.current = scene;

    const themeObserver = new MutationObserver(() => {
      if (sceneRef.current) {
        const newBg = getThemeBgColor();
        sceneRef.current.background = newBg;
        if (sceneRef.current.fog) {
          sceneRef.current.fog.color = newBg;
        }
      }
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    const camera = new THREE.PerspectiveCamera(45, safeWidth / safeHeight, 0.1, 500);
    cameraRef.current = camera;
    updateCameraPosition();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch (err: any) {
      console.error('WebGLRenderer initialization failed:', err);
      setLifecycleState('error');
      setError('WebGL2 hardware acceleration could not be initialized in this browser or GPU environment.');
      return;
    }

    renderer.setSize(safeWidth, safeHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    mountRef.current.innerHTML = '';
    mountRef.current.appendChild(renderer.domElement);

    // B. Physically Based Industrial Facility Lighting
    const ambientLight = new THREE.AmbientLight(0xf1f5f9, 0.75);
    scene.add(ambientLight);

    // Primary High-Bay Directional Light (Simulating factory roof high-bay arrays)
    const dirLight = new THREE.DirectionalLight(0xfff8ee, 1.25);
    dirLight.position.set(35, 45, 30);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 150;
    dirLight.shadow.camera.left = -40;
    dirLight.shadow.camera.right = 40;
    dirLight.shadow.camera.top = 40;
    dirLight.shadow.camera.bottom = -40;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);

    // Cool Sky / Perimeter Fill Light for natural industrial contrast
    const fillLight = new THREE.DirectionalLight(0xdbeafe, 0.45);
    fillLight.position.set(-25, 35, -20);
    scene.add(fillLight);

    // Subtle localized point light over primary production cell
    const cellPointLight = new THREE.PointLight(0x38bdf8, 0.6, 60);
    cellPointLight.position.set(17, 6, 12);
    scene.add(cellPointLight);

    // C. Scene Groups
    const objectsGroup = new THREE.Group();
    const workersGroup = new THREE.Group();
    const zonesGroup = new THREE.Group();
    const cameraConesGroup = new THREE.Group();
    const demoGroup = new THREE.Group();
    const densityGroup = new THREE.Group();

    objectsGroupRef.current = objectsGroup;
    workersGroupRef.current = workersGroup;
    zonesGroupRef.current = zonesGroup;
    cameraConesGroupRef.current = cameraConesGroup;
    demoGroupRef.current = demoGroup;
    densityGroupRef.current = densityGroup;

    scene.add(objectsGroup);
    scene.add(workersGroup);
    scene.add(zonesGroup);
    scene.add(cameraConesGroup);
    scene.add(demoGroup);
    scene.add(densityGroup);

    // Immediately populate initial 3D objects, zones, cameras so viewport is never blank
    populateEnvironmentObjects(objectsGroup, sceneModelRef.current, showEquipmentRef.current, currentEnvConfig.category);
    populateSafetyZones(zonesGroup, sceneModelRef.current, showZonesRef.current, violatedZoneIdsRef.current);
    populateCameraCones(cameraConesGroup, sceneModelRef.current, showCoverageRef.current);

    // Construct Demo Meshes (Worker, Trail, Frustum Scan, Alarm Beacon)
    buildDemoMeshes(demoGroup);

    // Dynamic Viewport Resize Handling
    const updateDimensions = (w: number, h: number) => {
      if (w <= 0 || h <= 0) return;
      if (cameraRef.current && rendererRef.current) {
        cameraRef.current.aspect = w / h;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(w, h);
      }
    };

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        updateDimensions(cr.width, cr.height);
      }
    });
    if (mountRef.current) {
      resizeObserver.observe(mountRef.current);
    }

    const handleResize = () => {
      if (!mountRef.current) return;
      updateDimensions(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    // Background tab pause handling
    let isHidden = false;
    const handleVisibilityChange = () => {
      isHidden = document.hidden;
      if (!isHidden) {
        lastFrameTimeRef.current = performance.now();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Frame-rate and rendering telemetry measurement
    let frameCount = 0;
    let lastFpsUpdate = performance.now();

    // Unified Render Loop
    let pulseAngle = 0;
    lastFrameTimeRef.current = performance.now();

    const animate = () => {
      if (isDisposed) return;
      animFrameRef.current = requestAnimationFrame(animate);

      // Pause rendering when tab is hidden to save GPU cycles and battery
      if (isHidden) return;

      const now = performance.now();
      const deltaSeconds = Math.min((now - lastFrameTimeRef.current) / 1000, 0.1);
      lastFrameTimeRef.current = now;

      // Update frame telemetry
      frameCount++;
      if (now - lastFpsUpdate > 1000) {
        setFps(Math.max(1, Math.round((frameCount * 1000) / (now - lastFpsUpdate))));
        setRenderMs(Number((deltaSeconds * 1000).toFixed(1)));
        frameCount = 0;
        lastFpsUpdate = now;
      }

      // 1. Demo Mode Tick
      if (isDemoModeRef.current) {
        if (demoStatusRef.current === 'playing') {
          demoElapsedRef.current += deltaSeconds * demoSpeedRef.current;
          if (demoElapsedRef.current >= DEMO_TOTAL_DURATION) {
            demoElapsedRef.current = DEMO_TOTAL_DURATION;
            demoStatusRef.current = 'completed';
            setDemoStatus('completed');
          }
          setDemoElapsed(demoElapsedRef.current);
        }

        const time = demoElapsedRef.current;
        const { cameraPos, targetPos } = getDemoCameraTransform(
          time,
          reducedMotion,
          currentEnvConfig.demoScenarios
        );

        // Smooth camera gliding
        if (cameraRef.current) {
          if (reducedMotion) {
            cameraRef.current.position.set(...cameraPos);
            targetRef.current.set(...targetPos);
          } else {
            cameraRef.current.position.lerp(new THREE.Vector3(...cameraPos), 0.08);
            targetRef.current.lerp(new THREE.Vector3(...targetPos), 0.08);
          }
          cameraRef.current.lookAt(targetRef.current);
        }

        // Update synthetic worker avatar
        const worker = getSyntheticWorkerPosition(time, currentEnvConfig.category);
        if (demoWorkerMeshRef.current) {
          demoWorkerMeshRef.current.visible = worker.active;
          if (worker.active) {
            demoWorkerMeshRef.current.position.set(worker.x, worker.y, worker.z);
            const baseRing = demoWorkerMeshRef.current.getObjectByName('baseRing') as THREE.Mesh;
            if (baseRing) {
              (baseRing.material as THREE.MeshBasicMaterial).color.setHex(
                worker.inViolation ? 0xff0044 : 0x00f5d4
              );
            }
          }
        }

        // Update motion trail
        if (demoTrailLineRef.current && worker.active && worker.trail.length >= 2) {
          const points = worker.trail.map(([tx, tz]) => new THREE.Vector3(tx, 0.04, tz));
          demoTrailLineRef.current.geometry.setFromPoints(points);
          demoTrailLineRef.current.visible = true;
        } else if (demoTrailLineRef.current) {
          demoTrailLineRef.current.visible = false;
        }

        // Update camera FOV scan pulse
        if (demoScanFrustumRef.current) {
          const inScan = time >= 8.0 && time <= 32.0;
          demoScanFrustumRef.current.visible = inScan;
          if (inScan) {
            const scanZ = 12.0 + Math.sin(time * 3.0) * 3.5;
            demoScanFrustumRef.current.position.set(17.0, 2.2, scanZ);
          }
        }

        // Update breach zone alarm beacon
        if (demoBeaconRingRef.current) {
          const inAlarm = time >= 32.0 && time <= 60.0;
          demoBeaconRingRef.current.visible = inAlarm;
          if (inAlarm) {
            demoBeaconRingRef.current.rotation.z += 0.04;
            const sc = 1.0 + 0.15 * Math.sin(time * 7.0);
            demoBeaconRingRef.current.scale.set(sc, sc, sc);
          }
        }

        // Zone color flashing during breach
        if (zonesGroupRef.current) {
          zonesGroupRef.current.children.forEach((child) => {
            if (child.userData.item?.zone_id === 'zone-robotics-01' && child instanceof THREE.Mesh) {
              const mat = child.material as THREE.MeshStandardMaterial;
              if (time >= 32.0 && time <= 60.0) {
                mat.color.setHex(0xff0033);
                mat.emissive.setHex(0x550011);
                mat.opacity = 0.45 + 0.2 * Math.sin(time * 8.0);
              } else {
                mat.color.setHex(0xef4444);
                mat.emissive.setHex(0x000000);
                mat.opacity = 0.25;
              }
            }
          });
        }
      } else {
        // 2. Non-Demo Interactive Modes
        if (isWalkthroughRef.current) {
          // A. First-Person Walkthrough Mode Navigation
          const walkSpeed = reducedMotionRef.current ? 2.8 : 5.0; // Respect reduced motion
          const yaw = walkthroughYawRef.current;
          const pitch = walkthroughPitchRef.current;

          let moveX = 0;
          let moveZ = 0;

          if (keysPressedRef.current['KeyW'] || keysPressedRef.current['w'] || keysPressedRef.current['ArrowUp']) {
            moveX += Math.sin(yaw);
            moveZ += Math.cos(yaw);
          }
          if (keysPressedRef.current['KeyS'] || keysPressedRef.current['s'] || keysPressedRef.current['ArrowDown']) {
            moveX -= Math.sin(yaw);
            moveZ -= Math.cos(yaw);
          }
          if (keysPressedRef.current['KeyA'] || keysPressedRef.current['a'] || keysPressedRef.current['ArrowLeft']) {
            moveX += Math.cos(yaw);
            moveZ -= Math.sin(yaw);
          }
          if (keysPressedRef.current['KeyD'] || keysPressedRef.current['d'] || keysPressedRef.current['ArrowRight']) {
            moveX -= Math.cos(yaw);
            moveZ += Math.sin(yaw);
          }

          if (moveX !== 0 || moveZ !== 0) {
            const len = Math.hypot(moveX, moveZ);
            const stepX = (moveX / len) * walkSpeed * deltaSeconds;
            const stepZ = (moveZ / len) * walkSpeed * deltaSeconds;

            const floorW = sceneModelRef.current?.dimensions.width_meters || 60;
            const floorD = sceneModelRef.current?.dimensions.depth_meters || 40;
            const targetX = Math.max(1.2, Math.min(floorW - 1.2, walkthroughPosRef.current.x + stepX));
            const targetZ = Math.max(1.2, Math.min(floorD - 1.2, walkthroughPosRef.current.z + stepZ));

            const currentX = walkthroughPosRef.current.x;
            const currentZ = walkthroughPosRef.current.z;
            const eqList = sceneModelRef.current?.equipment;

            // Separate axis collision detection enables smooth wall/equipment sliding
            if (!isPositionBlockedByEquipment(targetX, currentZ, eqList)) {
              walkthroughPosRef.current.x = targetX;
            }
            if (!isPositionBlockedByEquipment(currentX, targetZ, eqList)) {
              walkthroughPosRef.current.z = targetZ;
            }
          }

          if (cameraRef.current) {
            const px = walkthroughPosRef.current.x;
            const py = 1.75; // Standard verified eye level above floor
            const pz = walkthroughPosRef.current.z;
            cameraRef.current.position.set(px, py, pz);

            const lookTarget = new THREE.Vector3(
              px + Math.sin(yaw) * Math.cos(pitch),
              py + Math.sin(pitch),
              pz + Math.cos(yaw) * Math.cos(pitch)
            );
            cameraRef.current.lookAt(lookTarget);
          }

          // Throttle coordinate reporting for dev diagnostics & HUD
          if (frameCount % 6 === 0) {
            const curX = Number(walkthroughPosRef.current.x.toFixed(2));
            const curZ = Number(walkthroughPosRef.current.z.toFixed(2));
            const curYawDeg = Math.round((((yaw * 180) / Math.PI) % 360 + 360) % 360);
            setWalkthroughCoords({
              x: curX,
              y: 1.75,
              z: curZ,
              yawDeg: curYawDeg,
            });
            checkWalkthroughSpatialSafety(curX, curZ, curYawDeg);
          }
        } else if (cameraPovIdRef.current) {
          // B. Physical CCTV Camera POV Mode
          const povCam = sceneModelRef.current?.cameras.find((c) => c.camera_id === cameraPovIdRef.current);
          if (povCam && cameraRef.current) {
            cameraRef.current.position.set(povCam.position[0], povCam.position[1], povCam.position[2]);
            cameraRef.current.lookAt(povCam.target[0], povCam.target[1], povCam.target[2]);
          }
        } else {
          // C. Standard Orbital Mode with Smooth Damped Lerp
          const lerpFactor = reducedMotionRef.current ? 1.0 : 0.08;
          sphericalRef.current.radius += (targetSphericalRef.current.radius - sphericalRef.current.radius) * lerpFactor;
          sphericalRef.current.theta += (targetSphericalRef.current.theta - sphericalRef.current.theta) * lerpFactor;
          sphericalRef.current.phi += (targetSphericalRef.current.phi - sphericalRef.current.phi) * lerpFactor;
          targetRef.current.lerp(desiredTargetRef.current, lerpFactor);
          updateCameraPosition();
        }

        // Standard Live Mode Rendering: Pulsing violated zones
        if (!reducedMotionRef.current) {
          pulseAngle += 0.05;
          zonesGroup.children.forEach((child) => {
            if (child.userData.isViolated && child instanceof THREE.Mesh) {
              const mat = child.material as THREE.MeshStandardMaterial;
              mat.opacity = 0.35 + 0.2 * Math.sin(pulseAngle);
            }
          });
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      isDisposed = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      themeObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      renderer.dispose();
      if (mountRef.current) mountRef.current.innerHTML = '';
    };
  }, [viewMode]);

  // 3B. Update Factory Building Shell & Equipment Layer
  useEffect(() => {
    if (!objectsGroupRef.current) return;
    populateEnvironmentObjects(objectsGroupRef.current, sceneModel, showEquipment, currentEnvConfig.category);
  }, [sceneModel, showEquipment, currentEnvConfig.category]);


  // Build Demo 3D Meshes
  const buildDemoMeshes = (group: THREE.Group) => {
    // 1. Synthetic Worker Avatar (Realistic 1.75m industrial worker with PPE)
    const workerGroup = createIndustrialWorkerAvatar(false);
    workerGroup.visible = false;
    group.add(workerGroup);
    demoWorkerMeshRef.current = workerGroup;

    // 2. Motion Trail Line
    const trailGeo = new THREE.BufferGeometry();
    const trailMat = new THREE.LineBasicMaterial({
      color: 0x00f5d4,
      linewidth: 3,
      transparent: true,
      opacity: 0.85,
    });
    const trailLine = new THREE.Line(trailGeo, trailMat);
    trailLine.visible = false;
    group.add(trailLine);
    demoTrailLineRef.current = trailLine;

    // 3. Camera Scan Frustum Plane
    const scanGeo = new THREE.PlaneGeometry(8, 4);
    const scanMat = new THREE.MeshBasicMaterial({
      color: 0x00f5d4,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
    });
    const scanMesh = new THREE.Mesh(scanGeo, scanMat);
    scanMesh.rotation.x = -Math.PI / 2;
    scanMesh.position.set(17.0, 2.2, 12.0);
    scanMesh.visible = false;
    group.add(scanMesh);
    demoScanFrustumRef.current = scanMesh;

    // 4. Breach Alarm Beacon Ring
    const beaconGeo = new THREE.TorusGeometry(3.2, 0.08, 12, 32);
    const beaconMat = new THREE.MeshBasicMaterial({
      color: 0xff0044,
      transparent: true,
      opacity: 0.9,
    });
    const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
    beaconMesh.rotation.x = -Math.PI / 2;
    beaconMesh.position.set(17.0, 4.2, 13.5);
    beaconMesh.visible = false;
    group.add(beaconMesh);
    demoBeaconRingRef.current = beaconMesh;
  };

  // Camera Orbit calculations
  const updateCameraPosition = () => {
    if (!cameraRef.current) return;
    const { radius, theta, phi } = sphericalRef.current;
    const target = targetRef.current;

    cameraRef.current.position.x = target.x + radius * Math.sin(phi) * Math.sin(theta);
    cameraRef.current.position.y = target.y + radius * Math.cos(phi);
    cameraRef.current.position.z = target.z + radius * Math.sin(phi) * Math.cos(theta);
    cameraRef.current.lookAt(target);
  };

  // Raycasting for Hover Tooltip & Selection
  const handlePointerMove = (e: React.MouseEvent) => {
    if (!mountRef.current || !cameraRef.current || !sceneRef.current) return;

    // Orbit / Look Dragging
    if (isDraggingRef.current) {
      const dx = e.clientX - prevMouseRef.current.x;
      const dy = e.clientY - prevMouseRef.current.y;
      prevMouseRef.current = { x: e.clientX, y: e.clientY };

      if (isWalkthroughRef.current) {
        const lookSpeed = reducedMotionRef.current ? 0.0025 : 0.0045;
        walkthroughYawRef.current -= dx * lookSpeed;
        walkthroughPitchRef.current = Math.max(
          -1.3,
          Math.min(1.3, walkthroughPitchRef.current - dy * lookSpeed)
        );
        setHoveredInfo(null);
        return;
      } else if (cameraPovIdRef.current) {
        // Exits fixed camera POV back into orbit when dragged
        setCameraPovId(null);
      } else {
        if (e.buttons === 1) {
          sphericalRef.current.theta -= dx * 0.007;
          sphericalRef.current.phi = Math.max(
            0.1,
            Math.min(Math.PI / 2 - 0.05, sphericalRef.current.phi - dy * 0.007)
          );
          targetSphericalRef.current.theta = sphericalRef.current.theta;
          targetSphericalRef.current.phi = sphericalRef.current.phi;
        } else if (e.buttons === 2) {
          const panSpeed = 0.06;
          targetRef.current.x -= dx * panSpeed * Math.cos(sphericalRef.current.theta);
          targetRef.current.z += dx * panSpeed * Math.sin(sphericalRef.current.theta);
          targetRef.current.x += dy * panSpeed * Math.sin(sphericalRef.current.theta);
          targetRef.current.z += dy * panSpeed * Math.cos(sphericalRef.current.theta);
          desiredTargetRef.current.copy(targetRef.current);
        }
        updateCameraPosition();
      }
      setHoveredInfo(null);
      return;
    }

    // Hover Raycasting
    const rect = mountRef.current.getBoundingClientRect();
    mouseNDCRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseNDCRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(mouseNDCRef.current, cameraRef.current);

    const interactables: THREE.Object3D[] = [];
    if (objectsGroupRef.current) interactables.push(...objectsGroupRef.current.children);
    if (zonesGroupRef.current) interactables.push(...zonesGroupRef.current.children);
    if (cameraConesGroupRef.current) interactables.push(...cameraConesGroupRef.current.children);
    if (workersGroupRef.current) interactables.push(...workersGroupRef.current.children);

    const hits = raycasterRef.current.intersectObjects(interactables, true);

    for (const h of hits) {
      const hit = h.object;
      if (hit.userData && hit.userData.item) {
        const item = hit.userData.item;
        mountRef.current.style.cursor = 'pointer';
        setHoveredInfo({
          name: item.name || item.camera_id || item.zone_id || (item.track_id ? `Worker #${item.track_id}` : 'Object'),
          type: (hit.userData.type || 'ELEMENT').toUpperCase(),
          details: item.status || item.zone_type || item.category || (item.in_violation ? 'BREACH DETECTED' : 'CLEAR'),
          screenX: e.clientX,
          screenY: e.clientY,
        });
        return;
      }
    }

    mountRef.current.style.cursor = 'grab';
    setHoveredInfo(null);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    prevMouseRef.current = { x: e.clientX, y: e.clientY };
    dragStartRef.current = { x: e.clientX, y: e.clientY };

    if (isWalkthroughRef.current && mountRef.current && document.pointerLockElement !== mountRef.current) {
      mountRef.current.requestPointerLock?.();
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    isDraggingRef.current = false;
    const dx = Math.abs(e.clientX - dragStartRef.current.x);
    const dy = Math.abs(e.clientY - dragStartRef.current.y);

    // If mouse didn't drag, treat as click selection
    if (dx < 4 && dy < 4) {
      handleSceneClick(e);
    }
  };

  const handleSceneClick = (e: React.MouseEvent) => {
    if (isWalkthroughRef.current) return;
    if (!mountRef.current || !cameraRef.current) return;
    const rect = mountRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycasterRef.current.setFromCamera(mouse, cameraRef.current);

    const interactables: THREE.Object3D[] = [];
    if (objectsGroupRef.current) interactables.push(...objectsGroupRef.current.children);
    if (zonesGroupRef.current) interactables.push(...zonesGroupRef.current.children);
    if (cameraConesGroupRef.current) interactables.push(...cameraConesGroupRef.current.children);
    if (workersGroupRef.current) interactables.push(...workersGroupRef.current.children);

    const hits = raycasterRef.current.intersectObjects(interactables, true);

    let selectedAny = false;
    for (const h of hits) {
      const hit = h.object;
      const type = hit.userData?.type;
      const item = hit.userData?.item;

      if (item && type) {
        setIsWalkthrough(false);
        setCameraPovId(null);

        if (type === 'camera') {
          setSelectedCamera(item);
          setSelectedZone(null);
          setSelectedEquipment(null);
          targetSphericalRef.current = { radius: 18, theta: Math.PI / 3, phi: 1.15 };
          desiredTargetRef.current = new THREE.Vector3(item.position[0], item.position[1], item.position[2]);
        } else if (type === 'zone') {
          setSelectedZone(item);
          setSelectedCamera(null);
          setSelectedEquipment(null);
          const pts = item.polygon_meters || [];
          if (pts.length > 0) {
            const avgX = pts.reduce((a: number, p: number[]) => a + p[0], 0) / pts.length;
            const avgZ = pts.reduce((a: number, p: number[]) => a + p[1], 0) / pts.length;
            desiredTargetRef.current = new THREE.Vector3(avgX, 1.0, avgZ);
            targetSphericalRef.current = { radius: 24, theta: Math.PI / 4, phi: 1.15 };
          }
        } else if (type === 'equipment') {
          setSelectedEquipment(item);
          setSelectedCamera(null);
          setSelectedZone(null);
          if (item.position) {
            desiredTargetRef.current = new THREE.Vector3(item.position[0], 1.5, item.position[2]);
            targetSphericalRef.current = { radius: 20, theta: Math.PI / 3.5, phi: 1.1 };
          }
        }
        selectedAny = true;
        break;
      }
    }

    if (!selectedAny) {
      setSelectedCamera(null);
      setSelectedZone(null);
      setSelectedEquipment(null);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (isWalkthroughRef.current) return;
    targetSphericalRef.current.radius = Math.max(
      12,
      Math.min(180, targetSphericalRef.current.radius + e.deltaY * 0.08)
    );
    if (reducedMotionRef.current) {
      sphericalRef.current.radius = targetSphericalRef.current.radius;
      updateCameraPosition();
    }
  };

  // 4. Update 3D Safety Zones Layer
  useEffect(() => {
    if (!zonesGroupRef.current || !sceneModel) return;
    populateSafetyZones(zonesGroupRef.current, sceneModel, showZones, violatedZoneIds);
  }, [sceneModel, showZones, violatedZoneIds]);

  // 5. Update Camera Cones & Realistic CCTV Models Layer
  useEffect(() => {
    if (!cameraConesGroupRef.current || !sceneModel) return;
    populateCameraCones(cameraConesGroupRef.current, sceneModel, showCoverage);
  }, [sceneModel, showCoverage]);

  // 6. Update Real-Time Live Worker Tracking Layer
  useEffect(() => {
    if (!workersGroupRef.current) return;
    const group = workersGroupRef.current;
    group.clear();

    if (!showTracks || isDemoMode) return;

    liveTracks.forEach((marker) => {
      const avatar = createIndustrialWorkerAvatar(marker.in_violation);
      avatar.position.set(marker.world_x, 0, marker.world_z);

      // Trajectory path line
      if (marker.trail && marker.trail.length >= 2) {
        const points = marker.trail.map(([tx, tz]) => new THREE.Vector3(tx, 0.04, tz));
        const trailGeo = new THREE.BufferGeometry().setFromPoints(points);
        const trailMat = new THREE.LineBasicMaterial({
          color: marker.in_violation ? 0xff0044 : 0x00f5d4,
          linewidth: 2,
          transparent: true,
          opacity: 0.75,
        });
        group.add(new THREE.Line(trailGeo, trailMat));
      }

      avatar.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.userData = { type: 'worker', item: marker };
        }
      });
      avatar.userData = { type: 'worker', item: marker };
      group.add(avatar);
    });
  }, [liveTracks, showTracks, isDemoMode]);

  // 7. Update Spatial Density Heatmap Layer
  useEffect(() => {
    if (!densityGroupRef.current) return;
    const group = densityGroupRef.current;
    group.clear();

    if (!showDensityHeatmap || isDemoMode) return;

    liveTracks.forEach((marker) => {
      // Base glowing circular disc on floor
      const discGeo = new THREE.CircleGeometry(2.2, 24);
      discGeo.rotateX(-Math.PI / 2);
      const discMat = new THREE.MeshBasicMaterial({
        color: marker.in_violation ? 0xff1744 : 0x00f0ff,
        transparent: true,
        opacity: 0.38,
        depthWrite: false,
      });
      const discMesh = new THREE.Mesh(discGeo, discMat);
      discMesh.position.set(marker.world_x, 0.02, marker.world_z);
      group.add(discMesh);

      // Outer gradient boundary ring
      const ringGeo = new THREE.RingGeometry(2.2, 3.2, 24);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: marker.in_violation ? 0xff5252 : 0x26c6da,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.set(marker.world_x, 0.02, marker.world_z);
      group.add(ringMesh);
    });
  }, [liveTracks, showDensityHeatmap, isDemoMode]);

  // Keyboard Shortcuts for Demo Mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isDemoModeRef.current) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlayPauseDemo();
      } else if (e.code === 'Escape') {
        e.preventDefault();
        handleExitDemo();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleNextScene();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handlePrevScene();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Demo Control Handlers
  const handleStartDemo = () => {
    setIsDemoMode(true);
    setDemoStatus('playing');
    setDemoElapsed(0.0);
    demoElapsedRef.current = 0.0;
    setDemoAcknowledged(false);
    setDemoEscalated(false);
    lastFrameTimeRef.current = performance.now();
  };

  const togglePlayPauseDemo = () => {
    if (demoStatus === 'playing') {
      setDemoStatus('paused');
    } else {
      setDemoStatus('playing');
      lastFrameTimeRef.current = performance.now();
    }
  };

  const handleRestartDemo = () => {
    setDemoElapsed(0.0);
    demoElapsedRef.current = 0.0;
    setDemoStatus('playing');
    setDemoAcknowledged(false);
    setDemoEscalated(false);
    lastFrameTimeRef.current = performance.now();
  };

  const handleExitDemo = () => {
    setIsDemoMode(false);
    setDemoStatus('paused');
    setDemoElapsed(0.0);
    demoElapsedRef.current = 0.0;
    if (demoWorkerMeshRef.current) demoWorkerMeshRef.current.visible = false;
    if (demoTrailLineRef.current) demoTrailLineRef.current.visible = false;
    if (demoScanFrustumRef.current) demoScanFrustumRef.current.visible = false;
    if (demoBeaconRingRef.current) demoBeaconRingRef.current.visible = false;
    resetCamera();
  };

  const handleSeekDemo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setDemoElapsed(newTime);
    demoElapsedRef.current = newTime;
    if (demoStatus === 'completed') {
      setDemoStatus('playing');
    }
  };

  const activeDemoScenes = currentEnvConfig.demoScenarios || DEMO_SCENES;

  const handleNextScene = () => {
    const current = activeDemoScenes.find((s) => demoElapsed >= s.startTime && demoElapsed < s.endTime);
    if (current && current.index < activeDemoScenes.length - 1) {
      const nextTime = activeDemoScenes[current.index + 1].startTime;
      setDemoElapsed(nextTime);
      demoElapsedRef.current = nextTime;
    }
  };

  const handlePrevScene = () => {
    const current = activeDemoScenes.find((s) => demoElapsed >= s.startTime && demoElapsed < s.endTime);
    if (current && current.index > 0) {
      const prevTime = activeDemoScenes[current.index - 1].startTime;
      setDemoElapsed(prevTime);
      demoElapsedRef.current = prevTime;
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const resetCamera = () => {
    setIsWalkthrough(false);
    setCameraPovId(null);
    targetSphericalRef.current = { radius: 70, theta: Math.PI / 4, phi: Math.PI / 3 };
    desiredTargetRef.current = new THREE.Vector3(30, 0, 20);
    if (reducedMotion) {
      sphericalRef.current = { ...targetSphericalRef.current };
      targetRef.current.copy(desiredTargetRef.current);
      updateCameraPosition();
    }
  };

  const setCameraPreset = (preset: 'overview' | 'robotics' | 'cnc' | 'logistics' | 'forklift') => {
    setIsWalkthrough(false);
    setCameraPovId(null);
    if (preset === 'overview') {
      targetSphericalRef.current = { radius: 75, theta: Math.PI / 4, phi: Math.PI / 3.2 };
      desiredTargetRef.current = new THREE.Vector3(30, 0, 20);
    } else if (preset === 'robotics') {
      targetSphericalRef.current = { radius: 24, theta: 0.8, phi: 1.1 };
      desiredTargetRef.current = new THREE.Vector3(17, 1.5, 12);
    } else if (preset === 'cnc') {
      targetSphericalRef.current = { radius: 24, theta: 1.9, phi: 1.1 };
      desiredTargetRef.current = new THREE.Vector3(15, 1.5, 28);
    } else if (preset === 'logistics') {
      targetSphericalRef.current = { radius: 28, theta: 2.5, phi: 1.05 };
      desiredTargetRef.current = new THREE.Vector3(32, 1.5, 22);
    } else if (preset === 'forklift') {
      targetSphericalRef.current = { radius: 22, theta: 2.8, phi: 1.1 };
      desiredTargetRef.current = new THREE.Vector3(52, 1.5, 32);
    }
    if (reducedMotion) {
      sphericalRef.current = { ...targetSphericalRef.current };
      targetRef.current.copy(desiredTargetRef.current);
      updateCameraPosition();
    }
  };


  // Helper formatting for seconds to MM:SS
  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Identify active demo scene
  const activeDemoScene: DemoScene =
    activeDemoScenes.find((s) => demoElapsed >= s.startTime && demoElapsed < s.endTime) ||
    activeDemoScenes[activeDemoScenes.length - 1];

  const activeDemoIncident = useMemo(
    () => getDemoIncidentPayload(currentEnvConfig.category),
    [currentEnvConfig.category]
  );

  return (
    <div
      ref={containerRef}
      className="digital-twin-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: isFullscreen ? '100vh' : 'calc(100vh - 72px)',
        background: 'var(--bg-main)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* WebGL Hardware Error Fallback */}
      {lifecycleState === 'error' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(6, 9, 19, 0.95)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 70,
            gap: '16px',
            padding: '24px',
            textAlign: 'center',
          }}
        >
          <AlertTriangle size={42} color="var(--status-danger)" />
          <h3 style={{ color: 'var(--text-primary)', fontSize: '18px', fontWeight: 700, margin: 0 }}>
            WebGL Hardware Acceleration Unavailable
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', maxWidth: '440px', margin: 0, lineHeight: 1.5 }}>
            {error || 'Unable to initialize 3D WebGL context on this device. You can immediately access the full factory layout using the 2D SVG Floor Plan view.'}
          </p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              onClick={() => setViewMode('2D')}
              style={{
                background: 'var(--accent-cyan)',
                color: '#060913',
                border: 'none',
                padding: '8px 18px',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Switch to 2D Floor Plan
            </button>
            <button
              onClick={() => {
                setError(null);
                setLifecycleState('connecting_backend');
                setRetryCounter((c) => c + 1);
              }}
              style={{
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                padding: '8px 18px',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              Retry WebGL
            </button>
          </div>
        </div>
      )}


      {/* Error Alert Banner */}
      {error && (
        <div
          style={{
            position: 'absolute',
            top: '60px',
            left: '20px',
            right: '20px',
            background: 'rgba(239, 68, 68, 0.2)',
            border: '1px solid var(--status-danger)',
            color: 'var(--text-primary)',
            padding: '10px 16px',
            borderRadius: '6px',
            zIndex: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ============================================================== */}
      {/* TOP HEADER / TOOLBAR (Standard vs Cinematic Demo HUD)        */}
      {/* ============================================================== */}
      {!isDemoMode ? (
        /* STANDARD OPERATIONS TOOLBAR */
        <div
          className="twin-toolbar"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 20px',
            background: 'var(--bg-surface)',
            borderBottom: '1px solid var(--border-subtle)',
            zIndex: 20,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          {/* Left: Branding, 3D/2D, Floors, and Prominent Start Twin Demo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: 'var(--accent-cyan)',
                fontWeight: 700,
                fontSize: '14px',
                letterSpacing: '0.5px',
              }}
            >
              <Activity size={18} />
              <span>DIGITAL TWIN</span>
            </div>

            {/* Multi-Environment Selector Dropdown */}
            <select
              id="twin-env-switcher"
              value={activeEnvId}
              onChange={(e) => {
                const nextEnv = e.target.value;
                setActiveEnvId(nextEnv);
                if (isWalkthroughRef.current) {
                  setIsWalkthrough(false);
                  if (document.pointerLockElement) {
                    document.exitPointerLock?.();
                  }
                }
                setCameraPovId(null);
                setSelectedCamera(null);
                setSelectedZone(null);
                setSelectedEquipment(null);
                const nextCfg = getEnvironmentById(nextEnv);
                const floorW = nextCfg.sceneModel.dimensions.width_meters;
                const floorD = nextCfg.sceneModel.dimensions.depth_meters;
                desiredTargetRef.current = new THREE.Vector3(floorW / 2, 0, floorD / 2);
                targetSphericalRef.current = { radius: Math.max(floorW, floorD) * 1.15, theta: Math.PI / 4, phi: Math.PI / 3 };
                if (onEnvironmentChange) onEnvironmentChange(nextEnv);
              }}
              style={{
                background: 'var(--bg-card)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                padding: '5px 10px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Switch active industrial digital twin environment"
            >
              {ALL_ENVIRONMENTS.map((env) => (
                <option key={env.id} value={env.id}>
                  {env.name}
                </option>
              ))}
            </select>

            {onNavigateToCenter && (
              <button
                id="btn-return-twin-center"
                onClick={onNavigateToCenter}
                style={{
                  background: 'var(--bg-card)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  padding: '5px 10px',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
                title="Return to Digital Twin Center catalog"
              >
                <Compass size={13} color="var(--accent-cyan)" />
                <span>Twin Center</span>
              </button>
            )}

            <div style={{ height: '18px', width: '1px', background: 'var(--border-card)' }} />

            {/* 3D vs 2D Switcher */}
            <div style={{ display: 'flex', background: 'var(--bg-card)', borderRadius: '6px', padding: '2px', border: '1px solid var(--border-subtle)' }}>
              <button
                onClick={() => setViewMode('3D')}
                style={{
                  background: viewMode === '3D' ? 'var(--accent-cyan)' : 'transparent',
                  color: viewMode === '3D' ? '#060913' : 'var(--text-secondary)',
                  border: 'none',
                  padding: '5px 12px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                3D Spatial View
              </button>
              <button
                onClick={() => setViewMode('2D')}
                style={{
                  background: viewMode === '2D' ? 'var(--accent-cyan)' : 'transparent',
                  color: viewMode === '2D' ? '#060913' : 'var(--text-secondary)',
                  border: 'none',
                  padding: '5px 12px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                2D Floor Plan
              </button>
            </div>

            {/* Floor Selector */}
            {sceneModel && (
              <select
                value={selectedFloor}
                onChange={(e) => setSelectedFloor(e.target.value)}
                style={{
                  background: 'var(--bg-card)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '6px',
                  padding: '5px 10px',
                  fontSize: '12px',
                  fontWeight: 500,
                }}
              >
                {sceneModel.floors.map((fl) => (
                  <option key={fl.id} value={fl.id}>
                    {fl.name}
                  </option>
                ))}
              </select>
            )}

            {/* PROMINENT START TWIN DEMO BUTTON */}
            <button
              onClick={handleStartDemo}
              id="btn-start-twin-demo"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'linear-gradient(135deg, var(--accent-cyan) 0%, var(--accent-blue) 100%)',
                color: '#060913',
                fontWeight: 700,
                fontSize: '12px',
                padding: '6px 16px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                boxShadow: 'var(--shadow-glow-cyan)',
                transition: 'transform 0.15s ease, filter 0.15s ease',
              }}
              title="Launch cinematic guided 3D factory demonstration"
            >
              <Play size={13} fill="#060913" />
              <span>Start Twin Demo</span>
              <Sparkles size={13} />
            </button>
          </div>

          {/* Right: Operational Status & Replay */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {lifecycleState === 'connecting_backend' ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 12px',
                  background: 'rgba(56, 189, 248, 0.15)',
                  color: 'var(--accent-cyan)',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                <Activity size={13} className="animate-spin" />
                <span>SYNCING BACKEND...</span>
              </div>
            ) : lifecycleState === 'ready_disconnected' || isOfflineFallback ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '5px 12px',
                    background: 'rgba(245, 158, 11, 0.18)',
                    color: 'var(--status-warning)',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                  title="Edge backend offline or unreachable. Demonstrating using local factory model baseline."
                >
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--status-warning)' }} />
                  <span>OFFLINE (LOCAL MODEL)</span>
                </div>
                <button
                  onClick={() => setRetryCounter((c) => c + 1)}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--accent-cyan)',
                    padding: '5px 10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontWeight: 600,
                  }}
                  title="Retry connecting to edge backend API and WebSocket"
                >
                  <RotateCcw size={12} />
                  <span>Retry Sync</span>
                </button>
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 12px',
                  background: isReplayMode ? 'rgba(245, 158, 11, 0.18)' : 'rgba(16, 185, 129, 0.18)',
                  color: isReplayMode ? 'var(--status-warning)' : 'var(--status-success)',
                  border: `1px solid ${isReplayMode ? 'rgba(245, 158, 11, 0.35)' : 'rgba(16, 185, 129, 0.35)'}`,
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                <Radio size={13} className={isReplayMode ? '' : 'animate-pulse'} />
                <span>{isReplayMode ? 'HISTORICAL REPLAY' : 'REAL-TIME LIVE'}</span>
              </div>
            )}


            <button
              onClick={() => {
                const next = !isReplayMode;
                setIsReplayMode(next);
                if (next) {
                  fetchReplayTimeline().then((res) => setReplayEvents(res.timeline || []));
                }
              }}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Clock size={13} />
              <span>{isReplayMode ? 'Return to Live' : 'Replay Timeline'}</span>
            </button>

            {/* Audible Safety Alert Toggle Button */}
            <button
              onClick={() => {
                const nextMuted = audioAlertEngine.toggleMute();
                setIsAudioMuted(nextMuted);
              }}
              title={isAudioMuted ? 'Safety audio alarms are MUTED. Click to enable sound.' : 'Safety audio alarms are ACTIVE. Click to mute.'}
              style={{
                background: isAudioMuted ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                border: `1px solid ${isAudioMuted ? 'rgba(239, 68, 68, 0.35)' : 'rgba(16, 185, 129, 0.35)'}`,
                color: isAudioMuted ? 'var(--status-critical, #ef4444)' : 'var(--status-success, #10b981)',
                padding: '5px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                fontWeight: 600,
              }}
            >
              {isAudioMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
              <span>{isAudioMuted ? 'Alarms Muted' : 'Alarms Active'}</span>
            </button>
          </div>
        </div>
      ) : (
        /* CINEMATIC DEMO HUD TOPBAR */
        <div className="demo-hud-topbar" id="demo-cinematic-hud">
          {/* Top Row: Scene Info, Status Badge, and Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            {/* Scene Info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="demo-sim-badge">
                <span className="pulse-dot" style={{ backgroundColor: 'var(--status-warning)' }} />
                <span>Simulation Demo Mode</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.4px' }}>
                  SCENE {activeDemoScene.number}/6: {activeDemoScene.title.toUpperCase()}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  {activeDemoScene.subtitle}
                </span>
              </div>
            </div>

            {/* Control Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Prev Scene */}
              <button
                onClick={handlePrevScene}
                disabled={activeDemoScene.index === 0}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  padding: '5px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  opacity: activeDemoScene.index === 0 ? 0.4 : 1,
                }}
                title="Previous Scene (Left Arrow)"
              >
                <ChevronLeft size={14} />
              </button>

              {/* Play / Pause */}
              <button
                onClick={togglePlayPauseDemo}
                id="btn-demo-play-pause"
                style={{
                  background: 'var(--accent-cyan)',
                  color: '#060913',
                  border: 'none',
                  padding: '6px 14px',
                  borderRadius: '4px',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
                title="Pause / Resume (Spacebar)"
              >
                {demoStatus === 'playing' ? <Pause size={13} fill="#060913" /> : <Play size={13} fill="#060913" />}
                <span>{demoStatus === 'playing' ? 'Pause' : 'Resume'}</span>
              </button>

              {/* Next Scene */}
              <button
                onClick={handleNextScene}
                disabled={activeDemoScene.index === DEMO_SCENES.length - 1}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  padding: '5px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  opacity: activeDemoScene.index === DEMO_SCENES.length - 1 ? 0.4 : 1,
                }}
                title="Next Scene (Right Arrow)"
              >
                <ChevronRight size={14} />
              </button>

              {/* Speed Selector */}
              <select
                value={demoSpeed}
                onChange={(e) => setDemoSpeed(parseFloat(e.target.value))}
                style={{
                  background: 'var(--bg-card)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '4px',
                  padding: '4px 6px',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <option value={0.5}>0.5x Speed</option>
                <option value={1.0}>1.0x Speed</option>
                <option value={1.5}>1.5x Speed</option>
              </select>

              {/* Restart */}
              <button
                onClick={handleRestartDemo}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                  padding: '5px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
                title="Restart Demo (R)"
              >
                <RotateCcw size={14} />
              </button>

              {/* Fullscreen */}
              <button
                onClick={toggleFullscreen}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                  padding: '5px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
                title="Toggle Fullscreen (F)"
              >
                {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
              </button>

              {/* Exit Demo */}
              <button
                onClick={handleExitDemo}
                id="btn-exit-demo"
                style={{
                  background: 'rgba(239, 68, 68, 0.2)',
                  border: '1px solid var(--status-danger)',
                  color: 'var(--status-danger)',
                  padding: '5px 12px',
                  borderRadius: '4px',
                  fontWeight: 600,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
                title="Exit Demo (Esc)"
              >
                Exit Demo
              </button>
            </div>
          </div>

          {/* Bottom Row: Multi-Segment Scrubbable Timeline Track */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--accent-cyan)', minWidth: 40 }}>
              {formatSeconds(demoElapsed)}
            </span>

            <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
              <input
                type="range"
                min={0}
                max={DEMO_TOTAL_DURATION}
                step={0.1}
                value={demoElapsed}
                onChange={handleSeekDemo}
                className="demo-timeline-slider"
                id="demo-progress-slider"
              />
            </div>

            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', minWidth: 40 }}>
              {formatSeconds(DEMO_TOTAL_DURATION)}
            </span>
          </div>

          {/* Scene Segment Markers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center' }}>
            {DEMO_SCENES.map((s) => (
              <div
                key={s.id}
                onClick={() => {
                  setDemoElapsed(s.startTime);
                  demoElapsedRef.current = s.startTime;
                }}
                style={{
                  cursor: 'pointer',
                  padding: '2px 0',
                  borderRadius: '3px',
                  background: activeDemoScene.id === s.id ? 'rgba(0, 245, 212, 0.15)' : 'transparent',
                  color: activeDemoScene.id === s.id ? 'var(--accent-cyan)' : 'var(--text-muted)',
                  fontWeight: activeDemoScene.id === s.id ? 700 : 500,
                  borderBottom: `2px solid ${activeDemoScene.id === s.id ? 'var(--accent-cyan)' : 'transparent'}`,
                  transition: 'all 0.15s ease',
                }}
              >
                {s.number}. {s.title.split(' ')[0]}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* SPATIAL 3D VIEWPORT & IN-SCENE HUD OVERLAYS                    */}
      {/* ============================================================== */}
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        {/* Layer Visibility Floater (hidden in demo mode to keep presentation clean) */}
        {!isDemoMode && (
          <div
            style={{
              position: 'absolute',
              top: '16px',
              left: '16px',
              background: 'var(--bg-card)',
              backdropFilter: 'blur(10px)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              padding: '12px 16px',
              zIndex: 20,
              boxShadow: 'var(--shadow-card)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              fontSize: '12px',
              color: 'var(--text-primary)',
            }}
          >
            <div
              style={{
                fontWeight: 700,
                color: 'var(--text-secondary)',
                marginBottom: '2px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              <Layers size={14} color="var(--accent-cyan)" />
              <span>VISIBILITY LAYERS</span>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={showZones} onChange={(e) => setShowZones(e.target.checked)} />
              <span>Safety Zones</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={showCoverage} onChange={(e) => setShowCoverage(e.target.checked)} />
              <span>Camera FOV Cones</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={showEquipment} onChange={(e) => setShowEquipment(e.target.checked)} />
              <span>Equipment Footprints</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={showTracks} onChange={(e) => setShowTracks(e.target.checked)} />
              <span>Live Worker Tracks ({liveTracks.size})</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showDensityHeatmap}
                onChange={(e) => setShowDensityHeatmap(e.target.checked)}
              />
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Flame size={12} color="var(--accent-orange, #f59e0b)" />
                <span>Worker Density Heatmap</span>
              </span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!isAudioMuted}
                onChange={() => {
                  const nextMuted = audioAlertEngine.toggleMute();
                  setIsAudioMuted(nextMuted);
                }}
              />
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                {!isAudioMuted ? <Volume2 size={12} color="var(--status-success)" /> : <VolumeX size={12} color="var(--text-muted)" />}
                <span>Audible Safety Alarms</span>
              </span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={reducedMotion} onChange={(e) => setReducedMotion(e.target.checked)} />
              <span>Reduced Motion</span>
            </label>

            <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '4px 0' }} />

            {/* Camera View Presets */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>
                Camera Vantage Presets
              </span>
              <button
                onClick={resetCamera}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-cyan)',
                  fontSize: '10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                  padding: 0,
                  fontWeight: 600,
                }}
                title="Reset to default isometric overview"
              >
                <Compass size={11} />
                <span>Reset</span>
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginTop: '2px' }}>
              <button
                onClick={() => setCameraPreset('overview')}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                  padding: '4px 6px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Isometric
              </button>
              <button
                onClick={() => setCameraPreset('robotics')}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                  padding: '4px 6px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Robotic Bay
              </button>
              <button
                onClick={() => setCameraPreset('cnc')}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                  padding: '4px 6px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                CNC Center
              </button>
              <button
                onClick={() => setCameraPreset('logistics')}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                  padding: '4px 6px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Logistics Line
              </button>
              <button
                onClick={() => setCameraPreset('forklift')}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                  padding: '4px 6px',
                  borderRadius: '4px',
                  fontSize: '10px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  gridColumn: 'span 2',
                }}
              >
                Forklift & Staging
              </button>
            </div>

            <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '4px 0' }} />

            {/* First-Person Walkthrough Mode Button */}
            <button
              onClick={() => {
                const next = !isWalkthrough;
                setIsWalkthrough(next);
                setCameraPovId(null);
                if (next) {
                  const spawn = getEnvironmentSpawnPoint(currentEnvConfig.category, sceneModel);
                  walkthroughPosRef.current = spawn.position.clone();
                  walkthroughYawRef.current = spawn.yaw;
                  walkthroughPitchRef.current = spawn.pitch;
                  setWalkthroughCoords({
                    x: Number(spawn.position.x.toFixed(2)),
                    y: 1.75,
                    z: Number(spawn.position.z.toFixed(2)),
                    yawDeg: Math.round((((spawn.yaw * 180) / Math.PI) % 360 + 360) % 360),
                  });
                }
              }}
              style={{
                background: isWalkthrough ? 'rgba(56, 189, 248, 0.25)' : 'var(--bg-card)',
                border: `1px solid ${isWalkthrough ? 'var(--accent-cyan)' : 'var(--border-subtle)'}`,
                color: isWalkthrough ? 'var(--accent-cyan)' : 'var(--text-primary)',
                padding: '5px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                justifyContent: 'center',
                fontWeight: 600,
                transition: 'all 0.15s ease',
              }}
              title="Walk through facility at 1.75m eye level using WASD or arrow keys"
            >
              <Footprints size={13} />
              <span>{isWalkthrough ? 'Exit Walkthrough Mode' : 'First-Person Walkthrough'}</span>
            </button>

            {/* Camera-to-Camera POV Navigation */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '2px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>
                Camera Viewpoints (POV)
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '3px' }}>
                {sceneModel.cameras.map((cam) => {
                  const isActive = cameraPovId === cam.camera_id;
                  return (
                    <button
                      key={cam.camera_id}
                      onClick={() => {
                        if (isActive) {
                          setCameraPovId(null);
                        } else {
                          setIsWalkthrough(false);
                          setCameraPovId(cam.camera_id);
                        }
                      }}
                      style={{
                        background: isActive ? 'rgba(16, 185, 129, 0.22)' : 'var(--bg-card)',
                        border: `1px solid ${isActive ? 'var(--status-success)' : 'var(--border-subtle)'}`,
                        color: isActive ? 'var(--status-success)' : 'var(--text-secondary)',
                        padding: '3px 6px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontWeight: 600,
                      }}
                      title={`Jump to optical viewpoint of ${cam.name}`}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Camera size={11} />
                        <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {cam.camera_id}
                        </span>
                      </div>
                      <span
                        style={{
                          fontSize: '8px',
                          padding: '1px 4px',
                          borderRadius: '3px',
                          background: cam.status === 'LIVE' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(100, 116, 139, 0.3)',
                          color: cam.status === 'LIVE' ? '#34d399' : '#94a3b8',
                        }}
                      >
                        {cam.status}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '4px 0' }} />

            {/* Performance & Edge Telemetry */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-secondary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Zap size={11} color="var(--accent-cyan)" />
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {fps} FPS ({renderMs}ms)
                </span>
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  onClick={() => setShowDiagnostics(!showDiagnostics)}
                  style={{
                    background: showDiagnostics ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                    border: `1px solid ${showDiagnostics ? 'var(--accent-cyan)' : 'var(--border-subtle)'}`,
                    color: showDiagnostics ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                    padding: '2px 5px',
                    borderRadius: '3px',
                    fontSize: '9px',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                  title="Toggle WebGL Scene & Camera Dev Diagnostics Overlay"
                >
                  DIAG: {showDiagnostics ? 'ON' : 'OFF'}
                </button>
                <button
                  onClick={() => setIsLowPower(!isLowPower)}
                  style={{
                    background: isLowPower ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                    border: `1px solid ${isLowPower ? 'var(--status-warning)' : 'var(--border-subtle)'}`,
                    color: isLowPower ? 'var(--status-warning)' : 'var(--text-secondary)',
                    padding: '2px 5px',
                    borderRadius: '3px',
                    fontSize: '9px',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                  title="Toggle Low Power Mode for constrained edge hardware"
                >
                  {isLowPower ? 'LOW-PWR: ON' : 'ECO: OFF'}
                </button>
              </div>
            </div>
          </div>

        )}

        {/* Developer Diagnostics Overlay */}
        {showDiagnostics && viewMode === '3D' && (
          <div
            style={{
              position: 'absolute',
              top: '70px',
              left: '16px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-card)',
              borderRadius: '8px',
              padding: '12px 14px',
              zIndex: 35,
              width: '280px',
              fontSize: '10px',
              fontFamily: 'monospace',
              color: 'var(--text-secondary)',
              boxShadow: 'var(--shadow-card)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '4px' }}>
              <span style={{ fontWeight: 800, color: 'var(--accent-cyan)' }}>DEV DIAGNOSTICS</span>
              <button
                onClick={() => setShowDiagnostics(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11px' }}
              >
                ✕
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Renderer:</span>
              <span style={{ color: '#34d399', fontWeight: 600 }}>Active (r{THREE.REVISION})</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>WebGL Context:</span>
              <span style={{ color: rendererRef.current ? '#34d399' : '#ef4444', fontWeight: 600 }}>
                {rendererRef.current ? 'WebGL2 (Hardware)' : 'Context Lost'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Canvas Size:</span>
              <span style={{ color: 'var(--text-primary)' }}>
                {mountRef.current?.clientWidth || 0} x {mountRef.current?.clientHeight || 0} px
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Scene Objects:</span>
              <span style={{ color: 'var(--text-primary)' }}>
                {objectsGroupRef.current?.children.length || 0} meshes, {zonesGroupRef.current?.children.length || 0} zones
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Active Mode:</span>
              <span style={{ color: isWalkthrough ? 'var(--accent-cyan)' : cameraPovId ? '#f59e0b' : '#94a3b8', fontWeight: 700 }}>
                {isWalkthrough ? 'FIRST_PERSON_WALK' : cameraPovId ? `CCTV_POV (${cameraPovId})` : 'ORBITAL_INSPECT'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Eye Position:</span>
              <span style={{ color: 'var(--text-primary)' }}>
                [{walkthroughCoords.x}, 1.75, {walkthroughCoords.z}]
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Eye Heading:</span>
              <span style={{ color: 'var(--text-primary)' }}>{walkthroughCoords.yawDeg}°</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Pointer Lock:</span>
              <span style={{ color: isPointerLocked ? '#34d399' : '#94a3b8' }}>
                {isPointerLocked ? 'ENGAGED' : 'RELEASED'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Framerate:</span>
              <span style={{ color: fps >= 45 ? '#34d399' : '#f59e0b' }}>
                {fps} FPS ({renderMs} ms)
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Facility:</span>
              <span style={{ color: 'var(--text-primary)', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {currentEnvConfig.name}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Lifecycle / Data:</span>
              <span style={{ color: isOfflineFallback ? '#f59e0b' : '#34d399' }}>
                {isOfflineFallback ? 'OFFLINE_SYNTHETIC' : 'API_SYNCHRONIZED'}
              </span>
            </div>
          </div>
        )}

        {/* First-Person Walkthrough Live AI Agent Execution & Safety HUD */}
        {isWalkthrough && viewMode === '3D' && (
          <>
            {/* Active Hazard & Multi-Agent Execution Card */}
            {walkthroughSafety.isViolating && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '92px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 'min(780px, 94vw)',
                  background: 'var(--bg-surface)',
                  border: `2px solid ${walkthroughSafety.severity === 'CRITICAL' ? 'var(--status-danger)' : 'var(--status-warning)'}`,
                  borderRadius: '10px',
                  padding: '14px 18px',
                  zIndex: 35,
                  boxShadow: walkthroughSafety.severity === 'CRITICAL'
                    ? '0 12px 32px rgba(239, 68, 68, 0.28)'
                    : '0 12px 32px rgba(245, 158, 11, 0.28)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                {/* Breach Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span
                      style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        background: walkthroughSafety.severity === 'CRITICAL' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                        border: `1px solid ${walkthroughSafety.severity === 'CRITICAL' ? 'var(--status-danger)' : 'var(--status-warning)'}`,
                        color: walkthroughSafety.severity === 'CRITICAL' ? 'var(--status-danger)' : 'var(--status-warning)',
                        fontSize: '11px',
                        fontWeight: 800,
                        letterSpacing: '0.04em',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <AlertTriangle size={14} />
                      {walkthroughSafety.severity} SAFETY BREACH
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {walkthroughSafety.zoneName}
                    </span>
                    <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                      ({walkthroughSafety.ruleId})
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--accent-cyan)' }}>
                      Position: [{walkthroughCoords.x}m, {walkthroughCoords.z}m]
                    </span>
                    {walkthroughSafety.agentRunning && (
                      <span
                        style={{
                          fontSize: '11px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          color: 'var(--accent-cyan)',
                          fontWeight: 600,
                        }}
                      >
                        <Zap size={13} className="spin" />
                        AI Agent Analyzing...
                      </span>
                    )}
                  </div>
                </div>

                {/* 4-Stage Multi-Agent Bounded Execution DAG */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: '8px',
                    background: 'var(--bg-elevated)',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  {/* Stage A: Investigator */}
                  <div
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                        STAGE A: INVESTIGATOR
                      </span>
                      <Eye size={12} color="var(--accent-cyan)" />
                    </div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--status-success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={12} /> Grounded Evidence
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      Telemetry at [{walkthroughCoords.x}m, {walkthroughCoords.z}m] verified.
                    </div>
                  </div>

                  {/* Stage B: Policy Gate */}
                  <div
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                        STAGE B: POLICY GATE
                      </span>
                      <ShieldCheck size={12} color="var(--status-warning)" />
                    </div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--status-danger)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <ShieldAlert size={12} /> Rule Violation
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      Deterministic rule enforced: {walkthroughSafety.ruleId}
                    </div>
                  </div>

                  {/* Stage C: Responder */}
                  <div
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                        STAGE C: RESPONDER
                      </span>
                      <Bot size={12} color="var(--accent-purple)" />
                    </div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={12} /> {walkthroughSafety.agentRunning ? 'Dispatching Tools...' : 'Incident Dispatched'}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      {walkthroughSafety.agentResponse?.incident_id ? `ID: ${walkthroughSafety.agentResponse.incident_id.slice(0, 16)}...` : 'Auditable tools executed'}
                    </div>
                  </div>

                  {/* Stage D: Verifier */}
                  <div
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                        STAGE D: VERIFIER
                      </span>
                      <CheckCircle2 size={12} color="var(--status-success)" />
                    </div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--status-success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle2 size={12} /> {walkthroughSafety.agentResponse?.agent_state?.status || 'VERIFIED'}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      Tamper-evident DB audit trail recorded
                    </div>
                  </div>
                </div>

                {/* Action Links Row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', paddingTop: '4px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    {walkthroughSafety.agentResponse?.message || 'Spatial breach triggered AI agent reasoning layer.'}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {onNavigate && (
                      <>
                        <button
                          onClick={() => {
                            exitWalkthroughMode();
                            onNavigate('agent');
                          }}
                          style={{
                            background: 'var(--bg-card)',
                            border: '1px solid var(--accent-cyan)',
                            color: 'var(--accent-cyan)',
                            padding: '4px 10px',
                            borderRadius: '5px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                          }}
                          title="Open Agent Trace DAG Console"
                        >
                          <Bot size={12} />
                          Inspect Agent Trace
                          <ArrowRight size={11} />
                        </button>
                        <button
                          onClick={() => {
                            exitWalkthroughMode();
                            onNavigate('incidents');
                          }}
                          style={{
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-primary)',
                            padding: '4px 10px',
                            borderRadius: '5px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                          }}
                          title="View Incident Management Record"
                        >
                          Review Incident
                          <ExternalLink size={11} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* First-Person Walkthrough Control Bar Overlay */}
            <div
              style={{
                position: 'absolute',
                bottom: '24px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'var(--bg-surface)',
                border: `1px solid ${walkthroughSafety.isViolating ? (walkthroughSafety.severity === 'CRITICAL' ? 'var(--status-danger)' : 'var(--status-warning)') : 'var(--accent-cyan)'}`,
                borderRadius: '8px',
                padding: '10px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                zIndex: 30,
                boxShadow: 'var(--shadow-card)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Footprints size={18} color={walkthroughSafety.isViolating ? 'var(--status-danger)' : 'var(--accent-cyan)'} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Walkthrough Mode Active (Eye-Level 1.75m)
                    </span>
                    {walkthroughSafety.isViolating ? (
                      <span
                        style={{
                          fontSize: '9px',
                          padding: '1px 6px',
                          borderRadius: '3px',
                          background: 'rgba(239, 68, 68, 0.25)',
                          border: '1px solid var(--status-danger)',
                          color: '#ef4444',
                          fontWeight: 700,
                          letterSpacing: '0.03em',
                        }}
                      >
                        SAFETY BREACH ACTIVE
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: '9px',
                          padding: '1px 6px',
                          borderRadius: '3px',
                          background: 'rgba(16, 185, 129, 0.2)',
                          border: '1px solid var(--status-success)',
                          color: '#34d399',
                          fontWeight: 600,
                        }}
                      >
                        SAFE TRANSIT PATH
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: '9px',
                        padding: '1px 5px',
                        borderRadius: '3px',
                        background: isPointerLocked ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)',
                        border: `1px solid ${isPointerLocked ? 'var(--status-success)' : 'var(--status-warning)'}`,
                        color: isPointerLocked ? '#34d399' : '#fbbf24',
                        fontWeight: 600,
                      }}
                    >
                      {isPointerLocked ? 'MOUSE-LOOK LOCKED' : 'CLICK VIEWPORT TO LOCK'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                    <span>
                      Use <kbd style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-card)', padding: '1px 4px', borderRadius: '3px', color: 'var(--text-primary)' }}>W</kbd>{' '}
                      <kbd style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-card)', padding: '1px 4px', borderRadius: '3px', color: 'var(--text-primary)' }}>A</kbd>{' '}
                      <kbd style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-card)', padding: '1px 4px', borderRadius: '3px', color: 'var(--text-primary)' }}>S</kbd>{' '}
                      <kbd style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-card)', padding: '1px 4px', borderRadius: '3px', color: 'var(--text-primary)' }}>D</kbd> or Arrows to Walk • Mouse/Drag to Look
                    </span>
                    <span style={{ fontFamily: 'monospace', fontSize: '10px', color: walkthroughSafety.isViolating ? 'var(--status-danger)' : 'var(--accent-cyan)' }}>
                      X: {walkthroughCoords.x}m • Z: {walkthroughCoords.z}m • HDG: {walkthroughCoords.yawDeg}°
                    </span>
                  </div>
                </div>
              </div>

              {/* Virtual D-Pad buttons for mouse/click navigation */}
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  onMouseDown={() => { keysPressedRef.current['w'] = true; }}
                  onMouseUp={() => { keysPressedRef.current['w'] = false; }}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    padding: '5px 9px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                  title="Move Forward"
                >
                  Forward
                </button>
                <button
                  onMouseDown={() => { keysPressedRef.current['s'] = true; }}
                  onMouseUp={() => { keysPressedRef.current['s'] = false; }}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    padding: '5px 9px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                  title="Move Backward"
                >
                  Back
                </button>
                <button
                  onClick={() => {
                    const spawn = getEnvironmentSpawnPoint(currentEnvConfig.category, sceneModel);
                    walkthroughPosRef.current = spawn.position.clone();
                    walkthroughYawRef.current = spawn.yaw;
                    walkthroughPitchRef.current = spawn.pitch;
                    setWalkthroughCoords({
                      x: Number(spawn.position.x.toFixed(2)),
                      y: 1.75,
                      z: Number(spawn.position.z.toFixed(2)),
                      yawDeg: Math.round((((spawn.yaw * 180) / Math.PI) % 360 + 360) % 360),
                    });
                    checkWalkthroughSpatialSafety(spawn.position.x, spawn.position.z, Math.round((((spawn.yaw * 180) / Math.PI) % 360 + 360) % 360));
                  }}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-secondary)',
                    padding: '5px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  title="Reset avatar position to initial entrance spawn point"
                >
                  Reset Spawn
                </button>
              </div>

              <button
                onClick={() => {
                  exitWalkthroughMode();
                  const floorW = sceneModel.dimensions.width_meters || 60;
                  const floorD = sceneModel.dimensions.depth_meters || 40;
                  desiredTargetRef.current = new THREE.Vector3(floorW / 2, 0, floorD / 2);
                  targetSphericalRef.current = { radius: Math.max(floorW, floorD) * 1.15, theta: Math.PI / 4, phi: Math.PI / 3 };
                }}
                style={{
                  background: 'rgba(239, 68, 68, 0.2)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#ef4444',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Exit (ESC)
              </button>
            </div>
          </>
        )}

        {/* Camera POV Optical HUD Overlay */}
        {cameraPovId && viewMode === '3D' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              zIndex: 30,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              padding: '24px',
              border: '2px solid rgba(56, 189, 248, 0.3)',
              boxSizing: 'border-box',
            }}
          >
            {/* Top Bar: Camera Telemetry */}
            {(() => {
              const activeCam = sceneModel.cameras.find((c) => c.camera_id === cameraPovId);
              const isUnregistered = activeCam?.status === 'UNREGISTERED';
              return (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div
                    style={{
                      background: 'var(--bg-surface)',
                      padding: '8px 14px',
                      borderRadius: '6px',
                      border: `1px solid ${isUnregistered ? 'rgba(245, 158, 11, 0.4)' : 'rgba(56, 189, 248, 0.3)'}`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '3px',
                      boxShadow: 'var(--shadow-card)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Camera size={14} color={isUnregistered ? 'var(--status-warning)' : 'var(--accent-cyan)'} />
                      <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '0.5px' }}>
                        {cameraPovId?.toUpperCase()} • {activeCam?.name}
                      </span>
                      <span
                        style={{
                          fontSize: '9px',
                          padding: '1px 5px',
                          borderRadius: '3px',
                          background: isUnregistered ? 'rgba(245, 158, 11, 0.25)' : 'rgba(16, 185, 129, 0.25)',
                          color: isUnregistered ? '#fbbf24' : '#34d399',
                          fontWeight: 700,
                        }}
                      >
                        {activeCam?.status}
                      </span>
                    </div>
                    <span style={{ fontSize: '10px', color: isUnregistered ? '#fbbf24' : 'var(--text-secondary)', fontFamily: 'monospace' }}>
                      {isUnregistered
                        ? 'UNREGISTERED SENSOR NODE • NO PHYSICAL RTSP STREAM ATTACHED • SPATIAL VANTAGE PREVIEW ONLY (UNCALIBRATED)'
                        : `RES: 1920x1080 @ 30 FPS • FOV: ${activeCam?.fov_horizontal_deg || 85}° • ACCEL: MPS YOLOv8n • STATUS: LIVE STREAMING`}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        background: 'var(--bg-surface)',
                        padding: '8px 14px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-subtle)',
                        fontFamily: 'monospace',
                        fontSize: '11px',
                        color: 'var(--text-primary)',
                        boxShadow: 'var(--shadow-card)',
                      }}
                    >
                      {new Date().toISOString().replace('T', ' ').replace('Z', ' UTC')}
                    </div>
                    <button
                      onClick={() => setCameraPovId(null)}
                      style={{
                        pointerEvents: 'auto',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--accent-cyan)',
                        padding: '8px 14px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Exit Camera POV
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Center Viewfinder Optical Reticle */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '120px',
                height: '120px',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Crosshair size={28} color="rgba(56, 189, 248, 0.6)" />
            </div>

            {/* Bottom Bar: Instructions */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div
                style={{
                  background: 'rgba(6, 9, 19, 0.75)',
                  padding: '4px 12px',
                  borderRadius: '20px',
                  fontSize: '11px',
                  color: 'var(--text-secondary)',
                }}
              >
                Fixed Camera Line of Sight • Drag mouse or click [Exit Camera POV] to resume 3D orbit
              </div>
            </div>
          </div>
        )}

        {/* 3D WebGL Canvas Viewport */}
        {viewMode === '3D' ? (
          <div
            ref={mountRef}
            onMouseMove={handlePointerMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onWheel={handleWheel}
            onContextMenu={(e) => e.preventDefault()}
            style={{ width: '100%', height: '100%', cursor: 'grab' }}
          />
        ) : (
          /* 2D Floor Plan SVG Viewport */
          <div
            style={{
              width: '100%',
              height: '100%',
              background: 'var(--bg-main)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {sceneModel && (
              <svg
                viewBox={`0 0 ${sceneModel.dimensions.width_meters} ${sceneModel.dimensions.depth_meters}`}
                style={{
                  width: '85%',
                  height: '85%',
                  border: '2px solid var(--border-card)',
                  borderRadius: '12px',
                  background: 'var(--bg-surface)',
                  boxShadow: 'var(--shadow-card)',
                }}
              >
                <defs>
                  <pattern id="grid2d" width="5" height="5" patternUnits="userSpaceOnUse">
                    <path d="M 5 0 L 0 0 0 5" fill="none" stroke="rgba(56, 189, 248, 0.12)" strokeWidth="0.1" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid2d)" />

                {/* Walkways */}
                {sceneModel.walkways.map((w) => (
                  <line
                    key={w.id}
                    x1={w.points[0][0]}
                    y1={w.points[0][1]}
                    x2={w.points[1][0]}
                    y2={w.points[1][1]}
                    stroke="#10B981"
                    strokeWidth={w.width_meters}
                    strokeOpacity="0.25"
                    strokeLinecap="round"
                  />
                ))}

                {/* Zones */}
                {sceneModel.zones.map((z) => (
                  <polygon
                    key={z.zone_id}
                    points={z.polygon_meters.map(([x, y]) => `${x},${y}`).join(' ')}
                    fill={z.color_hex}
                    fillOpacity="0.3"
                    stroke={z.color_hex}
                    strokeWidth="0.4"
                    onClick={() => setSelectedZone(z)}
                    style={{ cursor: 'pointer' }}
                  />
                ))}

                {/* Equipment */}
                {sceneModel.equipment.map((eq) => (
                  <rect
                    key={eq.id}
                    x={eq.position[0] - eq.dimensions[0] / 2}
                    y={eq.position[2] - eq.dimensions[2] / 2}
                    width={eq.dimensions[0]}
                    height={eq.dimensions[2]}
                    fill="#334155"
                    stroke="#475569"
                    strokeWidth="0.2"
                    onClick={() => setSelectedEquipment(eq)}
                    style={{ cursor: 'pointer' }}
                  />
                ))}

                {/* Cameras */}
                {sceneModel.cameras.map((c) => (
                  <circle
                    key={c.camera_id}
                    cx={c.position[0]}
                    cy={c.position[2]}
                    r="1.2"
                    fill={c.status === 'LIVE' ? 'var(--accent-cyan)' : '#64748B'}
                    onClick={() => setSelectedCamera(c)}
                    style={{ cursor: 'pointer' }}
                  />
                ))}
              </svg>
            )}
          </div>
        )}

        {/* Hover Tooltip (Raycasting) */}
        {hoveredInfo && !isDemoMode && (
          <div
            className="spatial-hover-tooltip"
            style={{
              left: hoveredInfo.screenX,
              top: hoveredInfo.screenY,
            }}
          >
            <div style={{ fontWeight: 700, color: 'var(--accent-cyan)', fontSize: '11px' }}>
              [{hoveredInfo.type}] {hoveredInfo.name}
            </div>
            {hoveredInfo.details && (
              <div style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>{hoveredInfo.details}</div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* DYNAMIC SCENE-SPECIFIC DEMO OVERLAYS                           */}
        {/* ============================================================== */}
        {isDemoMode && (
          <>
            {/* SCENE 1: Factory Setup Calibration Badge */}
            {activeDemoScene.index === 0 && (
              <div
                className="demo-floating-card"
                style={{
                  bottom: '24px',
                  left: '24px',
                  padding: '16px 20px',
                  maxWidth: '380px',
                  borderLeft: '4px solid var(--accent-cyan)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Info size={16} color="var(--accent-cyan)" />
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase' }}>
                    Plant Spatial Model Initialized
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Detroit Plant Alpha: <strong>60.0m × 40.0m</strong> ground level. Walkways, CNC mills, Fanuc robotic cells, and calibrated homography matrices loaded.
                </p>
                <div style={{ marginTop: 8, fontSize: '11px', color: 'var(--text-muted)' }}>
                  Coordinate mapping: <em>Metric Cartesian (X, Z ground plane)</em>
                </div>
              </div>
            )}

            {/* SCENE 2: Live Camera Video Stream Preview HUD */}
            {activeDemoScene.index === 1 && (
              <div
                className="demo-floating-card"
                style={{
                  bottom: '24px',
                  right: '24px',
                  width: '320px',
                  padding: '14px',
                  border: '1px solid var(--accent-cyan)',
                  boxShadow: 'var(--shadow-glow-cyan)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Video size={15} color="var(--accent-cyan)" />
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>cam-facility-01</span>
                  </div>
                  <span className="badge badge-success" style={{ fontSize: '10px' }}>
                    LIVE YOLO INGESTION
                  </span>
                </div>

                {/* Real Live MJPEG Stream */}
                <div style={{ width: '100%', height: '170px', background: '#000', borderRadius: '6px', overflow: 'hidden', position: 'relative' }}>
                  {authToken ? (
                    <img
                      src={getCameraLiveStreamUrl('cam-facility-01', authToken)}
                      alt="Live feed for cam-facility-01"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                      Connecting Stream...
                    </div>
                  )}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 6,
                      left: 6,
                      background: 'rgba(0, 0, 0, 0.75)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--accent-cyan)',
                    }}
                  >
                    23.7 FPS | 27.7ms (MPS)
                  </div>
                </div>

                <div style={{ marginTop: 10, fontSize: '11px', color: 'var(--text-secondary)' }}>
                  Target: <strong>Welding Cell A Exclusion Zone</strong> (80° FOV)
                </div>
              </div>
            )}

            {/* SCENE 3: Synthetic Worker Tracking HUD Card */}
            {activeDemoScene.index === 2 && (
              <div
                className="demo-floating-card"
                style={{
                  top: '120px',
                  left: '24px',
                  width: '280px',
                  padding: '14px',
                  borderLeft: '4px solid var(--accent-cyan)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{activeDemoIncident.worker_alias}</span>
                  <span className="demo-sim-badge">Simulated Track</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div>State: <strong style={{ color: 'var(--status-success)' }}>Transit Path (Active Track)</strong></div>
                  <div>Camera Ingestion: <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{activeDemoIncident.camera_name.split(' ')[0]}</strong></div>
                  <div>Optical Confidence: <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>{(activeDemoIncident.confidence * 100).toFixed(1)}%</strong></div>
                </div>
              </div>
            )}

            {/* SCENE 4: Restricted Zone Breach Alarm Banner */}
            {activeDemoScene.index === 3 && (
              <div
                className="demo-floating-card"
                style={{
                  top: '120px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  padding: '16px 28px',
                  background: 'rgba(24, 8, 14, 0.94)',
                  border: '2px solid var(--status-danger)',
                  boxShadow: 'var(--shadow-glow-danger)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  maxWidth: '600px',
                  width: '90%',
                }}
              >
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: '50%',
                    background: 'rgba(255, 51, 102, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--status-danger)',
                    flexShrink: 0,
                  }}
                  className="animate-pulse"
                >
                  <ShieldAlert size={26} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--status-danger)', letterSpacing: '0.5px' }}>
                      CRITICAL SAFETY BREACH: {activeDemoIncident.rule_id}
                    </span>
                    <span className="demo-sim-badge">Advisory Sim</span>
                  </div>
                  <div style={{ fontSize: '12px', color: '#fff', lineHeight: 1.4 }}>
                    {activeDemoIncident.worker_alias} entered <strong>{activeDemoIncident.zone_name}</strong>.
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 4 }}>
                    {activeDemoIncident.persistence_frames}-frame persistence debouncing confirmed • Zero external dispatch triggered
                  </div>
                </div>
              </div>
            )}

            {/* SCENE 5: Incident Investigation Drawer */}
            {activeDemoScene.index === 4 && (
              <div
                className="demo-floating-card"
                style={{
                  top: '110px',
                  bottom: '24px',
                  right: '24px',
                  width: '380px',
                  padding: '20px',
                  overflowY: 'auto',
                  border: '1px solid var(--status-danger)',
                  boxShadow: 'var(--shadow-card)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--status-danger)' }}>
                    INCIDENT #{activeDemoIncident.incident_id}
                  </span>
                  <span className="demo-sim-badge">Simulated Investigation</span>
                </div>

                <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>
                  {activeDemoIncident.title}
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '12px', color: 'var(--text-secondary)', marginBottom: 16 }}>
                  <div>Source Camera: <strong style={{ color: 'var(--text-primary)' }}>{activeDemoIncident.camera_name}</strong></div>
                  <div>Monitored Zone: <strong style={{ color: 'var(--status-danger)' }}>{activeDemoIncident.zone_name}</strong></div>
                  <div>Rule Violated: <code style={{ color: 'var(--accent-cyan)' }}>{activeDemoIncident.rule_id}</code></div>
                  <div>Timestamp: <span style={{ fontFamily: 'var(--font-mono)' }}>{activeDemoIncident.timestamp_utc}</span></div>
                </div>

                <div style={{ background: 'var(--bg-elevated)', borderRadius: '6px', padding: '12px', marginBottom: 16 }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: 6, textTransform: 'uppercase' }}>
                    Multi-Agent Grounding Trace
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                    {activeDemoIncident.agent_summary}
                  </p>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 6 }}>
                    Cited Keyframes: {activeDemoIncident.evidence_citations.join(', ')}
                  </div>
                </div>

                {/* Simulated Review Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    onClick={() => setDemoAcknowledged(true)}
                    disabled={demoAcknowledged}
                    className="btn btn-primary"
                    style={{
                      width: '100%',
                      justifyContent: 'center',
                      background: demoAcknowledged ? 'var(--status-success)' : undefined,
                    }}
                  >
                    <CheckCircle2 size={14} />
                    <span>{demoAcknowledged ? 'Acknowledged by Safety Operator' : 'Acknowledge Event [Simulated]'}</span>
                  </button>

                  <button
                    onClick={() => setDemoEscalated(true)}
                    disabled={demoEscalated}
                    className="btn btn-secondary"
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    <Shield size={14} />
                    <span>{demoEscalated ? 'Escalation Notice Dispatched' : 'Escalate to Plant Supervisor [Simulated]'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* SCENE 6: Factory Overview & Verification Summary Modal */}
            {activeDemoScene.index === 5 && (
              <div
                className="demo-floating-card"
                style={{
                  top: '110px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '560px',
                  maxWidth: '92%',
                  padding: '24px 28px',
                  border: '1px solid var(--accent-cyan)',
                  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8), var(--shadow-glow-cyan)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <CheckCircle2 size={20} color="var(--accent-cyan)" />
                    <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '0.4px' }}>
                      {currentEnvConfig.name.toUpperCase()} DEMO COMPLETE
                    </span>
                  </div>
                  <span className="demo-sim-badge">Workflow Verified</span>
                </div>

                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>
                  SENTINEL AI successfully demonstrated the complete industrial computer-vision safety lifecycle: real-time spatial video ingestion, metric ground-plane tracking, deterministic rule evaluation, tripwire breach isolation, and human-in-the-loop multi-agent grounding.
                </p>

                {/* KPI Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                  <div style={{ background: 'var(--bg-elevated)', padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Throughput</div>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-cyan)', marginTop: 4 }}>24.0 FPS</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Apple MPS (Metal)</div>
                  </div>
                  <div style={{ background: 'var(--bg-elevated)', padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Debounce Gate</div>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>5 Frames</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>0 False Positives</div>
                  </div>
                  <div style={{ background: 'var(--bg-elevated)', padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Cloud Dependency</div>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--status-success)', marginTop: 4 }}>0.0%</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>100% Local Edge</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <button onClick={handleRestartDemo} className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                    <RotateCcw size={14} /> Replay Demonstration
                  </button>
                  <button onClick={handleExitDemo} className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>
                    <Eye size={14} /> Return to Live Twin
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Active Alerts Indicator in Live Mode */}
        {activeAlerts.length > 0 && !isDemoMode && (
          <div
            style={{
              position: 'absolute',
              bottom: isReplayMode ? '74px' : '20px',
              left: '20px',
              background: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid var(--status-danger)',
              borderRadius: '6px',
              padding: '6px 12px',
              zIndex: 35,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: '11px',
              color: 'var(--status-danger)',
              fontWeight: 600,
            }}
          >
            <ShieldAlert size={14} />
            <span>{activeAlerts.length} Active Spatial Alerts Detected</span>
          </div>
        )}

        {/* Historical Replay Bottom Controller Bar */}
        {isReplayMode && !isDemoMode && (
          <div
            style={{
              position: 'absolute',
              bottom: '16px',
              left: '16px',
              right: '16px',
              background: 'rgba(15, 23, 42, 0.94)',
              backdropFilter: 'blur(12px)',
              border: '1px solid var(--status-warning)',
              borderRadius: '8px',
              padding: '12px 18px',
              zIndex: 35,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              style={{
                background: 'var(--status-warning)',
                border: 'none',
                color: '#060913',
                padding: '6px 14px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {isPlaying ? <Pause size={14} fill="#060913" /> : <Play size={14} fill="#060913" />}
              <span>{isPlaying ? 'Pause' : 'Play Replay'}</span>
            </button>
            <div style={{ flex: 1 }}>
              <input
                type="range"
                min={0}
                max={100}
                value={replayProgress}
                onChange={(e) => setReplayProgress(parseFloat(e.target.value))}
                className="demo-timeline-slider"
              />
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
              {replayEvents.length} Historical Incident Events Loaded
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* INTERACTIVE SELECTION SIDEBARS (Camera / Zone / Equipment)     */}
        {/* ============================================================== */}
        {selectedCamera && !isDemoMode && (
          <div
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              bottom: '16px',
              width: '360px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-card)',
              borderRadius: '8px',
              padding: '18px',
              zIndex: 30,
              boxShadow: 'var(--shadow-card)',
              overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Video size={18} color="var(--accent-cyan)" />
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{selectedCamera.name}</h3>
              </div>
              <button
                onClick={() => setSelectedCamera(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '12px', color: 'var(--text-secondary)', marginBottom: 16 }}>
              <div>Camera ID: <strong style={{ color: 'var(--text-primary)' }}>{selectedCamera.camera_id}</strong></div>
              <div>Operational Status: <strong style={{ color: selectedCamera.status === 'LIVE' ? 'var(--status-success)' : 'var(--text-muted)' }}>{selectedCamera.status}</strong></div>
              <div>Position (X, Y, Z): <code style={{ color: 'var(--text-primary)' }}>[{selectedCamera.position.join(', ')}]</code></div>
              <div>Coverage FOV: <strong>{selectedCamera.fov_horizontal_deg}°</strong></div>
              <div>Calibration: <strong style={{ color: selectedCamera.calibrated ? 'var(--status-success)' : 'var(--status-warning)' }}>{selectedCamera.calibrated ? 'HOMOGRAPHY VERIFIED' : 'PENDING'}</strong></div>
            </div>

            {/* Live Camera Stream Preview Tile */}
            <div style={{ width: '100%', height: '190px', background: '#000', borderRadius: '6px', overflow: 'hidden', position: 'relative' }}>
              {selectedCamera.status === 'LIVE' && authToken ? (
                <img
                  src={getCameraLiveStreamUrl(selectedCamera.camera_id, authToken)}
                  alt={selectedCamera.name}
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              ) : (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-muted)' }}>
                  <Video size={32} />
                  <span>Stream Offline or Unregistered</span>
                </div>
              )}
            </div>
          </div>
        )}

        {selectedZone && !isDemoMode && (
          <div
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              width: '320px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-card)',
              borderRadius: '8px',
              padding: '18px',
              zIndex: 30,
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShieldAlert size={18} color={selectedZone.color_hex} />
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{selectedZone.name}</h3>
              </div>
              <button
                onClick={() => setSelectedZone(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '12px', color: 'var(--text-secondary)' }}>
              <div>Zone ID: <strong style={{ color: 'var(--text-primary)' }}>{selectedZone.zone_id}</strong></div>
              <div>Zone Classification: <strong style={{ color: selectedZone.color_hex }}>{selectedZone.zone_type}</strong></div>
              <div>Height Barrier: <strong>{selectedZone.height_meters} meters</strong></div>
              <div>Active Safety Rules:</div>
              <ul style={{ paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                {selectedZone.active_rules.map((r) => (
                  <li key={r}><code style={{ color: 'var(--accent-cyan)' }}>{r}</code></li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {selectedEquipment && !isDemoMode && (
          <div
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              width: '320px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-card)',
              borderRadius: '8px',
              padding: '18px',
              zIndex: 30,
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{selectedEquipment.name}</h3>
              <button
                onClick={() => setSelectedEquipment(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '12px', color: 'var(--text-secondary)' }}>
              <div>ID: <strong style={{ color: 'var(--text-primary)' }}>{selectedEquipment.id}</strong></div>
              <div>Category: <strong>{selectedEquipment.category}</strong></div>
              <div>Operating Status: <strong style={{ color: 'var(--status-success)' }}>{selectedEquipment.status}</strong></div>
              <div>Dimensions (W, H, D): <code style={{ color: 'var(--text-primary)' }}>[{selectedEquipment.dimensions.join('m, ')}m]</code></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
