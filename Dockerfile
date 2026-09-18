FROM node:24-bookworm-slim AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.9.0 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

ARG NUXT_PUBLIC_APP_NAME=ResumAI
ARG NUXT_PUBLIC_SUPABASE_URL
ARG NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

ENV NUXT_PUBLIC_APP_NAME=${NUXT_PUBLIC_APP_NAME}
ENV NUXT_PUBLIC_SUPABASE_URL=${NUXT_PUBLIC_SUPABASE_URL}
ENV NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${NUXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}

RUN pnpm exec nuxt prepare && pnpm build

FROM node:24-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY --from=build --chown=node:node /app/.output ./.output

USER node

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
