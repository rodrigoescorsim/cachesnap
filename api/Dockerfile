# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM rust:1.77-slim-bookworm AS builder

WORKDIR /app

# Instalar dependências de sistema necessárias para compilação
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copiar manifests e fazer cache das dependências (camada separada)
# Isso evita recompilar todas as deps a cada mudança de código
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -f target/release/deps/api* target/release/deps/cachesnap*

# Copiar código fonte e compilar binary final
COPY src ./src
RUN cargo build --release

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Usuário não-root para segurança
RUN groupadd -r cachesnap && useradd -r -g cachesnap cachesnap

COPY --from=builder /app/target/release/api /usr/local/bin/api

USER cachesnap
EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

CMD ["api"]
