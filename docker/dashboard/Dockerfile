# RunSafe Dashboard - Compliance Monitoring UI
FROM node:20-alpine as builder

WORKDIR /app

# Build React dashboard
COPY <<EOF package.json
{
  "name": "runsafe-dashboard",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-scripts": "5.0.1",
    "axios": "^1.6.2",
    "recharts": "^2.10.3",
    "date-fns": "^2.30.0",
    "@mui/material": "^5.14.18",
    "@emotion/react": "^11.11.1",
    "@emotion/styled": "^11.11.0"
  },
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build"
  }
}
EOF

RUN npm install

# Copy source files
COPY src/ ./src/
COPY public/ ./public/

RUN npm run build

# Production stage
FROM nginx:alpine

COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 8081

CMD ["nginx", "-g", "daemon off;"]