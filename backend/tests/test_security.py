"""The API is internet-facing on Fly: every route but /health needs the token."""

import pytest
from fastapi.routing import APIRoute

from health.api.auth import require_token
from health.api.main import app
from health.config import check_public_token, settings

OPEN = {"/health", "/connect/coros/callback"}  # the browser lands on the callback


def test_every_route_but_health_requires_the_token():
    unprotected = [
        r.path
        for r in app.routes
        if isinstance(r, APIRoute)
        and r.path not in OPEN
        and not any(d.dependency is require_token for d in r.dependencies)
    ]
    assert unprotected == []


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
