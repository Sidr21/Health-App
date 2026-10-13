# Setup (Mac)

## 0. Prerequisites
- Xcode (App Store) with the iOS platform installed; open it once to accept the license.
- [uv](https://docs.astral.sh/uv/) (`brew install uv`), Node 22 (`brew install node`), Docker Desktop (optional, for the cloud image).
- Your iPhone on the same Wi-Fi as the Mac, Developer Mode enabled (Settings → Privacy & Security).

## 1. Backend
```bash
cd backend
cp ../.env.example .env            # set HEALTH_API_TOKEN to something long and random
uv sync
uv run health db init
uv run health coros auth           # opens the COROS login in your browser (spike for DESIGN §3.1)
uv run health coros sync --days 60 # backfill + compute scores
uv run health show today
uv run health serve --reload       # http://localhost:8000/docs
```
If `coros auth` fails at the OAuth step, copy the full error into the chat: that is the one open
question about the official MCP (whether it accepts third-party clients). Fallback is the Training
Hub API implementation described in `docs/DESIGN.md` §3.1.

Manual import without the MCP (works today): paste a tool output from Claude into a file and run
`uv run health coros import querySleepHrv path/to/file.txt`.

Lifting from other apps: export from Strong (Settings → Export data) or Hevy (Settings → Export &
import data → Export workouts) and run `uv run health strength import export.csv` (add `--unit kg`
for a Strong export in kilograms without a unit column). Re-importing replaces the same sessions.
`uv run health strength show today` prints muscle freshness and load.

## 2. App (development build on your phone, free Apple ID)
```bash
cd app
npm install --legacy-peer-deps
cp .env.example .env               # EXPO_PUBLIC_API_URL=http://<mac-lan-ip>:8000, EXPO_PUBLIC_API_TOKEN=<same token>
npx expo prebuild --platform ios   # generates ios/ (gitignored)
npx expo run:ios --device          # pick your iPhone; first build takes a while
```
Xcode will ask you to pick a signing team: choose your personal team (free Apple ID). The HealthKit
entitlement is in `app.json` and is allowed on free accounts. Re-run `expo run:ios --device` every
7 days when the free profile expires. Afterwards `npx expo start --dev-client` hot-reloads JS.

In the app: open Settings → "Connect Apple Health & sync now", allow the body-measurement types.

## 3. Cloud backend (phase 1, after the MCP auth works)
```bash
docker compose up -d --build       # or deploy backend/Dockerfile to Fly.io / Railway with a volume at /data
```
Point `EXPO_PUBLIC_API_URL` at the public URL. COROS tokens live in `/data/coros_oauth.json`;
run `health coros auth` once on the Mac and copy that file to the volume.
