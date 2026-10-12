#!/bin/sh
# Apply the dashboard's Home Assistant additions to the live HA container.
# Safe to re-run: the Peeters block in configuration.yaml is replaced, not
# appended twice, and scripts.yaml is overwritten. Backs both up first,
# checks the config, then restarts HA.
#
#   cd ~/peeters-dashboard/homeassistant && sh apply.sh
set -e
C=${HA_CONTAINER:-peeters-homeassistant-1}
HERE=$(cd "$(dirname "$0")" && pwd)
STAMP=$(date +%Y%m%d-%H%M%S)

docker exec "$C" cp /config/configuration.yaml "/config/configuration.yaml.bak-$STAMP"
docker exec "$C" sh -c "[ -f /config/scripts.yaml ] && cp /config/scripts.yaml /config/scripts.yaml.bak-$STAMP || true"

docker cp "$HERE/configuration.append.yaml" "$C:/tmp/peeters-block.yaml"
docker exec "$C" python3 - <<'PY'
start = '# ── Peeters dashboard: voice control'
end_marker = '# ── end Peeters dashboard'
# Blocks applied before the end marker existed finish on the bedtime payload.
old_end = """payload: '{"source":"alexa"}'"""
path = '/config/configuration.yaml'
lines = open(path).read().split('\n')
block = open('/tmp/peeters-block.yaml').read().strip('\n').split('\n')
s = next((i for i, l in enumerate(lines) if l.startswith(start)), None)
if s is None:
    out = lines + [''] + block
else:
    e = next((i for i in range(s, len(lines)) if lines[i].startswith(end_marker)), None)
    if e is None:
        e = next(i for i in range(s, len(lines)) if lines[i].strip() == old_end)
    out = lines[:s] + block + lines[e + 1:]
open(path, 'w').write('\n'.join(out).rstrip('\n') + '\n')
print('configuration.yaml updated')
PY
docker cp "$HERE/scripts.yaml" "$C:/config/scripts.yaml"

echo "Checking config..."
if ! docker exec "$C" python3 -m homeassistant --script check_config -c /config; then
  echo "Config check failed - restoring backups, HA not restarted."
  docker exec "$C" cp "/config/configuration.yaml.bak-$STAMP" /config/configuration.yaml
  docker exec "$C" sh -c "[ -f /config/scripts.yaml.bak-$STAMP ] && cp /config/scripts.yaml.bak-$STAMP /config/scripts.yaml || true"
  exit 1
fi
docker restart "$C" >/dev/null
echo "Done - HA restarting. Then: Alexa app -> Devices -> + -> Add device -> Philips Hue (or 'Alexa, discover devices')."
