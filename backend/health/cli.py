"""`health` command line. Run `uv run health --help`."""

from __future__ import annotations

import asyncio
import json
from datetime import date, timedelta
from pathlib import Path

import typer

from health.config import today_local

app = typer.Typer(no_args_is_help=True, help="Health app backend tools")
coros = typer.Typer(no_args_is_help=True, help="COROS (official MCP) commands")
db = typer.Typer(no_args_is_help=True, help="Database")
strength = typer.Typer(no_args_is_help=True, help="Strength training (lifting) data")
app.add_typer(coros, name="coros")
app.add_typer(db, name="db")
app.add_typer(strength, name="strength")


@db.command("init")
def db_init() -> None:
    from health.db import init_db

    init_db()
    typer.echo("database ready")


@coros.command("auth")
def coros_auth() -> None:
    """Log in to COROS once (opens a browser) and store the OAuth tokens."""
    from health.sources.coros.mcp_client import CorosMcp

    async def run() -> None:
        async with CorosMcp(interactive=True) as c:
            tools = await c.list_tools()
            typer.echo(f"authenticated; server exposes {len(tools)} tools")
            typer.echo(await c.call("queryUserInfo"))

    asyncio.run(run())


@coros.command("tools")
def coros_tools() -> None:
    from health.sources.coros.mcp_client import CorosMcp

    async def run() -> None:
        async with CorosMcp() as c:
            for t in await c.list_tools():
                typer.echo(t)

    asyncio.run(run())


@coros.command("call")
def coros_call(tool: str, args: str = "{}") -> None:
    """Call one tool and print the raw text, e.g. `health coros call queryRecoveryStatus`."""
    from health.sources.coros.mcp_client import CorosMcp

    async def run() -> None:
        async with CorosMcp() as c:
            typer.echo(await c.call(tool, json.loads(args)))

    asyncio.run(run())


@coros.command("sync")
def coros_sync(days: int = 30, laps: bool = True, fit_limit: int = 10) -> None:
    """Pull the last N days from COROS and store them, then recompute scores.

    Downloads at most FIT_LIMIT new FIT files per run (COROS caps daily downloads); files
    already stored are never downloaded again, so repeated runs finish the backfill."""
    from health.db import init_db, session_scope
    from health.sources.coros.sync import sync_all

    init_db()
    counts = asyncio.run(sync_all(days, with_laps=laps, fit_limit=fit_limit))
    for k, v in counts.items():
        typer.echo(f"{k:32s} {v}")
    from health.compute import compute_range

    with session_scope() as s:
        n = compute_range(s, today_local() - timedelta(days=days), today_local())
    typer.echo(f"recomputed {n} days")


@app.command("fit")
def fit_import(
    path: Path, label_id: str = typer.Option(..., help="COROS labelId of the activity")
) -> None:
    """Store a FIT file's per-second samples for an activity already in the database."""
    from sqlalchemy import select

    from health.db import init_db, session_scope
    from health.models import Activity
    from health.sources.fit import store_fit

    init_db()
    with session_scope() as s:
        a = s.execute(select(Activity).where(Activity.external_id == label_id)).scalar_one_or_none()
        if a is None:
            raise typer.BadParameter(f"no activity with labelId {label_id}; sync records first")
        n = store_fit(s, a, path.read_bytes())
    typer.echo(f"stored {n} samples for {label_id}")


@coros.command("import")
def coros_import(kind: str, path: Path, label_id: str | None = None) -> None:
    """Import a saved tool output (e.g. pasted from Claude). KIND is the MCP tool name."""
    from health.db import init_db, session_scope
    from health.sources.coros.store import import_text

    init_db()
    with session_scope() as s:
        n = import_text(s, kind, path.read_text(), label_id=label_id)
    typer.echo(f"imported {n} items from {path}")


@strength.command("import")
def strength_import(
    path: Path,
    unit: str = typer.Option("lb", help="Weight unit of a Strong export without a unit column"),
) -> None:
    """Import a Strong or Hevy CSV export (re-importing replaces the same sessions)."""
    from health.config import settings
    from health.db import init_db, session_scope
    from health.sources.strength_csv import parse_csv
    from health.sources.strength_store import replace_sessions

    init_db()
    source, sets = parse_csv(path.read_text(), unit=unit, tz=settings.timezone)
    with session_scope() as s:
        replace_sessions(s, source, sets)
    days = sorted({x.day for x in sets})
    typer.echo(f"{source}: {len(sets)} sets in {len({x.session_key for x in sets})} sessions")
    if days:
        typer.echo(f"{days[0]} .. {days[-1]}; run `health compute` to refresh stored scores")


@strength.command("show")
def strength_show(day: str = typer.Argument("today")) -> None:
    """Print the strength summary (muscle freshness, load, sessions) for a day."""
    from health.compute import strength_summary
    from health.db import init_db, session_scope

    init_db()
    d = today_local() if day == "today" else date.fromisoformat(day)
    with session_scope() as s:
        typer.echo(json.dumps(strength_summary(s, d), indent=2, default=str))


@app.command()
def compute(days: int = 30) -> None:
    """Recompute scores for the last N days."""
    from health.compute import compute_range
    from health.db import init_db, session_scope

    init_db()
    with session_scope() as s:
        n = compute_range(s, today_local() - timedelta(days=days), today_local())
    typer.echo(f"recomputed {n} days")


@app.command()
def show(day: str = typer.Argument("today")) -> None:
    """Print one day as the API returns it."""
    from health.api.main import _day_payload
    from health.db import init_db, session_scope

    init_db()
    d = today_local() if day == "today" else date.fromisoformat(day)
    with session_scope() as s:
        typer.echo(json.dumps(_day_payload(s, d), indent=2, default=str))


@app.command()
def serve(host: str = "0.0.0.0", port: int = 8000, reload: bool = False) -> None:
    import uvicorn

    uvicorn.run("health.api.main:app", host=host, port=port, reload=reload)
