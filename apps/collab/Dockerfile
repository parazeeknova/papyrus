# syntax=docker/dockerfile:1.7

ARG BUILDER_IMAGE="hexpm/elixir:1.19-erlang-28.2-ubuntu-jammy-20251013"
ARG RUNNER_IMAGE="debian:bookworm-20250113-slim"

FROM ${BUILDER_IMAGE} AS builder

RUN apt-get update -y && \
    apt-get install -y --no-install-recommends build-essential git ca-certificates && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV MIX_ENV=prod

RUN mix local.hex --force && mix local.rebar --force

COPY mix.exs mix.lock ./
COPY config ./config

RUN mix deps.get --only ${MIX_ENV}
RUN mix deps.compile

COPY lib ./lib
COPY priv ./priv

RUN mix compile
RUN mix phx.digest

COPY config/runtime.exs ./config/

RUN mix release

FROM ${RUNNER_IMAGE} AS runner

RUN apt-get update -y && \
    apt-get install -y --no-install-recommends \
      libstdc++6 \
      openssl \
      libncurses6 \
      locales \
      ca-certificates \
      curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen && locale-gen

ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8
ENV PORT=4000
ENV MIX_ENV=prod
ENV PHX_SERVER=true

WORKDIR /app

RUN chown nobody /app

COPY --from=builder --chown=nobody:root /app/_build/${MIX_ENV}/rel/papyrus_collab ./

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-4000}/api/health" || exit 1

USER nobody

EXPOSE 4000

CMD ["/app/bin/papyrus_collab", "start"]
