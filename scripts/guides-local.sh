#!/bin/zsh
# Prepares the Shotgun guides on this Mac: Shotgun blocks GitHub's servers, but opens normally here.
# Sunday evening: Monday's "This week" (pt-midday). Thursday afternoon: "This weekend" (pt-night, 22:30).
# The post goes in the queue and GitHub publishes it at its time, with its own Instagram token.
# Run by ~/Library/LaunchAgents/pt.hardmag.guides.plist (template: scripts/pt.hardmag.guides.plist).
set -e
cd /Users/lukasgalhardo/HardMag
export PATH=/opt/homebrew/bin:/Users/lukasgalhardo/.local/bin:/usr/bin:/bin
echo "--- $(date -u +%FT%TZ)"
git pull -q --rebase --autostash
case $(date -u +%u) in
  7) day=$(date -u -v+1d +%F); slot=pt-midday ;;
  4) day=$(date -u +%F); slot=pt-night ;;
  *) echo "no guide to prepare today"; exit 0 ;;
esac
if python3 -c "import json,sys; q=json.load(open('state/queue.json')); sys.exit(0 if any(i['key']=='$day-$slot' and i['status']!='failed' for i in q) else 1)"; then
  echo "$day-$slot already queued"; exit 0
fi
GITHUB_TOKEN=$(gh auth token) MEDIA_REPO=lukas0512/hardmag IG_ACCESS_TOKEN= IG_USER_ID= node src/run.ts --slot $slot --prepare $day
for f in state/queue.json state/state.json state/articles.json reports/fila.md state/shotgun-handles.json state/handles-pending.json state/photos.json; do [ -e "$f" ] && git add "$f"; done
git commit -q -m "queue: $day-$slot (prepared on the Mac)" || true
git pull -q --rebase --autostash && git push -q
echo "done: $day-$slot"
