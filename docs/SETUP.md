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
COROS hands each account to a regional server (`mcpus.coros.com` in the US); the client reads
COROS's OAuth metadata and connects to the one it names. To pin it, set
`HEALTH_COROS_MCP_URL=https://mcpus.coros.com/mcp` in `backend/.env`.

If `coros auth` fails at the OAuth step, copy the full error into the chat: that is the one open
question about the official MCP (whether it accepts third-party clients). Fallback is the Training
Hub API implementation described in `docs/DESIGN.md` §3.1.

Manual import without the MCP (works today): paste a tool output from Claude into a file and run
`uv run health coros import querySleepHrv path/to/file.txt`.

Workout files: `health coros sync` downloads up to 10 new FIT files per run (`--fit-limit N`);
COROS caps daily downloads, so a 12-month backfill finishes over a few days of runs. A single file
can be imported with `uv run health fit path/to/file.fit --label-id <COROS labelId>`.

Lifting from other apps: export from Strong (Settings → Export data) or Hevy (Settings → Export &
import data → Export workouts) and run `uv run health strength import export.csv` (add `--unit kg`
for a Strong export in kilograms without a unit column). Re-importing replaces the same sessions.
`uv run health strength show today` prints muscle freshness and load.

## 2. App (development build on your phone, free Apple ID)
Extra prerequisites: CocoaPods (`brew install cocoapods`), and on the iPhone Developer Mode
(Settings → Privacy & Security → Developer Mode, then restart). Plug the phone in by cable the
first time and tap "Trust This Computer".

```bash
cd app
npm install --legacy-peer-deps
cp .env.example .env               # EXPO_PUBLIC_API_URL=http://<mac-lan-ip>:8000 (ipconfig getifaddr en0),
                                   # EXPO_PUBLIC_API_TOKEN=<same as HEALTH_API_TOKEN in backend/.env>
npx expo prebuild --platform ios   # generates ios/ (gitignored)
npx expo run:ios --device          # pick your iPhone; first build takes 5–15 min
```
- Signing: if the build stops on signing, open `ios/Health.xcworkspace` in Xcode → target
  *Health* → Signing & Capabilities → Team = your Apple ID (Personal Team), then re-run. If the
  bundle ID `com.sidr21.healthapp` is reported as taken, change `ios.bundleIdentifier` in
  `app.json` (e.g. add a suffix) and run prebuild again.
- First launch: iOS refuses the app until you trust it: Settings → General → VPN & Device
  Management → your Apple ID → Trust.
- Allow "Local Network" when asked: the app talks to the backend on your Mac over Wi-Fi.
- The app only needs the HealthKit capability, which free accounts can sign. Don't add push
  notifications (paid accounts only); `expo-notifications` was removed for that reason.
- Free provisioning expires after 7 days: re-run `npx expo run:ios --device`. Day to day,
  `npx expo start --dev-client` hot-reloads JS changes onto the installed app.

In the app: open Settings → "Connect Apple Health & sync now", allow the body-measurement types.

## 3. Cloud backend (Fly.io)
One always-on machine runs the API and the COROS sync: a quick sync of the last 3 days every
15 minutes, plus a 30-day sync once a night after 4 am, each followed by a recompute. Settings
in the app shows the last run and has a "Sync COROS now" button. Cost: about $3–4 a month
(shared-cpu-1x, 512 MB, 1 GB volume); Fly asks for a card. The server has a public HTTPS
address; every endpoint except `/health` needs the API token, and with `HEALTH_PUBLIC=true`
(set in `fly.toml`) it refuses to start if the token is missing, a placeholder or shorter than
24 characters.

**COROS login, two ways.** Easiest: deploy first, then in the app open Settings → Connections →
**Connect COROS**. The server runs the login itself, the COROS page opens on the phone, and
the server keeps the token and refreshes it. If the COROS page refuses the server's callback
address, use the Mac instead: run `uv run health coros auth` (it creates
`backend/data/coros_oauth.json`) and pass that file in the `fly secrets set` line below.

```bash
curl -L https://fly.io/install.sh | sh        # or: brew install flyctl
fly auth signup                               # or: fly auth login
cd backend
fly launch --copy-config --no-deploy          # uses fly.toml; pick another app name if taken
fly volumes list                              # if no health_data volume is listed:
fly volumes create health_data --size 1 --region ewr --yes
fly secrets set HEALTH_API_TOKEN=<same token as app/.env>
# only for the Mac login: fly secrets set HEALTH_COROS_TOKEN_JSON="$(cat data/coros_oauth.json)"
fly deploy
```

Check it (use the app name you picked):
```bash
curl https://health-sidr21.fly.dev/health
curl -H "Authorization: Bearer <your token>" https://health-sidr21.fly.dev/sync/state
```
The first sync starts ~20 s after boot and the first one of the day pulls 30 days. `fly logs`
shows it running.

**Bring your existing history (optional).** To start from the database you already have on the
Mac instead of an empty one:
```bash
fly ssh console -C "rm -f /data/health.db"
fly ssh sftp shell          # then:  put data/health.db /data/health.db   (Ctrl-D to leave)
fly apps restart
```

**Point the phone at it.** In `app/.env` set `EXPO_PUBLIC_API_URL=https://health-sidr21.fly.dev`,
then restart the dev server with `npx expo start --dev-client --clear` (the URL is baked into
the JS bundle). The Mac no longer needs to be on.

**When COROS logs you out** (Settings shows "no COROS login" or sync errors about auth): run
`uv run health coros auth` on the Mac again, then
```bash
fly ssh console -C "rm /data/coros_oauth.json"
fly secrets set HEALTH_COROS_TOKEN_JSON="$(cat data/coros_oauth.json)"   # restarts the app
```
The secret is only used when the server has no token file, so refreshed tokens on the volume
are never overwritten by an old secret.

**Lab reports and doctor's documents.** Uploads (Biology → Labs, or the + button) are read by
Claude through the Anthropic API, so the server needs an API key from
[console.anthropic.com](https://console.anthropic.com):
```bash
fly secrets set ANTHROPIC_API_KEY=sk-ant-...      # locally: ANTHROPIC_API_KEY=... in backend/.env
```
Without it, uploads are kept and marked "couldn't read it" with a message saying the key is
missing; add the key and tap Try again. A 14-page report costs roughly $0.20–0.50 to read
(`HEALTH_DOCUMENTS_EFFORT=low` makes it cheaper, `high` more careful). The document goes to
Anthropic's API for reading (API inputs aren't used for training) and is stored on your
volume under `/data/documents/`. To try it on the Mac without the app:
`uv run health docs add ~/Downloads/report.pdf` prints what it read and leaves it for review.

Backups: Fly snapshots the volume daily (kept 5 days); `fly volumes snapshots list`.
Anywhere else: the same image runs with Docker (`docker compose up -d --build` from the repo
root) as long as `/data` is persistent and `HEALTH_SYNC_INTERVAL_MIN` is set.
