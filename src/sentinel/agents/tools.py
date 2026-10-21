"""
Allowlisted Agent Tools with Strict Authorization, Input Validation, and Idempotency Keys.
Arbitrary code execution or unauthorized network access is strictly prohibited.
"""

from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sentinel.agents.state import ActionResult
from sentinel.db.models import IncidentModel, NotificationModel
from sentinel.logging import setup_logging
from sentinel.security.auth import AuthenticatedUser, UserRole

logger = setup_logging()

# Explicitly allowlisted tool set
ALLOWLISTED_TOOLS = {
    "create_incident",
    "send_supervisor_alert",
    "request_human_review",
    "get_incident_status",
}

# Role permissions per tool
TOOL_ROLE_PERMISSIONS: dict[str, set[UserRole]] = {
    "create_incident": {UserRole.SAFETY_OFFICER, UserRole.ADMIN},
    "send_supervisor_alert": {UserRole.SAFETY_OFFICER, UserRole.ADMIN},
    "request_human_review": {UserRole.SAFETY_OFFICER, UserRole.ADMIN},
    "get_incident_status": {UserRole.VIEWER, UserRole.SAFETY_OFFICER, UserRole.ADMIN},
}


async def create_incident_tool(
    session: AsyncSession,
    incident_id: str,
    event_id: str,
    title: str,
    severity: str,
) -> dict[str, Any]:
    """Creates a confirmed incident record in the database."""
    # Check if incident already exists
    stmt = select(IncidentModel).where(IncidentModel.id == incident_id)
    res = await session.execute(stmt)
    existing = res.scalar_one_or_none()
    if existing:
        return {"incident_id": existing.id, "status": existing.status, "already_existed": True}

    incident = IncidentModel(
        id=incident_id,
        event_id=event_id,
        title=title,
        severity=severity,
        status="OPEN",
    )
    session.add(incident)
    await session.flush()
    return {"incident_id": incident.id, "status": incident.status, "already_existed": False}


async def send_supervisor_alert_tool(
    session: AsyncSession,
    incident_id: str,
    channel: str,
    recipient: str,
    message: str,
    idempotency_key: str,
) -> dict[str, Any]:
    """
    Sends an authorized alert through the local notification sink.
    Idempotent: prevents duplicate dispatch attempts.
    """
    # Check idempotency key
    stmt = select(NotificationModel).where(NotificationModel.idempotency_key == idempotency_key)
    res = await session.execute(stmt)
    existing = res.scalar_one_or_none()
    if existing:
        return {
            "notification_id": existing.id,
            "status": existing.status,
            "duplicate_prevented": True,
        }

    notif_id = f"notif_{idempotency_key[:16]}"
    notif = NotificationModel(
        id=notif_id,
        incident_id=incident_id,
        channel=channel,
        recipient=recipient,
        payload_json={"message": message},
        status="SENT",
        idempotency_key=idempotency_key,
    )
    session.add(notif)
    await session.flush()
    logger.info(f"Notification sink dispatched alert {notif_id} to {recipient} via {channel}")
    return {"notification_id": notif.id, "status": notif.status, "duplicate_prevented": False}


async def request_human_review_tool(
    session: AsyncSession,
    incident_id: str,
    reason: str,
) -> dict[str, Any]:
    """Escalates an incident to manual safety review."""
    stmt = select(IncidentModel).where(IncidentModel.id == incident_id)
    res = await session.execute(stmt)
    incident = res.scalar_one_or_none()
    if not incident:
        raise ValueError(f"Incident {incident_id} not found")

    incident.status = "ESCALATED"
    incident.resolution_notes = f"Escalated for human review: {reason}"
    await session.flush()
    return {"incident_id": incident.id, "status": incident.status, "escalated": True}


async def get_incident_status_tool(
    session: AsyncSession,
    incident_id: str,
) -> dict[str, Any]:
    """Fetches the current status of an incident."""
    stmt = select(IncidentModel).where(IncidentModel.id == incident_id)
    res = await session.execute(stmt)
    incident = res.scalar_one_or_none()
    if not incident:
        return {"found": False}
    return {
        "found": True,
        "incident_id": incident.id,
        "status": incident.status,
        "severity": incident.severity,
    }


async def execute_tool(
    session: AsyncSession,
    tool_name: str,
    parameters: dict[str, Any],
    idempotency_key: str,
    caller: Optional[AuthenticatedUser] = None,
) -> ActionResult:
    """Dispatches a tool call with strict allowlist and caller authorization enforcement."""
    # 1. Allowlist Gate
    if tool_name not in ALLOWLISTED_TOOLS:
        logger.error(f"Security Alert: Blocked unauthorized tool execution: {tool_name}")
        return ActionResult(
            tool_name=tool_name,
            status="REJECTED_UNAUTHORIZED",
            output={},
            error=f"Tool '{tool_name}' is not in the authorized Sentinel AI allowlist",
        )

    # 2. Caller Authorization Gate
    if caller is None:
        logger.error(f"Security Alert: Blocked tool execution without authenticated caller: {tool_name}")
        return ActionResult(
            tool_name=tool_name,
            status="REJECTED_UNAUTHORIZED",
            output={},
            error=f"Direct tool execution of '{tool_name}' requires an authorized caller",
        )

    allowed_roles = TOOL_ROLE_PERMISSIONS.get(tool_name, set())
    if caller.role != UserRole.ADMIN and caller.role not in allowed_roles:
        logger.error(
            f"Security Alert: Caller '{caller.username}' with role '{caller.role.value}' denied for tool '{tool_name}'"
        )
        return ActionResult(
            tool_name=tool_name,
            status="REJECTED_UNAUTHORIZED",
            output={},
            error=f"Caller role '{caller.role.value}' is not authorized to execute tool '{tool_name}'",
        )

    try:
        # 2. Dispatch
        if tool_name == "create_incident":
            output = await create_incident_tool(
                session=session,
                incident_id=parameters["incident_id"],
                event_id=parameters["event_id"],
                title=parameters["title"],
                severity=parameters["severity"],
            )
        elif tool_name == "send_supervisor_alert":
            output = await send_supervisor_alert_tool(
                session=session,
                incident_id=parameters["incident_id"],
                channel=parameters.get("channel", "MOCK_CONSOLE"),
                recipient=parameters.get("recipient", "supervisor_on_duty"),
                message=parameters["message"],
                idempotency_key=idempotency_key,
            )
        elif tool_name == "request_human_review":
            output = await request_human_review_tool(
                session=session,
                incident_id=parameters["incident_id"],
                reason=parameters["reason"],
            )
        elif tool_name == "get_incident_status":
            output = await get_incident_status_tool(
                session=session,
                incident_id=parameters["incident_id"],
            )
        else:
            output = {}

        return ActionResult(
            tool_name=tool_name,
            status="SUCCESS",
            output=output,
            error=None,
        )
    except Exception as e:
        logger.error(f"Tool execution failed for '{tool_name}': {e}")
        return ActionResult(
            tool_name=tool_name,
            status="FAILED",
            output={},
            error=str(e),
        )
