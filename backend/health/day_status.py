"""The Home status chip (Active / Rest day / Sick / Travel), "until changed".

A status is kept on the user and logged as a journal tag (rest_day, sick, travel = 1) for
every day it lasts, so Insights can compare the days after a sick day with the rest. The tags
for days since the status was set are filled in whenever the status is read; switching back
to Active stops it.
"""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from health.models import JournalEntry, User

STATUSES = ("active", "rest_day", "sick", "travel")
TAGS = STATUSES[1:]
MAX_FILL_DAYS = 30


def _user(s: Session) -> User:
    u = s.execute(select(User)).scalars().first()
    if u is None:
        u = User(name="me")
        s.add(u)
        s.flush()
    return u


def _tag_day(s: Session, d: date, status: str) -> None:
    """Exactly one status tag on day `d` (none for active)."""
    s.execute(delete(JournalEntry).where(JournalEntry.date == d, JournalEntry.tag.in_(TAGS)))
    if status != "active":
        s.add(JournalEntry(date=d, tag=status, value=1.0))


def current(s: Session, today: date) -> dict:
    u = _user(s)
    status = u.day_status or "active"
    since = u.day_status_since
    if status != "active" and since:
        d = max(since, today - timedelta(days=MAX_FILL_DAYS))
        while d <= today:
            has = s.execute(
                select(JournalEntry).where(JournalEntry.date == d, JournalEntry.tag == status)
            ).scalar_one_or_none()
            if has is None:
                _tag_day(s, d, status)
            d += timedelta(days=1)
        s.flush()
    return {"status": status, "since": since.isoformat() if since and status != "active" else None}


def set_status(s: Session, status: str, today: date) -> dict:
    if status not in STATUSES:
        raise ValueError(f"status must be one of {', '.join(STATUSES)}")
    u = _user(s)
    u.day_status = None if status == "active" else status
    u.day_status_since = None if status == "active" else today
    _tag_day(s, today, status)
    s.flush()
    return current(s, today)


def on_day(s: Session, d: date) -> str:
    """The status logged for a past day (active when none)."""
    row = s.execute(
        select(JournalEntry.tag).where(
            JournalEntry.date == d, JournalEntry.tag.in_(TAGS), JournalEntry.value > 0
        )
    ).first()
    return row[0] if row else "active"
