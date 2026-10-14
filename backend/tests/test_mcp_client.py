"""CorosMcp against a real (local) MCP server built with the installed SDK, so an SDK upgrade
that changes the client API fails here instead of on the first real COROS sync."""

import asyncio
import socket
import threading
import time

import pytest
import uvicorn

from health.config import settings
from health.sources.coros.mcp_client import CorosMcp


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture
def fake_coros(tmp_path, monkeypatch):
    from mcp.server.mcpserver import MCPServer

    srv = MCPServer("fake-coros")

    @srv.tool()
    def queryUserInfo() -> str:  # noqa: N802 - COROS tool name
        return "Nickname: test\nHeight: 175 cm"

    @srv.tool()
    def broken() -> str:
        raise ValueError("nope")

    port = _free_port()
    config = uvicorn.Config(
        srv.streamable_http_app(), host="127.0.0.1", port=port, log_level="error"
    )
    server = uvicorn.Server(config)
    t = threading.Thread(target=server.run, daemon=True)
    t.start()
    for _ in range(100):
        if server.started:
            break
        time.sleep(0.05)
    monkeypatch.setattr(settings, "coros_mcp_url", f"http://127.0.0.1:{port}/mcp")
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    yield
    server.should_exit = True
    t.join(5)


def test_call_tool_returns_text(fake_coros):
    async def go():
        async with CorosMcp() as c:
            tools = await c.list_tools()
            text = await c.call("queryUserInfo")
            with pytest.raises(RuntimeError, match="broken failed"):
                await c.call("broken")
            return tools, text

    tools, text = asyncio.run(go())
    assert "queryUserInfo" in tools and "Height: 175 cm" in text


@pytest.fixture
def oauth_coros(tmp_path, monkeypatch):
    """A local MCP server that requires OAuth, like mcp.coros.com."""
    from mcp.server.auth.settings import AuthSettings, ClientRegistrationOptions
    from mcp.server.mcpserver import MCPServer

    from tests.fake_oauth import AutoApproveProvider

    port = _free_port()
    base = f"http://127.0.0.1:{port}"
    provider = AutoApproveProvider()
    srv = MCPServer(
        "fake-coros-oauth",
        auth_server_provider=provider,
        auth=AuthSettings(
            issuer_url=base,
            resource_server_url=f"{base}/mcp",
            client_registration_options=ClientRegistrationOptions(enabled=True),
            validate_token_resource=True,
        ),
    )

    @srv.tool()
    def queryUserInfo() -> str:  # noqa: N802
        return "Nickname: oauth-user"

    config = uvicorn.Config(
        srv.streamable_http_app(), host="127.0.0.1", port=port, log_level="error"
    )
    server = uvicorn.Server(config)
    t = threading.Thread(target=server.run, daemon=True)
    t.start()
    for _ in range(100):
        if server.started:
            break
        time.sleep(0.05)
    monkeypatch.setattr(settings, "coros_mcp_url", f"{base}/mcp")
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    yield provider
    server.should_exit = True
    t.join(5)


def test_cli_login_then_headless_calls(oauth_coros, monkeypatch):
    """`health coros auth`: browser login via the localhost callback, token saved, later
    non-interactive syncs reuse it."""
    import webbrowser

    import httpx2

    monkeypatch.setattr(settings, "coros_oauth_callback_port", _free_port())

    def browser(url: str) -> bool:  # the "user" logs in: follow COROS's redirect to the callback
        def go():
            with httpx2.Client(follow_redirects=True, timeout=10) as h:
                h.get(url)

        threading.Thread(target=go, daemon=True).start()
        return True

    monkeypatch.setattr(webbrowser, "open", browser)

    async def login():
        async with CorosMcp(interactive=True) as c:
            return await c.call("queryUserInfo")

    assert "oauth-user" in asyncio.run(login())
    assert settings.coros_token_path.exists()

    async def headless():
        async with CorosMcp() as c:
            return await c.call("queryUserInfo")

    assert "oauth-user" in asyncio.run(headless())


@pytest.mark.usefixtures("tmp_db")
def test_in_app_login_through_the_api(oauth_coros, monkeypatch):
    """Connections screen: start → COROS page → redirect to our callback → token saved."""
    import httpx2
    from fastapi.testclient import TestClient

    from health import scheduler
    from health.api.main import app

    synced = []

    async def fake_sync(days, fit_limit):
        synced.append(days)
        return {}

    monkeypatch.setattr(scheduler, "_coros_sync", fake_sync)
    monkeypatch.setattr(scheduler, "state", scheduler.SyncState())
    h = {"Authorization": "Bearer testtoken"}
    with TestClient(app, base_url="https://health.example") as c:
        assert c.get("/connections", headers=h).json()["coros"]["connected"] is False
        bad = c.post("/connect/coros/start", json={"return_to": "https://evil"}, headers=h)
        assert bad.status_code == 422
        r = c.post("/connect/coros/start", json={"return_to": "healthapp://connections"}, headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["callback_url"] == "https://health.example/connect/coros/callback"
        # the user logs in on the COROS page, which redirects to our callback with a code
        with httpx2.Client(timeout=10) as browser:
            page = browser.get(r.json()["auth_url"])
        assert page.status_code in (302, 303, 307)
        to = httpx2.URL(page.headers["location"])
        assert str(to).startswith("https://health.example/connect/coros/callback")
        done = c.get(f"/connect/coros/callback?{to.query.decode()}", follow_redirects=False)
        assert done.status_code == 302 and done.headers["location"] == (
            "healthapp://connections?coros=connected"
        )
        assert settings.coros_token_path.exists()
        conn = c.get("/connections", headers=h).json()
        assert conn["coros"]["connected"] is True
        # a replayed or forged callback is refused
        again = c.get(f"/connect/coros/callback?{to.query.decode()}")
        assert again.status_code == 400 and "no COROS login in progress" in again.text

        async def headless():  # the token saved by the in-app login works for syncing
            async with CorosMcp() as mcp:
                return await mcp.call("queryUserInfo")

        assert "oauth-user" in asyncio.run(headless())
        assert c.delete("/connect/coros", headers=h).json() == {"removed": True, "connected": False}
        assert not settings.coros_token_path.exists()

    assert synced == [settings.sync_full_days]  # a full sync started right after connecting
