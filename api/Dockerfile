# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM rust:1.88-slim-bookworm AS builder

WORKDIR /app

# Instalar dependências de sistema necessárias para compilação
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copiar manifests e fazer cache das dependências (camada separada)
# Isso evita recompilar todas as deps a cada mudança de código
COPY api/Cargo.toml api/Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -f target/release/deps/api* target/release/deps/cachesnap*

# Copiar migrations para o path esperado pelo sqlx::migrate!("../migrations")
COPY migrations /migrations

# Copiar código fonte e cache sqlx offline, compilar binary final
COPY api/src ./src
COPY api/.sqlx ./.sqlx
ENV SQLX_OFFLINE=true
RUN cargo build --release

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Usuário não-root para segurança
RUN groupadd -r cachesnap && useradd -r -g cachesnap cachesnap

COPY --from=builder /app/target/release/api /usr/local/bin/api

USER cachesnap
EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

CMD ["api"]
