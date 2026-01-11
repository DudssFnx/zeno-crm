FROM node:20-slim

RUN apt-get update && apt-get install -y \
    git \
    ca-certificates \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends \
    && update-ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build
RUN npm prune --omit=dev

ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

EXPOSE 3001

CMD ["npm", "start"]
