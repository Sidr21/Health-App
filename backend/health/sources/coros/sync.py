"""Pull everything from COROS through the MCP and store it (DESIGN phase 1)."""

from __future__ import annotations

import re
from datetime import date, timedelta

import httpx
from sqlalchemy import select

from health.config import today_local
from health.db import session_scope
from health.models import Activity, ActivitySample
from health.sources.coros.mcp_client import CorosMcp
from health.sources.coros.parsers import SportRecord
from health.sources.coros.store import import_text, log, unwrap
from health.sources.fit import store_fit

_SPORT_ALL = [65535]
RUN_TYPES = {100, 101, 102, 103}  # outdoor, indoor (treadmill), trail, track run


def _yyyymmdd(d: date) -> str:
    return d.strftime("%Y%m%d")


_FIT_URL = re.compile(r"https?://\S+?\.fit\b")


class FitDownloadError(Exception):
    pass


def fit_url(reply: str) -> str:
    """The download URL in queryActivityFitFileDownloadUrls' reply, e.g.
    `1. <labelId>.fit\n   https://s3.coros.com/fit/<user>/<labelId>.fit`."""
    m = _FIT_URL.search(reply)
    if not m:
        raise FitDownloadError(f"no FIT URL in COROS's reply: {reply.strip()[:200]!r}")
    return m.group(0)


async def fetch_fit(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as http:
        r = await http.get(url)
    if r.status_code != 200:
        raise FitDownloadError(f"GET {url} -> HTTP {r.status_code}: {r.text[:200]!r}")
    if r.content[8:12] != b".FIT":  # every FIT file's header carries the ".FIT" signature
        ctype = r.headers.get("content-type")
        raise FitDownloadError(f"GET {url} returned {ctype}, not a FIT file: {r.content[:80]!r}")
    return r.content


async def _download_fit(c: CorosMcp, label_id: str, sport_type: int) -> bytes:
    text = await c.call(
        "queryActivityFitFileDownloadUrls", {"labelId": label_id, "sportType": sport_type}
    )
    return await fetch_fit(fit_url(text))


async def sync_all(
    days: int = 30, *, with_laps: bool = True, fit_limit: int = 10
) -> dict[str, int]:
    today = today_local()
    start = today - timedelta(days=days)
    counts: dict[str, int] = {}
    async with CorosMcp() as c:
        simple = [
            ("queryUserInfo", {}),
            ("queryFitnessAssessmentOverview", {}),
            ("queryRecoveryStatus", {}),
            ("queryRestingHeartRate", {"days": days}),
            ("queryAvgHeartRate", {"days": days}),
            ("queryDailyHealthData", {"days": days}),
            ("querySleepOverview", {"days": days}),
            ("queryStressLevel", {"days": days}),
            ("queryTrainingLoadAssessment", {"days": days}),
        ]
        # sleep HRV + stress series are capped at 7 days per call
        for k in range(0, days, 7):
            end = today - timedelta(days=k)
            st = max(start, end - timedelta(days=6))
            rng = {"startDate": _yyyymmdd(st), "endDate": _yyyymmdd(end), "days": 7}
            simple.append(("querySleepHrv", rng))
            simple.append(("queryStressTimeSeries", dict(rng)))
        with session_scope() as s:
            for tool, args in simple:
                try:
                    text = await c.call(tool, args)
                    counts[tool] = counts.get(tool, 0) + import_text(s, tool, text)
                    log(s, tool, True)
                except Exception as e:  # keep going; one failing tool must not stop the sync
                    log(s, tool, False, str(e)[:500])
                    counts[tool] = -1
            records_text = await c.call(
                "querySportRecords",
                {
                    "startDate": _yyyymmdd(start),
                    "endDate": _yyyymmdd(today),
                    "sportTypeCodes": _SPORT_ALL,
                    "minDistanceKm": 0,
                    "maxDistanceKm": 0,
                    "minDurationMinutes": 0,
                    "maxDurationMinutes": 0,
                    "maxAveragePace": "",
                    "locationKeyword": "",
                    "limit": 200,
                },
            )
            counts["querySportRecords"] = import_text(s, "querySportRecords", records_text)
            from health.sources.coros.parsers import parse_sport_records

            fit_wanted: list[tuple[Activity, SportRecord]] = []
            # a file without samples (stored by an older version) counts as missing
            streamed = set(s.execute(select(ActivitySample.activity_id).distinct()).scalars())
            for r in parse_sport_records(unwrap(records_text)):  # often a JSON-quoted string
                # each step on its own: a detail or lap reply we can't parse must not cost the
                # activity its FIT file (the stream is what the models need most)
                for tool in ("getActivityDetail", "queryActivityLapData")[: 2 if with_laps else 1]:
                    try:
                        text = await c.call(
                            tool, {"labelId": r.label_id, "sportType": r.sport_type}
                        )
                        import_text(s, tool, text, label_id=r.label_id)
                    except Exception as e:
                        log(s, f"{tool}:{r.label_id}", False, f"{type(e).__name__}: {e}"[:500])
                act = s.execute(
                    select(Activity).where(
                        Activity.source == "coros", Activity.external_id == r.label_id
                    )
                ).scalar_one_or_none()
                if act is not None and (not act.fit_path or act.id not in streamed):
                    fit_wanted.append((act, r))
            # COROS caps FIT downloads per day (asking for the URL counts): spend them on runs
            # first, whose streams the fitness models need, newest first; then everything else
            fit_wanted.sort(
                key=lambda ar: (ar[1].sport_type not in RUN_TYPES, -ar[1].date.toordinal())
            )
            stored = 0
            for act, r in fit_wanted[: max(0, fit_limit)]:
                try:
                    data = await _download_fit(c, r.label_id, r.sport_type)
                    counts["fit_samples"] = counts.get("fit_samples", 0) + store_fit(s, act, data)
                    stored += 1
                    log(s, f"fit:{r.label_id}", True)
                except Exception as e:
                    counts["fit_failed"] = counts.get("fit_failed", 0) + 1
                    log(s, f"fit:{r.label_id}", False, f"{type(e).__name__}: {e}"[:500])
            counts["fit"] = stored
            counts["fit_still_missing"] = len(fit_wanted) - stored
    return counts
