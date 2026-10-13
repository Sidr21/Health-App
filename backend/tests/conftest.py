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
