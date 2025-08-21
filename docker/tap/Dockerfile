# RunSafe Tap - Network Traffic Monitor
FROM alpine:3.18

RUN apk add --no-cache \
    tcpdump \
    python3 \
    py3-pip \
    postgresql-client \
    jq

# Install Python dependencies
RUN pip3 install --no-cache-dir \
    psycopg2-binary \
    scapy \
    python-dotenv

WORKDIR /app

# Copy monitoring script
COPY monitor.py .

# Run as root for network capture capabilities
USER root

CMD ["python3", "monitor.py"]