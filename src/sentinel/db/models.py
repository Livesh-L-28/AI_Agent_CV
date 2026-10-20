"""
SQLAlchemy Async ORM Declarative Models.
Supports both SQLite and PostgreSQL with strict relational integrity,
foreign keys, JSON columns, and indexing.
"""

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import (
    JSON,
    BigInteger,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.ext.asyncio import AsyncAttrs
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(AsyncAttrs, DeclarativeBase):
    pass


class VideoSourceModel(Base):
    __tablename__ = "video_sources"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    source_type: Mapped[str] = mapped_column(String(32), nullable=False)  # replay, webcam, upload
    uri: Mapped[str] = mapped_column(String(512), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="CREATED", index=True)
    fps: Mapped[float] = mapped_column(Float, default=25.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    detections: Mapped[list["DetectionModel"]] = relationship(
        back_populates="source", cascade="all, delete-orphan"
    )
    events: Mapped[list["SafetyEventModel"]] = relationship(
        back_populates="source", cascade="all, delete-orphan"
    )


class DetectionModel(Base):
    __tablename__ = "detections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("video_sources.id"), index=True, nullable=False
    )
    frame_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    timestamp_ns: Mapped[int] = mapped_column(BigInteger, nullable=False)
    track_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    class_id: Mapped[int] = mapped_column(Integer, nullable=False)
    class_name: Mapped[str] = mapped_column(String(64), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    bbox_x1: Mapped[float] = mapped_column(Float, nullable=False)
    bbox_y1: Mapped[float] = mapped_column(Float, nullable=False)
    bbox_x2: Mapped[float] = mapped_column(Float, nullable=False)
    bbox_y2: Mapped[float] = mapped_column(Float, nullable=False)

    source: Mapped["VideoSourceModel"] = relationship(back_populates="detections")


class SafetyEventModel(Base):
    __tablename__ = "safety_events"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    source_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("video_sources.id"), index=True, nullable=False
    )
    track_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    event_type: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    severity: Mapped[str] = mapped_column(String(32), nullable=False)
    zone_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    rule_id: Mapped[str] = mapped_column(String(128), nullable=False)
    first_observation_ns: Mapped[int] = mapped_column(BigInteger, nullable=False)
    last_observation_ns: Mapped[int] = mapped_column(BigInteger, nullable=False)
    persistence_count: Mapped[int] = mapped_column(Integer, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    deduplication_key: Mapped[str] = mapped_column(String(256), index=True, nullable=False)
    meta_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    source: Mapped["VideoSourceModel"] = relationship(back_populates="events")
    incident: Mapped[Optional["IncidentModel"]] = relationship(
        back_populates="event", uselist=False
    )


class IncidentModel(Base):
    __tablename__ = "incidents"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    event_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("safety_events.id"), unique=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(256), nullable=False)
    status: Mapped[str] = mapped_column(
        String(32), default="OPEN", index=True, nullable=False
    )  # OPEN, RESOLVED, FALSE_POSITIVE
    severity: Mapped[str] = mapped_column(String(32), nullable=False)
    assigned_to: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    resolution_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), onupdate=func.now())

    event: Mapped["SafetyEventModel"] = relationship(back_populates="incident")
    evidence_assets: Mapped[list["EvidenceAssetModel"]] = relationship(back_populates="incident")
    notifications: Mapped[list["NotificationModel"]] = relationship(back_populates="incident")


class EvidenceAssetModel(Base):
    __tablename__ = "evidence_assets"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    incident_id: Mapped[Optional[str]] = mapped_column(
        String(64), ForeignKey("incidents.id"), nullable=True, index=True
    )
    asset_type: Mapped[str] = mapped_column(String(32), nullable=False)  # FRAME, CROP, CLIP
    file_path: Mapped[str] = mapped_column(String(512), nullable=False)
    sha256_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)
    mime_type: Mapped[str] = mapped_column(String(64), default="image/jpeg")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    incident: Mapped[Optional["IncidentModel"]] = relationship(back_populates="evidence_assets")


class AgentRunModel(Base):
    __tablename__ = "agent_runs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    event_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("safety_events.id"), index=True, nullable=False
    )
    correlation_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="RUNNING", nullable=False)
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    model_name: Mapped[str] = mapped_column(String(64), nullable=False)
    latency_ms: Mapped[float] = mapped_column(Float, default=0.0)
    shared_state_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    tool_executions: Mapped[list["ToolExecutionModel"]] = relationship(back_populates="agent_run")


class ToolExecutionModel(Base):
    __tablename__ = "tool_executions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    agent_run_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("agent_runs.id"), index=True, nullable=False
    )
    tool_name: Mapped[str] = mapped_column(String(64), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    arguments_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    result_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(32), default="SUCCESS", nullable=False)
    executed_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    agent_run: Mapped["AgentRunModel"] = relationship(back_populates="tool_executions")


class NotificationModel(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    incident_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("incidents.id"), index=True, nullable=False
    )
    channel: Mapped[str] = mapped_column(String(32), nullable=False)
    recipient: Mapped[str] = mapped_column(String(128), nullable=False)
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(32), default="SENT", nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    sent_at: Mapped[datetime] = mapped_column(DateTime, default=func.now())

    incident: Mapped["IncidentModel"] = relationship(back_populates="notifications")


class AuditLogModel(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    correlation_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    actor: Mapped[str] = mapped_column(String(128), nullable=False)
    action: Mapped[str] = mapped_column(String(128), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(64), nullable=False)
    resource_id: Mapped[str] = mapped_column(String(64), nullable=False)
    outcome: Mapped[str] = mapped_column(String(32), nullable=False)
    details_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=func.now(), index=True)
