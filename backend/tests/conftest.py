from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def fixture_text():
    def _load(name: str) -> str:
        text = (FIXTURES / "coros" / name).read_text()
        # MCP tool results arrive as a JSON string; fixtures are stored quoted the same way.
        if text.startswith('"') and text.rstrip().endswith('"'):
            text = text.strip()[1:-1]
        return text

    return _load


@pytest.fixture
def tmp_db(tmp_path, monkeypatch):
    """Fresh SQLite database per test, with the API token fixed to `testtoken`."""
    from health import db as dbmod
    from health.config import settings

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "database_url", f"sqlite:///{tmp_path}/t.db")
    monkeypatch.setattr(settings, "api_token", "testtoken")
    dbmod._engine = None
    dbmod._SessionLocal = None
    dbmod.init_db()
    yield
    dbmod._engine = None
    dbmod._SessionLocal = None
