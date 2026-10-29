# The self-host as an image: the record server and the app it serves, from the workspace at the repository root.
#
#   docker build -f apps/selfhost/Dockerfile -t braindog .
#   docker run -d -v braindog:/data -p 8080:8080 --env-file .env braindog
#
# Or `docker compose up -d` at the repository root. With BRAINDOG_OWNER in the env file, the first start makes the record.
#
# NOTHING THAT OPENS THE RECORD IS IN THE IMAGE OR ITS BUILD ARGUMENTS: no server key, no key file, and no address to
# listen on. Without a server key the server treats every request as the owner's, so it binds 127.0.0.1 and nothing
# outside the container can reach it; the health check below asks from inside and still passes. The operator makes it
# reachable with the env file, which names the key and the address, a decision made where the
# record lives and not baked into a layer anybody can pull. The key file is made
# by `init` inside the volume.

# The major version is the root package.json's `engines`, and the exact one is `.node-version`.
FROM node:24-bookworm-slim

# pnpm comes from the root `packageManager` pin through corepack, so the image installs with the version the lockfile
# was written by and nobody chooses a second one here.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=true
RUN corepack enable

WORKDIR /app

# THE WHOLE WORKSPACE, INSTALLED AS IT IS IN CI, and never `pnpm deploy`: the self-host imports the workspace packages
# as TypeScript source through their `exports`, so the tree is what runs.
COPY . .
RUN pnpm install --frozen-lockfile

# The app the server hands out, at `apps/web/build`, where `main.ts` looks for it.
RUN pnpm --filter @braindog/web build

# THE RECORD LIVES IN THE VOLUME, owned by the user the server runs as, so a copy, a key file and the Directory can all
# be written there and nowhere else.
RUN mkdir -p /data && chown node:node /data
ENV NODE_ENV=production PORT=8080 BRAINDOG_DATA=/data
USER node
VOLUME /data
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

CMD ["node", "apps/selfhost/src/main.ts", "serve"]
