# Home Assistant config for the dashboard

HA's live config lives in the `ha_config` docker volume, not in git. These files
are the dashboard's additions, kept here so they can be re-applied.

| File | Goes to | Purpose |
| --- | --- | --- |
| `configuration.append.yaml` | appended to `/config/configuration.yaml` | emulated Hue bridge + `rest_command.peeters_bedtime` |
| `scripts.yaml` | `/config/scripts.yaml` | `script.bedtime` — what "Alexa, bedtime" runs; the kids' countdown scripts |
| `apply.sh` | run on the Mini | applies both, checks the config, restarts HA |

Apply (first time, after a fresh HA volume, or after changing these files):

```bash
cd ~/peeters-dashboard/homeassistant && sh apply.sh
```

It backs up both files, replaces the Peeters block in `configuration.yaml` (between the
`# ── Peeters dashboard` and `# ── end Peeters dashboard` markers — so it's safe to re-run),
overwrites `scripts.yaml`, and restores the backups without restarting if HA's config
check fails. Then "Alexa, discover devices" to pick up new devices. The Mini's firewall must let Docker reach the bridge:
`sudo ufw allow from 172.16.0.0/12 to any port 8300 proto tcp`.
