"""The daily FIT quota goes to runs first. Fake COROS, synthetic records."""

import asyncio
from datetime import UTC, datetime

from sqlalchemy import select

from health.sources.coros import sync
from tests.fitwriter import synthetic_run


def _record(i: int, name: str, day: str, sport: int, ts: int) -> str:
    return (
        f"{i}. {name} — {day}\n   Location: Test Park\n"
        f"   Time Window: startTimestamp={ts} | endTimestamp={ts + 1800}\n"
        f"   Duration: 30:00 | Distance: 5.00 km\n"
        f"   Average Pace: 6:00 /km | Avg HR: 150 bpm | Calories: 300 kcal\n"
        f"   LabelId: {9000 + i} | SportType: {sport}\n"
    )


RECORDS = "Sport Records — test (5 records)\n========================\n\n" + "\n".join(
    [
        _record(1, "Indoor Cycling", "2026-10-12", 201, 1791800000),
        _record(2, "Indoor Cycling", "2026-10-11", 201, 1791700000),
        _record(3, "Indoor Cycling", "2026-10-10", 201, 1791600000),
        _record(4, "Outdoor Run", "2026-10-09", 100, 1791500000),
        _record(5, "Outdoor Run", "2026-10-08", 100, 1791400000),
    ]
)


class FakeCoros:
    asked: list[str] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def call(self, tool, args=None):
        if tool == "querySportRecords":
            return RECORDS
        if tool == "queryActivityFitFileDownloadUrls":
            FakeCoros.asked.append(args["labelId"])
            return (
                f"1. {args['labelId']}.fit\n   https://s3.coros.com/fit/1/{args['labelId']}.fit\n"
            )
        raise RuntimeError("not in this test")


def test_fit_quota_goes_to_runs_first(tmp_db, monkeypatch):
    from health.db import session_scope
    from health.models import Activity

    fit = synthetic_run(datetime(2026, 10, 8, 7, tzinfo=UTC), minutes=12)

    async def fetch(url):
        return fit

    monkeypatch.setattr(sync, "CorosMcp", FakeCoros)
    monkeypatch.setattr(sync, "fetch_fit", fetch)
    FakeCoros.asked = []
    counts = asyncio.run(sync.sync_all(10, with_laps=False, fit_limit=2))

    assert FakeCoros.asked == ["9004", "9005"]  # the two runs, though the rides are newer
    assert counts["fit"] == 2 and counts["fit_still_missing"] == 3
    with session_scope() as s:
        have = {a.external_id for a in s.execute(select(Activity)).scalars() if a.fit_path}
    assert have == {"9004", "9005"}
