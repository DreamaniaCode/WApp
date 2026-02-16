# Production Dockerfile
FROM node:20-slim

# Install Chromium and dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer to use the installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies  (including devDeps for build)
RUN npm install

# Copy source
COPY . .

# Build Backend Only (Skip Next.js build to save time/resources)
RUN npm run build:backend

# Expose port (Backend Only)
EXPOSE 3001

# Start Backend
CMD ["npm", "run", "start:backend"]
