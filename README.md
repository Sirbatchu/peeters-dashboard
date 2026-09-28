# Peeters Family Dashboard

Wall dashboard for the kitchen iPad, served from the Mac Mini at `192.168.10.6`.

## Getting there

| What | Where |
| --- | --- |
| Dashboard | http://192.168.10.6 (iPad) · https://192.168.10.6:8443 (Android tablet) |
| Home Assistant | http://192.168.10.6:8123 |
| Calendar feed (subscribe from a phone) | http://192.168.10.6/api/calendar.ics |

The iPad runs it fullscreen via Safari → Share → **Add to Home Screen**. It must be
Safari; Chrome on iOS cannot install home-screen apps.

## The Android tablet (TCL 10")

Chrome only offers **Install** (a real fullscreen app) on HTTPS — on plain
`http://192.168.10.6` it says *"This app cannot be installed"* and only offers a
shortcut that opens in a browser tab. So Caddy also serves the dashboard on
**https://192.168.10.6:8443**, signed by its own local CA (port 8443 because another
container on the Mini already uses 443). One-time setup on the tablet:

1. In Chrome open **http://192.168.10.6/ca.crt** — it downloads `peeters-ca.crt`.
2. Settings → Security & privacy → More security settings → Encryption & credentials →
   **Install a certificate → CA certificate** → pick `peeters-ca.crt` from Downloads.
   (Menu names vary a little by Android version; search Settings for "CA certificate".)
3. Fully close Chrome, then open **https://192.168.10.6:8443** — there should be no warning.
4. ⋮ menu → **Add to home screen → Install**. It launches fullscreen, landscape, and
   keeps the screen awake (Wake Lock).

The CA lives in the `caddy_data` volume, so it survives deploys. If that volume is ever
deleted, a new CA is generated and steps 1–2 must be repeated.

Nothing changes for the iPad: `http://` still works and is not redirected.

## Deploying

Push to `main`. A self-hosted GitHub Actions runner on the Mini rebuilds and restarts
the stack automatically — usually done inside two minutes.

```bash
git push origin main
gh run list --repo Sirbatchu/peeters-dashboard --limit 1   # watch it land
```

The runner is a systemd service, so it survives reboots:

```bash
systemctl status actions.runner.Sirbatchu-peeters-dashboard.macmini.service
```

## The stack

Four containers, compose project `peeters`, living in `~/peeters-dashboard` on the Mini.

| Service | Role |
| --- | --- |
| `web` | Caddy serving the built Svelte SPA on :80 and :8443, proxying `/api` to the API |
| `api` | Fastify — calendar, kids, household, Home Assistant bridge |
| `db` | Postgres 16 — the source of truth for everything |
| `homeassistant` | Device layer on :8123 (host networking, needed for Sonos/Blink discovery) |

Untracked on the Mini and **not** in git: `.env` (secrets) and `photos/` (photo-frame
images). Everything else is replaced from the repo on each deploy.

## The iPad constraint

The iPad is a 4th gen, capped at **iOS 10.3 / Safari 10**. This shapes the frontend:

- `@vitejs/plugin-legacy` targets `ios_saf >= 10`, so modern syntax is transpiled away.
  Write normal modern code — the build handles it.
- **No flexbox `gap`** (Safari 14.1+). Use CSS grid `grid-gap`, or margins.
- No service workers, so no offline mode — the Mini has to be reachable.
- Layout is landscape-first: a `max-height: 850px` media query compacts the header,
  tabs and calendar grid so all six weeks fit on a 1024×748 screen.

## Calendar views

The calendar has **Week / Month / Year** views (remembered per device) and a **⛶**
button for full screen: the header and tabs give way to a slim bar with the clock, a
**Calendar / Kids** switch, and **✕ Exit full screen**. Tap a month name in Year view
to open it, or any day for its events.

## Who an event is for

Every event belongs to a person (or a shared bucket), and that choice drives its
colour everywhere in the calendar. Pick it from the colour chips in the event form.

| Who | Colour |
| --- | --- |
| Family (default, shared) | slate `#64748b` |
| Matthew Peeters | purple `#8b5cf6` |
| Jamie-Lee | baby blue `#7dd3fc` |
| Malachi | blue `#3b82f6` |
| Atticus | green `#10b981` |
| Waverly | light pink `#f9a8d4` |
| Forest | orange `#f97316` |

Text on an event pill is black or white depending on the colour's perceived
brightness, so the pale pink and baby blue stay readable. Add or recolour people
in the `calendars` table (`sort_order` sets the chip order) — no code change needed.

Tap the **pencil** next to an event in the day view to edit it. Editing one
occurrence of a repeating event changes the whole series.

## Dimming

There is no automatic bedtime dim. Tap **🌙** (end of the tab row, or **🌙 Dim** in the
full-screen bar) to dim the screen, and **☀️** to brighten it again. Each screen
remembers its own setting.

## Background photos

From any phone on the home Wi-Fi, open **http://192.168.10.6/photos** — or scan the QR
code on the **House** tab. Tap **Add photos**, pick from the camera roll, then choose
**Animated sky**, **One photo** (tap the one you want) or **Slideshow**. The dashboard
picks the change up within a minute. Tip: Share → Add to Home Screen on that page for
a one-tap icon.

Photos are resized on the phone before upload and kept in the `backgrounds` docker
volume (separate from the idle-slideshow `photos/` folder).

## Settings

Times and toggles live in the `settings` table, editable over the API:

```bash
curl -X PUT http://192.168.10.6/api/settings \
  -H "Content-Type: application/json" \
  -d '{"morning_leave":"08:40"}'
```

| Key | Default | Effect |
| --- | --- | --- |
| `morning_start` / `morning_leave` | 07:00 / 08:30 | School-run countdown window |
| `school_days` | `12345` | ISO weekdays the countdown runs (Mon=1) |
| `background_mode` | `sky` | `sky`, `photo` or `slideshow` (set from `/photos`) |
| `background_photo` / `background_mins` | — / 15 | Chosen photo; slideshow interval |

`PARENT_PIN` (in `.env`, default `1234`) gates reward claims.

## Local development

```bash
cd web && npm install && npm run dev   # :5199, proxies /api to the Mini
```
