from __future__ import annotations

import secrets

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from health.config import settings

_bearer = HTTPBearer(auto_error=False)


def require_token(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> None:
    if creds is None or not secrets.compare_digest(creds.credentials, settings.api_token):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid token")
