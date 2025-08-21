# Product Requirements Document (PRD)
**Product:** RunSafe Monitoring Bundle (n8n + Compliance Layer)  
**Author:** [Your Name]  
**Date:** [Insert Date]  
**Version:** Draft v0.1  

---

## 1. Overview
**Vision:**  
RunSafe provides a GDPR-compliant automation environment for hotels adopting AI. By wrapping an n8n deployment in a controlled Docker bundle, RunSafe enables hotels to use AI safely while ensuring **visibility, monitoring, and audit logs** for all data flowing into AI providers.  

**Problem Statement:**  
Hotels risk GDPR violations when AI agents process guest PII (passport numbers, payment data, health details). Current workflows offer no visibility into which data is shared, where it flows, or whether it complies with GDPR.  

**Solution:**  
Deliver a **self-contained Docker Compose bundle**:  
- n8n for workflow automation.  
- RunSafe Gateway intercepting AI-bound API calls.  
- RunSafe Tap monitoring all traffic in/out.  
- Audit DB + Dashboard providing compliance visibility.  
- Pre-configured GDPR detection & policies.  

---

## 2. Goals & Non-Goals
**Goals (MVP v0.1)**  
- Provide hotels with **real-time visibility** into AI-bound requests.  
- Detect and classify GDPR-sensitive data (passport, financial, health).  
- Store immutable audit logs for compliance officers.  
- Show violations in a simple dashboard.  
- Deploy in under 10 minutes via Docker Compose.  

**Non-Goals (MVP)**  
- Blocking or sanitizing data flows (that’s Phase 2).  
- Full PMS integrations (templates only).  
- Supporting every AI provider (focus on OpenAI + Anthropic).  

---

## 3. Target Market
- **Primary:** Boutique hotel chains (10–50 properties, €20M+ revenue).  
- **Secondary:** Hospitality tech vendors (chatbots, PMS platforms).  

---

## 4. Product Scope

### Phase 1: Monitoring (Days 1–7)
- Passive monitoring of AI-bound traffic.  
- Regex + NER-based detection of PII and GDPR categories.  
- Audit DB (Postgres) with immutable logs.  
- Dashboard: requests, agents, data types, violation counts.  

### Phase 2: Reporting (Days 8–10)
- Daily CSV exports of violations.  
- GDPR Article 30 “Data Processing Record” template.  
- Simple heatmap (workflows × violation type).  

### Phase 3: Guardrails (Phase 2 release, optional)
- Policy engine to redact, block, or mask data.  
- Enforce GDPR Articles 5 & 9.  

---

## 5. Key User Stories
- **As a Compliance Officer**, I need to see every piece of guest PII sent to AI systems so I can prove GDPR compliance.  
- **As a Hotel Manager**, I want daily compliance reports without involving IT.  
- **As a Hotel IT Admin**, I want to deploy RunSafe in 10 minutes without network changes.  

---

## 6. Technical Requirements

**Architecture Components:**  
- **n8n Container:** Workflow automation.  
- **RunSafe Gateway:** API-compatible proxy for OpenAI/Anthropic endpoints. Logs all requests/responses.  
- **RunSafe Tap:** Passive monitor of container network traffic.  
- **Audit DB:** PostgreSQL storing logs, violations, metadata.  
- **Dashboard:** React SPA showing metrics + reports.  

**Implementation Details:**  
- Deployment: Docker Compose bundle.  
- Config: `.env` with encryption keys, tenant key, policy mode.  
- Detection: Regex + spaCy NER for passports, IBANs, credit cards, names, emails.  
- Performance: <50ms added latency for monitored flows.  
- Logs: Append-only, cryptographically signed entries.  

---

## 7. Success Metrics (30 Days)
**Technical:**  
- 95% detection accuracy for GDPR data.  
- <50ms latency overhead.  
- Zero disruptions to workflows.  

**Business:**  
- 3 pilot hotels installed.  
- 1 paying customer by day 30.  
- 1 GDPR violation discovered & documented.  

---

## 8. Risks & Mitigations
- **Risk:** Hotels use AI outside n8n → coverage gap.  
  - *Mitigation:* Position RunSafe n8n as the “compliant hub” for all hotel AI. Optional email/SIEM tap later.  
- **Risk:** False positives reduce trust.  
  - *Mitigation:* Start in monitor-only mode. Classify, don’t block.  
- **Risk:** Adoption friction.  
  - *Mitigation:* 10-minute Docker install, templates provided.  

---

## 9. Next Steps
- Build gateway skeleton (OpenAI-compatible pass-through).  
- Integrate PII detection + policy JSON.  
- Ship Docker Compose with n8n + RunSafe containers.  
- Pilot with 1–2 boutique hotel chains.  
- Gather feedback on visibility → expand into guardrails in Phase 2.  
