FROM oven/bun:1.4-alpine

WORKDIR /app

# install dependencies against the lockfile
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# copy the rest of the source
COPY . .

ENV NODE_ENV=production
EXPOSE 3000

# sync the schema to postgres, then start the server
CMD ["sh", "-c", "bun run db:push && bun run src/index.ts"]
