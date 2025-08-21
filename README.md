# RunSafe - GDPR-Compliant AI Automation for Hotels

RunSafe provides a secure, monitored environment for hotels to leverage AI automation while maintaining GDPR compliance. By wrapping n8n workflows in a compliance layer, RunSafe ensures visibility, monitoring, and audit logs for all data flowing to AI providers.

## 🎯 Key Features

- **Real-time PII Detection** - Automatically identifies passport numbers, credit cards, health data
- **Compliance Monitoring** - Track GDPR violations and generate audit reports
- **Easy Integration** - Works with existing n8n workflows and AI providers
- **10-Minute Setup** - Docker-based deployment with minimal configuration

## 📁 Project Structure

```
saferun/
├── config/                 # Configuration files
│   └── policy.json        # GDPR policy definitions
├── docker/                # Docker build files
│   ├── dashboard/         # Dashboard UI container
│   ├── gateway/           # API proxy container
│   └── tap/              # Network monitor container
├── docs/                  # Documentation
│   ├── DeploymentREADME.md
│   ├── PilotChecklist.md
│   ├── PRD.md
│   └── SalesSheet.md
├── workflows/             # n8n workflow templates
│   └── SafeConciergeWorkflow.json
├── .env.example          # Environment variables template
├── .env.template         # Simple env template
├── build.sh              # Docker image build script
├── docker-compose.yml    # Container orchestration
└── README.md            # This file
```

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose (v2.0+)
- 4GB RAM minimum
- Ports 5678, 8080, 8081 available

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/saferun.git
   cd saferun
   ```

2. **Build Docker images**
   ```bash
   chmod +x build.sh
   ./build.sh
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

4. **Start services**
   ```bash
   docker compose up -d
   ```

5. **Access the system**
   - n8n: http://localhost:5678
   - Dashboard: http://localhost:8081

## 📊 Components

### RunSafe Gateway
- **Multi-Provider Support**: OpenAI, Anthropic with more providers coming
- **Smart Authentication**: Auto-transforms headers for different providers
- **Complete API Coverage**: Chat, embeddings, messages, and latest 2025 APIs
- **Real-time Logging**: All requests/responses with correlation IDs
- **GDPR Policy Engine**: Real-time compliance monitoring

### RunSafe Tap
- Monitors container network traffic
- Passive detection of data flows
- Zero-impact performance monitoring

### RunSafe Dashboard
- Real-time violation tracking
- Compliance reporting
- Export audit logs

## 🔒 GDPR Compliance

RunSafe helps hotels comply with:
- **Article 5** - Data minimization and purpose limitation
- **Article 9** - Special category data protection
- **Article 30** - Records of processing activities
- **Article 32** - Security of processing

## 💰 Pricing

- **Monitor Mode**: €199/property/month
- **Enforce Mode**: €499/property/month
- **Enterprise**: €4,999/month (unlimited properties)

## 📚 Documentation

- [Deployment Guide](docs/DeploymentREADME.md)
- [Product Requirements](docs/PRD.md)
- [Pilot Checklist](docs/PilotChecklist.md)
- [Sales Information](docs/SalesSheet.md)

## 🤝 Support

- Documentation: https://docs.runsafe.ai
- Email: support@runsafe.ai
- Slack: runsafe-community.slack.com

## 📄 License

Copyright © 2024 RunSafe. All rights reserved.