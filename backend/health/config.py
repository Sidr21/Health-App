from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration. Every field can be set via an environment variable or `.env`."""

    model_config = SettingsConfigDict(env_prefix="HEALTH_", env_file=".env", extra="ignore")

    data_dir: Path = Path("data")
    database_url: str = "sqlite:///data/health.db"
    api_token: str = "change-me"  # bearer token the phone presents
    timezone: str = "America/New_York"

    coros_mcp_url: str = "https://mcp.coros.com/mcp"
    coros_oauth_callback_port: int = 8765

    @property
    def raw_dir(self) -> Path:
        return self.data_dir / "raw"

    @property
    def coros_token_path(self) -> Path:
        return self.data_dir / "coros_oauth.json"


settings = Settings()
