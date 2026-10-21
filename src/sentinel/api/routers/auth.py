"""
Authentication API Router.
Handles credential verification, JWT token issuance, and authenticated identity introspection.
"""


from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from sentinel.security.auth import (
    AuthenticatedUser,
    UserRole,
    create_access_token,
    get_current_user,
)

router = APIRouter(prefix="/api/v1/auth", tags=["Authentication"])

# Predefined operational accounts for secure demo and test deployments
# In production, these are provisioned via enterprise identity directory or database
DEMO_CREDENTIALS = {
    "admin": {
        "password": "admin_secure_password_99!",
        "role": UserRole.ADMIN,
        "user_id": "usr_admin_001",
    },
    "safety_officer": {
        "password": "officer_secure_password_42!",
        "role": UserRole.SAFETY_OFFICER,
        "user_id": "usr_officer_001",
    },
    "viewer": {
        "password": "viewer_read_only_pass_12!",
        "role": UserRole.VIEWER,
        "user_id": "usr_viewer_001",
    },
}


class TokenRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: str
    expires_in: int = 3600


class UserMeResponse(BaseModel):
    user_id: str
    username: str
    role: str


@router.post("/token", response_model=TokenResponse)
async def login_for_access_token(payload: TokenRequest):
    """
    Validates user credentials server-side and issues a signed JWT access token.
    Rejects invalid credentials with HTTP 401.
    """
    account = DEMO_CREDENTIALS.get(payload.username)
    if not account or account["password"] != payload.password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(
        user_id=account["user_id"],
        username=payload.username,
        role=account["role"],
    )

    return TokenResponse(
        access_token=token,
        role=account["role"].value,
        user_id=account["user_id"],
    )


@router.get("/me", response_model=UserMeResponse)
async def get_current_user_profile(user: AuthenticatedUser = Depends(get_current_user)):
    """Returns the verified profile of the authenticated caller."""
    return UserMeResponse(
        user_id=user.user_id,
        username=user.username,
        role=user.role.value,
    )
