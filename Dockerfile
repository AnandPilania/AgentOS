FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ─── Production image ─────────────────────────────────────
FROM node:20-alpine AS runner

RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    openssh

WORKDIR /app

# Copy only what's needed
COPY --from=builder /app/dist          ./dist
COPY --from=builder /app/node_modules  ./node_modules
COPY --from=builder /app/package.json  ./package.json

ENV NODE_ENV=production
ENV AGENTOS_SERVER_MODE=1
ENV PORT=3000

EXPOSE 3000

# In server mode, AgentOS runs as a headless API + web UI
CMD ["node", "dist/main/server.js"]
