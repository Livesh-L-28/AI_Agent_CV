"""
Modular PPE Detection Model Adapter.
Wraps specialized safety equipment detection checkpoints with explicit class mappings.
"""

from pathlib import Path
from typing import Optional

import numpy as np

from sentinel.logging import setup_logging
from sentinel.vision.adapter import YOLOAdapter
from sentinel.vision.types import Detection

logger = setup_logging()


class PPEModelAdapter:
    """
    Adapter for PPE-specific object detectors (e.g. YOLO trained on SHWD, Roboflow PPE).
    Explicitly documents supported classes and avoids confusing generic COCO models.
    """

    KNOWN_PPE_CLASSES = {
        "helmet",
        "hardhat",
        "safety_helmet",
        "vest",
        "safety_vest",
        "high_vis_vest",
        "no_helmet",
        "no_vest",
        "goggles",
    }

    def __init__(
        self,
        weights_path: Optional[str] = None,
        confidence_threshold: float = 0.40,
        device: str = "auto",
    ) -> None:
        self.weights_path = weights_path
        self.confidence_threshold = confidence_threshold
        self.device = device
        self.is_custom_model_loaded = False
        self.base_adapter: Optional[YOLOAdapter] = None
        self.supported_ppe_classes: list[str] = []

        if weights_path and Path(weights_path).is_file():
            self._load_custom_ppe_model(weights_path)
        else:
            logger.info(
                "No custom PPE weights specified; operating in modular fixture/synthetic mode."
            )

    def _load_custom_ppe_model(self, path: str) -> None:
        """Loads a specialized custom PPE weights file."""
        try:
            self.base_adapter = YOLOAdapter(
                model_path=path,
                device=self.device,
                confidence_threshold=self.confidence_threshold,
            )
            self.supported_ppe_classes = [
                name
                for name in self.base_adapter.class_map.values()
                if any(k in name.lower() for k in self.KNOWN_PPE_CLASSES)
            ]
            self.is_custom_model_loaded = True
            logger.info(f"Loaded custom PPE detector with classes: {self.supported_ppe_classes}")
        except Exception as e:
            logger.warning(f"Could not load custom PPE checkpoint '{path}': {e}")
            self.is_custom_model_loaded = False

    def detect_ppe(self, frame: np.ndarray, frame_id: int = 0) -> list[Detection]:
        """Runs PPE inference on frame."""
        if not self.is_custom_model_loaded or self.base_adapter is None:
            # When custom checkpoint is pending, returns empty detection list safely
            return []

        res = self.base_adapter.infer(frame, frame_id=frame_id)
        # Filter for PPE-specific classes
        return [
            d
            for d in res.detections
            if any(k in d.class_name.lower() for k in self.KNOWN_PPE_CLASSES)
        ]
