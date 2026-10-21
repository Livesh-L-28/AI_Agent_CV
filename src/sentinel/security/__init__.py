"""
SENTINEL AI Security Subsystem.
Provides cryptographic authentication, authorization gates, and sanitization.
"""

from sentinel.security.auth import (
    SYSTEM_CALLER,
    AuthenticatedUser,
    UserRole,
    authenticate_websocket,
    create_access_token,
    decode_access_token,
    get_current_user,
    require_role,
)

__all__ = [
    "SYSTEM_CALLER",
    "AuthenticatedUser",
    "UserRole",
    "authenticate_websocket",
    "create_access_token",
    "decode_access_token",
    "get_current_user",
    "require_role",
]
