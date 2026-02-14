#!/bin/bash
# Start FastAPI backend on port 8000 in background
uvicorn backend.main:app --host 0.0.0.0 --port 8000 &
FASTAPI_PID=$!

# Wait for FastAPI to be ready
echo "Waiting for FastAPI to start..."
for i in {1..30}; do
  if curl -s http://127.0.0.1:8000/api/health > /dev/null 2>&1; then
    echo "FastAPI is ready on port 8000"
    break
  fi
  sleep 0.5
done

# Start Express+Vite dev server on port 5000 (proxies /api to FastAPI)
NODE_ENV=development npx tsx server/index.ts &
EXPRESS_PID=$!

# Handle cleanup
cleanup() {
  echo "Shutting down..."
  kill $FASTAPI_PID $EXPRESS_PID 2>/dev/null
  exit 0
}
trap cleanup SIGINT SIGTERM

# Wait for either to exit
wait -n
cleanup
