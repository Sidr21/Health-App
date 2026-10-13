# Health App — Design & Gameplan

A Bevel-style recovery / sleep / training app built on COROS data instead of Apple Watch data,
with Apple Health as a secondary source for body metrics, and our own physiology models
(VO2max, threshold HR, biological age) so we are not just re-skinning COROS numbers.

Status: **design draft v2** (2026-10-13). Client decided: native iOS via React Native. Nothing is built yet. This doc is the contract for what we build and in what order.

---

## 1. Goals and non-goals

**Goals**

1. Replace the COROS app as the daily "how am I doing" surface: Recovery, Sleep, Strain, Stress, Energy, plus the underlying HRV / RHR / sleep-stage trends.
2. Ingest COROS activities at full resolution (FIT files) and daily wellness data (sleep, nightly HRV, RHR, stress, training load).
3. Ingest Apple Health for things COROS does not have: body weight, BMI, body-fat %, lean mass, blood pressure, nutrition, mindfulness, and anything a future device adds.
4. Compute our own **VO2max**, **lactate-threshold heart rate (LTHR)**, **threshold / critical pace**, **race predictions**, and a transparent **biological (fitness) age**, each shown next to COROS's value with a confidence range and an explanation of inputs.
5. Bevel-like mobile UI: four score rings on a Today screen, drill-down screens per score, a Trends tab, a Workouts tab, a Journal with correlations.

**Non-goals (for v1)**

- Not a workout *planner* (COROS already does this; the MCP can create workouts if we ever want it).
- Not multi-user / not a SaaS. One athlete, one database. Keep auth trivial.
- No Android client in v1. React Native keeps the door open, but HealthKit-dependent features are iOS-only.
- No real-time / live HR. Everything is post-sync.

---

## 2. What Bevel does (feature reference)

From Bevel's App Store listing, help center and third-party reviews (screens could not be fetched directly from this environment; see "Open items" to drop in screenshots).

| Bevel feature | What it is | Our equivalent |
|---|---|---|
| **Recovery** (0–100 %) | Readiness from HRV (RMSSD, full sleep window), RHR, respiratory rate, SpO2, wrist temp, prior strain, vs. a personal baseline that takes 2–6 weeks to settle | Same idea; inputs = COROS nightly HRV series, RHR, sleep HR, sleep score, prior-day strain, (SpO2/resp rate only when a wellness check was run) |
| **Sleep** score | Time asleep vs need, REM, deep, HR dip, efficiency, continuity; smart-wake alarm | Same inputs from COROS sleep stages + sleep HR; no alarm |
| **Strain** | Daily exertion from workouts + all-day activity, including strength | TRIMP from FIT HR series + step/calorie-based non-workout load |
| **Stress** | Daytime stress score | COROS stress time series (already HRV-derived) |
| **Energy Bank** | Body-battery style 0–100 that drains with strain/stress and refills with sleep | Same model, computed from the day's stress + strain curves |
| **Trends** | Per-metric charts, 1W/1M/3M/6M/1Y, baseline bands | Same, plus our fitness metrics |
| **Journal + Insights** | Tag habits (alcohol, caffeine, late meal, sunlight, screen time…) and correlate with next-day sleep/recovery | Same, simple correlation table |
| **Biological Age** (Pro) | Weekly, rolling 30-day average of sleep, activity, RHR, optional blood biomarkers; shows "this week's changes" per input | Transparent fitness-age composite (section 6.5), weekly, with per-input contribution |
| AI coach, food photo logging, Strength Builder | Chat coach, nutrition, programs | Out of scope v1; optional LLM "daily note" in phase 5 |

Design language to copy (from the screenshots in `docs/reference/bevel/`): **light-first** with soft blue/lavender gradient backgrounds, white rounded cards, one large numeral per card, thin circular progress rings, chip filters, status badges with arrow icons ("Normal", "Below normal"), sparklines with a shaded normal-range band, a "Normal range 34–67 %" label on every score, and plain-language insight cards. Sleep is the one dark (navy) screen. Category colours: recovery green, sleep blue/purple, strain orange/red, stress yellow, energy teal.

---

## 3. Data sources and what each one can give us

### 3.1 COROS

Verified today against the connected **COROS PACE 4** account (user sidr21, 23 y, 175 cm, 67.4 kg):

| Dataset | Fields available | Notes |
|---|---|---|
| Activity list | date, sport code, duration, distance, avg pace/speed, avg HR, calories, start/end timestamps, labelId | 21 activities in the last 30 days: runs, indoor bike, hikes, walk, strength |
| Activity detail | moving/adjusted pace, best km, avg cadence, stride, avg power, elevation, Training Load, aerobic/anaerobic TE, training focus | COROS-derived |
| Laps / custom laps | per-lap stats, arbitrary time windows | |
| **FIT file** | full second-by-second record stream: HR, speed, distance, position, altitude, cadence, running power, plus laps and session messages | Daily download limit on COROS's side; cache every file forever |
| Daily health | steps, calories, exercise minutes, avg stress, sleep total/deep/light/REM/awake, sleep HR avg/min/max | sleep dated by wake-up day |
| Sleep overview | sleep score, main sleep window, nap windows, stage ratios, awake count | |
| **Sleep HRV** | COROS nightly avg, "normal range", baseline, **and raw ~5–10 min HRV samples with confidence (0–100000)** | We will compute our own nightly value from the raw samples |
| Resting HR | daily RHR | |
| Avg HR | daily average HR | no all-day HR series exposed |
| Stress time series | stress value, display score, stress-HRV, stress-HR per sample | daytime HRV proxy |
| Wellness check | HR, HRV, stress, respiration rate, SpO2 (only when user runs the on-watch check) | sparse |
| Training load | short-term load, long-term load, ratio, daily comment | COROS's ATL/CTL analogue |
| Recovery | %, level, hours to full | COROS's number, we keep it for comparison |
| Fitness assessment | VO2max (56), running level (81), threshold pace (4:43/km), 5k/10k/HM/M predictions | the numbers we want to second-guess |
| Profile, devices, menstrual cycle, training schedule | | |

**How we get it** — two implementations behind one `CorosSource` interface:

1. **Official COROS MCP** (`https://mcp.coros.com/mcp`, OAuth with COROS login). This is what this session is using. It is read-only and intended for AI clients; our backend can speak MCP (JSON-RPC over streamable HTTP) directly. Risk: COROS may restrict OAuth client registration to Claude/ChatGPT. **Verify in phase 1, day one.**
2. **Unofficial Training Hub API** (`teamapi.coros.com`, as used by `corosexport`, `Pinta365/coros`, `cygnusb/coros-mcp`). Covers activities, FIT downloads and daily data. Can break without notice; fallback only.

COROS's self-service exports do **not** include daily data (sleep, HRV, RHR), so one of the two above is mandatory. Either way, every raw response and FIT file is stored on disk so re-computation never needs the network.

### 3.2 Smart scale → COROS

The smart scale writes to COROS, not Apple Health, so weight lives on the COROS side. The MCP profile endpoint only returns the *current* weight (67.4 kg today), not a history. Plan:

- Record the profile weight on every sync into `body_metrics` (one row per change) so a history accumulates from day one.
- Check during phase 1 whether the Training Hub API exposes the scale's full history (weight, body-fat %, BMI); if it does, backfill from there.
- Keep Apple Health as a second body-metrics source only if something else writes there.

### 3.3 Apple Health (HealthKit, read directly by the app)

COROS already writes steps, heart rate, sleep analysis and distances into Apple Health. We treat COROS as the source of truth for those and use Apple Health for:

- Body mass, BMI, body-fat %, lean body mass, height, waist — **assumes the smart scale's own app also writes to Apple Health** (most do: Withings, Renpho, Eufy, Garmin Index). COROS's Apple Health sync does not list weight, so if the scale only talks to COROS, weight history comes from the sync-time capture in 3.2 instead. Verify in phase 1.
- Blood pressure, blood oxygen (if measured by something else), respiratory rate
- Apple's own VO2max estimate (if an Apple Watch is ever worn), for comparison
- Dietary energy / macros, water, caffeine, mindful minutes
- Any workouts not recorded on the COROS watch (dedupe by overlapping time window)

Mechanics: the app requests read permission for these types, registers HealthKit **background delivery** (`enableBackgroundDelivery`) plus an anchored query per type, and POSTs new samples to the backend's `/ingest/apple-health` endpoint whenever iOS wakes it. On app open it also runs a catch-up query. Dedupe key = `(source bundle id, uuid)`.

### 3.4 Manual / journal

Journal tags and notes, race results (used to validate VO2max), HRmax tests, sickness/travel flags.

---

## 4. Architecture

```
┌──────────────────────────┐      ┌──────────────────────────────┐
│  COROS (MCP or Hub API)  │      │  Apple Health (HealthKit /   │
│  activities, FIT, daily  │      │  Health Auto Export webhook) │
└────────────┬─────────────┘      └───────────────┬──────────────┘
             │ pull (cron, every 15 min)           │ app POSTs new samples
             ▼                                     ▼
┌──────────────────────────────────────────────────────────────────┐
│  backend/  (Python 3.12, FastAPI)                                 │
│  ├─ sources/     CorosSource (mcp | hub), AppleHealthIngest       │
│  ├─ store/       SQLite (dev) / Postgres (prod) via SQLAlchemy    │
│  │               + raw/ blob dir for FIT + JSON                   │
│  ├─ engine/      pure functions: sleep, recovery, strain, stress, │
│  │               energy, load (CTL/ATL/TSB), vo2max, lthr,        │
│  │               critical_speed, race_predict, bio_age, journal   │
│  ├─ api/         REST + JSON for the client                       │
│  └─ cli/         `health sync`, `health recompute`, `health show` │
└──────────────────────────────┬───────────────────────────────────┘
                               │ HTTPS JSON
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│  app/  Expo / React Native iOS client (see 4.1)                   │
│  Today · Trends · Workouts · Fitness · Journal · Settings         │
└──────────────────────────────────────────────────────────────────┘
```

Principles

- **Raw first, derive later.** Every COROS/Apple payload is persisted untouched. All scores are deterministic functions of raw data + settings, so we can change a formula and recompute history in seconds.
- **Engine is a pure library** with no I/O. Unit-tested with fixture FIT files and synthetic nights. The CLI lets us compare our numbers with COROS's before any UI exists.
- **Every derived number carries provenance**: method name, inputs used, confidence/CI, and the COROS value it competes with.

### 4.1 Client: native iOS built with React Native (decided)

Decision: **React Native via Expo, TypeScript.** It is a real native app (App Store-installable, full HealthKit, push, widgets later) written in JavaScript/React, which is the stack you want to work in.

| | React Native (Expo) — chosen | SwiftUI | PWA |
|---|---|---|---|
| HealthKit | yes, via `@kingstinct/react-native-healthkit` (Expo config plugin, background delivery supported) | yes | no (needs a helper app) |
| Language | TypeScript / React | Swift | TypeScript / React |
| Build without a Mac | yes: **EAS Build** compiles iOS in the cloud; install via TestFlight or an internal-distribution dev build | no | n/a |
| Can be exercised in this cloud session | component logic + UI in unit tests and Storybook-style screenshots; the real HealthKit path must be run on your phone | no | fully |
| Widgets / Live Activities | later, via a small Swift extension (Expo supports native modules) | native | weak |

Things to know up front:

- **Expo Go cannot load HealthKit** (custom native code), so we use a *development build*: `eas build --profile development --platform ios`, install on your iPhone, then JS changes hot-reload over the network. One cloud build per native-dependency change, not per code change.
- An **Apple Developer account ($99/yr)** is needed for TestFlight and internal distribution. Without it, a free Apple ID can only sideload through Xcode for 7 days at a time.
- HealthKit background delivery wakes the app at most roughly hourly for most types; that is fine for weight and body composition.

### 4.2 Stack

- Backend: Python 3.12, FastAPI, SQLAlchemy, `fitdecode` for FIT, numpy/pandas for the engine, APScheduler for sync. `uv` for deps, `pytest`, `ruff`. (If you would rather have one language everywhere, the engine ports to TypeScript with `fit-file-parser` and `simple-statistics`; Python is recommended because the numerical work and FIT tooling are better there.)
- App: Expo SDK (latest stable), TypeScript, Expo Router for navigation, `react-native-reanimated` + `react-native-skia` for rings, sparklines and the hypnogram (Victory Native XL is built on Skia and gives line/area charts with bands), `@kingstinct/react-native-healthkit`, `expo-notifications`, `expo-background-task`, TanStack Query for API data, Zustand for local state.
- Storage: SQLite file during development; Postgres when hosted. Raw blobs on disk (`data/raw/coros/fit/<labelId>.fit`, `data/raw/coros/daily/<date>.json`, `data/raw/apple/<ts>.json`).
- Hosting: Docker Compose. Run locally on a Mac/mini-PC or on Fly.io/Railway; single container + volume is enough. The phone needs to reach it, so either a public URL or Tailscale.
- Secrets: `.env` (COROS credentials/OAuth tokens, ingest API key the app presents).

---

## 5. Data model

Core tables (SQLAlchemy models, migrations with Alembic):

```
users            id, name, sex, dob, height_cm, hr_max, hr_max_source, units, tz
activities       id, source(coros|apple), external_id, sport, start_ts, end_ts, duration_s,
                 distance_m, avg_hr, max_hr, avg_pace, avg_power, elev_gain, calories,
                 coros_training_load, coros_aerobic_te, coros_anaerobic_te, raw_json, fit_path
activity_samples activity_id, t_offset_s, hr, speed_mps, distance_m, cadence, power, alt_m, lat, lon, grade
activity_laps    activity_id, idx, start_offset_s, duration_s, distance_m, avg_hr, avg_pace
daily            date, steps, calories, exercise_min, avg_hr, rhr, stress_avg,
                 coros_recovery_pct, coros_stl, coros_ltl, coros_load_ratio, raw_json
sleep_sessions   date(wake day), start_ts, end_ts, asleep_s, deep_s, light_s, rem_s, awake_s,
                 awake_count, hr_avg, hr_min, hr_max, coros_score, is_nap
hrv_samples      ts, rmssd_ms, confidence, context(sleep|stress|check)
stress_samples   ts, stress, stress_hrv, stress_hr
body_metrics     ts, source, metric(weight_kg|bmi|body_fat_pct|lean_kg|bp_sys|bp_dia|...), value
journal          date, tag, value(bool|number), note
scores           date, kind(recovery|sleep|strain|stress|energy), value, components_json, version
fitness          date, metric(vo2max|lthr|threshold_pace|critical_speed|d_prime|hr_max_est|
                 ctl|atl|tsb|bio_age|race_5k|race_10k|race_hm|race_m), value, ci_low, ci_high,
                 method, inputs_json, coros_value, version
```

`version` on `scores`/`fitness` is the engine formula version, so old rows are invalidated by a recompute.

---

## 6. The engine: formulas we will own

Every formula below is a v1 proposal. Each gets a markdown note in `docs/engine/` with the literature it comes from and a backtest against COROS's number (and real race results) before we trust it in the UI.

### 6.1 Nightly HRV (input to Recovery)

COROS gives raw ~5–10 min samples with confidence. Our value:

1. Keep samples inside the main sleep window with `confidence >= 90000`.
2. Natural-log transform (`lnRMSSD`), take the **median** of the night (robust to the 80–90 ms spikes visible in the data).
3. Baselines: 7-day EWMA and 28-day EWMA + SD of lnRMSSD. "Normal range" = baseline ± 1 SD, shown as a band on charts.
4. Also compute a "last 4 h of sleep" variant to compare with Bevel's full-window recommendation; settings toggle.

### 6.2 Sleep score (0–100)

Weighted sum, weights tunable in settings:

| Component | Weight | Scoring |
|---|---|---|
| Duration vs need | 35 | need = 8 h default, adapted by prior-day strain (+15 min per 5 strain pts) and 14-day debt; 100 % at ≥ need, linear down |
| Efficiency | 15 | asleep / in-bed; 100 at ≥ 95 %, 0 at ≤ 75 % |
| Restorative (deep + REM) | 20 | 100 at ≥ 45 % of asleep, 0 at ≤ 25 % |
| Continuity | 10 | awake count (>5 min) and awake minutes |
| HR dip | 10 | sleep min HR vs daytime RHR, and sleep avg HR vs 28-day avg sleep HR |
| Consistency | 10 | bedtime/waketime deviation from 14-day median (±30 min = full marks) |

### 6.3 Recovery (0–100)

Z-scores against personal baselines, clipped at ±2.5, mapped to 0–100 via a logistic:

```
hrv_z   = (lnRMSSD_tonight - lnRMSSD_28d_mean) / lnRMSSD_28d_sd           weight 0.40
rhr_z   = -(rhr_today - rhr_28d_mean) / rhr_28d_sd                        weight 0.25
sleep   = (sleep_score - 70) / 15                                          weight 0.20
shr_z   = -(sleep_avg_hr - 28d mean) / sd                                  weight 0.10
strain  = -(yesterday_strain - 28d_mean) / sd, only if positive excess     weight 0.05
resp/SpO2 penalties only when a wellness check exists for the morning.
recovery = 100 * sigmoid(sum(w_i * z_i))   # sigmoid centred so z=0 → 67 ("green" starts at 67)
```

Bands: ≥67 green, 34–66 amber, <34 red. First 14 days show "calibrating" with widened bands; 28 days to full confidence (Bevel says 2–6 weeks; same story).

### 6.4 Strain, Stress, Energy Bank

- **Workout strain** = Banister TRIMP from the FIT HR series using HR reserve and the sex-specific exponential weighting; for activities with no HR (strength logged without HR) fall back to COROS Training Load scaled to TRIMP units.
- **Non-workout load** = steps and active calories outside activities, converted with a fixed small factor (so a 15 k-step day is ~3 strain points).
- **Daily strain** mapped to Whoop-like 0–21 log scale for the ring (ln-scaled so a hard day is 15–18, a rest day 3–6). Store raw TRIMP too.
- **Stress** = time-weighted mean of COROS stress samples while awake, plus "high stress minutes". We do not re-derive it; COROS's is already HRV-based.
- **Energy Bank** (0–100): start of day = recovery score (post-sleep); each 5-min slot: `-k_strain * HR_above_rest - k_stress * stress_level + k_rest * (stress < 25 ? 1 : 0)`; sleep refills toward 100 at a rate proportional to sleep quality. Calibrate k's so a typical day ends at 15–30.
- **Training load**: CTL (42-day EWMA) / ATL (7-day) / TSB from daily TRIMP, charted against COROS's short/long-term load and ratio.

### 6.5 VO2max — three independent estimators, one blended number

1. **Submaximal HR–pace method** (Firstbeat/Garmin style, our main one)
   - For each run, take steady-state windows: ≥ 3 min, after minute 5, |grade| < 3 %, cadence within 5 % of run median, HR drift < 3 bpm/min, speed CV < 8 %.
   - Oxygen cost of running from the ACSM equation `VO2 = 3.5 + 0.2*v + 0.9*v*grade` (v in m/min), with an optional per-athlete economy correction learned from race data.
   - Fraction of VO2max from %HRR: `%VO2max ≈ %HRR = (HR - RHR) / (HRmax - RHR)`.
   - `VO2max_window = VO2 / %HRR`. Aggregate per run by HR-weighted median, then across runs by a 30-day EWMA with outlier rejection (heat, illness days flagged from journal).
   - Worked example from last month's data: 12.08 km at 5:18/km, avg HR 167, RHR 55. v = 188.7 m/min → VO2 ≈ 41.2. With an assumed HRmax of 195, %HRR = 0.80 → **VO2max ≈ 51.5**. COROS says 56. The gap is almost entirely the HRmax assumption and the economy term, which is exactly why HRmax must come from data (6.7), not 220-age.
2. **Race / best-effort method**: pull best 1 km, 1 mi, 5 km, 10 km efforts from the FIT streams (and manual race entries) → Daniels VDOT. Only fast *efforts* count (HR ≥ 90 % HRmax for most of the effort) so an easy long run does not depress it.
3. **Critical-speed model**: fit `d = CS * t + D'` on the speed-duration curve (3, 5, 8, 12, 20, 30, 60 min bests over the last 90 days). CS ≈ threshold pace; `VO2max` from CS via the Daniels/Gilbert relation. Also yields race predictions directly.

Blend: inverse-variance weighted mean of available estimators; show each one, its CI, and COROS's 56 on the Fitness screen. Backtest: predicted 5k/10k vs any real race the user enters.

### 6.6 Threshold heart rate (LTHR) and threshold pace

1. **Friel field test** when the data has one: a ≥ 30-min effort at near-constant max sustainable pace; LTHR = avg HR of the last 20 min. Detected automatically; user can also tag one.
2. **HR–pace deflection** on tempo/progressive runs: fit a piecewise-linear HR vs speed curve over steady windows; the breakpoint is the LT estimate (Conconi-style). Needs ≥ 3 runs with a range of intensities.
3. **From critical speed**: `LTHR = HR at CS` from the pooled HR–speed regression of steady windows.
4. **Fallback prior**: 0.89 × HRmax with wide CI, only while 1–3 are unavailable.

Blend as in 6.5; keep a time series. Threshold pace = CS from the speed-duration curve (with D'), compared with COROS's 4:43/km. Zones (HR and pace) derive from LTHR / threshold pace, not from HRmax.

### 6.7 HRmax

- User-entered if known from a test.
- Field test: the "Max HR Field Test" workout in the COROS library, protocol and extraction in `docs/engine/hrmax-test.md`.
- Else: 95th percentile of the top-3 per-activity max HR over 12 months from runs with a hard finish (HR still rising in the last 2 min), minus artefact filtering (drop samples that jump > 10 bpm/s or sit > 10 bpm above the next highest plateau). Show "estimated" badge.

### 6.8 Biological (fitness) age

Transparent and reproducible; no claim of clinical validity. Weekly on Monday from a rolling 30-day window, like Bevel.

```
fitness_age  = age at which the user's VO2max would be the 50th percentile for their sex
               (Cooper Institute / FRIEND registry normative tables)                weight 0.45
rhr_adj      = (rhr_30d - sex/age norm) / 10 years per 10 bpm                     weight 0.15
hrv_adj      = -(lnRMSSD_30d vs age norm) scaled                                  weight 0.15
body_adj     = BMI / body-fat % vs healthy band (from Apple Health)                weight 0.10
sleep_adj    = avg sleep score and duration vs 7–9 h band                         weight 0.10
activity_adj = weekly MET-min vs 500–1000 band                                    weight 0.05
bio_age      = chronological_age + sum(w_i * adj_i) blended with fitness_age
```

Screen shows the number, delta vs chronological age, and a "this week's changes" list with each input's contribution, exactly like Bevel's.

---

## 7. App screens (matched to the Bevel screenshots in `docs/reference/bevel/`)

Tab bar: **Today · Trends · Workouts · Fitness · Journal**; settings behind the avatar in the Today header. Light theme with a soft gradient background; Sleep detail is dark navy like Bevel's.

**Today** (ref `01-today-home.png`)
```
┌─────────────────────────────────┐
│ Today, Oct 13 ▾            (SR) │  date dropdown opens a calendar; avatar → settings
│ [🏃 Active · until changed ▾] [☀ 18° New York] │  status chip (Active / Rest day / Sick / Travel = journal shortcut) + weather
│ ┌─────────────────────────────┐ │
│ │  ◯ 6.1     ◯ 72 %    ◯ 68  │ │  card with three rings: Strain · Recovery · Sleep (Bevel's order)
│ │  Strain   Recovery   Sleep  │ │  tap a ring → score detail (modal)
│ └─────────────────────────────┘ │
│ ┌ Energy  58 %  ▁▂▃▅▆▇▇▆▅▄▃ ─┐ │  Energy Bank + Stress as a fourth card (Bevel puts these on the watch face)
│ ┌ Resting HRV  42 ms  Normal ▁▃▂▅▆▂▃ ┐│  stacked metric cards, value left, badge, sparkline with band right
│ ┌ Resting HR   57 bpm Normal ▆▅▅▄▃▂▁ ┐│
│ ┌ Sleep        7h 07m Below usual ▃▅▆▂┐│
│ ┌ Today's workouts ───────────┐ │  sport icon · name · duration · strain contribution
│ │ 🏃 Outdoor run 6.0 km 37:18 │ │
│ ┌ 🌱 Insight ─────────────────┐ │  one-paragraph plain-language card, expandable (ref 04 bottom card)
│ └─────────────────────────────┘ │
│  Today  Trends  Workouts  Fitness  Journal │
└─────────────────────────────────┘
```
Empty state before baselines exist: rings show "– %" and the card says "Nothing to see yet" with a calibrating hint, as in the screenshot.

**Score detail** (ref `02-strain-score-detail.png`, one layout for Strain, Recovery, Sleep, Stress, Energy)
```
┌─────────────────────────────────┐
│ ✕          Strain Score         │  presented as a modal sheet
│ 65 %                 Normal range│  big value + date left; personal normal range right, coloured by band
│ Feb 19                34 – 67 % │
│ [Strain score][Exercise duration][Daytime HR][TRIMP]│  chip row switches the chart's series
│   ╱╲        ╱╲            100   │  line chart with dot markers, gradient fill, dotted "Avg. 66 %" line,
│ ╱╱  ╲╲____╱╱  ╲╲  Avg 66 %  67  │  shaded normal band; 1W / 1M / 3M range toggle under it
│ ┌ Daytime HR  45 bpm  ↓ Below normal  ▁▂▃▅▄▂ →┐│  component cards, each tappable → Trends for that metric
│ ┌ Total energy …                               ┐│
│ ┌ How this was computed ──────┐ │  our addition: component weights and the values that went in
└─────────────────────────────────┘
```

**Recovery detail** (ref `04-recovery-detail.png`) uses the same sheet but with Bevel's hero treatment: illustrated sky/landscape header whose palette follows the band (green day, amber, red), a large ring "72 % recovered" over it, then two side-by-side cards (Resting HRV 42 ms ▲ · Resting HR 57 bpm ▼), then the 🌱 insight card ("Your resting HRV is 42 ms, below your usual 47 ms, and…"), then the chart and components as above.

**Sleep detail** (ref `03-sleep-detail.png`, dark navy)
```
┌─────────────────────────────────┐
│ ✕     Primary sleep             │
│       Oct 13 · 23:51 – 08:07    │
│ Sleep Stages                    │
│ ▇ ▁▁▃▃▁▁▅▅▁▁▂▂▇▇▁▁              │  hypnogram step chart: Awake orange · REM light blue · Core/Light blue · Deep purple
│ ☾ 11:51 PM  2 AM  4 AM  6 AM ☀ 8:07 AM │
│ ▭ Typical range     Duration 8:16:00 │
│ ┌ Awake 1h 9m 14 % ◔ ┐ ┌ REM 1h 1m 12 % ◔ ┐ │  2×2 stage cards with mini rings vs typical range
│ ┌ Core  4h 34m 55 % ◑ ┐ ┌ Deep 1h 32m 19 % ◔ ┐ │
│ ┌ Sleep needed 8h 30m  ◯ ┐      │  ring with bed / sparkle / sun / alarm markers; need = base + debt + strain
│ ┌ Sleep HR  avg 60 · min 50 ▁▂▃▂▁ ┐│
│ ┌ Sleep score 68 · components ┐  │  duration, efficiency, restorative, continuity, HR dip, consistency
└─────────────────────────────────┘
```

**Trends**: metric picker (Recovery, Sleep, Strain, Stress, Energy, HRV, RHR, sleep HR, sleep stages, steps, weight, BMI, body fat, VO2max, LTHR, threshold pace, CTL/ATL/TSB, bio age) × range (1W/1M/3M/6M/1Y). Same chart component as the score detail (dots, gradient, average line, normal band), weekly averages, tap-to-inspect.

**Workouts**: list grouped by week with weekly totals; detail = map (if GPS), HR/pace/power/cadence/altitude charts with zone shading, laps table, HR-zone time, TRIMP, aerobic/anaerobic TE (COROS) next to our strain, "steady windows used for VO2max" highlighted.

**Fitness**: VO2max (ours vs COROS, CI, 3 estimators), LTHR + zones, threshold pace / critical-speed curve, race predictions table, load chart (CTL/ATL/TSB vs COROS short/long), HRmax estimate, and the **Biological age** screen below.

**Biological age** (ref `08-biological-age.png`)
```
┌─────────────────────────────────┐
│          Biological Age      ⋯  │
│      ╭──────●─────────╮         │  arc gauge, chronological age marked, marker at bio age
│         21.4  · 1.6 years younger│
│      Next update in 2 days      │  weekly on Monday
│ ┌ ✓ 83 % confidence · 30 days of HRV, 28 of sleep, no body-fat data → ┐│  confidence from input coverage
│ Age Biomarkers                  │
│ ┌ ◔ Fitness (VO2max)  2.1 years younger  ⌄ ┐ │  group header with mini ring + contribution; expands to rows:
│ │ VO2max   35 ──────●──── 65   −2.1 years │ │  each row = value on a min–max slider + years contribution
│ ┌ ◔ Sleep   0.4 years younger  ⌄ ┐        │
│ │ Time asleep 5h ───●──── 11h  −0.1 years │
│ │ Consistency 30 % ──────● 100 % −0.3 years│
│ ┌ ◔ Heart   RHR, HRV rows ┐  ┌ ◔ Body  BMI, body-fat rows ┐  ┌ ◔ Activity  steps, MET-min ┐ │
└─────────────────────────────────┘
```

**Journal**: tag grid for today (alcohol, caffeine after 2 pm, late meal, travel, sick, sauna, nap, screens in bed, custom), notes; "Insights" section listing tag → next-day recovery/sleep/HRV deltas with sample counts, hidden until n ≥ 8. The status chip on Today ("Active / Rest day / Sick / Travel") writes here.

**Settings**: data sources + last sync, HealthKit permissions, HRmax, RHR source, sleep need, units, formula weights (advanced), export/backup.

Out of scope but visible on Bevel's site, kept as later options: nutrition tracking (ref 05), health records / labs feeding biological age (ref 06), AI chat over your data (ref 07, phase 6 with the Claude API).

---

## 8. Build plan

Each phase ends with something usable and a short writeup. Estimates assume part-time work with Claude doing most of the typing.

| Phase | Deliverable | Done when |
|---|---|---|
| **0. Scaffold** (1–2 days) | Monorepo (`backend/`, `app/`, `docs/`), Docker Compose, CI (ruff, pytest, tsc, eslint, jest), `.env.example`, CLAUDE.md; Expo project with EAS configured; you create the Apple Developer account and run one dev build on your phone | `make dev` brings up the API; the dev build opens on your iPhone and shows a hello screen fed by the API |
| **1. Ingestion** (3–5 days) | `CorosSource` (MCP first, Hub API fallback), full backfill of activities + FIT + daily data, raw blob store, `health sync` cron; in the app: HealthKit permissions, anchored queries, background delivery, POST to `/ingest/apple-health`; weight captured from the COROS profile on every sync | 12 months of history on disk; `health show today` prints COROS's recovery/sleep/HRV/RHR from our DB |
| **2. Engine v1** (3–5 days) | nightly HRV, sleep score, recovery, strain, stress, energy, CTL/ATL/TSB; backtest notebook comparing ours vs COROS over the backfill | Correlation + bias report in `docs/engine/backtest-v1.md`; formulas tuned so disagreement is explainable |
| **3. Fitness models** (5–8 days) | HRmax estimate, steady-window extractor, VO2max ×3, LTHR ×3, critical speed, race predictions, blending + CIs | Report vs COROS and vs any real race; unit tests on fixture FITs |
| **4. App v1** (6–10 days) | Today, score-detail sheet, Recovery hero, Sleep detail (hypnogram), Trends, Workouts list/detail, Settings; shared chart/ring/sparkline components in Skia; component tests + screenshot tests in CI | Daily use replaces the COROS app for "how am I" |
| **5. Fitness + journal UI** (3–5 days) | Fitness tab, biological age, Journal + correlations, rule-based insights | |
| **6. Polish** (ongoing) | morning recovery push, LLM daily insight / chat over your data (Claude API), home-screen widget via a Swift extension, TestFlight release | |

Suggested first session after this doc is approved: phase 0 + the MCP-client spike from phase 1 (can our backend authenticate to `mcp.coros.com`?), because that answer decides whether the unofficial API work is needed at all. In parallel you set up the Apple Developer account so the first dev build can go on your phone.

---

## 9. Risks

- **COROS access.** Official MCP may not allow third-party OAuth clients; unofficial API may break. Mitigation: interface + two implementations; raw cache means an outage only pauses new data.
- **FIT download quota.** COROS limits daily FIT downloads. Backfill over several days; never re-download.
- **HRmax drives everything in 6.5.** A wrong HRmax shifts VO2max by ~1 ml/kg/min per 3 bpm. Mitigation: estimate from data, show the sensitivity, encourage a real test.
- **Small-n statistics.** Journal correlations and bio-age will be noisy for months. Show sample sizes and CIs; hide below thresholds.
- **Native build loop.** HealthKit cannot be exercised in this cloud session; every HealthKit change needs a dev build on your phone to verify. Keep the HealthKit layer thin and well-logged so most work stays in testable TypeScript.
- **Weight source.** If the scale writes only to COROS (not Apple Health), weight history is limited to what we capture at sync time going forward.
- **Scope creep toward COROS's planner / Bevel's AI coach.** Both explicitly deferred.

---

## 10. Open items (need your input)

1. ~~Client~~ — decided: native iOS via React Native / Expo (4.1).
2. **HRmax**: field test is now in your COROS workout library (`docs/engine/hrmax-test.md`); tell me a date to schedule it. Any recent race results (date, distance, time) to validate VO2max against?
3. **COROS → Apple Health sync**: is it enabled on your phone today, and do you have any other HealthKit writers (scale, Apple Watch)?
4. **Hosting**: run on a home machine (Docker) or a small cloud box?
5. ~~Bevel screenshots~~ — received and filed in `docs/reference/bevel/`; section 7 now mirrors them. Still useful if you have them: the Trends tab, a workout detail, and the Journal screen (from inside the app rather than the marketing site).
7. **Apple Developer account**: do you have one? Needed for TestFlight / internal builds.
8. **Smart scale app**: which scale, and does its own app write to Apple Health?
6. **Units**: km and kg assumed.

---

## Appendix A — Sources used

- Bevel: App Store listing; help.bevel.health "Features available by app version", "Membership & pricing", biological-age release notes; reviews at kiledjian.com, healthappinsider.com, autonomous.ai, techwaterfall.com.in, bodly.app, neura.health, fitcoin.co.
- COROS: support articles on exporting workout data and third-party sync, Apple Health connection, "COROS MCP: connecting your training data to AI"; community clients `corosexport` (PyPI), `Pinta365/coros`, `cygnusb/coros-mcp`, `dholliday3/coros-training-mcp`.
- Methods: Banister TRIMP; ACSM metabolic running equation; Daniels & Gilbert VDOT; Monod–Scherrer critical speed; Friel 30-min LTHR test; Cooper Institute / FRIEND VO2max norms; Plews & Buchheit on lnRMSSD rolling averages.
