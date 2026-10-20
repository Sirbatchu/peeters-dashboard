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

The Mini's address is **`DASHBOARD_HOST`** in `.env` (default `192.168.10.6`; the
addresses on this page assume that). Caddy's HTTPS certificate, the Alexa Hue bridge proxy
and the calendar-feed links all follow it. If the Mini's IP changes, set it there, redeploy
(or `docker compose -p peeters up -d`), and re-run `homeassistant/apply.sh` so the Echos
find the bridge at the new address. Use an IP rather than a hostname — Echo devices need
an IP for the Hue bridge. The tablet keeps trusting the dashboard: Caddy issues a fresh
certificate for the new address from the same local CA.

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

Text on an event pill is black or white depending on the colour's perceived
brightness, so the pale pink and baby blue stay readable. Add or recolour people
in the `calendars` table (`sort_order` sets the chip order) — no code change needed.

Tap the **pencil** next to an event in the day view to edit it. Editing one
occurrence of a repeating event changes the whole series.

## Reminders

Recurring reminders — bins, PE kit, swimming bag — live under ⚙️ **Settings → Reminders**
(each falls on a weekday, every week or every other week). They show as a chip on the
**Next up** strip from midday the day before until midday on the day, Alexa says them the
evening before (`reminder_time`, default 18:00, on the briefing Echo) and again in the
morning briefing. Bins come pre-set: recycling every Monday, refuse every other Monday
(12 Oct 2026 was a refuse week).

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

Tap **⚙️** (end of the tab row, or in the full-screen bar) to change the school-run
times and school days from the tablet. They're saved on the Mini, so every screen
follows. Everything also lives in the `settings` table, editable over the API:

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

**Claiming a prize needs the parent PIN**, set as `PARENT_PIN` in `.env` on the Mini (it is
never in the repo, which is public). With no PIN set, claiming is locked; five wrong
tries lock it for a minute. **↩ Claims** on the *Saving up for* card lists recent claims
with a **Refund** button (also PIN-protected) that gives the stars back. Awarding bonus
stars stays open to anyone at the screen.

### Morning and evening jobs

The Kids tab shows **☀️ Morning jobs** until 10:00 and **🌙 Evening jobs** from 17:00
(by the tablet's clock); in between each child's card just shows how the morning went.
Each ticked job is worth a star, and a day counts towards the 🔥 streak once both lists
are done. Items live in `checklist_items` with a `routine` of `morning` or `evening`;
the API adds the column and the evening list once on startup.

Hidden kids (`kids.active = false`) keep their stars and history but don't appear on the
board. Waverly is hidden for now; to bring her back:

```bash
docker compose -p peeters exec db psql -U peeters -c "UPDATE kids SET active = TRUE WHERE slug = 'waverly'"
```

### Pictures and sounds

Each child's ring shows their emoji from the `kids` table; ⚡ is drawn as an animated
Pikachu (Malachi), 🦊 as Eevee (Atticus) and 🤖 as a dancing robot — see
`web/src/lib/Avatar.svelte`.

Finishing a morning or evening list plays that child's celebration tune, and a
**Beat the clock** timer plays an alarm when it runs out. Tunes are synthesised in the
browser (`web/src/sounds.js`), and the melodies are original: "Pokémon-style" and
"Minecraft-style" means the feel, not the real theme tunes. Choose and ▶ test them under
⚙️ **Settings → Sounds** (`sounds_on`, `sound_timer`, `sound_<kid>` in `settings`).
Browsers only play sound after the screen has been tapped once since loading.

### Alexa countdowns

Alexa can start the **Beat the clock** timers. Home Assistant's emulated Hue bridge shows
each one to Alexa as a "light" (Tidy up / Get dressed / Teeth / Maths / Quiet time
countdown, plus Stop countdown). Turning one on calls `POST /api/timer {"chore":"maths"}`,
and within ~5 seconds every screen jumps to the Kids tab, brightens and starts it.

Set up once on the Mini (re-run safely after any change in `homeassistant/`):

```bash
cd ~/peeters-dashboard/homeassistant && sh apply.sh
```

Then say "Alexa, discover devices", and in the Alexa app add a **Routine** per timer for a
natural phrase — When: *Voice* "maths time" → Action: *Smart Home* → Maths countdown →
*Power on* (optionally *Alexa says* "Three minutes of maths, go!"). Avoid the word "timer"
in phrases, or Alexa sets one of its own timers instead.

### Times tables

**🧮 Tables** on a child's card opens a 60-second quick-fire round with a big number pad;
answers check themselves once enough digits are typed, and misses come back later in the
round. Pick which tables (1–12) before starting — remembered per child in
`settings.tables_<kid>`. Every 5 right earns ⭐ (up to 5 ⭐ a day from the game, worked out
by the API); those stars land in `kid_awards` as "Times tables", so they show in the award
history and can be removed. Rounds are kept in `tables_rounds` for personal bests.

### Prizes

The **Saving up for** card lists prizes kids spend their stars on. They **reset every
day**: each child can claim each prize once a day if they have enough stars (a ✓ with
their emoji shows who's had it today). Claims are kept in the `reward_claims` table;
the API creates it on startup, moves any claims from the old one-off scheme into it, and
adds the Ice cream / breakfast / lunch / dinner-out prizes once.

Ice cream is 15 stars. To change a prize's price (e.g. ice cream to 25):

```bash
docker compose -p peeters exec db psql -U peeters -c "UPDATE rewards SET cost = 25 WHERE label = 'Ice cream'"
```

### Bonus stars

On the **Kids** tab, **＋ Award** next to a child's stars opens a panel to give 1–10
bonus stars with a note saying what they were for and who gave them (Mummy, Daddy or
another name). Awards add to the same ⭐ balance rewards are
claimed from, and the panel lists recent awards — 🗑 removes a mistake.
They're stored in the `kid_awards` table, which the API creates on startup if missing.

## J.A.R.V.I.S. (Alexa skill)

Say **"Alexa, ask Jarvis …"** and Claude answers in a British voice, using the dashboard
as his toolbox: the calendar (read and add), shopping list, reminders, dinners, pinned
notes, weather, the Kids board and its countdowns, bedtime and dimming, speakers, phone
finder, Home Assistant scripts, and the Echos themselves. For things Alexa does natively
(music, Alexa timers, lights Alexa owns) he hands Alexa the command through Home
Assistant, just after he finishes speaking.

- "Alexa, ask Jarvis what we're doing this weekend"
- "Alexa, ask Jarvis to put eggs and bread on the shopping list"
- "Alexa, ask Jarvis to add swimming for Malachi on Tuesday at five"
- "Alexa, ask Jarvis to play Radio 2 in the kitchen" (he passes it to Alexa)
- "Alexa, open Jarvis" for a back-and-forth. The mic stays open a few seconds after each
  answer, so a follow-up ("and Sunday?") needs no "Alexa".

**How it fits together.** Alexa's cloud → Cloudflare Tunnel → `api` container port
**3001**, which serves exactly one route (`POST /alexa`). Every request must carry Amazon's
signature for our skill ID or it's rejected, and nothing else on the Mini is published.
Claude reaches the dashboard in-process (`api/src/jarvis/`). Alexa only gives a skill 8
seconds; if Jarvis needs longer he says "Bear with me a moment" and the answer comes out of
the Jarvis Echo (`jarvis_target` in `settings`, defaulting to `briefing_target`) through
Home Assistant, in Alexa's normal voice.

**Test without Alexa** (any machine on the Wi-Fi), once the API key is in `.env`:

```bash
curl -X POST http://192.168.10.6/api/jarvis -H 'Content-Type: application/json' \
  -d '{"text":"what is on this weekend?"}'
```

### Setting it up

1. **Claude API key.** Create one at platform.claude.com and add
   `ANTHROPIC_API_KEY=...` to `.env` on the Mini.
2. **Cloudflare Tunnel.** In Cloudflare Zero Trust → Networks → Tunnels, create a tunnel
   (Docker), copy its token, and add a **public hostname** on a domain you own, e.g.
   `jarvis.example.co.uk`, pointing at service **`http://api:3001`**. In `.env` add
   `CLOUDFLARE_TUNNEL_TOKEN=...` and `COMPOSE_PROFILES=jarvis`.
3. **The skill.** At developer.amazon.com/alexa/console/ask → *Create Skill*: name
   "Jarvis", locale **English (UK)**, type **Custom**, hosting **Provision your own**,
   template **Start from scratch**. Then:
   - *Interaction Model → JSON Editor*: paste `alexa/interaction-model.json`, **Save**,
     **Build**.
   - *Endpoint*: HTTPS, `https://jarvis.example.co.uk/alexa`, certificate option
     *"My development endpoint is a sub-domain of a domain that has a wildcard
     certificate from a certificate authority"*. Save.
   - Copy the Skill ID (`amzn1.ask.skill....`) into `.env` as `ALEXA_SKILL_ID=...`.
4. **Deploy**: push to `main` (or `docker compose -p peeters up -d --build` on the Mini).
   The skill port only starts once `ALEXA_SKILL_ID` is set.
5. *Test* tab in the console → set testing to **Development**. The skill is then live on
   every Echo signed in to the same Amazon account. It's never published, so nobody
   else can use it.

If the console rejects the one-word invocation name "jarvis" (Amazon discourages them),
change `invocationName` to two words, e.g. "house jarvis", and say "ask house jarvis".

| `.env` | Default | |
| --- | --- | --- |
| `JARVIS_MODEL` | `claude-opus-5-5` | `claude-haiku-5-5` answers faster and costs much less, for simpler requests |
| `JARVIS_EFFORT` | `low` | How hard Claude thinks; higher is slower, and Alexa only waits 8 seconds |
| `JARVIS_VOICE` | `Brian` | Amazon Polly voice for skill replies; set it blank for Alexa's own voice |

## Local development

```bash
cd web && npm install && npm run dev   # :5199, proxies /api to the Mini
```
