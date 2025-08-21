# RunSafe n8n Monitoring Bundle – Deployment Guide

## Prerequisites
- Docker + Docker Compose installed (v2.0+)
- Access to a server or VM with internet connectivity
- Minimum 4GB RAM, 10GB disk space
- Ports 5678, 8080, 8081 available

---

## 1. Build Docker Images
First, build the required RunSafe images:
```bash
# Make build script executable
chmod +x build.sh

# Build all images
./build.sh
```

---

## 2. Setup Environment Variables
Copy the example file and configure:
```bash
# Copy template
cp .env.example .env

# Generate encryption key
echo "N8N_ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env

# Edit .env to add your RUNSAFE_TENANT_KEY
nano .env
```

---

## 3. Run the Deployment
```bash
docker compose up -d
```

---

## 4. Access the Services
- n8n: http://localhost:5678  
- RunSafe Dashboard: http://localhost:8081  
- RunSafe Gateway: http://localhost:8080
- Gateway API Discovery: http://localhost:8080/api/endpoints  

---

## 5. Import Workflow
Import one of the provided workflow templates:

**Option A: Simple Concierge (OpenAI only)**
1. Open n8n at http://localhost:5678
2. Go to Workflows → Import
3. Select `workflows/SafeConciergeWorkflow.json`
4. Set environment variable `RUNSAFE_TENANT_KEY` in n8n
5. Activate the workflow

**Option B: Multi-Provider Concierge (OpenAI + Anthropic)**
1. Import `workflows/MultiProviderWorkflow.json`
2. Set environment variables in n8n:
   - `OPENAI_API_KEY` for OpenAI endpoints
   - `ANTHROPIC_API_KEY` for Anthropic endpoints
3. Activate the workflow

## 5.1 Supported AI Provider Endpoints

The RunSafe Gateway supports the following endpoints:

### OpenAI Endpoints
- **Chat Completions**: `http://gateway:8080/v1/chat/completions`
  - Authentication: `Authorization: Bearer YOUR_OPENAI_KEY`
  - Models: GPT-4, GPT-3.5-turbo, etc.
- **Embeddings**: `http://gateway:8080/v1/embeddings`
  - Authentication: `Authorization: Bearer YOUR_OPENAI_KEY`
  - Models: text-embedding-ada-002, etc.
- **Responses** (New 2025): `http://gateway:8080/v1/responses`
  - Authentication: `Authorization: Bearer YOUR_OPENAI_KEY`

### Anthropic Endpoints  
- **Messages**: `http://gateway:8080/v1/messages`
  - Authentication: `Authorization: Bearer YOUR_ANTHROPIC_KEY` (auto-transformed)
  - Models: Claude 3 Sonnet, Claude 3 Opus, etc.
  - Note: Gateway automatically adds required `anthropic-version` header

### Endpoint Discovery
- **API Discovery**: `http://gateway:8080/api/endpoints`
  - Returns complete list of supported endpoints and authentication methods

---

## 6. Pilot Includes
- Pre-built "Safe Concierge" workflow
- Daily GDPR Violation CSV report
- Article 30 compliance log template

---

## 7. Next Steps
- Test with sample data containing PII
- Review violations in dashboard
- Export compliance reports
- Switch POLICY_MODE to `enforce` after pilot validation

---

## Troubleshooting

### Common Issues

**Container fails to start:**
```bash
# Check logs
docker compose logs gateway
docker compose logs n8n

# Verify environment variables
docker compose config
```

**Port already in use:**
```bash
# Find process using port
lsof -i :5678

# Or change port in .env
N8N_PORT=5679
```

**Database connection errors:**
```bash
# Check postgres is running
docker compose ps postgres

# Reset database
docker compose down -v
docker compose up -d
```

**Workflow not detecting PII:**
- Verify POLICY_MODE is set correctly
- Check gateway logs: `docker compose logs gateway`
- Ensure workflow uses gateway URL: `http://gateway:8080`

**Can't access dashboard:**
- Check firewall rules
- Verify dashboard is running: `docker compose ps dashboard`
- Try: `curl http://localhost:8081`

---

## Support
- Documentation: https://docs.runsafe.ai
- Email: support@runsafe.ai
- Slack: runsafe-community.slack.com