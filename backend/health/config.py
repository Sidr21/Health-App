from __future__ import annotations

from datetime import date
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration. Every field can be set via an environment variable or `.env`."""

    model_config = SettingsConfigDict(env_prefix="HEALTH_", env_file=".env", extra="ignore")

    data_dir: Path = Path("data")
    database_url: str = "sqlite:///data/health.db"
    api_token: str = "change-me"  # bearer token the phone presents
    timezone: str = "America/New_York"
    today: date | None = None  # pin "today" (tests, replaying a past day)

    coros_mcp_url: str = "https://mcp.coros.com/mcp"
    coros_oauth_callback_port: int = 8765
    # contents of data/coros_oauth.json from `health coros auth` on a machine with a browser;
    # written to the data dir on startup when no token file exists yet (cloud deploys)
    coros_token_json: str | None = None

    # background sync inside the API process (0 = off; the cloud deploy sets 15)
    sync_interval_min: int = 0
    sync_days: int = 3  # window of each quick sync
    sync_full_days: int = 30  # nightly deeper sync catches late edits and missed days
    sync_full_hour: int = 4  # local hour after which the day's deep sync runs
    sync_fit_limit: int = 3  # new FIT downloads per run (COROS caps daily downloads)
    docs: bool = True  # serve /docs and /openapi.json

    @property
    def raw_dir(self) -> Path:
        return self.data_dir / "raw"

    @property
    def coros_token_path(self) -> Path:
        return self.data_dir / "coros_oauth.json"


settings = Settings()


def today_local():
    """Today's date in the user's time zone (the server runs in UTC), unless pinned."""
    from datetime import datetime
    from zoneinfo import ZoneInfo

    if settings.today is not None:
        return settings.today
    return datetime.now(ZoneInfo(settings.timezone)).date()
