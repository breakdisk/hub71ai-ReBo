FROM rust:1-bookworm AS builder

WORKDIR /app

COPY backend/Cargo.toml backend/Cargo.lock ./
COPY backend/src ./src

RUN cargo build --locked --release

FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends wget \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/relocation-engine-backend /usr/local/bin/relocation-engine-backend

USER 10001:10001

ENV APP_ENV=local-demo
ENV ONBOARD_ENGINE_BIND=127.0.0.1:8080

EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/relocation-engine-backend"]
