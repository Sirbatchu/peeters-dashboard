# Home Assistant config for the dashboard

HA's live config lives in the `ha_config` docker volume, not in git. These files
are the dashboard's additions, kept here so they can be re-applied.

| File | Goes to | Purpose |
| --- | --- | --- |
| `configuration.append.yaml` | appended to `/config/configuration.yaml` | emulated Hue bridge + `rest_command.peeters_bedtime` |
| `scripts.yaml` | `/config/scripts.yaml` | `script.bedtime` — what "Alexa, bedtime" runs |

Re-apply after a fresh HA volume:

```bash
docker exec -i peeters-homeassistant-1 sh -c 'cat >> /config/configuration.yaml' < configuration.append.yaml
docker exec -i peeters-homeassistant-1 sh -c 'cat > /config/scripts.yaml' < scripts.yaml
```

then restart HA. The Mini's firewall must let Docker reach the bridge:
`sudo ufw allow from 172.16.0.0/12 to any port 8300 proto tcp`.
