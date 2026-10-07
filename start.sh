#!/usr/bin/env bash
# Launch the finance dashboard in a tmux session with two windows:
#   - backend:  FastAPI (uvicorn) on 127.0.0.1:8787  (localhost only)
#   - frontend: Next.js dev server on 0.0.0.0:3000    (reachable on the LAN)
#
# The frontend proxies /api/* to the backend, so only the frontend needs to be
# exposed. Ollama (qwen3) is expected to be running separately on :11434.
#
# Usage:
#   ./start.sh                 create/replace the 'finance' session (detached)
#   tmux attach -t finance     watch the logs (Ctrl-b then d to detach)
#   tmux kill-session -t finance   stop both servers
set -euo pipefail

SESSION=finance
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Free the ports if something is already bound (ignore if nothing is).
fuser -k 8787/tcp 2>/dev/null || true
fuser -k 3000/tcp 2>/dev/null || true

# Start from a clean session.
tmux kill-session -t "$SESSION" 2>/dev/null || true

# Window 1 — backend (FastAPI + scheduler).
tmux new-session -d -s "$SESSION" -n backend -c "$ROOT/backend"
tmux send-keys -t "$SESSION:backend" \
  '.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8787' C-m

# Window 2 — frontend (Next.js dev server, bound to all interfaces for LAN).
tmux new-window -t "$SESSION" -n frontend -c "$ROOT/frontend"
tmux send-keys -t "$SESSION:frontend" \
  'BACKEND_ORIGIN=http://127.0.0.1:8787 npm run dev -- -H 0.0.0.0 -p 3000' C-m

echo "Started tmux session '$SESSION'."
echo "  backend : http://127.0.0.1:8787   (API, localhost only)"
echo "  frontend: http://$(hostname -I 2>/dev/null | awk '{print $1}'):3000  (open this in your browser)"
echo
echo "Watch logs:  tmux attach -t $SESSION     (Ctrl-b then d to detach)"
echo "Stop all:    tmux kill-session -t $SESSION"
