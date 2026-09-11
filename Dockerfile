# ---- build ----
FROM oven/bun:1-slim AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# ---- runtime ----
FROM node:22-slim AS runtime
RUN apt-get update \
	&& apt-get install -y --no-install-recommends ffmpeg \
	&& rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/.output ./.output
COPY --from=build /app/package.json ./package.json

ENV NODE_ENV=production \
	VELLICHOR_DATA_DIR=/data \
	PORT=5257 \
	HOST=0.0.0.0

VOLUME /data
EXPOSE 5257
CMD ["node", ".output/server/index.mjs"]
