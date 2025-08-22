# RunSafe Gateway - API Proxy with GDPR Monitoring
FROM node:20-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    curl \
    jq

# Copy package.json and install dependencies
COPY package.json .
RUN npm install --production

# Copy gateway server code
COPY server.js .
COPY db.js .

# Create non-root user
RUN addgroup -g 1001 -S gateway && \
    adduser -S gateway -u 1001 -G gateway

# Change ownership
RUN chown -R gateway:gateway /app
USER gateway

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

CMD ["node", "server.js"]