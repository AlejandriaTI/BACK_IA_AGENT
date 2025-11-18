# Stage 1: Build
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Stage 2: Production
FROM node:20-slim AS production

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production

COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/main.js"]
