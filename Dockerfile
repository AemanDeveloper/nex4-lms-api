FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
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
COPY --from=build /app/dist ./dist
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
