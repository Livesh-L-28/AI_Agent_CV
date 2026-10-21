"""
SENTINEL AI Server-Trusted Authentication and Authorization Module.
Provides verified JWT issuance, signature validation, RBAC dependencies,
and WebSocket handshake authentication.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from enum import StrEnum
from typing import Any, Callable, Optional

import jwt
from fastapi import Depends, Header, HTTPException, Query, WebSocket, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel, Field

from sentinel.config import get_settings
from sentinel.logging import setup_logging

logger = setup_logging()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token", auto_error=False)


class UserRole(StrEnum):
    """Least-privilege operational roles within SENTINEL AI."""

    VIEWER = "viewer"
    SAFETY_OFFICER = "safety_officer"
    ADMIN = "admin"


class AuthenticatedUser(BaseModel):
    """Immutable representation of a server-verified caller identity."""

    user_id: str
    username: str
    role: UserRole
    scopes: list[str] = Field(default_factory=list)


# Internal System Caller used strictly by automated camera inference & background agent pipelines
SYSTEM_CALLER = AuthenticatedUser(
    user_id="sys_sentinel_internal",
    username="sentinel_internal_orchestrator",
    role=UserRole.ADMIN,
    scopes=["internal_execution"],
)


def create_access_token(
    user_id: str,
    username: str,
    role: UserRole | str,
    expires_delta: Optional[timedelta] = None,
    scopes: Optional[list[str]] = None,
    secret_key_override: Optional[str] = None,
) -> str:
    """
    Creates a cryptographically signed JWT access token.
    Never embeds secrets or credentials in logs.
    """
    settings = get_settings()
    now = datetime.now(timezone.utc)

    if expires_delta is not None:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.jwt_access_token_expire_minutes)

    role_str = role.value if isinstance(role, UserRole) else str(role)

    payload: dict[str, Any] = {
        "sub": user_id,
        "username": username,
        "role": role_str,
        "scopes": scopes or [],
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }

    if settings.jwt_issuer:
        payload["iss"] = settings.jwt_issuer
    if settings.jwt_audience:
        payload["aud"] = settings.jwt_audience

    signing_key = secret_key_override or settings.get_jwt_secret_key()
    return jwt.encode(payload, signing_key, algorithm=settings.jwt_algorithm)


def decode_access_token(
    token: str,
    secret_key_override: Optional[str] = None,
) -> AuthenticatedUser:
    """
    Decodes and rigorously validates an access token:
    - Verifies cryptographic signature using configured algorithm
    - Enforces expiration time
    - Verifies issuer and audience if configured
    """
    settings = get_settings()
    signing_key = secret_key_override or settings.get_jwt_secret_key()

    options = {
        "verify_signature": True,
        "verify_exp": True,
        "verify_iat": True,
        "require": ["exp", "sub"],
    }

    try:
        decoded = jwt.decode(
            token,
            signing_key,
            algorithms=[settings.jwt_algorithm],
            options=options,
            issuer=settings.jwt_issuer if settings.jwt_issuer else None,
            audience=settings.jwt_audience if settings.jwt_audience else None,
        )
    except jwt.ExpiredSignatureError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or malformed authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e

    try:
        role_enum = UserRole(decoded.get("role", UserRole.VIEWER.value))
    except ValueError:
        role_enum = UserRole.VIEWER

    return AuthenticatedUser(
        user_id=decoded["sub"],
        username=decoded.get("username", decoded["sub"]),
        role=role_enum,
        scopes=decoded.get("scopes", []),
    )


async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    auth_header: Optional[str] = Header(None, alias="Authorization"),
) -> AuthenticatedUser:
    """
    FastAPI dependency: Extracts and verifies JWT credentials from request.
    Rejects unauthenticated requests with HTTP 401.
    """
    extracted_token = token
    if not extracted_token and auth_header:
        if auth_header.startswith("Bearer "):
            extracted_token = auth_header.split(" ", 1)[1].strip()

    if not extracted_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return decode_access_token(extracted_token)


async def get_current_user_with_query(
    token: Optional[str] = Depends(oauth2_scheme),
    auth_header: Optional[str] = Header(None, alias="Authorization"),
    token_query: Optional[str] = Query(None, alias="token"),
) -> AuthenticatedUser:
    """
    Extracts and verifies JWT token from Authorization header, Bearer token, or query param ?token=.
    Useful for authenticated browser media streams (MJPEG/HLS) that cannot inject custom headers.
    """
    extracted = token or token_query
    if not extracted and auth_header:
        if auth_header.startswith("Bearer "):
            extracted = auth_header.split(" ", 1)[1].strip()

    if not extracted:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return decode_access_token(extracted)


def require_role(*allowed_roles: UserRole | str) -> Callable[[AuthenticatedUser], AuthenticatedUser]:
    """
    Factory creating a role-enforcement dependency.
    Always derives authorization strictly from verified token claims.
    """
    normalized_allowed = {
        r.value if isinstance(r, UserRole) else str(r) for r in allowed_roles
    }

    def role_dependency(
        user: AuthenticatedUser = Depends(get_current_user),
    ) -> AuthenticatedUser:
        # Administrators satisfy all operational role requirements
        if user.role == UserRole.ADMIN:
            return user

        if user.role.value not in normalized_allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden: role '{user.role.value}' is not permitted to perform this action",
            )
        return user

    return role_dependency


async def authenticate_websocket(websocket: WebSocket) -> AuthenticatedUser:
    """
    Authenticates a WebSocket connection before accepting handshake.
    Supports query parameter (?token=...) or Authorization header.
    Closes with RFC-6455 policy violation (1008) upon failure.
    """
    token = websocket.query_params.get("token")
    if not token:
        auth_hdr = websocket.headers.get("authorization")
        if auth_hdr and auth_hdr.startswith("Bearer "):
            token = auth_hdr.split(" ", 1)[1].strip()

    if not token:
        await websocket.close(code=1008, reason="Authentication token missing")
        raise HTTPException(status_code=401, detail="Authentication token missing")

    try:
        return decode_access_token(token)
    except HTTPException:
        await websocket.close(code=1008, reason="Authentication token invalid or expired")
        raise
