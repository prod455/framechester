# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:22.23.4-bookworm-slim
ARG RUST_IMAGE=rust:1.99.1-slim-bookworm

FROM ${RUST_IMAGE} AS engine-build
WORKDIR /build
COPY Cargo.toml Cargo.lock ./
COPY crates/ ./crates/
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    cargo build --locked --release -p framechester-cli

FROM ${NODE_IMAGE} AS web-build
WORKDIR /build/web
COPY web/package.json web/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY web/ ./
RUN npm run build
# Bundle the server into the same relative location as its TS entry point.
# This retains import.meta.url paths and leaves build tools out of the runtime.
RUN node --input-type=module -e 'import {build} from "esbuild"; await build({entryPoints:["server/index.ts"],outfile:"runtime/server/index.mjs",bundle:true,platform:"node",format:"esm",target:"node22",sourcemap:false});'

FROM ${NODE_IMAGE} AS runtime
LABEL org.opencontainers.image.title="Framechester Studio" \
      org.opencontainers.image.description="Local single-operator media production Studio and Rust engine" \
      org.opencontainers.image.licenses="Apache-2.0 AND GPL-3.0-or-later"
ENV NODE_ENV=production \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/piper/bin:${PATH}" \
    FRAMECHESTER_CONTAINER=1 \
    FRAMECHESTER_WEB_PORT=4317 \
    FRAMECHESTER_WEB_HOME=/data/studio \
    FRAMECHESTER_PRIVATE_ROOT=/data/private \
    FRAMECHESTER_ENGINE_BINARY=/usr/local/bin/framechester \
    FRAMECHESTER_VAULT_KEY_FILE=/run/secrets/vault_key
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates ffmpeg fonts-dejavu-core python3 python3-venv libgomp1 \
    && rm -rf /var/lib/apt/lists/*
COPY docker/piper-requirements.txt /tmp/piper-requirements.txt
RUN python3 -m venv /opt/piper \
    && /opt/piper/bin/pip install --no-cache-dir --only-binary=:all: --require-hashes -r /tmp/piper-requirements.txt \
    && rm /tmp/piper-requirements.txt \
    && mkdir -p /data/private /data/studio /models /usr/share/framechester/licenses \
    && chown -R 1000:1000 /data \
    && chmod 700 /data /data/private /data/studio \
    && /opt/piper/bin/pip freeze > /usr/share/framechester/licenses/python-packages.txt \
    && dpkg-query -W > /usr/share/framechester/licenses/debian-packages.txt
WORKDIR /app
COPY --from=engine-build /build/target/release/framechester /usr/local/bin/framechester
COPY --from=web-build /build/web/dist/ ./web/dist/
COPY --from=web-build /build/web/runtime/server/ ./web/server/
COPY LICENSE THIRD_PARTY_NOTICES.md docker/THIRD_PARTY.md /usr/share/framechester/licenses/
COPY docker/healthcheck.mjs ./docker/healthcheck.mjs
USER 1000:1000
EXPOSE 4317
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=4 \
    CMD ["node", "/app/docker/healthcheck.mjs"]
CMD ["node", "/app/web/server/index.mjs"]
