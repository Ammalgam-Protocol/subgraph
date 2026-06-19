FROM node:24.3.0-slim

# psql is needed for dumping and restoring the initial effects cache.
# ca-certificates: the -slim base ships no CA bundle, so the native hypersync-client
# Rust addon fails TLS to *.hypersync.xyz with "UnknownIssuer" (Node bundles its own, this addon doesn't).
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates postgresql-client && \
    rm -rf /var/lib/apt/lists/*

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm@10.32.1

WORKDIR /envio-indexer

COPY ./package.json ./package.json
COPY ./pnpm-lock.yaml ./pnpm-lock.yaml

RUN pnpm install --frozen-lockfile

COPY ./config.yaml ./config.yaml
COPY ./schema.graphql ./schema.graphql

RUN pnpm envio codegen

COPY ./ ./

CMD pnpm envio start
