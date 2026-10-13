# HRmax field test

Why: every submaximal VO2max estimate in `DESIGN.md` §6.5 divides by heart-rate reserve, so a 5 bpm error in HRmax moves VO2max by roughly 1.5 ml/kg/min. The 220-minus-age guess (197 for you) has a standard error of about ±10 bpm. A measured value fixes that.

## The workout (saved in your COROS workout library as "Max HR Field Test")

| Step | Duration | Effort | HR guide (% of LTHR) |
|---|---|---|---|
| Warm up | 15 min | easy, relaxed | 60–80 |
| Opener | 3 min | ~5k effort | 95–105 |
| Easy | 2 min | jog | 60–80 |
| Hard rep × 2 | 3 min each | as fast as you can hold for the full 3 min, uphill | 105–120 |
| Easy between reps | 2 min | jog back down | 60–80 |
| Final rep | 2 min + 1 min | 2 min hard, then 1 min absolutely all-out | 108–120, then 112–120 |
| Cool down | 10 min | jog | 55–75 |

Conditions that matter more than the structure:

- Recovery green, no hard session in the previous 48 h, no caffeine crash, not sick.
- A steady 4–6 % hill (or treadmill at 4–6 % incline) so you can reach max without sprint mechanics limiting you. Flat works but tends to read 2–4 bpm low.
- Cool weather. Heat inflates HR at submax but you still hit the same max; it just feels worse.
- Watch worn snug, one finger above the wrist bone. A chest strap is better if you have one (optical HR lags 5–15 s on sprints and can miss the peak by a few bpm).
- The all-out minute is the whole point. If you have anything left at the top, the number is low.

To put it on your calendar, tell me the date and I will schedule it, or pick it from the Workout Library in the COROS app.

## What the engine does with it

1. Pull the FIT file, take the HR series from the final rep plus 30 s after it (HR often peaks 10–20 s after you stop).
2. Reject artefacts: samples that jump more than 10 bpm per second, or that sit more than 10 bpm above the next-highest 5 s plateau.
3. HRmax = highest remaining 5 s rolling median.
4. Store as `fitness.metric = hr_max_est`, `method = field_test`, with the activity id in `inputs_json`. A field-test value outranks the automatic 12-month estimate from training data (`DESIGN.md` §6.7) and a user-entered value outranks both.
5. Re-test every 6–12 months; HRmax drifts down roughly 0.5–1 bpm per year at your age, slowly enough to ignore between tests.

## Sanity check against your current data

Your recent runs top out around 167–168 bpm average, with no all-out efforts in the last 30 days, so the automatic estimator has nothing to work with yet. After the test, expect a number somewhere in the 185–200 range; anything under 180 means the final rep was not all-out and the test should be repeated.
