"""Client for the official COROS MCP server (https://mcp.coros.com/mcp, which hands each account
to a regional host such as https://mcpus.coros.com/mcp; see `resolve_mcp_url`).

Spike for DESIGN §3.1: can a third-party backend authenticate? The server advertises OAuth
(RFC 9728 protected-resource metadata); the MCP SDK's OAuthClientProvider handles discovery,
dynamic client registration (RFC 7591), PKCE and token refresh. Tokens are stored in
`data/coros_oauth.json`. Run `health coros auth` on a machine with a browser.
"""

from __future__ import annotations

import asyncio
import json
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx2
from mcp import ClientSession
from mcp.client.auth import OAuthClientProvider, TokenStorage
from mcp.client.streamable_http import streamable_http_client
from mcp.shared.auth import (
    AuthorizationCodeResult,
    OAuthClientInformationFull,
    OAuthClientMetadata,
    OAuthToken,
)

from health.config import settings


class FileTokenStorage(TokenStorage):
    def __init__(self, path: Path):
        self.path = path

    def _read(self) -> dict[str, Any]:
        if self.path.exists():
            return json.loads(self.path.read_text())
        return {}

    def _write(self, data: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(data, indent=2))
        self.path.chmod(0o600)

    async def get_tokens(self) -> OAuthToken | None:
        tok = self._read().get("tokens")
        return OAuthToken.model_validate(tok) if tok else None

    async def set_tokens(self, tokens: OAuthToken) -> None:
        data = self._read()
        data["tokens"] = tokens.model_dump(exclude_none=True)
        self._write(data)

    async def get_client_info(self) -> OAuthClientInformationFull | None:
        info = self._read().get("client")
        return OAuthClientInformationFull.model_validate(info) if info else None

    async def set_client_info(self, client_info: OAuthClientInformationFull) -> None:
        data = self._read()
        data["client"] = client_info.model_dump(exclude_none=True, mode="json")
        self._write(data)


class _CallbackServer:
    """One-shot localhost HTTP server that captures ?code=&state= from the OAuth redirect."""

    def __init__(self, port: int):
        self.port = port
        self.result: dict[str, str] = {}
        self._done = threading.Event()
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):  # noqa: N802
                qs = parse_qs(urlparse(self.path).query)
                outer.result = {k: v[0] for k, v in qs.items()}
                self.send_response(200)
                self.send_header("content-type", "text/html")
                self.end_headers()
                self.wfile.write(b"<h2>COROS login complete. You can close this tab.</h2>")
                outer._done.set()

            def log_message(self, *_):
                pass

        self._server = HTTPServer(("127.0.0.1", port), Handler)

    def serve(self) -> None:
        threading.Thread(target=self._server.serve_forever, daemon=True).start()

    async def wait(self, timeout: float = 300) -> AuthorizationCodeResult:
        loop = asyncio.get_running_loop()
        ok = await loop.run_in_executor(None, self._done.wait, timeout)
        self._server.shutdown()
        if not ok:
            raise TimeoutError("no OAuth callback received")
        if "error" in self.result:
            raise RuntimeError(f"OAuth error: {self.result}")
        return AuthorizationCodeResult(
            code=self.result["code"], state=self.result.get("state"), iss=self.result.get("iss")
        )


_resolved: dict[str, str] = {}


def _site(host: str) -> str:
    return ".".join(host.lower().split(".")[-2:])


async def resolve_mcp_url(url: str | None = None) -> str:
    """The MCP URL to use. COROS serves accounts from regional hosts (mcpus.coros.com in the
    US) and says which in its protected-resource metadata (RFC 9728); the MCP SDK refuses a
    URL that differs from that resource instead of following it. So read the metadata first
    and use the resource it names, as long as it is https on the same site (*.coros.com)."""
    url = url or settings.coros_mcp_url
    if url in _resolved:
        return _resolved[url]
    p = urlparse(url)
    origin = f"{p.scheme}://{p.netloc}"
    resolved = url
    try:
        async with httpx2.AsyncClient(timeout=15) as h:
            for meta in (
                f"{origin}/.well-known/oauth-protected-resource{p.path}",
                f"{origin}/.well-known/oauth-protected-resource",
            ):
                r = await h.get(meta)
                if r.status_code != 200:
                    continue
                resource = r.json().get("resource")
                if isinstance(resource, str):
                    q = urlparse(resource)
                    if (
                        q.scheme == "https"
                        and q.hostname
                        and p.hostname
                        and _site(q.hostname) == _site(p.hostname)
                    ):
                        resolved = resource
                break
    except (httpx2.HTTPError, ValueError):
        pass  # no metadata: connect to the configured URL and let the SDK report what's wrong
    _resolved[url] = resolved
    return resolved


def client_metadata(redirect_uri: str) -> OAuthClientMetadata:
    return OAuthClientMetadata(
        client_name="Health App (personal)",
        redirect_uris=[redirect_uri],
        grant_types=["authorization_code", "refresh_token"],
        response_types=["code"],
        token_endpoint_auth_method="none",
    )


def build_auth(interactive: bool, server_url: str | None = None) -> OAuthClientProvider:
    port = settings.coros_oauth_callback_port
    cb = _CallbackServer(port) if interactive else None

    async def redirect_handler(url: str) -> None:
        print(f"\nOpen this URL to log in to COROS:\n{url}\n")
        webbrowser.open(url)

    async def callback_handler() -> AuthorizationCodeResult:
        assert cb is not None
        return await cb.wait()

    if cb:
        cb.serve()
    return OAuthClientProvider(
        server_url=server_url or settings.coros_mcp_url,
        client_metadata=client_metadata(f"http://127.0.0.1:{port}/callback"),
        storage=FileTokenStorage(settings.coros_token_path),
        redirect_handler=redirect_handler if interactive else None,
        callback_handler=callback_handler if interactive else None,
    )


class CorosMcp:
    """`async with CorosMcp() as c: await c.call("queryUserInfo")`."""

    def __init__(self, interactive: bool = False, auth: OAuthClientProvider | None = None):
        self.interactive = interactive
        self._auth = auth  # a prepared provider (the in-app login); else built from settings
        self.session: ClientSession | None = None

    async def __aenter__(self) -> CorosMcp:
        url = await resolve_mcp_url()
        auth = self._auth or build_auth(self.interactive, url)
        self._http = httpx2.AsyncClient(auth=auth, timeout=60)
        self._transport = streamable_http_client(url, http_client=self._http)
        read, write, *_ = await self._transport.__aenter__()
        self._session_cm = ClientSession(read, write)
        self.session = await self._session_cm.__aenter__()
        await self.session.initialize()
        return self

    async def __aexit__(self, *exc) -> None:
        await self._session_cm.__aexit__(*exc)
        await self._transport.__aexit__(*exc)
        await self._http.aclose()

    async def list_tools(self) -> list[str]:
        assert self.session
        res = await self.session.list_tools()
        return [t.name for t in res.tools]

    async def call(self, tool: str, args: dict[str, Any] | None = None) -> str:
        """Returns the concatenated text content of the tool result."""
        assert self.session
        res = await self.session.call_tool(tool, args or {})
        parts = []
        for c in res.content:
            text = getattr(c, "text", None)
            if text is not None:
                parts.append(text)
        if res.is_error:
            raise RuntimeError(f"{tool} failed: {''.join(parts)[:500]}")
        return "\n".join(parts)
