# --- Stage 1: Build ---
FROM node:20-alpine AS builder
WORKDIR /app

# Copy dependency configs
COPY package*.json nx.json tsconfig.base.json ./
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Build Nx projects
RUN npx nx build backend --configuration=production
RUN npx nx build frontend --configuration=production

# --- Stage 2: Backend Production Runner ---
FROM node:20-alpine AS backend-runner
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --only=production --legacy-peer-deps

COPY --from=builder /app/dist/backend ./dist/backend

EXPOSE 3000
CMD ["node", "dist/backend/main.js"]

# --- Stage 3: Frontend Web Server (Nginx) ---
FROM nginx:alpine AS frontend-runner
COPY --from=builder /app/dist/apps/frontend/browser /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
