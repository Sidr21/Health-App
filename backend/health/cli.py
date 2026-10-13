"""`health` command line. Run `uv run health --help`."""

from __future__ import annotations

import asyncio
import json
from datetime import date, timedelta
from pathlib import Path

import typer

app = typer.Typer(no_args_is_help=True, help="Health app backend tools")
coros = typer.Typer(no_args_is_help=True, help="COROS (official MCP) commands")
db = typer.Typer(no_args_is_help=True, help="Database")
app.add_typer(coros, name="coros")
app.add_typer(db, name="db")


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
def coros_sync(days: int = 30, laps: bool = True) -> None:
    """Pull the last N days from COROS and store them, then recompute scores."""
    from health.db import init_db, session_scope
    from health.sources.coros.sync import sync_all

    init_db()
    counts = asyncio.run(sync_all(days, with_laps=laps))
    for k, v in counts.items():
        typer.echo(f"{k:32s} {v}")
    from health.compute import compute_range

    with session_scope() as s:
        n = compute_range(s, date.today() - timedelta(days=days), date.today())
    typer.echo(f"recomputed {n} days")


@coros.command("import")
def coros_import(kind: str, path: Path, label_id: str | None = None) -> None:
    """Import a saved tool output (e.g. pasted from Claude). KIND is the MCP tool name."""
    from health.db import init_db, session_scope
    from health.sources.coros.store import import_text

    init_db()
    with session_scope() as s:
        n = import_text(s, kind, path.read_text(), label_id=label_id)
    typer.echo(f"imported {n} items from {path}")


@app.command()
def compute(days: int = 30) -> None:
    """Recompute scores for the last N days."""
    from health.compute import compute_range
    from health.db import init_db, session_scope

    init_db()
    with session_scope() as s:
        n = compute_range(s, date.today() - timedelta(days=days), date.today())
    typer.echo(f"recomputed {n} days")


@app.command()
def show(day: str = "today") -> None:
    """Print one day as the API returns it."""
    from health.api.main import _day_payload
    from health.db import init_db, session_scope

    init_db()
    d = date.today() if day == "today" else date.fromisoformat(day)
    with session_scope() as s:
        typer.echo(json.dumps(_day_payload(s, d), indent=2, default=str))


@app.command()
def serve(host: str = "0.0.0.0", port: int = 8000, reload: bool = False) -> None:
    import uvicorn

    uvicorn.run("health.api.main:app", host=host, port=port, reload=reload)
