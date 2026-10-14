"""The API is internet-facing on Fly: every route but /health needs the token."""

import re

import pytest
from fastapi.routing import APIRoute

from health.api.auth import require_token
from health.api.main import app
from health.config import check_public_token, settings

OPEN = {"/health", "/connect/coros/callback"}  # the browser lands on the callback


def _api_routes(routes, inherited=()):
    """Every APIRoute with the dependencies it runs under, including routes of included
    routers (FastAPI 0.14x mounts those lazily, so app.routes doesn't list them)."""
    for r in routes:
        if isinstance(r, APIRoute):
            yield r, [*inherited, *r.dependencies]
        elif hasattr(r, "original_router"):
            yield from _api_routes(
                r.original_router.routes, [*inherited, *r.original_router.dependencies]
            )


def test_every_route_but_health_requires_the_token():
    routes = list(_api_routes(app.routes))
    assert any(r.path == "/documents" for r, _ in routes)  # the walk reaches included routers
    unprotected = [
        r.path
        for r, deps in routes
        if r.path not in OPEN and not any(d.dependency is require_token for d in deps)
    ]
    assert unprotected == []


def test_requests_without_the_token_are_refused(tmp_db):
    from fastapi.testclient import TestClient

    with TestClient(app) as c:
        for r, _ in _api_routes(app.routes):
            if r.path in OPEN:
                continue
            path = re.sub(r"\{[^}]+\}", "1", r.path)
            for method in r.methods:
                assert c.request(method, path).status_code == 401, f"{method} {r.path}"


def test_public_deploy_refuses_weak_tokens(monkeypatch):
    monkeypatch.setattr(settings, "public", True)
    for weak in ("change-me", "devtoken", "short-token"):
        monkeypatch.setattr(settings, "api_token", weak)
        with pytest.raises(RuntimeError):
            check_public_token()
    monkeypatch.setattr(settings, "api_token", "zQTv1IUSESzeGiJRTCGTEcr_7mUgD_xx")
    check_public_token()
    monkeypatch.setattr(settings, "public", False)
    monkeypatch.setattr(settings, "api_token", "change-me")
    check_public_token()  # local dev keeps working with the placeholder
