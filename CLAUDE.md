# Health App — working notes for Claude

Bevel-style recovery/sleep/training app on COROS data. Design and gameplan: `docs/DESIGN.md`
(read §4 architecture and §6 engine before touching code). Bevel reference screens:
`docs/reference/bevel/`.

## Layout
- `backend/` Python 3.12, FastAPI, SQLAlchemy, uv. Package `health/`:
  `sources/coros` (MCP client + text parsers + store), `sources/apple_health.py`,
  `engine/` (pure functions, no I/O), `compute.py` (DB glue), `api/`, `cli.py`.
- `app/` Expo SDK 57 + React Native + TypeScript, Expo Router (`src/app/`), tabs Home · Journal ·
  Fitness · Biology. HealthKit via `@kingstinct/react-native-healthkit` (needs a dev build, not Expo Go).
- `docs/` design, engine notes, Bevel screenshots.

## Commands
- Backend: `cd backend && uv run pytest -q`, `uv run ruff check health tests`, `uv run health --help`.
- App: `cd app && npx tsc --noEmit && npx eslint . && npx jest --ci`.
- `make lint`, `make test` run both.

## Rules
- The repo is **public**: never commit real health data. Test fixtures under
  `backend/tests/fixtures/` are synthetic; keep them that way. Runtime data lives in `backend/data/` (gitignored).
- Engine functions stay pure (inputs in, numbers out) with tests; DB access goes in `compute.py` / `store.py`.
- Every derived number records its method and inputs (`fitness.inputs`, `scores.components`).
- COROS MCP returns formatted text, not JSON (lap data is the exception). Parsers live in
  `sources/coros/parsers.py`; add a synthetic fixture + test for every new tool.
- `npx expo install` cannot reach the React Native Directory from the cloud session; install with
  plain `npm install --legacy-peer-deps` using versions from `node_modules/expo/bundledNativeModules.json`.
- Do not create `ios/` or `android/` by hand (Continuous Native Generation).
