# RunSafe Project Guidelines

This file extends the global `~/.claude/CLAUDE.md` guidelines with project-specific instructions for the RunSafe GDPR compliance platform.

## Project Context

**What is RunSafe?**
RunSafe is a GDPR-compliant automation environment for hotels using AI. It wraps n8n deployments in a Docker bundle with:
- **RunSafe Gateway**: API proxy that logs and monitors AI calls
- **RunSafe Tap**: Network traffic monitor for container-level visibility  
- **RunSafe Dashboard**: Compliance reporting and violation tracking
- **Policy Engine**: GDPR rule enforcement and PII detection

**Target Users:**
- Hotels adopting AI chatbots/automations
- Compliance officers needing GDPR audit trails
- IT teams deploying AI workflows safely

## Project-Specific Architecture

### Core Components Stack
```
Frontend: React Dashboard (TypeScript + Material-UI)
Backend: Node.js Gateway (Express.js + PostgreSQL client)
Network Monitor: Python Tap (Scapy + psycopg2)
Database: PostgreSQL 16 (audit logs, violations, metadata)
Orchestration: Docker Compose v2.0+
Workflow Engine: n8n (3rd party - latest stable)
Reverse Proxy: Nginx (for dashboard)
```

### Tech Stack Details
- **Node.js**: v20 Alpine (Gateway service)
- **Python**: v3.11 Alpine (Tap monitoring service)  
- **PostgreSQL**: v16 (Audit database)
- **React**: v18.2+ (Dashboard frontend)
- **Docker**: Multi-stage builds for production
- **Environment**: Linux containers, tested on macOS/Linux

### Dependencies & Versions
**Gateway Service (Node.js):**
- express: ^4.18.2 (HTTP server)
- http-proxy-middleware: ^2.0.6 (AI API proxying)
- pg: ^8.11.3 (PostgreSQL client)
- winston: ^3.11.0 (Logging)
- body-parser: ^1.20.2 (Request parsing)

**Tap Service (Python):**
- scapy: Network packet analysis
- psycopg2-binary: PostgreSQL client
- python-dotenv: Environment management

**Dashboard Service (React):**
- react: ^18.2.0
- @mui/material: ^5.14.18 (UI components)
- recharts: ^2.10.3 (Data visualization)
- axios: ^1.6.2 (API client)

### Port Allocation
- **5678**: n8n workflow editor
- **8080**: RunSafe Gateway (AI API proxy)
- **8081**: RunSafe Dashboard (compliance UI)
- **5432**: PostgreSQL (internal, not exposed)

### Data Flow Pattern
```
Hotel Guest → n8n Workflow → RunSafe Gateway → AI Provider (OpenAI/Anthropic)
                    ↓
              RunSafe Tap (monitors)
                    ↓
              Audit Database → Dashboard
```

## Implementation Guidelines

### 1. Security-First Development

**GDPR Compliance is Non-Negotiable:**
- All PII detection must be tested with real-world data patterns
- Audit logs must be immutable and cryptographically signed
- No data should bypass the monitoring layer
- Default to blocking/masking when in doubt

**Security Testing Requirements:**
- Test PII detection with EU passport formats, IBAN numbers, credit cards
- Verify no data leaks in Docker container logs
- Ensure encrypted connections between all components
- Test data retention policies (3-year limit)

### 2. Deployment & Operations

**Docker-First Architecture:**
- Each service must have health checks
- Use multi-stage builds for production images
- Include resource limits and restart policies
- Test deployment on clean systems

**Environment Configuration:**
- All secrets via environment variables only
- Provide comprehensive .env.example
- Document minimum system requirements
- Include troubleshooting for common deployment issues

### 3. Testing Strategy

**PII Detection Testing:**
```bash
# Test with these sample data types:
- EU Passport: "A1234567" 
- IBAN: "DE89370400440532013000"
- Credit Card: "4532015112830366"
- Email: "guest@hotel.com"
- Phone: "+49 30 12345678"
```

**Integration Testing:**
- n8n workflow imports correctly
- Gateway proxies requests without data loss
- Dashboard displays real-time violations
- CSV exports contain expected audit data

### 4. Code Patterns

**Gateway API Development:**
- Use Express.js middleware for request/response logging
- Implement circuit breakers for AI provider calls
- Add correlation IDs for request tracing
- Return OpenAI-compatible responses

**PII Detection Pattern:**
```javascript
const detected = await piiDetector.scan(requestBody);
if (detected.violations.length > 0) {
  await auditLogger.log({
    type: 'violation',
    data: detected.violations,
    correlationId: req.correlationId
  });
}
```

## Project File Structure Standards

### Current Directory Structure
```
saferun/
├── README.md                    # Main project documentation
├── CLAUDE.md                    # This file - project guidelines
├── docker-compose.yml           # Container orchestration
├── build.sh                     # Docker image build script
├── .env.example                 # Environment variables template
├── .env.template                # Simple env template
├── config/                      # Configuration files
│   └── policy.json             # GDPR policy definitions
├── docker/                     # Docker build files
│   ├── dashboard/              # React dashboard container
│   │   └── Dockerfile
│   ├── gateway/                # Node.js API proxy container
│   │   └── Dockerfile
│   └── tap/                    # Python network monitor container
│       └── Dockerfile
├── docs/                       # User-facing documentation
│   ├── DeploymentREADME.md     # Deployment instructions
│   ├── PRD.md                  # Product requirements
│   ├── PilotChecklist.md       # Success criteria
│   └── SalesSheet.md           # Marketing information
└── workflows/                  # n8n workflow templates
    └── SafeConciergeWorkflow.json
```

### File Organization Rules
- **Root level**: Deployment and build files only
- **config/**: Policy definitions, detection rules, environment templates  
- **docker/**: Service-specific Dockerfiles and build contexts
- **docs/**: User-facing documentation and design materials
- **workflows/**: n8n workflow templates and examples
- **scripts/**: Build, test, and deployment automation (when needed)

### Key Files Purpose
- `docker-compose.yml`: Defines all services, networks, volumes
- `build.sh`: Builds all Docker images in correct order
- `config/policy.json`: GDPR rules, PII patterns, enforcement policies
- `.env.example`: Complete environment documentation with examples
- `workflows/SafeConciergeWorkflow.json`: Reference n8n workflow

## Quality Gates (Project-Specific)

### Before Any Commit:
- PII detection tests pass with sample EU data
- No hardcoded credentials or API keys
- Docker images build successfully
- n8n workflow imports without errors

### Before Release:
- Full deployment test on clean environment
- GDPR compliance review of all data flows
- Performance test: <50ms added latency
- Security scan of Docker images

## Common Gotchas & Solutions

### n8n Integration Issues
- **Problem**: Workflow can't access gateway
- **Solution**: Ensure service names match docker-compose.yml
- **Test**: `curl http://gateway:8080/health` from n8n container

### PII Detection False Positives
- **Problem**: Normal text triggers passport detection
- **Solution**: Adjust regex patterns in `config/policy.json`
- **Test**: Run detection against hotel marketing content

### Docker Networking
- **Problem**: Services can't communicate
- **Solution**: All services must be on `runsafe` network
- **Test**: `docker compose exec n8n ping gateway`

## Development Workflow

### For New Features:
1. **Plan**: Create IMPLEMENTATION_PLAN.md with GDPR impact assessment
2. **Prototype**: Start with monitoring-only mode
3. **Test**: Verify compliance before enforcement features
4. **Document**: Update deployment guides and troubleshooting

### For Bug Fixes:
1. **Reproduce**: Test with actual hotel data patterns (anonymized)
2. **Fix**: Ensure fix doesn't bypass compliance monitoring
3. **Verify**: Check audit logs capture the fix correctly

## Support & Debugging

### Log Analysis:
```bash
# Check gateway logs for PII violations
docker compose logs gateway | grep "violation"

# Monitor network traffic
docker compose logs tap | grep "ai_request"

# Dashboard connectivity
curl http://localhost:8081/api/health
```

### Common Debug Commands:
```bash
# Test PII detection
echo '{"query":"My passport is A1234567"}' | \
  curl -X POST http://localhost:8080/test-detection

# Check database audit logs
docker compose exec postgres psql -U postgres -d audit \
  -c "SELECT * FROM violations ORDER BY created_at DESC LIMIT 5;"
```

---

**Remember**: This is a GDPR compliance tool for hotels. Every line of code we write could affect a hotel's legal compliance. Test thoroughly, document clearly, and prioritize security over convenience.