FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/src/db/schema.sql ./dist/db/schema.sql
RUN npm install --production
EXPOSE 3000
CMD ["node", "dist/index.js"]
