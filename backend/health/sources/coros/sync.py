"""Pull everything from COROS through the MCP and store it (DESIGN phase 1)."""

from __future__ import annotations

from datetime import date, timedelta

from health.db import session_scope
from health.sources.coros.mcp_client import CorosMcp
from health.sources.coros.store import import_text, log

_SPORT_ALL = [65535]


def _yyyymmdd(d: date) -> str:
    return d.strftime("%Y%m%d")


async def sync_all(days: int = 30, *, with_laps: bool = True) -> dict[str, int]:
    today = date.today()
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

            for r in parse_sport_records(records_text):
                try:
                    det = await c.call(
                        "getActivityDetail", {"labelId": r.label_id, "sportType": r.sport_type}
                    )
                    import_text(s, "getActivityDetail", det, label_id=r.label_id)
                    if with_laps:
                        laps = await c.call(
                            "queryActivityLapData",
                            {"labelId": r.label_id, "sportType": r.sport_type},
                        )
                        import_text(s, "queryActivityLapData", laps, label_id=r.label_id)
                except Exception as e:
                    log(s, f"activity:{r.label_id}", False, str(e)[:500])
    return counts
