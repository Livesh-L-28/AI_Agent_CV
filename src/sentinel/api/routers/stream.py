"""
WebSocket Live Telemetry and Event Streaming Router.
Provides real-time updates for connected React dashboard clients.
Protected with server-trusted token validation.
"""

from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from sentinel.logging import setup_logging
from sentinel.security.auth import authenticate_websocket

logger = setup_logging()

router = APIRouter(tags=["Stream"])


class ConnectionManager:
    """Manages active WebSocket client connections for real-time live monitoring."""

    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket client connected. Total clients: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"WebSocket client disconnected. Total clients: {len(self.active_connections)}")

    async def broadcast_json(self, message: dict[str, Any]) -> None:
        """Broadcasts a JSON message to all connected dashboards."""
        dead_connections = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                dead_connections.append(connection)

        for dead in dead_connections:
            self.disconnect(dead)


stream_manager = ConnectionManager()


@router.websocket("/api/v1/stream")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time video telemetry, bounding boxes,
    and instantaneous safety event alerts.
    Requires verified JWT authentication token via ?token= query parameter or Authorization header.
    """
    # 1. Server-side credential validation before acceptance
    user = await authenticate_websocket(websocket)

    # 2. Establish connection
    await stream_manager.connect(websocket)
    try:
        # Send initial connection handshake with authenticated caller context
        await websocket.send_json(
            {
                "type": "HANDSHAKE",
                "message": "Connected to SENTINEL AI Live Stream Engine",
                "authenticated_user": user.username,
                "role": user.role.value,
                "active_clients": len(stream_manager.active_connections),
            }
        )

        while True:
            # Keep connection alive; accept client control commands (e.g. ping/heartbeat)
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        stream_manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error for user {user.username}: {e}")
        stream_manager.disconnect(websocket)
