"""A tiny OAuth authorization server for tests: registers any client, auto-approves every
login (as if the user clicked "Allow" on the COROS page) and issues opaque tokens."""

from __future__ import annotations

import secrets
import time

from mcp.server.auth.provider import (
    AccessToken,
    AuthorizationCode,
    AuthorizationParams,
    RefreshToken,
    construct_redirect_uri,
)
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken


class AutoApproveProvider:
    def __init__(self) -> None:
        self.clients: dict[str, OAuthClientInformationFull] = {}
        self.codes: dict[str, AuthorizationCode] = {}
        self.access: dict[str, AccessToken] = {}
        self.refresh: dict[str, RefreshToken] = {}

    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        return self.clients.get(client_id)

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        self.clients[client_info.client_id] = client_info

    async def authorize(
        self, client: OAuthClientInformationFull, params: AuthorizationParams
    ) -> str:
        code = secrets.token_urlsafe(16)
        self.codes[code] = AuthorizationCode(
            code=code,
            scopes=params.scopes or [],
            expires_at=time.time() + 300,
            client_id=client.client_id,
            code_challenge=params.code_challenge,
            redirect_uri=params.redirect_uri,
            redirect_uri_provided_explicitly=params.redirect_uri_provided_explicitly,
            resource=params.resource,
        )
        return construct_redirect_uri(str(params.redirect_uri), code=code, state=params.state)

    async def load_authorization_code(self, client, authorization_code: str):
        return self.codes.get(authorization_code)

    def _issue(self, client_id: str, scopes: list[str], resource: str | None) -> OAuthToken:
        at, rt = secrets.token_urlsafe(16), secrets.token_urlsafe(16)
        self.access[at] = AccessToken(
            token=at,
            client_id=client_id,
            scopes=scopes,
            expires_at=int(time.time()) + 3600,
            resource=resource,
        )
        self.refresh[rt] = RefreshToken(
            token=rt, client_id=client_id, scopes=scopes, resource=resource
        )
        return OAuthToken(access_token=at, token_type="Bearer", expires_in=3600, refresh_token=rt)

    async def exchange_authorization_code(self, client, authorization_code: AuthorizationCode):
        self.codes.pop(authorization_code.code, None)
        return self._issue(client.client_id, authorization_code.scopes, authorization_code.resource)

    async def load_refresh_token(self, client, refresh_token: str):
        return self.refresh.get(refresh_token)

    async def exchange_refresh_token(self, client, refresh_token: RefreshToken, scopes):
        self.refresh.pop(refresh_token.token, None)
        return self._issue(client.client_id, scopes or refresh_token.scopes, refresh_token.resource)

    async def load_access_token(self, token: str):
        return self.access.get(token)

    async def revoke_token(self, token) -> None:
        self.access.pop(getattr(token, "token", ""), None)
