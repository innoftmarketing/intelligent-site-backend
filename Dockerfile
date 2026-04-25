FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --production=false

COPY tsconfig.json ./
COPY src/ ./src/
COPY scripts/ ./scripts/

RUN npx tsc

# Pre-configured defaults (override in Coolify env vars)
ENV DATABASE_URL=postgresql://paperclip:paperclip@db-lvqfh3pwp2pqs6qnhrvdm6ct:5432/intelligent_site
ENV EVOLUTION_API_URL=https://whatsapp.innoft.link
ENV EVOLUTION_API_KEY=R5C5HFERG3pQ4PLTfaNMus2KH3StBjhE
ENV EVOLUTION_INSTANCE=intelligent-site
ENV WEBHOOK_SECRET=b7c53acd67a5c2f62601449914675fc2571abc863eec1e46
ENV MASTER_ENCRYPTION_KEY=056cdd5c1985151be72bc50cd10f735861db6e0404a63a40710158a2882c4e6d
ENV PORT=3200

# These MUST be set in Coolify environment variables
ENV ANTHROPIC_API_KEY=placeholder
ENV ELEVENLABS_API_KEY=placeholder
ENV GEMINI_API_KEY=placeholder
ENV SMART_CRM_TRIGGER_KEY=placeholder

EXPOSE 3200

CMD ["node", "dist/server.js"]
