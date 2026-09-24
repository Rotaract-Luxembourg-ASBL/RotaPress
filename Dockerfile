FROM node:24.21.0-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY scripts/pnpm.mjs scripts/local_common.mjs ./scripts/
RUN node scripts/pnpm.mjs install --frozen-lockfile
COPY . .
# Build-time placeholders only. Deployment secrets are supplied at runtime.
RUN DATABASE_URL=postgresql://rotapress_app:unused@127.0.0.1/rotapress \
    BETTER_AUTH_SECRET=build-only-placeholder-not-used-at-runtime \
    APP_URL=http://127.0.0.1:3000 EMAIL_PROVIDER=disabled \
    node scripts/pnpm.mjs build

FROM node:24.21.0-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 ROTAPRESS_DEPLOYMENT=hosted
RUN groupadd --gid 10001 rotapress && useradd --uid 10001 --gid 10001 --no-create-home rotapress
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/src ./src
COPY --from=build /app/db ./db
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/package.json /app/tsconfig.json /app/next.config.ts ./
EXPOSE 3000
# The root supervisor bootstraps, then runs web/jobs with UID 10001 and a
# restricted environment. Only /app/.data is persistent application storage.
CMD ["node", "--conditions=react-server", "--import", "tsx", "scripts/hosting/start.mjs"]
