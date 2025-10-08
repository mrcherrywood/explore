# Wren AI Integration Guide

## Environment Variables
- WREN_AI_ENABLED=true # toggles Wren AI path in /api/chat
- WREN_AI_BASE_URL=http://localhost:5556 # default service URL
- WREN_AI_API_KEY= # optional bearer token

## Service Setup
- Install prerequisites (Python 3.12, Poetry 1.8.3, Just)
- From WrenAI repo, run:
  - poetry install
  - just init
  - configure .env.dev + config.yaml
  - just up
  - just start
- API available at http://localhost:5556

## Chat Flow
- When flag enabled, /api/chat uses Wren AI to generate SQL
- Generated SQL executes via Supabase exec_raw_sql
- Response includes reasoning + markdown table + SQL block

## Testing Notes
- Ensure Supabase RPC exec_raw_sql configured
- Mock Wren endpoints for unit tests
- Restart Next.js dev server after env changes
