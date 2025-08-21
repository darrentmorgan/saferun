# RunSafe Dashboard - Placeholder Implementation
FROM nginx:alpine

WORKDIR /usr/share/nginx/html

# Copy static dashboard files
COPY public/ .

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 8081

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8081/health || exit 1

CMD ["nginx", "-g", "daemon off;"]