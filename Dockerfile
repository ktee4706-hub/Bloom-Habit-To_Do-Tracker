FROM node:22-alpine

WORKDIR /app

# Copy application files (Node 22+ includes built-in node:sqlite, zero external npm dependencies)
COPY package.json server.js db.js ./
COPY public ./public

# Ensure data directory exists for SQLite
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000
ENV SQLITE_PATH=/app/data/app.db

EXPOSE 3000

CMD ["node", "server.js"]
