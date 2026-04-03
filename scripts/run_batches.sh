#!/usr/bin/env bash
# run_batches.sh — Run the rebuild pipeline in sequential batches until all
# remaining podcasts are processed.
#
# Limit is set to 500 SQLite candidates per run (~10% Phase 3b pass rate →
# ~50 guest-friendly per batch). Keeping allFeeds small prevents V8 heap
# from accumulating processed feed objects across multiple inner batches.
# run_batches.sh handles the ~250 sequential runs needed automatically.
#
# Usage: ./scripts/run_batches.sh
# Output: logs/run_batches.log (timestamped, streamed live)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$ROOT_DIR/logs"
LOG_FILE="$LOG_DIR/run_batches.log"

PIPELINE="$SCRIPT_DIR/rebuild_database.js"
BATCH_LIMIT=500
SLEEP_BETWEEN=5

mkdir -p "$LOG_DIR"

ts()  { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "[$(ts)] $*" | tee -a "$LOG_FILE"; }

log "════════════════════════════════════════════════════════════════"
log "  run_batches.sh started — limit=${BATCH_LIMIT} per batch"
log "════════════════════════════════════════════════════════════════"

batch=1

while true; do
  log ""
  log "── Batch ${batch} starting ──────────────────────────────────────"

  # Temp file captures output for stop-condition check.
  # Pipeline: node → tee to tmp (passthrough) → tee appending to log + stdout.
  tmp=$(mktemp)

  node --max-old-space-size=4096 --expose-gc "$PIPELINE" \
    --limit=$BATCH_LIMIT \
    --random \
    --confirm \
    2>&1 \
    | tee "$tmp" \
    | tee -a "$LOG_FILE"

  node_exit=${PIPESTATUS[0]}

  # Stop condition: pipeline found nothing new to process
  if grep -q "No new feeds to process" "$tmp"; then
    rm -f "$tmp"
    log ""
    log "No new feeds to process — all podcasts are in Firestore. Done."
    break
  fi

  rm -f "$tmp"

  # Stop on unexpected pipeline failure
  if [ "$node_exit" -ne 0 ]; then
    log ""
    log "Pipeline exited with code ${node_exit} — stopping. Check log for details."
    exit "$node_exit"
  fi

  log "── Batch ${batch} complete ──────────────────────────────────────"
  batch=$((batch + 1))

  log "Waiting ${SLEEP_BETWEEN}s for OS memory recovery..."
  sleep "$SLEEP_BETWEEN"
done

log ""
log "════════════════════════════════════════════════════════════════"
log "  run_batches.sh finished — ${batch} batch(es) run"
log "════════════════════════════════════════════════════════════════"
