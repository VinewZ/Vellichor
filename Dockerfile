# ---- build ----
FROM oven/bun:1-slim AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# ---- runtime ----
FROM oven/bun:1-slim AS runtime
RUN apt-get update \
	&& apt-get install -y --no-install-recommends ffmpeg \
	&& rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public

ENV NODE_ENV=production \
	DATA_DIR=/data \
	PORT=3000 \
	HOST=0.0.0.0

VOLUME /data
EXPOSE 3000
CMD ["bun", "dist/server/server.js"]
