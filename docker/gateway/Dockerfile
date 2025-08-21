# RunSafe Gateway - API Proxy with GDPR Monitoring
FROM node:20-alpine

WORKDIR /app

# Install dependencies
RUN apk add --no-cache \
    curl \
    jq \
    postgresql-client

# Create gateway application
COPY <<EOF package.json
{
  "name": "runsafe-gateway",
  "version": "1.0.0",
  "description": "RunSafe Gateway for GDPR-compliant AI API calls",
  "main": "server.js",
  "dependencies": {
    "express": "^4.18.2",
    "http-proxy-middleware": "^2.0.6",
    "pg": "^8.11.3",
    "body-parser": "^1.20.2",
    "winston": "^3.11.0",
    "dotenv": "^16.3.1"
  }
}
EOF

RUN npm install

# Copy gateway server code
COPY server.js .
COPY pii-detector.js .
COPY policy-engine.js .

EXPOSE 8080

CMD ["node", "server.js"]