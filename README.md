# Peeters Family Dashboard

Wall dashboard for the kitchen iPad, served from the Mac Mini at `192.168.10.6`.

## Getting there

| What | Where |
| --- | --- |
| Dashboard | http://192.168.10.6 |
| Home Assistant | http://192.168.10.6:8123 |
| Calendar feed (subscribe from a phone) | http://192.168.10.6/api/calendar.ics |

The iPad runs it fullscreen via Safari → Share → **Add to Home Screen**. It must be
Safari; Chrome on iOS cannot install home-screen apps.

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
| `web` | Caddy serving the built Svelte SPA on :80, proxying `/api` to the API |
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

## Settings

Times and toggles live in the `settings` table, editable over the API:

```bash
curl -X PUT http://192.168.10.6/api/settings \
  -H "Content-Type: application/json" \
  -d '{"bedtime_start":"20:30"}'
```

| Key | Default | Effect |
| --- | --- | --- |
| `morning_start` / `morning_leave` | 07:00 / 08:30 | School-run countdown window |
| `school_days` | `12345` | ISO weekdays the countdown runs (Mon=1) |
| `bedtime_start` / `bedtime_end` | 19:00 / 06:30 | When the display dims |

`PARENT_PIN` (in `.env`, default `1234`) gates reward claims.

## Local development

```bash
cd web && npm install && npm run dev   # :5199, proxies /api to the Mini
```
