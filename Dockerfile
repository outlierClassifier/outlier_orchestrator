FROM ubuntu:22.04 AS base

ARG DEBIAN_FRONTEND=noninteractive
ARG PYTHON_VERSION=3.11
ARG NODE_MAJOR=20

RUN apt-get update -y && \
    apt-get install -y --no-install-recommends \
      curl ca-certificates build-essential git jq \
      python${PYTHON_VERSION} python${PYTHON_VERSION}-dev python${PYTHON_VERSION}-venv \
      && rm -rf /var/lib/apt/lists/*

RUN curl https://sh.rustup.rs -sSf | bash -s -- -y --no-modify-path && \
    /root/.cargo/bin/rustup component add clippy rustfmt

ENV PATH="/root/.cargo/bin:${PATH}"

RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    npm install -g pnpm && \
    node --version && npm --version && pnpm --version

ARG UID=1000
RUN useradd -m -u ${UID} runner
USER runner
WORKDIR /workspace

COPY --from=dataset_reduced    /   /opt/dataset/
ENV DATASET_DIR=/opt/dataset

CMD ["bash"]
