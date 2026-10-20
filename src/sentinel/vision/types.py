"""
SENTINEL AI Computer Vision Data Types
Defines typed schemas for bounding boxes, detections, model metadata, and inference results.
"""

from typing import Optional

from pydantic import BaseModel, Field, field_validator


class BoundingBox(BaseModel):
    """
    Normalized bounding box in unit coordinates [0.0, 1.0].
    x1, y1 represents top-left; x2, y2 represents bottom-right.
    """

    x1: float = Field(ge=0.0, le=1.0, description="Normalized top-left X")
    y1: float = Field(ge=0.0, le=1.0, description="Normalized top-left Y")
    x2: float = Field(ge=0.0, le=1.0, description="Normalized bottom-right X")
    y2: float = Field(ge=0.0, le=1.0, description="Normalized bottom-right Y")

    @field_validator("x2")
    @classmethod
    def validate_x2(cls, v: float, info) -> float:
        x1 = info.data.get("x1", 0.0)
        if v < x1:
            raise ValueError(f"x2 ({v}) cannot be less than x1 ({x1})")
        return v

    @field_validator("y2")
    @classmethod
    def validate_y2(cls, v: float, info) -> float:
        y1 = info.data.get("y1", 0.0)
        if v < y1:
            raise ValueError(f"y2 ({v}) cannot be less than y1 ({y1})")
        return v

    @property
    def width(self) -> float:
        return self.x2 - self.x1

    @property
    def height(self) -> float:
        return self.y2 - self.y1

    @property
    def area(self) -> float:
        return self.width * self.height

    @property
    def center(self) -> tuple[float, float]:
        return ((self.x1 + self.x2) / 2.0, (self.y1 + self.y2) / 2.0)

    @property
    def ground_contact_point(self) -> tuple[float, float]:
        """
        Calculates the estimated ground-contact point (bottom-center of bounding box).
        This is the OSHA / computer vision standard for spatial zone containment.
        """
        return ((self.x1 + self.x2) / 2.0, self.y2)

    def to_pixel(self, img_width: int, img_height: int) -> tuple[int, int, int, int]:
        """Converts normalized coordinates to integer pixel coordinates [px1, py1, px2, py2]."""
        px1 = int(round(self.x1 * img_width))
        py1 = int(round(self.y1 * img_height))
        px2 = int(round(self.x2 * img_width))
        py2 = int(round(self.y2 * img_height))
        return (
            max(0, min(px1, img_width)),
            max(0, min(py1, img_height)),
            max(0, min(px2, img_width)),
            max(0, min(py2, img_height)),
        )


class Detection(BaseModel):
    """Represents a single detected object in a frame."""

    class_id: int
    class_name: str
    confidence: float = Field(ge=0.0, le=1.0)
    bbox: BoundingBox
    track_id: Optional[int] = None


class ModelMetadata(BaseModel):
    """Metadata describing a loaded computer vision checkpoint."""

    model_name: str
    class_map: dict[int, str]
    device: str
    input_size: int
    total_classes: int


class InferenceResult(BaseModel):
    """Complete output of a single vision inference step."""

    frame_id: int
    timestamp_ns: int
    image_width: int
    image_height: int
    detections: list[Detection]
    latency_ms: float
    device: str

    @property
    def person_count(self) -> int:
        return sum(1 for d in self.detections if d.class_name == "person")
