FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --production=false

COPY tsconfig.json ./
COPY src/ ./src/
COPY scripts/ ./scripts/

RUN npx tsc

EXPOSE 3200

CMD ["node", "dist/server.js"]
