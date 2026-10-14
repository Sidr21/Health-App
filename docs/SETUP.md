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

## 3. Cloud backend (Google Cloud, free)
A free e2-micro VM runs the API and the COROS sync around the clock: the last 3 days every
15 minutes and 30 days once a night, each followed by a recompute. Settings in the app shows
the last run and has a "Sync COROS now" button. The phone reaches the VM through
[Tailscale](https://tailscale.com) (free), so nothing on the VM is open to the internet. The
database is copied every night (kept 14 days).

**Before you start:** `uv run health coros auth` must have worked on the Mac, so
`backend/data/coros_oauth.json` exists. The VM can't open a browser to log in; it starts from
that token and keeps refreshing it.

**1. Create the VM** at [console.cloud.google.com](https://console.cloud.google.com):
- New project (e.g. `health`), then turn on billing. The free tier needs a card but doesn't
  charge for what's below.
- Compute Engine → VM instances → Create instance:
  - Region **us-east1**, **us-central1** or **us-west1** (only these are free); any zone.
  - Machine type **e2-micro**.
  - Boot disk: **Debian 12**, disk type **Standard persistent disk**, **30 GB**. The default
    "Balanced" disk is not free.
  - Leave the firewall boxes (HTTP/HTTPS traffic) unticked.
- Billing → Budgets & alerts → a **$1 budget** with email alerts, so any charge outside the
  free tier (for example the VM's external IP) shows up in days, not months.

**2. Install the backend.** Click **SSH** next to the VM (opens a terminal in the browser):
```bash
curl -fsSL https://raw.githubusercontent.com/Sidr21/Health-App/claude/design-gameplan/deploy/gcp/setup-vm.sh | sudo bash
```
It asks for `HEALTH_API_TOKEN` (the same token as in `app/.env`), installs Docker and
Tailscale, builds and starts the API. Settings live in `/etc/health/backend.env`, data in
`/var/lib/health`.

**3. Connect Tailscale.** Install Tailscale on the iPhone (App Store) and log in. On the VM:
```bash
sudo tailscale up --hostname=health --ssh     # open the printed link and log in with the same account
sudo tailscale serve --bg 8000                # prints https://health.<your-tailnet>.ts.net
```
If `serve` says HTTPS isn't enabled, open the link it gives and enable it, then run it again.

**4. Give the VM your COROS login.** In the browser SSH window use **Upload file** (gear or
upload icon, top right) and pick `backend/data/coros_oauth.json` from the Mac, then:
```bash
sudo install -m 600 ~/coros_oauth.json /var/lib/health/coros_oauth.json && rm ~/coros_oauth.json
```
The next sync (within 15 minutes) picks it up. Check it with
`curl -s -H "Authorization: Bearer <token>" http://127.0.0.1:8000/sync/state`.

**5. Bring your existing history (optional).** Upload `backend/data/health.db` the same way, then:
```bash
cd /opt/health-app && sudo docker compose -f deploy/gcp/compose.yml stop
sudo install -m 600 ~/health.db /var/lib/health/health.db && rm ~/health.db
sudo docker compose -f deploy/gcp/compose.yml start
```

**6. Point the phone at it.** In `app/.env` set `EXPO_PUBLIC_API_URL=https://health.<your-tailnet>.ts.net`
and restart the dev server (`npx expo start --dev-client --clear`). The phone needs the
Tailscale app connected (it can stay on in the background); the Mac can be off.

**Day to day**
- Update to the latest code: `sudo /opt/health-app/deploy/gcp/update.sh`
- Logs: `sudo docker compose -f /opt/health-app/deploy/gcp/compose.yml logs -f --tail 100`
- Backups: `/var/lib/health/backups/health-YYYY-MM-DD.db`
- COROS logged you out: run `uv run health coros auth` on the Mac again and repeat step 4.

Free-tier limits: one e2-micro in those three regions, 30 GB standard disk, 1 GB of outbound
traffic a month (the sync and the app use far less). Google's terms change; the $1 budget alert
is there to catch it if they do.

## 4. Alternative: Fly.io (~$3–4/month, fully managed)
No server to maintain, automatic volume snapshots and a public HTTPS URL; you pay for that.
One always-on machine runs the API and the COROS sync: a quick sync of the last 3 days every
15 minutes, plus a 30-day sync once a night after 4 am, each followed by a recompute. Settings
in the app shows the last run and has a "Sync COROS now" button. Cost: about $3–4 a month
(shared-cpu-1x, 512 MB, 1 GB volume); Fly asks for a card.

**Before you start:** `uv run health coros auth` must have worked on the Mac, so
`backend/data/coros_oauth.json` exists. The server can't open a browser to log in itself; it
starts from that token and keeps refreshing it.

```bash
curl -L https://fly.io/install.sh | sh        # or: brew install flyctl
fly auth signup                               # or: fly auth login
cd backend
fly launch --copy-config --no-deploy          # uses fly.toml; pick another app name if taken
fly volumes list                              # if no health_data volume is listed:
fly volumes create health_data --size 1 --region ewr --yes
fly secrets set HEALTH_API_TOKEN=<your token> HEALTH_COROS_TOKEN_JSON="$(cat data/coros_oauth.json)"
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

Backups: Fly snapshots the volume daily (kept 5 days); `fly volumes snapshots list`.
Anywhere else: the same image runs with Docker (`docker compose up -d --build` from the repo
root) as long as `/data` is persistent and `HEALTH_SYNC_INTERVAL_MIN` is set.
