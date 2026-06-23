# Tovaitech company site — small Node/Express server that renders the static
# pages and exposes a password-protected admin to edit content at runtime.
# Build context is the project root (see docker-compose.yml).
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data

# Install deps first for layer caching
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install --omit=dev

# App + content (defaults bundled in the image; runtime store lives on /data volume)
COPY server ./server
COPY public ./public
COPY data ./data

RUN mkdir -p /data
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=4s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:8080/healthz || exit 1

CMD ["node", "server/server.js"]
