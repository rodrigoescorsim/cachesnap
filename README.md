# CacheSnap

CacheSnap is an edge performance monitoring product focused on cache behavior, latency, and plain-English diagnosis across multiple regions.

## Stack

- Next.js 16 App Router + React 19 + Tailwind CSS 4
- Rust API with `axum`
- PostgreSQL / TimescaleDB + Redis
- AWS Lambda (Node.js 20, arm64) for global probes — 8 regions

## Project layout

- `src/` — dashboard, auth, and Next.js API routes
- `api/` — Rust ingest API, scheduler, baseline, and alerts
- `probes/lambda/` — AWS Lambda probe (Node.js 20, zero dependencies)
- `workers/probe/` — legacy Cloudflare Worker probe (deprecated, kept for reference)
- `migrations/` — database schema and follow-up migrations
- `docs/` — product, stack, worker, and status documentation
- `docs/FEATURES.md` — full product feature catalog (alerts, capabilities, differentiators)

## Running locally

Prerequisites:

- Node.js 20+
- Rust toolchain
- Docker Desktop

Start the local stack:

```bash
./scripts/dev.sh
```

Run the Rust API:

```bash
cd api
cargo watch -x run
```

Run the Next.js app:

```bash
npm run dev
```

Endpoints:

- Dashboard: `http://localhost:3000`
- Rust API: `http://localhost:3001`
- Healthcheck: `http://localhost:3001/health`

## Validation

Frontend / app:

```bash
npm run lint
npm run test
npm run build
```

Rust API:

```bash
cd api
cargo test
```

Worker:

```bash
cd workers/probe
npm test
```

## Notes

- The app no longer depends on remote Google Fonts during build, which keeps `next build` working in restricted/offline environments.
- Next.js behavior in this repo may differ from older versions. When changing framework-level behavior, check the local docs in `node_modules/next/dist/docs/`.
- Current project status and next milestones live in `docs/STATUS.md`.
- Probes now run on AWS Lambda (8 regions). See `probes/lambda/README.md` for deployment instructions.
- The legacy Cloudflare Worker probe code in `workers/probe/` is kept for reference but is no longer in active use.
