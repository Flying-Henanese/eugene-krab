FROM docker.m.daocloud.io/oven/bun:1-debian

WORKDIR /app


# 更换 Debian APT 源（中科大）
RUN sed -i 's|deb.debian.org|mirrors.ustc.edu.cn|g' /etc/apt/sources.list.d/debian.sources \
 && sed -i 's|security.debian.org|mirrors.ustc.edu.cn/debian-security|g' /etc/apt/sources.list.d/debian.sources

RUN apt-get update -o Acquire::Retries=5 \
  && apt-get install -y --no-install-recommends -o Acquire::Retries=5 \
    ca-certificates \
    curl \
    git \
    python3 \
    make \
    g++ \
    build-essential \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnss3 \
    libpango-1.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libxkbcommon0 \
    xauth \
    xvfb \
  && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./

RUN bun install --frozen-lockfile --ignore-scripts --registry https://registry.npmmirror.com \
  && bun ./node_modules/playwright/cli.js install chromium

COPY . .

CMD ["xvfb-run", "-a", "bun", "run", "gateway"]
