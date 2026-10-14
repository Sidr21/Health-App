"""COROS login started from the app, so no Mac is needed (Connections screen).

The server runs the OAuth client: it registers itself with COROS (dynamic client
registration) using its own public callback URL, hands the authorization URL to the app, the
app opens it in an in-app browser, COROS redirects to `/connect/coros/callback`, and the
server exchanges the code. Tokens are kept in memory until the whole flow succeeds and only
then replace `coros_oauth.json`, so a failed attempt never breaks a working login. One login
can be pending at a time; a new start replaces it.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from mcp.client.auth import OAuthClientProvider
from mcp.shared.auth import AuthorizationCodeResult, OAuthClientInformationFull, OAuthToken

from health.config import settings
from health.sources.coros.mcp_client import CorosMcp, client_metadata

PENDING_TIMEOUT_S = 600  # time allowed to finish logging in on the COROS page


class MemoryTokenStorage:
    def __init__(self) -> None:
        self.tokens: OAuthToken | None = None
        self.client: OAuthClientInformationFull | None = None

    async def get_tokens(self) -> OAuthToken | None:
        return self.tokens

    async def set_tokens(self, tokens: OAuthToken) -> None:
        self.tokens = tokens

    async def get_client_info(self) -> OAuthClientInformationFull | None:
        return self.client

    async def set_client_info(self, client_info: OAuthClientInformationFull) -> None:
        self.client = client_info

    def save(self) -> None:
        assert self.tokens and self.client
        data: dict[str, Any] = {
            "tokens": self.tokens.model_dump(exclude_none=True),
            "client": self.client.model_dump(exclude_none=True, mode="json"),
        }
        path = settings.coros_token_path
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=2))
        tmp.chmod(0o600)
        tmp.replace(path)


class LoginError(Exception):
    pass


class _Pending:
    def __init__(self, callback_url: str, return_to: str | None):
        loop = asyncio.get_running_loop()
        self.return_to = return_to
        self.url: asyncio.Future[str] = loop.create_future()
        self.code: asyncio.Future[AuthorizationCodeResult] = loop.create_future()
        self.storage = MemoryTokenStorage()
        self.provider = OAuthClientProvider(
            server_url=settings.coros_mcp_url,
            client_metadata=client_metadata(callback_url),
            storage=self.storage,
            redirect_handler=self._redirect,
            callback_handler=self._callback,
        )
        self.task = asyncio.create_task(self._run())

    async def _redirect(self, url: str) -> None:
        if not self.url.done():
            self.url.set_result(url)

    async def _callback(self) -> AuthorizationCodeResult:
        return await asyncio.wait_for(self.code, PENDING_TIMEOUT_S)

    async def _run(self) -> None:
        try:
            async with CorosMcp(auth=self.provider) as c:
                await c.list_tools()  # proves the new token works before it is saved
            self.storage.save()
        except BaseException as e:
            if not self.url.done():  # failed before COROS even showed a login page
                self.url.set_exception(LoginError(f"COROS refused the login: {e}"))
            raise


_pending: _Pending | None = None


async def start(callback_url: str, return_to: str | None = None) -> str:
    """Begin a login; returns the COROS authorization URL to open in a browser."""
    global _pending
    if _pending and not _pending.task.done():
        _pending.task.cancel()
    _pending = _Pending(callback_url, return_to)
    try:
        return await asyncio.wait_for(asyncio.shield(_pending.url), 30)
    except TimeoutError as e:
        _pending.task.cancel()
        raise LoginError("COROS did not answer in time") from e


async def finish(params: dict[str, str]) -> str | None:
    """Handle the redirect back from COROS. Returns where to send the browser next."""
    p = _pending
    if p is None or p.task.done():
        raise LoginError("no COROS login in progress: start again from the app")
    if "error" in params:
        p.task.cancel()
        raise LoginError(f"COROS said: {params.get('error_description') or params['error']}")
    if not params.get("code"):
        raise LoginError("COROS sent no authorization code")
    p.code.set_result(
        AuthorizationCodeResult(
            code=params["code"], state=params.get("state"), iss=params.get("iss")
        )
    )
    try:
        await asyncio.wait_for(asyncio.shield(p.task), 60)
    except Exception as e:
        raise LoginError(f"could not finish the COROS login: {e}") from e
    return p.return_to


def disconnect() -> bool:
    path = settings.coros_token_path
    if path.exists():
        path.unlink()
        return True
    return False
