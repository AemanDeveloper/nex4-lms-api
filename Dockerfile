FROM node:24-alpine AS dependencies
WORKDIR /app
RUN npm install --global npm@11.9.0
COPY package*.json ./
COPY prisma ./prisma
# Resolve Linux-only optional packages inside the Linux image. The committed
# lockfile is produced on Windows and npm ci rejects those platform additions.
RUN npm install --include=dev --no-audit --no-fund
RUN npm run db:generate

FROM dependencies AS build
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
COPY --from=dependencies /app/node_modules ./node_modules
COPY prisma ./prisma
COPY scripts ./scripts
COPY --from=build /app/dist ./dist
USER node
EXPOSE 4000
CMD ["sh", "-c", "npm run db:learning-core:deploy && node dist/src/main.js"]
