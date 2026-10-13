from datetime import datetime, timedelta

import pytest

from health.engine.muscles import (
    MUSCLES,
    catalog,
    doses_for_activity,
    doses_for_set,
    exercise_muscles,
    muscle_states,
    muscular_load,
    status_for,
)

T0 = datetime(2026, 10, 1, 18, 0)
D0 = T0.date()


@pytest.mark.parametrize(
    ("name", "family", "primary"),
    [
        ("Bench Press (Barbell)", "Bench press / push-up", "chest"),
        ("Incline Bench Press (Dumbbell)", "Incline press", "chest"),
        ("Squat (Barbell)", "Squat", "quads"),
        ("Bulgarian Split Squat", "Lunge / split squat", "quads"),
        ("Romanian Deadlift (Barbell)", "Romanian deadlift", "hamstrings"),
        ("Deadlift (Barbell)", "Deadlift", "glutes"),
        ("Lat Pulldown (Cable)", "Pull-up / pulldown", "lats"),
        ("Chin Up", "Chin-up", "lats"),
        ("Seated Cable Row", "Row", "lats"),
        ("Upright Row", "Lateral raise", "shoulders"),
        ("Reverse Fly (Dumbbell)", "Rear delt / face pull", "shoulders"),
        ("Cable Crossover", "Chest fly", "chest"),
        ("Leg Curl (Machine)", "Leg curl", "hamstrings"),
        ("Bicep Curl (Dumbbell)", "Biceps curl", "biceps"),
        ("Wrist Curl", "Wrist curl", "forearms"),
        ("Triceps Pushdown", "Triceps extension", "triceps"),
        ("Calf Press on Leg Press", "Calf raise", "calves"),
        ("Bicycle Crunch", "Oblique work", "obliques"),
        ("Plank", "Ab work", "abs"),
        ("Whole Body", "Whole body", "quads"),
    ],
)
def test_exercise_matching(name, family, primary):
    m = exercise_muscles(name)
    assert m.matched and m.name == family
    assert max(m.muscles, key=m.muscles.get) == primary
    assert set(m.muscles) <= set(MUSCLES)


def test_unknown_exercise_spreads_over_whole_body():
    m = exercise_muscles("Zercher Turkish thing")
    assert not m.matched and len(m.muscles) > 5


def test_common_exercises_all_matched():
    from health.engine.muscles import COMMON_EXERCISES, common_exercises

    assert all(exercise_muscles(n).matched for n in COMMON_EXERCISES)
    assert len(common_exercises()) == len(COMMON_EXERCISES)


def test_catalog_unique_and_valid():
    names = [c["name"] for c in catalog()]
    assert len(names) == len(set(names))
    assert all(c["primary"] in MUSCLES for c in catalog())


def test_set_doses_credit_sets_and_volume():
    d = doses_for_set(T0, D0, "Bench Press", reps=8, weight_kg=80, set_type="normal")
    by = {x.muscle: x for x in d}
    assert by["chest"].load == 1 and by["chest"].volume_kg == 640
    assert by["triceps"].sets == 0.5 and by["triceps"].volume_kg == 320
    assert doses_for_set(T0, D0, "Bench Press", 8, 40, set_type="warmup") == []
    # unknown reps still count as a set, with no volume
    assert {x.muscle: x.volume_kg for x in doses_for_set(T0, D0, "Squat", None, None)}["quads"] == 0


def test_activity_doses_use_training_load_or_fallback():
    run = doses_for_activity(T0, D0, "Outdoor Run", training_load=70, duration_s=3600)
    total = sum(x.load for x in run)
    assert total == pytest.approx(7.0)
    assert {x.muscle: x.load for x in run}["quads"] == pytest.approx(2.1)
    walk = doses_for_activity(T0, D0, "Walk", training_load=None, duration_s=3600)
    assert sum(x.load for x in walk) == pytest.approx(3.0)  # 60 min x 0.5 / 10
    assert doses_for_activity(T0, D0, "Walk", None, None) == []


def test_freshness_decays_back_over_three_days():
    doses = [x for _ in range(8) for x in doses_for_set(T0, D0, "Squat", 5, 100)]
    now = muscle_states(doses, T0)["quads"]
    assert now.freshness == pytest.approx(26.4, abs=0.2) and now.status == "depleted"
    two = muscle_states(doses, T0 + timedelta(hours=48))["quads"]
    assert 65 < two.freshness < 80 and two.status == "fatigued"
    three = muscle_states(doses, T0 + timedelta(hours=72))["quads"]
    assert three.freshness > 80 and three.status == "recovered"
    st = muscle_states(doses, T0 + timedelta(hours=1))
    assert st["quads"].sets_7d == 8 and st["quads"].volume_7d_kg == 4000
    assert st["quads"].last_trained == T0
    assert st["chest"].freshness == 100 and st["chest"].last_trained is None
    # doses after `at` are ignored, and the 7-day window drops old work
    assert muscle_states(doses, T0 - timedelta(hours=1))["quads"].freshness == 100
    assert muscle_states(doses, T0 + timedelta(days=8))["quads"].sets_7d == 0


def test_status_bands():
    assert [status_for(v) for v in (100, 80, 79.9, 50, 49.9)] == [
        "recovered",
        "recovered",
        "fatigued",
        "fatigued",
        "depleted",
    ]


def test_muscular_load_needs_two_weeks_then_bands():
    one_week = [
        x for k in range(3) for x in doses_for_set(T0 - timedelta(days=k * 2), D0, "Squat", 5, 100)
    ]
    ml = muscular_load(one_week, T0)
    assert ml.chronic is None and ml.status == "Building baseline" and ml.acute > 0
    history = []
    for k in range(28):  # one squat set a day for four weeks
        ts = T0 - timedelta(days=k)
        history += doses_for_set(ts, ts.date(), "Squat", 5, 100)
    ml = muscular_load(history, T0)
    assert ml.ratio == pytest.approx(1.0, abs=0.01) and ml.status == "Productive"
    assert ml.optimal == (
        pytest.approx(0.8 * ml.chronic, abs=0.1),
        pytest.approx(1.3 * ml.chronic, abs=0.1),
    )
