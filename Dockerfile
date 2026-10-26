# METAL public online demo: a read-only build (METAL_PUBLIC_DEMO=1) with
# approved sample data baked in. Build it from a staging folder made by
# scripts/public-demo/stage.sh, which adds demo-data/ next to this file.
# The local app doesn't use this file.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    METAL_PUBLIC_DEMO=1 \
    METAL_DATA_DIR=/app/data
# Search-time models (checksummed), then the demo build. No worker, FFmpeg or Whisper:
# nothing is processed online.
RUN test -f demo-data/metal.db || (echo "demo-data/ missing: build from scripts/public-demo/stage.sh" >&2; exit 1) \
  && bash scripts/public-demo/fetch-models.sh models \
  && npm run build \
  && rm -rf data && mv demo-data data \
  && chown -R node:node /app/data

USER node
EXPOSE 3000
CMD ["sh", "-c", "exec node_modules/.bin/next start -H 0.0.0.0 -p ${PORT:-3000}"]
