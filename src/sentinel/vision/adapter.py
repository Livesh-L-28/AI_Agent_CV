"""
SENTINEL AI YOLO Model Adapter
Provides verified model loading, class-map validation, device selection,
inference latency tracking, and frame annotation.
"""

import os
import time
from pathlib import Path
from typing import Any, Optional

import cv2
import numpy as np
from ultralytics import YOLO

from sentinel.logging import setup_logging
from sentinel.vision.geometry import denormalize_bbox, normalize_bbox
from sentinel.vision.metrics import get_vision_metrics_provider
from sentinel.vision.types import Detection, InferenceResult, ModelMetadata

logger = setup_logging()


class YOLOAdapter:
    """
    Adapter for YOLO models using Ultralytics.
    Encapsulates model initialization, class-map introspection, inference, and visualization.
    """

    def __init__(
        self,
        model_path: str = "yolov8n.pt",
        device: str = "auto",
        confidence_threshold: float = 0.35,
        iou_threshold: float = 0.45,
        image_size: int = 640,
    ) -> None:
        self.model_path = model_path
        self.requested_device = device
        self.device = self._resolve_device(device)
        self.confidence_threshold = confidence_threshold
        self.iou_threshold = iou_threshold
        self.image_size = image_size

        self.model: Optional[YOLO] = None
        self.class_map: dict[int, str] = {}
        self.metadata: Optional[ModelMetadata] = None

        self._load_model()

    def _resolve_device(self, device: str) -> str:
        """Determines the torch execution device."""
        if device != "auto":
            return device
        try:
            import torch

            if torch.cuda.is_available():
                return "cuda"
            if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                return "mps"
        except ImportError:
            pass
        return "cpu"

    def _load_model(self) -> None:
        """Loads and validates the YOLO model checkpoint."""
        model_file = Path(self.model_path)

        # If a custom file path is given, verify it exists
        if "/" in self.model_path or "\\" in self.model_path:
            if not model_file.is_file():
                raise FileNotFoundError(f"YOLO model weights file not found: {self.model_path}")

        try:
            logger.info(f"Loading YOLO model '{self.model_path}' on device '{self.device}'...")
            self.model = YOLO(self.model_path)
            # Introspect model names dynamically
            raw_names = self.model.names
            if isinstance(raw_names, dict):
                self.class_map = {int(k): str(v) for k, v in raw_names.items()}
            elif isinstance(raw_names, list):
                self.class_map = {i: str(name) for i, name in enumerate(raw_names)}
            else:
                self.class_map = {}

            self.metadata = ModelMetadata(
                model_name=os.path.basename(self.model_path),
                class_map=self.class_map,
                device=self.device,
                input_size=self.image_size,
                total_classes=len(self.class_map),
            )
            logger.info(
                f"Loaded {self.metadata.model_name} successfully ({self.metadata.total_classes} classes)."
            )
        except Exception as e:
            logger.error(f"Failed to load YOLO model '{self.model_path}': {e}")
            raise

    def has_class(self, class_name: str) -> bool:
        """Checks if a given class name exists in the model's verified class map."""
        return class_name.lower() in [name.lower() for name in self.class_map.values()]

    def validate_classes(self, required_classes: list[str]) -> dict[str, bool]:
        """Validates whether required classes are present in the model's class map."""
        available = {name.lower() for name in self.class_map.values()}
        return {cls: (cls.lower() in available) for cls in required_classes}

    def get_capabilities(self) -> dict[str, Any]:
        """
        Introspects model classes and reports whether industrial PPE detection is supported.
        Explicitly distinguishes general COCO-80 from dedicated PPE fine-tuned checkpoints.
        """
        helmet_classes = {"helmet", "hardhat", "hard_hat", "safety_helmet"}
        vest_classes = {"vest", "safety_vest", "hi_vis_vest", "reflective_vest"}
        goggle_classes = {"goggles", "safety_goggles", "protective_eyewear"}

        available = {name.lower() for name in self.class_map.values()}
        has_helmet = bool(available & helmet_classes)
        has_vest = bool(available & vest_classes)
        has_goggles = bool(available & goggle_classes)
        ppe_supported = has_helmet or has_vest

        return {
            "model_name": os.path.basename(self.model_path),
            "total_classes": len(self.class_map),
            "supports_person": "person" in available,
            "supports_ppe": ppe_supported,
            "supported_ppe_types": {
                "HARDHAT": has_helmet,
                "SAFETY_VEST": has_vest,
                "GOGGLES": has_goggles,
            },
            "dataset_type": "CUSTOM_PPE" if ppe_supported else "COCO_80",
            "ppe_capability_status": "SUPPORTED" if ppe_supported else "UNSUPPORTED_COCO_BASE",
            "guidance": (
                "Active model supports industrial PPE detection."
                if ppe_supported
                else (
                    "Active model is base COCO-80 which lacks hardhat and safety vest classes. "
                    "PPE compliance rules are bypassed to prevent false-positive violations. "
                    "Configure a licensed PPE-specific model (e.g. trained on SHWD or Pictor-PPE) "
                    "via YOLO_MODEL_PATH in environment configuration."
                )
            ),
        }

    def infer(self, frame: np.ndarray, frame_id: int = 0) -> InferenceResult:
        """
        Runs object detection on a single frame.
        Guarantees typed output and measures latency in milliseconds.
        """
        if frame is None or not isinstance(frame, np.ndarray) or frame.size == 0:
            raise ValueError("Invalid frame: array is None or empty")

        if len(frame.shape) < 2 or frame.shape[0] == 0 or frame.shape[1] == 0:
            raise ValueError(f"Invalid frame dimensions: {frame.shape}")

        img_height, img_width = frame.shape[:2]
        start_time = time.perf_counter()

        # Run inference through ultralytics
        results = self.model(
            frame,
            conf=self.confidence_threshold,
            iou=self.iou_threshold,
            imgsz=self.image_size,
            device=self.device,
            verbose=False,
        )

        latency_ms = (time.perf_counter() - start_time) * 1000.0
        detections: list[Detection] = []

        if results and len(results) > 0 and results[0].boxes is not None:
            boxes = results[0].boxes
            for i in range(len(boxes)):
                xyxy = boxes.xyxy[i].cpu().numpy()
                px1, py1, px2, py2 = float(xyxy[0]), float(xyxy[1]), float(xyxy[2]), float(xyxy[3])
                conf = float(boxes.conf[i].cpu().numpy())
                cls_id = int(boxes.cls[i].cpu().numpy())
                cls_name = self.class_map.get(cls_id, f"class_{cls_id}")

                track_id: Optional[int] = None
                if boxes.id is not None:
                    track_id = int(boxes.id[i].cpu().numpy())

                bbox = normalize_bbox(px1, py1, px2, py2, img_width, img_height)
                detections.append(
                    Detection(
                        class_id=cls_id,
                        class_name=cls_name,
                        confidence=conf,
                        bbox=bbox,
                        track_id=track_id,
                    )
                )

        # Record empirical live telemetry
        persons_detected = len([d for d in detections if d.class_name == "person"])
        get_vision_metrics_provider().record_inference(
            latency_ms=latency_ms,
            detected_persons=persons_detected,
            device=self.device,
        )

        return InferenceResult(
            frame_id=frame_id,
            timestamp_ns=time.time_ns(),
            image_width=img_width,
            image_height=img_height,
            detections=detections,
            latency_ms=round(latency_ms, 2),
            device=self.device,
        )

    def annotate(
        self,
        frame: np.ndarray,
        detections: list[Detection],
        draw_ground_point: bool = True,
    ) -> np.ndarray:
        """
        Draws bounding boxes, labels, and ground contact points on a copy of the frame.
        """
        annotated = frame.copy()
        img_height, img_width = frame.shape[:2]

        for det in detections:
            px1, py1, px2, py2 = denormalize_bbox(det.bbox, img_width, img_height)

            # Choose color based on class
            if det.class_name == "person":
                color = (0, 220, 0)  # Bright green
            else:
                color = (255, 180, 0)  # Cyan/blue

            # Draw bounding box
            cv2.rectangle(annotated, (px1, py1), (px2, py2), color, 2)

            # Label text
            track_str = f"#{det.track_id} " if det.track_id is not None else ""
            label = f"{track_str}{det.class_name} {det.confidence:.2f}"

            # Text background
            (tw, th), baseline = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            cv2.rectangle(annotated, (px1, py1 - th - baseline - 4), (px1 + tw + 4, py1), color, -1)
            cv2.putText(
                annotated,
                label,
                (px1 + 2, py1 - baseline - 2),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (0, 0, 0),
                1,
                cv2.LINE_AA,
            )

            # Optional ground-contact point
            if draw_ground_point and det.class_name == "person":
                gx, gy = det.bbox.ground_contact_point
                g_px = int(round(gx * img_width))
                g_py = int(round(gy * img_height))
                cv2.circle(annotated, (g_px, g_py), 4, (0, 0, 255), -1)  # Red dot

        return annotated
