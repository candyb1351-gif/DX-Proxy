#!/bin/bash
set -e
source /opt/lib/common.sh

init_defaults
regen_config

echo "[entrypoint] starting mtg-multi on :${MT_PORT}"
mtg-multi run "$MTG_CONFIG" >> "$DATA_DIR/mtg.log" 2>&1 &
MTG_PID=$!

echo "[entrypoint] starting panel on :${PANEL_PORT}"
DATA_DIR="$DATA_DIR" PANEL_PORT="$PANEL_PORT" STATS_PORT="$STATS_PORT" \
  node /opt/panel/server.js >> "$DATA_DIR/panel.log" 2>&1 &
PANEL_PID=$!

# ---- watchdog: restart mtg-multi whenever dx sets the reload flag ----
(
  while true; do
    if [ -f "$RELOAD_FLAG" ]; then
      echo "[watchdog] reload flag detected, restarting mtg-multi"
      rm -f "$RELOAD_FLAG"
      if kill -0 "$MTG_PID" 2>/dev/null; then
        kill "$MTG_PID" 2>/dev/null || true
        wait "$MTG_PID" 2>/dev/null || true
      fi
      mtg-multi run "$MTG_CONFIG" >> "$DATA_DIR/mtg.log" 2>&1 &
      MTG_PID=$!
    fi
    # also restart panel if it died
    if ! kill -0 "$PANEL_PID" 2>/dev/null; then
      echo "[watchdog] panel died, restarting"
      DATA_DIR="$DATA_DIR" PANEL_PORT="$PANEL_PORT" STATS_PORT="$STATS_PORT" \
        node /opt/panel/server.js >> "$DATA_DIR/panel.log" 2>&1 &
      PANEL_PID=$!
    fi
    sleep 2
  done
) &

wait
