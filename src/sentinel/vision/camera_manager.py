"""
Camera Pipeline Manager and Multi-Camera Worker Engine.
Orchestrates isolated camera workers, enforces resource bounds, manages YOLO inference concurrency,
and provides authenticated low-latency MJPEG and WebSocket telemetry streams.
"""

import asyncio
import time
from collections import deque
from pathlib import Path
from typing import AsyncGenerator, Optional

import cv2
import numpy as np

from sentinel.api.routers.stream import stream_manager
from sentinel.config import get_settings
from sentinel.logging import setup_logging
from sentinel.rules.ppe import PPEAssociationEngine
from sentinel.rules.temporal_engine import TemporalEventEngine
from sentinel.rules.zones import RestrictedZone, ZoneManager, ZoneType
from sentinel.vision.adapter import YOLOAdapter
from sentinel.vision.geometry import PlanarHomography
from sentinel.vision.metrics import get_vision_metrics_provider
from sentinel.vision.sources.base import BaseVideoSource, VideoFrame
from sentinel.vision.sources.camera import (
    BrowserWebcamSource,
    CameraConfig,
    CameraMetrics,
    CameraStatus,
    CameraType,
    RTSPCameraSource,
    validate_camera_uri,
)
from sentinel.vision.sources.replay import VideoReplaySource
from sentinel.vision.sources.webcam import WebcamSource
from sentinel.vision.tracking import MultiObjectTracker

logger = setup_logging()

# Default placeholder 640x480 frame for idle/disconnected cameras
_IDLE_JPEG_CACHE: Optional[bytes] = None


def _get_idle_jpeg(message: str = "CAMERA OFFLINE") -> bytes:
    global _IDLE_JPEG_CACHE
    if _IDLE_JPEG_CACHE is None:
        img = np.zeros((480, 640, 3), dtype=np.uint8)
        img[:] = (15, 23, 42)  # Dark slate background #0F172A
        # Draw border
        cv2.rectangle(img, (20, 20), (620, 460), (30, 41, 59), 2)
        # Draw status message
        cv2.putText(
            img,
            message,
            (180, 230),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.9,
            (148, 163, 184),
            2,
            cv2.LINE_AA,
        )
        cv2.putText(
            img,
            "Awaiting Active Stream Ingestion",
            (160, 270),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (100, 116, 139),
            1,
            cv2.LINE_AA,
        )
        _, enc = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
        _IDLE_JPEG_CACHE = enc.tobytes()
    return _IDLE_JPEG_CACHE


class CameraPipelineWorker:
    """
    Isolated processing worker for a single registered camera stream.
    Performs frame acquisition, YOLO inference, tracking, temporal safety rules,
    JPEG rendering for web streaming, and telemetry broadcasting.
    """

    def __init__(
        self,
        config: CameraConfig,
        source: BaseVideoSource,
        adapter: YOLOAdapter,
        inference_semaphore: asyncio.Semaphore,
        zone_manager: Optional[ZoneManager] = None,
        homography: Optional[PlanarHomography] = None,
    ) -> None:
        self.config = config
        self.source = source
        self.adapter = adapter
        self.inference_semaphore = inference_semaphore
        self.camera_id = config.camera_id
        self.homography = homography

        # Video geometry & rules
        self.tracker = MultiObjectTracker(iou_threshold=0.25, max_lost_frames=15)
        self.zone_manager = zone_manager or ZoneManager()
        self.temporal_engine = TemporalEventEngine(
            zone_manager=self.zone_manager,
            persistence_threshold=5,
            track_loss_grace_frames=3,
        )
        self.ppe_engine = PPEAssociationEngine(persistence_threshold=6)
        # Check model capabilities to avoid false PPE violations on COCO base models
        caps = self.adapter.get_capabilities()
        if not caps.get("has_ppe_classes", False):
            self.ppe_engine.ppe_capability_enabled = False

        # State & Metrics
        self.is_running = False
        self._task: Optional[asyncio.Task] = None
        self._latest_jpeg: Optional[bytes] = None
        self._metrics = CameraMetrics()
        self._fps_window: deque[float] = deque(maxlen=30)
        self._latency_window: deque[float] = deque(maxlen=30)
        self._lock = asyncio.Lock()

    def get_latest_jpeg(self) -> bytes:
        """Returns the latest annotated JPEG frame bytes or idle card if unavailable."""
        if self._latest_jpeg is not None:
            return self._latest_jpeg
        return _get_idle_jpeg(f"{self.config.name} (CONNECTING)")

    def get_metrics(self) -> CameraMetrics:
        """Returns current operational metrics for this camera."""
        metrics = self._metrics.model_copy()
        now_ns = time.time_ns()
        if metrics.last_frame_timestamp_ns > 0:
            metrics.last_frame_age_seconds = round(
                (now_ns - metrics.last_frame_timestamp_ns) / 1e9, 2
            )
        return metrics

    async def start(self) -> None:
        """Starts the camera capture and async pipeline processing task."""
        if self.is_running:
            return
        self.is_running = True
        try:
            self.source.start()
        except Exception as e:
            logger.error(f"Failed to start underlying source for camera '{self.camera_id}': {e}")
            self.is_running = False
            self._metrics.last_error_category = "SOURCE_INIT_FAILED"
            raise

        self._task = asyncio.create_task(self._run_loop(), name=f"cam-worker-{self.camera_id}")
        logger.info(f"Camera worker '{self.camera_id}' task launched.")

    async def stop(self) -> None:
        """Gracefully halts the pipeline worker and releases capture resources."""
        self.is_running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self.source.stop()
        self._task = None
        self._latest_jpeg = None
        logger.info(f"Camera worker '{self.camera_id}' stopped cleanly.")

    async def _run_loop(self) -> None:
        """Continuous pipeline loop. Isolates errors to prevent cascading failure."""
        logger.info(f"Camera worker loop running for '{self.camera_id}'.")
        consecutive_errors = 0

        while self.is_running:
            try:
                # 1. Read frame off source in executor to avoid blocking asyncio event loop
                loop = asyncio.get_running_loop()
                frame: Optional[VideoFrame] = await loop.run_in_executor(None, self.source.read_frame)

                if frame is None:
                    # Ingest delay / awaiting next stream packet
                    await asyncio.sleep(0.01)
                    continue

                self._metrics.frames_read += 1
                now_ns = time.time_ns()
                self._metrics.last_frame_timestamp_ns = now_ns

                # 2. Backpressure / Stale Frame Gate: Drop if frame is older than 500ms (live cameras only)
                if self.config.camera_type != CameraType.REPLAY:
                    frame_age_sec = (now_ns - frame.timestamp_ns) / 1e9
                    self._metrics.last_frame_age_seconds = round(frame_age_sec, 3)
                    if frame_age_sec > 0.5:
                        self._metrics.frames_dropped += 1
                        continue
                else:
                    self._metrics.last_frame_age_seconds = 0.0

                effective_timestamp_ns = (
                    now_ns if self.config.camera_type == CameraType.REPLAY else frame.timestamp_ns
                )

                # 3. Model Inference guarded by concurrency semaphore
                t_start = time.monotonic()
                async with self.inference_semaphore:
                    inf_result = await loop.run_in_executor(
                        None, self.adapter.infer, frame.data, frame.frame_id
                    )
                inference_ms = (time.monotonic() - t_start) * 1000

                # 4. Multi-Object Tracking & Ground-Contact Calculation
                self.tracker.update(inf_result.detections, frame_id=frame.frame_id)
                active_tracks = self.tracker.get_active_tracks()

                # 5. Temporal Rules & Event Engine
                events = self.temporal_engine.process_frame(
                    tracked_entities=active_tracks,
                    timestamp_ns=effective_timestamp_ns,
                    source_id=self.camera_id,
                )

                # 6. Render annotated JPEG for live web viewing
                annotated_frame = self._render_annotation(
                    frame.data.copy(), active_tracks, events, inference_ms
                )
                _, enc = cv2.imencode(
                    ".jpg", annotated_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75]
                )
                self._latest_jpeg = enc.tobytes()

                # 7. Update Metrics & Rolling Telemetry
                total_duration_ms = (time.monotonic() - t_start) * 1000
                self._metrics.frames_processed += 1
                self._latency_window.append(total_duration_ms)
                self._fps_window.append(time.monotonic())

                # Calculate rolling FPS over past frames
                if len(self._fps_window) > 1:
                    dt = self._fps_window[-1] - self._fps_window[0]
                    self._metrics.effective_fps = (
                        round((len(self._fps_window) - 1) / dt, 1) if dt > 0 else 0.0
                    )
                self._metrics.average_latency_ms = (
                    round(sum(self._latency_window) / len(self._latency_window), 1)
                    if self._latency_window
                    else 0.0
                )
                self._metrics.last_error_category = None
                consecutive_errors = 0

                # 8. Broadcast synchronized telemetry over WebSocket
                detections_payload = []
                for t in active_tracks:
                    bbox = getattr(t, "current_bbox", getattr(t, "bbox", None))
                    gp = getattr(t, "ground_point", getattr(t, "ground_contact_point", (0.5, 0.5)))
                    world_pt = None
                    if self.homography is not None and gp is not None:
                        try:
                            wx, wz = self.homography.transform_point(gp)
                            world_pt = [round(wx, 2), round(wz, 2)]
                        except Exception:
                            world_pt = None

                    detections_payload.append(
                        {
                            "track_id": t.track_id,
                            "class_name": t.class_name,
                            "confidence": round(t.confidence, 2),
                            "bbox": [bbox.x1, bbox.y1, bbox.x2, bbox.y2] if bbox else [0, 0, 0, 0],
                            "ground_point": list(gp),
                            "world_point": world_pt,
                        }
                    )

                # Update global metrics provider for system-wide analytics
                metrics_provider = get_vision_metrics_provider()
                metrics_provider.record_inference(
                    latency_ms=inference_ms,
                    detected_persons=sum(1 for t in active_tracks if t.class_name == "person"),
                    device=str(getattr(self.adapter, "device", "cpu")),
                    active_tracks=len(active_tracks),
                )

                if stream_manager.active_connections:
                    await stream_manager.broadcast_json(
                        {
                            "type": "CAMERA_TELEMETRY",
                            "camera_id": self.camera_id,
                            "frame_id": frame.frame_id,
                            "timestamp_ns": effective_timestamp_ns,
                            "fps": self._metrics.effective_fps,
                            "latency_ms": self._metrics.average_latency_ms,
                            "detections": detections_payload,
                            "event_count": len(events),
                        }
                    )

                    # Also broadcast individual safety event alerts for Digital Twin & HUD highlights
                    if events:
                        for evt in events:
                            await stream_manager.broadcast_json(
                                {
                                    "type": "SAFETY_EVENT",
                                    "event_id": evt.event_id,
                                    "camera_id": self.camera_id,
                                    "track_id": evt.track_id,
                                    "event_type": evt.event_type.value
                                    if hasattr(evt.event_type, "value")
                                    else str(evt.event_type),
                                    "severity": evt.severity.value
                                    if hasattr(evt.severity, "value")
                                    else str(evt.severity),
                                    "zone_id": evt.zone_id,
                                    "first_observation_ns": evt.first_observation_ns,
                                    "last_observation_ns": evt.last_observation_ns,
                                    "confidence": evt.confidence,
                                }
                            )

                # Pacing: for replay streams, match target FPS; for live streams, yield small slice
                if self.config.camera_type == CameraType.REPLAY:
                    target_interval = 1.0 / (self.config.target_fps or 25.0)
                    elapsed = time.monotonic() - t_start
                    if elapsed < target_interval:
                        await asyncio.sleep(target_interval - elapsed)
                    else:
                        await asyncio.sleep(0.001)
                else:
                    await asyncio.sleep(0.005)

            except asyncio.CancelledError:
                break
            except Exception as e:
                consecutive_errors += 1
                self._metrics.last_error_category = type(e).__name__
                logger.error(f"Error in camera pipeline for '{self.camera_id}': {e}", exc_info=True)
                if consecutive_errors > 20:
                    logger.critical(
                        f"Camera '{self.camera_id}' exceeded error threshold (20). Pausing worker."
                    )
                    await asyncio.sleep(2.0)
                    consecutive_errors = 0
                await asyncio.sleep(0.1)

    def _render_annotation(
        self,
        frame: np.ndarray,
        tracks: list,
        events: list,
        latency_ms: float,
    ) -> np.ndarray:
        """Renders bounding boxes, ground-contact points, and zone overlays onto frame."""
        h, w = frame.shape[:2]

        # 1. Draw Restricted Safety Zones
        for zone in self.zone_manager.list_zones():
            pts = np.array(
                [[int(x * w), int(y * h)] for x, y in zone.polygon_points], dtype=np.int32
            )
            # Semi-transparent overlay
            overlay = frame.copy()
            cv2.fillPoly(overlay, [pts], (0, 0, 180) if zone.zone_type == ZoneType.RESTRICTED else (0, 140, 255))
            cv2.addWeighted(overlay, 0.25, frame, 0.75, 0, frame)
            cv2.polylines(frame, [pts], True, (0, 0, 230), 2)

        # 2. Draw Detected Tracked Workers
        for track in tracks:
            bbox = getattr(track, "current_bbox", getattr(track, "bbox", None))
            gp = getattr(track, "ground_point", getattr(track, "ground_contact_point", (0.5, 0.5)))
            if bbox is None:
                continue

            bx1, by1 = int(bbox.x1 * w), int(bbox.y1 * h)
            bx2, by2 = int(bbox.x2 * w), int(bbox.y2 * h)
            gx, gy = int(gp[0] * w), int(gp[1] * h)

            # Determine color: red if in active violation, green if compliant
            color = (0, 220, 100)  # compliant green
            for zone in self.zone_manager.list_zones():
                if zone.contains_point(gp):
                    color = (0, 0, 240)  # violating red
                    break

            # Bounding box
            cv2.rectangle(frame, (bx1, by1), (bx2, by2), color, 2)
            # Ground-contact dot
            cv2.circle(frame, (gx, gy), 4, (0, 0, 255), -1)

            # Label banner
            label = f"#{track.track_id} {track.class_name} {track.confidence:.2f}"
            cv2.rectangle(frame, (bx1, max(0, by1 - 18)), (bx1 + len(label) * 8 + 6, max(18, by1)), color, -1)
            cv2.putText(
                frame,
                label,
                (bx1 + 3, max(14, by1 - 4)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.4,
                (15, 23, 42),
                1,
                cv2.LINE_AA,
            )

        # 3. Top Status Bar
        status_bar = f"CAMERA: {self.config.name} | FPS: {self._metrics.effective_fps} | LATENCY: {latency_ms:.1f}ms"
        cv2.rectangle(frame, (0, 0), (w, 24), (15, 23, 42), -1)
        cv2.putText(
            frame,
            status_bar,
            (10, 16),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.45,
            (56, 189, 248),
            1,
            cv2.LINE_AA,
        )

        return frame


class CameraManager:
    """
    Central Camera Management Registry and Streaming Gateway.
    Controls camera configurations, lifecycle operations, inference resource concurrency,
    and live MJPEG streams.
    """

    def __init__(self, max_concurrent_streams: int = 4) -> None:
        self.max_concurrent_streams = max_concurrent_streams
        self.cameras: dict[str, CameraConfig] = {}
        self.workers: dict[str, CameraPipelineWorker] = {}
        self.inference_semaphore = asyncio.Semaphore(2)  # Limit concurrent GPU/MPS inference
        self._shared_adapter: Optional[YOLOAdapter] = None
        self._default_zone_mgr = self._build_default_zones()

    def _build_default_zones(self) -> ZoneManager:
        """Initializes default zone manager with demo Crane Zone A-1."""
        mgr = ZoneManager()
        zone = RestrictedZone(
            zone_id="zone-crane-a1",
            name="Overhead Crane Danger Zone A-1",
            polygon_points=[(0.36, 0.24), (0.58, 0.24), (0.58, 0.44), (0.36, 0.44)],
            zone_type=ZoneType.RESTRICTED,
        )
        mgr.add_zone(zone)
        return mgr

    def _get_adapter(self) -> YOLOAdapter:
        """Returns or lazily initializes the shared YOLO adapter."""
        if self._shared_adapter is None:
            settings = get_settings()
            device = settings.resolve_yolo_device()
            self._shared_adapter = YOLOAdapter(
                model_path=settings.yolo_model_path,
                device=device,
                confidence_threshold=settings.yolo_confidence_threshold,
            )
        return self._shared_adapter

    def register_camera(self, config: CameraConfig, allow_localhost: bool = False) -> CameraConfig:
        """Validates and registers a new camera configuration."""
        validate_camera_uri(config.uri, config.camera_type, allow_localhost=allow_localhost)
        self.cameras[config.camera_id] = config
        logger.info(f"Registered camera '{config.camera_id}' ({config.camera_type.value}) at {config.sanitized_uri}")
        return config

    def get_camera(self, camera_id: str) -> Optional[CameraConfig]:
        return self.cameras.get(camera_id)

    def list_cameras(self) -> list[CameraConfig]:
        return list(self.cameras.values())

    def get_metrics(self, camera_id: str) -> CameraMetrics:
        worker = self.workers.get(camera_id)
        if worker:
            return worker.get_metrics()
        return CameraMetrics()

    def get_camera_status(self, camera_id: str) -> CameraStatus:
        worker = self.workers.get(camera_id)
        if worker:
            if not worker.is_running:
                return CameraStatus.STOPPED
            if isinstance(worker.source, RTSPCameraSource):
                return worker.source.camera_status
            if isinstance(worker.source, BrowserWebcamSource):
                return worker.source.camera_status
            return CameraStatus.LIVE
        config = self.cameras.get(camera_id)
        if not config:
            return CameraStatus.DISCONNECTED
        return CameraStatus.DISABLED if not config.enabled else CameraStatus.DISCONNECTED

    async def start_camera(self, camera_id: str) -> bool:
        """Starts live ingestion and inference for the specified camera."""
        config = self.cameras.get(camera_id)
        if not config:
            raise ValueError(f"Camera '{camera_id}' is not registered")
        if not config.enabled:
            raise ValueError(f"Camera '{camera_id}' is currently disabled")

        if camera_id in self.workers and self.workers[camera_id].is_running:
            return True  # Already running

        # Check concurrency limit
        active_count = sum(1 for w in self.workers.values() if w.is_running)
        if active_count >= self.max_concurrent_streams:
            raise ResourceWarning(
                f"Maximum active camera streams reached ({self.max_concurrent_streams}). "
                "Stop an existing camera stream before starting another."
            )

        # Construct appropriate video source
        source: BaseVideoSource
        if config.camera_type == CameraType.RTSP:
            source = RTSPCameraSource(config)
        elif config.camera_type == CameraType.BROWSER_WEBCAM:
            source = BrowserWebcamSource(config)
        elif config.camera_type == CameraType.WEBCAM:
            device_idx = int(config.uri) if config.uri.isdigit() else 0
            source = WebcamSource(
                source_id=config.camera_id,
                device_index=device_idx,
                frame_sampling_rate=config.sampling_rate,
            )
        elif config.camera_type == CameraType.REPLAY:
            source = VideoReplaySource(
                source_id=config.camera_id,
                video_path=Path(config.uri),
                frame_sampling_rate=config.sampling_rate,
                loop=True,
            )
        else:
            raise ValueError(f"Unsupported camera type: {config.camera_type}")

        # Check if camera has calibration matrix in scene fixture
        homography = None
        try:
            from sentinel.api.routers.twin import _load_initial_scene

            scene = _load_initial_scene()
            cam_node = next((c for c in scene.cameras if c.camera_id == camera_id), None)
            if cam_node and cam_node.calibrated and cam_node.homography_matrix:
                homography = PlanarHomography(cam_node.homography_matrix)
        except Exception as e:
            logger.debug(f"No homography calibration loaded for '{camera_id}': {e}")

        adapter = self._get_adapter()
        worker = CameraPipelineWorker(
            config=config,
            source=source,
            adapter=adapter,
            inference_semaphore=self.inference_semaphore,
            zone_manager=self._default_zone_mgr,
            homography=homography,
        )
        self.workers[camera_id] = worker
        await worker.start()
        return True

    async def stop_camera(self, camera_id: str) -> bool:
        """Stops the camera pipeline worker cleanly."""
        worker = self.workers.pop(camera_id, None)
        if worker:
            await worker.stop()
            return True
        return False

    def ingest_browser_frame(self, camera_id: str, image_bytes: bytes) -> bool:
        """Pushes an incoming browser frame into a BrowserWebcamSource worker."""
        worker = self.workers.get(camera_id)
        if not worker or not worker.is_running:
            return False
        if isinstance(worker.source, BrowserWebcamSource):
            return worker.source.push_frame_bytes(image_bytes)
        return False

    def get_latest_jpeg(self, camera_id: str) -> bytes:
        """Returns the latest annotated JPEG bytes for a camera."""
        worker = self.workers.get(camera_id)
        if worker and worker.is_running:
            return worker.get_latest_jpeg()
        config = self.cameras.get(camera_id)
        name = config.name if config else camera_id
        return _get_idle_jpeg(f"{name} (OFFLINE)")

    async def stream_mjpeg(
        self, camera_id: str, max_frames: Optional[int] = None
    ) -> AsyncGenerator[bytes, None]:
        """
        Asynchronously yields multipart/x-mixed-replace MJPEG frame bytes for browser display.
        """
        frames_sent = 0
        try:
            while True:
                if max_frames is not None and frames_sent >= max_frames:
                    break
                jpeg = self.get_latest_jpeg(camera_id)
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n"
                    b"Content-Length: " + str(len(jpeg)).encode() + b"\r\n\r\n" + jpeg + b"\r\n"
                )
                frames_sent += 1
                # Yield at ~25 FPS to conserve CPU and bandwidth
                await asyncio.sleep(0.04)
        except asyncio.CancelledError:
            pass

    async def shutdown_all(self) -> None:
        """Stops all running camera workers during application shutdown."""
        logger.info(f"Shutting down {len(self.workers)} camera pipeline workers...")
        for camera_id, worker in list(self.workers.items()):
            try:
                await worker.stop()
            except Exception as e:
                logger.error(f"Error stopping worker '{camera_id}': {e}")
        self.workers.clear()


# Global CameraManager singleton
_camera_manager: Optional[CameraManager] = None


def get_camera_manager() -> CameraManager:
    global _camera_manager
    if _camera_manager is None:
        _camera_manager = CameraManager()
    return _camera_manager
