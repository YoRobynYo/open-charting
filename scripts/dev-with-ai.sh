#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f .env ]]; then
  cp .env.example .env
  chmod 600 .env
fi

if ! grep -Eq '^OPENAI_API_KEY=.*[[:alnum:]]' .env; then
  printf 'To enable AI chat, paste your provider API key (input hidden). Press Return to run the chart without AI: '
  read -r -s OPENAI_API_KEY_INPUT || true
  printf '\n'
  if [[ -n "${OPENAI_API_KEY_INPUT:-}" ]]; then
    OPENAI_API_KEY_INPUT="$OPENAI_API_KEY_INPUT" node scripts/save-local-ai-config.mjs
  else
    printf 'Starting the chart without AI chat. HH/HL structure labels will still work.\n'
  fi
  unset OPENAI_API_KEY_INPUT
fi

AI_PID=""
VITE_PID=""
cleanup() {
  trap - INT TERM EXIT
  if [[ -n "$AI_PID" ]]; then kill "$AI_PID" 2>/dev/null || true; fi
  if [[ -n "$VITE_PID" ]]; then kill "$VITE_PID" 2>/dev/null || true; fi
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

if grep -Eq '^OPENAI_API_KEY=.*[[:alnum:]]' .env; then
  printf 'Starting the local AI service on port 8787…\n'
  AI_LOCAL_DEV=true PORT=8787 node --env-file=.env server/ai-service.mjs &
  AI_PID=$!
fi

printf 'Starting open-charting. Use the Vite URL shown below; press Ctrl+C to stop both services.\n'
node ./node_modules/vite/bin/vite.js &
VITE_PID=$!
wait "$VITE_PID"
