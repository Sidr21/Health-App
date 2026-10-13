"""Muscle model: which muscles a set or a workout loads, and how fresh each muscle is.

Pure functions, no I/O. DESIGN.md §6.10 has the reasoning; the short version:

- Load is counted in **set-equivalents**. One hard working set where the muscle is the prime
  mover = 1.0. Synergists get a fraction (bench press: chest 1.0, triceps 0.5, shoulders 0.4).
- Cardio workouts also load muscles. Their training load (COROS's number, or a per-minute
  fallback) is converted at ``CARDIO_LOAD_PER_SET`` points per set-equivalent and split with a
  sport → muscle share table (running: quads 30 %, glutes 25 %, calves 20 % ...).
- Each dose decays exponentially with a per-muscle time constant (big muscles slower).
  Fatigue F = Σ dose · exp(-Δt / τ). Freshness = 100 · exp(-F / ``FRESHNESS_K``).
  With K = 6, eight hard sets leave a muscle ~26 % fresh, ~72 % two days later and ~85 %
  after three, which matches the usual 48–72 h recovery guidance.
- Muscular load is the 7-day sum of set-equivalents across all muscles; the optimal band is
  0.8–1.3 × the 28-day weekly average, the same acute:chronic idea as cardio load.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

FRESHNESS_K = 6.0
CARDIO_LOAD_PER_SET = 10.0  # COROS training-load points per set-equivalent
RECOVERED = 80.0
FATIGUED = 50.0  # below this a muscle is "depleted"
METHOD = "muscles_v1"


@dataclass(frozen=True)
class Muscle:
    id: str
    name: str
    views: tuple[str, ...]  # where the body map draws it: front, back
    tau_h: float  # fatigue time constant in hours


MUSCLES: dict[str, Muscle] = {
    m.id: m
    for m in [
        Muscle("chest", "Chest", ("front",), 30),
        Muscle("shoulders", "Shoulders", ("front", "back"), 24),
        Muscle("biceps", "Biceps", ("front",), 22),
        Muscle("triceps", "Triceps", ("back",), 22),
        Muscle("forearms", "Forearms", ("front", "back"), 18),
        Muscle("abs", "Abs", ("front",), 20),
        Muscle("obliques", "Obliques", ("front",), 20),
        Muscle("traps", "Traps", ("front", "back"), 24),
        Muscle("lats", "Lats", ("back",), 30),
        Muscle("lower_back", "Lower back", ("back",), 30),
        Muscle("glutes", "Glutes", ("back",), 32),
        Muscle("quads", "Quads", ("front",), 34),
        Muscle("hamstrings", "Hamstrings", ("back",), 34),
        Muscle("adductors", "Adductors", ("front",), 28),
        Muscle("calves", "Calves", ("front", "back"), 22),
    ]
}

WHOLE_BODY: dict[str, float] = {
    "quads": 0.35,
    "glutes": 0.35,
    "hamstrings": 0.25,
    "chest": 0.3,
    "lats": 0.3,
    "shoulders": 0.3,
    "triceps": 0.15,
    "biceps": 0.15,
    "abs": 0.25,
    "lower_back": 0.2,
    "calves": 0.1,
}

# (regex on the normalised exercise name, catalog name, muscle weights). First match wins, so
# specific patterns come before general ones ("leg curl" before "curl").
_RULES: list[tuple[str, str, dict[str, float]]] = [
    (r"whole body|full body", "Whole body", WHOLE_BODY),
    (
        r"romanian|\brdl\b|stiff.?leg",
        "Romanian deadlift",
        {"hamstrings": 1, "glutes": 0.6, "lower_back": 0.5, "forearms": 0.2},
    ),
    (
        r"deadlift",
        "Deadlift",
        {
            "glutes": 0.8,
            "hamstrings": 0.7,
            "lower_back": 0.8,
            "quads": 0.4,
            "traps": 0.4,
            "forearms": 0.3,
        },
    ),
    (r"hip thrust|glute bridge|bridge", "Hip thrust", {"glutes": 1, "hamstrings": 0.4}),
    (
        r"good morning|back extension|hyperextension|superman",
        "Back extension",
        {"lower_back": 1, "glutes": 0.5, "hamstrings": 0.5},
    ),
    (
        r"clean|snatch|thruster|kettlebell swing|\bswing\b|burpee",
        "Olympic / power lift",
        {
            "glutes": 0.7,
            "hamstrings": 0.6,
            "quads": 0.6,
            "shoulders": 0.4,
            "traps": 0.5,
            "lower_back": 0.4,
        },
    ),
    (r"calf|calves", "Calf raise", {"calves": 1}),
    (r"jump|plyo|bound", "Jumps / plyometrics", {"quads": 0.8, "glutes": 0.6, "calves": 0.5}),
    (r"front squat", "Front squat", {"quads": 1, "glutes": 0.5, "abs": 0.3, "adductors": 0.3}),
    (
        r"split squat|lunge|step.?up|bulgarian|pistol",
        "Lunge / split squat",
        {"quads": 1, "glutes": 0.7, "adductors": 0.3, "hamstrings": 0.2},
    ),
    (r"leg extension", "Leg extension", {"quads": 1}),
    (r"leg curl|hamstring curl|nordic", "Leg curl", {"hamstrings": 1, "calves": 0.2}),
    (
        r"squat|leg press|hack",
        "Squat",
        {"quads": 1, "glutes": 0.6, "adductors": 0.4, "lower_back": 0.2},
    ),
    (r"abduct", "Hip abduction", {"glutes": 1}),
    (r"adduct", "Hip adduction", {"adductors": 1}),
    (r"\bdips?\b", "Dip", {"triceps": 1, "chest": 0.6, "shoulders": 0.3}),
    (r"close.?grip", "Close-grip bench press", {"triceps": 1, "chest": 0.6, "shoulders": 0.3}),
    (
        r"incline.*(press|bench)|(press|bench).*incline",
        "Incline press",
        {"chest": 1, "shoulders": 0.5, "triceps": 0.4},
    ),
    (
        r"bench|chest press|push.?up|press.?up|floor press",
        "Bench press / push-up",
        {"chest": 1, "triceps": 0.5, "shoulders": 0.4},
    ),
    (r"rear delt|reverse fly|face pull", "Rear delt / face pull", {"shoulders": 1, "traps": 0.4}),
    (r"\bfly\b|flye|flyes|pec deck|crossover", "Chest fly", {"chest": 1, "shoulders": 0.2}),
    (
        r"overhead press|shoulder press|military|arnold|push press|\bohp\b",
        "Overhead press",
        {"shoulders": 1, "triceps": 0.5, "traps": 0.3},
    ),
    (r"lateral raise|side raise|upright row", "Lateral raise", {"shoulders": 1, "traps": 0.3}),
    (r"front raise", "Front raise", {"shoulders": 1}),
    (r"shrug", "Shrug", {"traps": 1, "forearms": 0.3}),
    (r"chin.?up", "Chin-up", {"lats": 1, "biceps": 0.7, "forearms": 0.3}),
    (
        r"pull.?up|pulldown|pull.?down|pullover|muscle.?up",
        "Pull-up / pulldown",
        {"lats": 1, "biceps": 0.5, "forearms": 0.3, "shoulders": 0.2},
    ),
    (
        r"\brows?\b|rowing",
        "Row",
        {"lats": 1, "traps": 0.6, "biceps": 0.4, "shoulders": 0.3, "lower_back": 0.2},
    ),
    (r"wrist|grip", "Wrist curl", {"forearms": 1}),
    (r"hammer", "Hammer curl", {"biceps": 0.8, "forearms": 0.6}),
    (r"curl", "Biceps curl", {"biceps": 1, "forearms": 0.4}),
    (
        r"tricep|skull|pushdown|push.?down|kickback|french press",
        "Triceps extension",
        {"triceps": 1},
    ),
    (r"farmer|carry", "Loaded carry", {"forearms": 1, "traps": 0.6, "abs": 0.3}),
    (
        r"russian twist|side plank|oblique|woodchop|pallof|bicycle",
        "Oblique work",
        {"obliques": 1, "abs": 0.5},
    ),
    (
        r"crunch|sit.?up|leg raise|knee raise|plank|ab wheel|rollout|hollow|v.?up|dead bug"
        r"|\babs?\b",
        "Ab work",
        {"abs": 1, "obliques": 0.3},
    ),
]
_COMPILED = [(re.compile(p), name, w) for p, name, w in _RULES]

# Cardio: share of the workout's load each muscle takes (sums to 1), plus the fallback load
# per minute when the source has no training load.
_SPORTS: list[tuple[str, dict[str, float], float]] = [
    (
        r"swim",
        {
            "lats": 0.3,
            "shoulders": 0.25,
            "triceps": 0.15,
            "chest": 0.1,
            "abs": 0.1,
            "quads": 0.05,
            "glutes": 0.05,
        },
        1.0,
    ),
    (
        r"row",
        {
            "lats": 0.25,
            "quads": 0.25,
            "glutes": 0.15,
            "hamstrings": 0.1,
            "biceps": 0.1,
            "traps": 0.1,
            "lower_back": 0.05,
        },
        1.0,
    ),
    (
        r"bike|cycl|ride|spin",
        {"quads": 0.45, "glutes": 0.25, "calves": 0.13, "hamstrings": 0.12, "abs": 0.05},
        0.9,
    ),
    (
        r"hike|walk|trek|climb stairs|stair",
        {"quads": 0.3, "glutes": 0.3, "calves": 0.2, "hamstrings": 0.15, "lower_back": 0.05},
        0.5,
    ),
    (
        r"ski|snowboard",
        {
            "quads": 0.4,
            "glutes": 0.25,
            "adductors": 0.1,
            "hamstrings": 0.1,
            "abs": 0.1,
            "calves": 0.05,
        },
        0.9,
    ),
    (
        r"run|jog|track|treadmill",
        {"quads": 0.3, "glutes": 0.25, "calves": 0.2, "hamstrings": 0.15, "abs": 0.1},
        1.1,
    ),
]
_SPORTS_COMPILED = [(re.compile(p), s, k) for p, s, k in _SPORTS]


def normalise(name: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", " ", name.lower()).strip()


@dataclass(frozen=True)
class ExerciseMatch:
    name: str  # catalog name
    muscles: dict[str, float]
    matched: bool  # False = unknown exercise, spread over the whole body


def exercise_muscles(exercise: str) -> ExerciseMatch:
    n = normalise(exercise)
    for rx, name, weights in _COMPILED:
        if rx.search(n):
            return ExerciseMatch(name, dict(weights), True)
    return ExerciseMatch("Unknown", dict(WHOLE_BODY), False)


COMMON_EXERCISES = [
    "Bench Press",
    "Incline Bench Press",
    "Dumbbell Bench Press",
    "Push-Up",
    "Dip",
    "Chest Fly",
    "Overhead Press",
    "Lateral Raise",
    "Face Pull",
    "Shrug",
    "Pull-Up",
    "Chin-Up",
    "Lat Pulldown",
    "Barbell Row",
    "Seated Cable Row",
    "Biceps Curl",
    "Hammer Curl",
    "Triceps Pushdown",
    "Skull Crusher",
    "Back Squat",
    "Front Squat",
    "Leg Press",
    "Bulgarian Split Squat",
    "Lunge",
    "Deadlift",
    "Romanian Deadlift",
    "Hip Thrust",
    "Back Extension",
    "Leg Extension",
    "Leg Curl",
    "Calf Raise",
    "Hip Adduction",
    "Plank",
    "Crunch",
    "Hanging Leg Raise",
    "Russian Twist",
    "Kettlebell Swing",
    "Farmer's Carry",
    "Box Jump",
]


def common_exercises() -> list[dict]:
    """Names offered by the app's log screen, each with the muscles the matcher assigns."""
    out = []
    for name in COMMON_EXERCISES:
        m = exercise_muscles(name)
        out.append(
            {
                "name": name,
                "family": m.name,
                "primary": max(m.muscles, key=lambda k: m.muscles[k]),
                "muscles": m.muscles,
            }
        )
    return out


def catalog() -> list[dict]:
    """Exercise families the matcher knows, for the app's picker."""
    seen: dict[str, dict] = {}
    for _, name, weights in _RULES:
        if name not in seen:
            primary = max(weights, key=lambda k: weights[k])
            seen[name] = {"name": name, "primary": primary, "muscles": dict(weights)}
    return list(seen.values())


@dataclass(frozen=True)
class Dose:
    ts: datetime
    day: date  # local calendar day, assigned by the caller
    muscle: str
    load: float  # set-equivalents
    sets: float = 0.0  # working sets credited to this muscle (strength only, fractional)
    volume_kg: float = 0.0  # reps x weight credited to this muscle
    source: str = "strength"


def doses_for_set(
    ts: datetime,
    day: date,
    exercise: str,
    reps: int | None,
    weight_kg: float | None,
    set_type: str = "normal",
) -> list[Dose]:
    """One working set. Warm-ups load nothing; a set with unknown reps still counts as a set."""
    if set_type == "warmup":
        return []
    match = exercise_muscles(exercise)
    vol = (reps or 0) * (weight_kg or 0.0)
    return [
        Dose(ts, day, m, w, sets=w, volume_kg=vol * w, source="strength")
        for m, w in match.muscles.items()
    ]


def sport_shares(sport: str) -> tuple[dict[str, float], float]:
    n = normalise(sport)
    for rx, shares, per_min in _SPORTS_COMPILED:
        if rx.search(n):
            return dict(shares), per_min
    total = sum(WHOLE_BODY.values())
    return {m: v / total for m, v in WHOLE_BODY.items()}, 0.8


def doses_for_activity(
    ts: datetime,
    day: date,
    sport: str,
    training_load: float | None,
    duration_s: float | None,
) -> list[Dose]:
    """A cardio (or unlogged strength) workout, split over muscles by sport."""
    shares, per_min = sport_shares(sport)
    load = training_load if training_load else (duration_s or 0) / 60 * per_min
    if load <= 0:
        return []
    total = load / CARDIO_LOAD_PER_SET
    return [Dose(ts, day, m, total * f, source="cardio") for m, f in shares.items()]


def status_for(freshness: float) -> str:
    if freshness >= RECOVERED:
        return "recovered"
    if freshness >= FATIGUED:
        return "fatigued"
    return "depleted"


@dataclass
class MuscleState:
    id: str
    name: str
    views: tuple[str, ...]
    freshness: float = 100.0
    status: str = "recovered"
    fatigue: float = 0.0
    load_7d: float = 0.0
    sets_7d: float = 0.0
    volume_7d_kg: float = 0.0
    last_trained: datetime | None = None
    sources: dict[str, float] = field(default_factory=dict)  # load_7d by source


def muscle_states(doses: list[Dose], at: datetime) -> dict[str, MuscleState]:
    """Freshness and 7-day totals per muscle at time `at`. Doses after `at` are ignored."""
    out = {m.id: MuscleState(m.id, m.name, m.views) for m in MUSCLES.values()}
    week_ago = at - timedelta(days=7)
    for d in doses:
        st = out.get(d.muscle)
        if st is None or d.ts > at:
            continue
        hours = (at - d.ts).total_seconds() / 3600
        st.fatigue += d.load * math.exp(-hours / MUSCLES[d.muscle].tau_h)
        if d.ts > week_ago:
            st.load_7d += d.load
            st.sets_7d += d.sets
            st.volume_7d_kg += d.volume_kg
            st.sources[d.source] = st.sources.get(d.source, 0.0) + d.load
        if d.load >= 0.25 and (st.last_trained is None or d.ts > st.last_trained):
            st.last_trained = d.ts
    for st in out.values():
        st.freshness = round(100 * math.exp(-st.fatigue / FRESHNESS_K), 1)
        st.status = status_for(st.freshness)
        st.fatigue = round(st.fatigue, 3)
        st.load_7d = round(st.load_7d, 2)
        st.sets_7d = round(st.sets_7d, 1)
        st.volume_7d_kg = round(st.volume_7d_kg, 1)
        st.sources = {k: round(v, 2) for k, v in st.sources.items()}
    return out


@dataclass(frozen=True)
class MuscularLoad:
    acute: float  # set-equivalents in the last 7 days, all muscles
    chronic: float | None  # average weekly set-equivalents over the last 28 days
    ratio: float | None
    optimal: tuple[float, float] | None
    status: str


def load_status(ratio: float | None) -> str:
    if ratio is None:
        return "Building baseline"
    if ratio < 0.8:
        return "Detraining"
    if ratio <= 1.3:
        return "Productive"
    if ratio <= 1.5:
        return "Overreaching"
    return "Overload"


def muscular_load(doses: list[Dose], at: datetime) -> MuscularLoad:
    acute = sum(d.load for d in doses if at - timedelta(days=7) < d.ts <= at)
    in_28 = [d for d in doses if at - timedelta(days=28) < d.ts <= at]
    first = min((d.ts for d in in_28), default=None)
    # Need at least two weeks of history before a chronic baseline means anything.
    chronic = None
    if first is not None and (at - first) >= timedelta(days=14):
        chronic = sum(d.load for d in in_28) / 4
    ratio = acute / chronic if chronic else None
    optimal = (round(0.8 * chronic, 1), round(1.3 * chronic, 1)) if chronic else None
    return MuscularLoad(
        round(acute, 1),
        round(chronic, 1) if chronic is not None else None,
        round(ratio, 2) if ratio is not None else None,
        optimal,
        load_status(ratio),
    )
