FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && mkdir -p dist/db && cp src/db/*.json dist/db/ 2>/dev/null || true

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY public ./public
COPY VERSION ./VERSION
COPY VERSION_CODE ./VERSION_CODE
EXPOSE 3000
CMD ["node", "dist/index.js"]
