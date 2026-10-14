"""Background COROS sync for the hosted backend.

One loop inside the API process: a quick sync of the last `sync_days` every
`sync_interval_min` minutes, and once a day (first run after `sync_full_hour` local time) a
deeper sync of `sync_full_days`. Each run pulls from the COROS MCP, then recomputes scores for
the synced window. Runs never overlap (`POST /sync` checks the same running flag), and the sync
itself runs
in a worker thread so the API keeps answering while it works.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from dataclasses import asdict, dataclass, field
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from health.config import settings, today_local

log = logging.getLogger("health.sync")

SyncFn = Callable[[int, int], Awaitable[dict[str, int]]]


@dataclass
class SyncState:
    enabled: bool = False
    interval_min: int = 0
    running: bool = False
    last_started: str | None = None
    last_finished: str | None = None
    last_ok: bool | None = None
    last_error: str | None = None
    last_days: int | None = None
    last_counts: dict[str, int] = field(default_factory=dict)
    last_full_date: str | None = None
    next_run: str | None = None

    def public(self) -> dict:
        return {**asdict(self), "coros_auth": coros_authorized()}


state = SyncState()
NO_AUTH = (
    "no COROS login on this server: run `health coros auth` on a Mac and set "
    "HEALTH_COROS_TOKEN_JSON (docs/SETUP.md §3)"
)
_tasks: set[asyncio.Task] = set()  # strong refs so background runs aren't garbage-collected


def start_background(coro) -> asyncio.Task:
    task = asyncio.create_task(coro)
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return task


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def coros_authorized() -> bool:
    return settings.coros_token_path.exists()


def seed_coros_token() -> bool:
    """Write HEALTH_COROS_TOKEN_JSON to the token file if there is none yet. The file then
    takes over: token refreshes are saved there, so the secret is only a starting point."""
    if not settings.coros_token_json or settings.coros_token_path.exists():
        return False
    data = json.loads(settings.coros_token_json)  # fail loudly on a bad paste
    if "tokens" not in data:
        raise ValueError("HEALTH_COROS_TOKEN_JSON must be the whole coros_oauth.json file")
    path = settings.coros_token_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2))
    path.chmod(0o600)
    return True


def window_for(now_local: datetime, last_full: date | None) -> int:
    """Days to sync this run: the deep window once per day after the deep-sync hour."""
    today = now_local.date()
    if now_local.hour >= settings.sync_full_hour and last_full != today:
        return settings.sync_full_days
    return settings.sync_days


async def _coros_sync(days: int, fit_limit: int) -> dict[str, int]:
    """Pull from COROS and recompute, off the event loop (sqlite and parsing block)."""

    def work() -> dict[str, int]:
        from health.compute import compute_range
        from health.db import session_scope
        from health.sources.coros.sync import sync_all

        counts = asyncio.run(sync_all(days, with_laps=True, fit_limit=fit_limit))
        with session_scope() as s:
            counts["days_recomputed"] = compute_range(
                s, today_local() - timedelta(days=days), today_local()
            )
        return counts

    return await asyncio.to_thread(work)


async def run_once(days: int | None = None, sync: SyncFn | None = None) -> SyncState:
    """One sync. If another is already running, returns its state without starting a second."""
    if state.running:  # set before the first await below, so this check can't race
        return state
    state.running = True
    now_local = datetime.now(ZoneInfo(settings.timezone))
    last_full = date.fromisoformat(state.last_full_date) if state.last_full_date else None
    days = days or window_for(now_local, last_full)
    state.last_started, state.last_days = _now(), days
    try:
        if not coros_authorized():
            state.last_ok, state.last_error = False, NO_AUTH
            log.warning(NO_AUTH)
            return state
        counts = await (sync or _coros_sync)(days, settings.sync_fit_limit)
        failed = sorted(k for k, v in counts.items() if v == -1)
        state.last_ok, state.last_counts = not failed, counts
        state.last_error = f"tools failed: {', '.join(failed)}" if failed else None
        if days >= settings.sync_full_days:
            state.last_full_date = now_local.date().isoformat()
    except Exception as e:  # the loop must survive anything a run throws
        log.exception("sync failed")
        state.last_ok, state.last_error = False, str(e)[:500]
    finally:
        state.running, state.last_finished = False, _now()
    return state


async def sync_loop(sync: SyncFn | None = None, first_delay_s: float = 20) -> None:
    interval = settings.sync_interval_min * 60
    state.enabled, state.interval_min = True, settings.sync_interval_min
    await asyncio.sleep(first_delay_s)  # let the API come up first
    while True:
        await run_once(sync=sync)
        state.next_run = (datetime.now(UTC) + timedelta(seconds=interval)).isoformat(
            timespec="seconds"
        )
        await asyncio.sleep(interval)
