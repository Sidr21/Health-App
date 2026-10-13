# Bevel reference screenshots

Captured from bevel.health on 2026-10-13 (marketing site, iPhone Safari). Used only as layout references for `docs/DESIGN.md` §7.

| File | Screen | What to copy |
|---|---|---|
| 01-today-home.png | Today / home | "Today, March 12 ▾" header, avatar top-right, status chip ("Active · Until changed") + weather chip, card with three rings (Strain · Recovery · Sleep), stacked metric cards below (Recovery score, Resting HRV, Resting HR 49 bpm · "Normal" badge · sparkline). Watch face shows three rings: Stress & Energy. |
| 02-strain-score-detail.png | Score detail (Strain) | Modal with ✕, title; big "65 %" + date left, "Normal range 34–67 %" right in green; chip row for sub-metrics (Strain score · Exercise Duration · Daytime HR · …); line chart with dot markers, soft gradient fill, dotted average line labelled "Avg. 66 %"; metric cards below ("Daytime HR 45 bpm · Below normal ↓ · sparkline with band"). |
| 03-sleep-detail.png | Sleep detail | Dark navy theme. "Primary sleep · date"; hypnogram step chart (Awake orange, REM light blue, Core blue, Deep purple) with moon/sun time axis; "Typical range" + Duration; 2×2 stage cards each with duration, %, mini ring. "Sleep Needed 8h 30m" ring widget. |
| 04-recovery-detail.png | Recovery detail | Back chevron + ? help; "Recovery · date ▾"; illustrated sky/landscape background; large ring "70 % recovered" in green; two cards (Resting HRV 85 ms ▲ · Resting HR 59 bpm ▼); expandable insight card "🌱 You're well recovered — your resting HRV is 72.4 ms, well above your usual 56.8 ms…". |
| 05-nutrition.png | Nutrition | Out of scope v1. Food-group sliders with ± scores, macro dot grid, net-energy slider, micronutrient cards. |
| 06-health-records.png | Health records | Out of scope v1. Labs / clinical notes list with filter chips; feeds biological age. |
| 07-ai-chat.png | AI coach chat | Phase 6 candidate. Question → visible reasoning steps → grounded answer with copy / 👍 / 👎. |
| 08-biological-age.png | Biological age | Arc gauge with marker (29.7), "Next update in 2 days", confidence card ("83 % confidence · High-quality estimate with minor gaps"), "Age Biomarkers" groups (Sleep · 1.7 years younger; Activity · 1.2 years younger), each expandable into rows with a value on a min–max slider and a "−0.1 years" contribution. |

Design language: **light-first** with soft blue/lavender gradient backgrounds, white rounded cards, large numerals, chip filters, status badges with arrow icons ("Normal", "Below normal"), sparklines with a shaded normal-range band, SF-style type. Sleep is the one dark screen.

## In-app screenshots (added 2026-10-13, user's own install, dark appearance)

These are from inside the app and override the marketing-site impressions above where they differ. The app is **dark** in normal use; the tab bar is **Home · Journal · Fitness · Biology** plus a floating **+** button.

| File | Screen | What to copy |
|---|---|---|
| 09-journal.png | Journal tab | Header "Journal / Oct 2026" with a ✦ Insights button and ⋯ menu; week strip (Sun–Sat) with a gold ✓ circle on days that have entries; "Today's Entries — your entries today contribute to the 90-day rolling data for tomorrow's insights"; sections **Daytime** / **Nighttime**; rows are either tri-state toggles (✕ · — · ✓: Added sugar, Keto diet, Low carbs) or numeric entries with a unit and → (Caffeine mg, Hydration fl oz, Daily mood). |
| 10-fitness-tab-week.png | Fitness tab, top | Calendar icon + ⋯; week strip of pills (F 9 … T 14) each with the day's sport icon or 💤 for rest, selected day highlighted, → to next week; promo card (skip); "Mon, October 12" day header with weather chip and + (manual workout); workout card: time, name, strain-% mini ring, distance, kcal, →; "Routines" (skip). |
| 11-workout-detail-summary.png | Workout detail, top | ✕ / share / ⋯; glowing sport icon, sport label, title, date + time range, source "COROS" (Bevel sees COROS workouts via Apple Health); "Workout Details" with a **Charts** button; **Activity Strain 44** ring card "Moderate load from this activity"; 2-column stats grid (Active duration, Total duration, Distance, Avg pace, Avg HR, Active energy, Total energy); "Heart" section begins with Cardio Load +27. |
| 12-workout-detail-hr-zones.png | Workout detail, heart | Heart Rate card: Avg / Min / Max; line coloured by zone with dotted zone boundaries (99 / 119 / 139 / 159 / 179 bpm) and time axis; **Heart Rate Zones** table (zone 5→0, bar, %, duration, bpm range). Note the boundaries imply a fixed %-of-HRmax scheme; ours will come from LTHR. |
| 13-workout-detail-cardio-focus-hrr.png | Workout detail, cardio focus + HRR | **Cardio Focus** rows (Anaerobic / High Aero / Low Aero: bar, %, "+points"); **Heart Rate Recovery**: "HR difference −28 bpm", "144 bpm → 116 bpm", one-minute decline chart, Poor/Fair/Good/Excellent/Superior scale (0 · 15 · 32 · 40 · 49+) "standardized to your age". |
| 14-workout-detail-muscles.png | Workout detail, muscles | **Muscular Load +28 · Peaking** with mini trend; **Muscle Breakdown**: body-part ring (Legs 100 %), per-muscle bars (Quads 30 %, Glutes 25 %, Calves 20 %, Hamstrings 15 %, Hip flexors 10 %) with highlighted anatomy icons. |
| 15-fitness-tab-load-cardio.png | Fitness tab, load + cardio | Two arc gauges: **Cardio load 27 · "Productive"** (0–45, optimal 20–32) and **Muscular load 48 · "Peaking"** (0–103, optimal 33–74) with tick marks and an optimal band; **Cardio** card grid (Edit): All Activities active duration 18:06:19 and active energy 8,066 kcal as cumulative lines vs previous period, VO₂ Max, Heart Rate Recovery 28 bpm "Fair" trend, Cardio Focus 41 % High Aerobic bars, Heart Rate Zones "Zone 0 · 4h 22m" bar chart. |
| 16-fitness-tab-strength.png | Fitness tab, strength | **Strength** card grid: All Muscles total sets / total volume with trend line; **Muscle Freshness** grid (Chest, Lats, Biceps, Triceps, Quads 51 %, Glutes 52 %) with anatomy icons and 10-dot meters; "Edit Fitness" button. Floating 🏃 and + buttons bottom corners. |
