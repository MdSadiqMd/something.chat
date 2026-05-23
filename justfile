set dotenv-load

# Ensures @something-chat/sdk is linked as a workspace dep, then starts Vite.
dev-web:
    bash scripts/run-web.sh

# Run API locally (outside Docker) — useful when iterating on Python code.
dev-api:
    cd apps/api && uv run uvicorn app.main:app --reload --port 8000

# Run worker locally (outside Docker).
dev-worker:
    cd workers/ingest && uv run python -m watchfiles "python -m app.main" app

build-sdk:
    pnpm --filter @something-chat/sdk build

build-web:
    pnpm --filter web build

build: build-sdk build-web

test-sdk:
    pnpm --filter @something-chat/sdk test

test-web:
    pnpm --filter web exec vitest run

test-api:
    cd apps/api && uv run pytest tests/ -v

test-worker:
    cd workers/ingest && uv run pytest tests/ -v

# Run all non-frontend tests (SDK + Web unit + API + Worker)
test:
    @echo "── SDK ──────────────────────────────────────────────────"
    just test-sdk
    @echo "── Web (unit) ───────────────────────────────────────────"
    just test-web
    @echo "── API ──────────────────────────────────────────────────"
    just test-api
    @echo "── Worker ───────────────────────────────────────────────"
    just test-worker
    @echo "✓ All tests passed"

migrate:
    cd apps/api && uv run alembic upgrade head

migrate-down:
    cd apps/api && uv run alembic downgrade -1

# Bind mounts keep api/app and worker/app in sync — no rebuild needed for
# Python edits. Use --build only when pyproject.toml or Dockerfile changes.
up:
    docker compose -f infra/docker-compose.yml up -d

# Full rebuild + restart (use after adding/removing Python packages).
rebuild:
    docker compose -f infra/docker-compose.yml up -d --build

down:
    docker compose -f infra/docker-compose.yml down

logs service="":
    docker compose -f infra/docker-compose.yml logs -f {{ service }}

# Restart a single service (e.g. just restart api).
restart service:
    docker compose -f infra/docker-compose.yml restart {{ service }}

format-web:
    pnpm --filter web format

setup:
    pnpm install
    just rebuild
    sleep 8
    just migrate
    @echo ""
    @echo "✓ Infra ready (postgres · redis · api · worker in Docker)."
    @echo "  Start the web dev server:"
    @echo "    just dev-web"

# Starts infra (no rebuild), then launches web dev server in the foreground.
run:
    just up
    just dev-web
