# RunSafe Database Backup Procedures

This document outlines the backup and recovery procedures for the RunSafe GDPR compliance audit database.

## Overview

The RunSafe system uses PostgreSQL 16 with time-partitioned tables for GDPR-compliant audit logging. This document provides procedures for:
- Regular automated backups
- Manual backup procedures
- Point-in-time recovery
- GDPR data retention compliance
- Disaster recovery scenarios

## Database Structure

### Tables
- `audit_logs` - Partitioned table (monthly) for API request/response logging
- `pii_violations` - PII detection violations and GDPR compliance tracking
- `system_metadata` - System configuration and operational metadata

### Partitions
- Monthly partitions: `audit_logs_YYYY_MM` (e.g., `audit_logs_2025_08`)
- Automatic partition creation for future months
- 7-year retention policy with automatic cleanup

## Backup Strategies

### 1. Full Database Backup

```bash
# Create full database dump
docker compose exec postgres pg_dump -U postgres -d audit \
  --verbose --format=custom --compress=9 \
  > backups/runsafe_audit_$(date +%Y%m%d_%H%M%S).backup

# Verify backup integrity
docker compose exec postgres pg_restore --list \
  backups/runsafe_audit_$(date +%Y%m%d_%H%M%S).backup
```

### 2. Partition-Specific Backup

```bash
# Backup specific month (example: August 2025)
docker compose exec postgres pg_dump -U postgres -d audit \
  --table=audit_logs_2025_08 \
  --table=pii_violations \
  --format=custom --compress=9 \
  > backups/runsafe_audit_2025_08_$(date +%Y%m%d).backup
```

### 3. GDPR-Compliant Export

```bash
# Export data for specific data subject (GDPR Article 20)
docker compose exec postgres psql -U postgres -d audit -c \
  "SELECT * FROM gdpr_export_subject_data('subject-id-here')" \
  --csv > gdpr_exports/subject_data_$(date +%Y%m%d).csv
```

## Automated Backup Script

Create `/scripts/backup_audit_db.sh`:

```bash
#!/bin/bash
set -e

# Configuration
BACKUP_DIR="/var/backups/runsafe"
RETENTION_DAYS=90
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Full database backup
echo "Starting database backup: $DATE"
docker compose exec -T postgres pg_dump -U postgres -d audit \
  --verbose --format=custom --compress=9 \
  > $BACKUP_DIR/runsafe_audit_$DATE.backup

# Verify backup
echo "Verifying backup integrity..."
docker compose exec -T postgres pg_restore --list \
  $BACKUP_DIR/runsafe_audit_$DATE.backup > /dev/null

if [ $? -eq 0 ]; then
    echo "Backup completed successfully: $BACKUP_DIR/runsafe_audit_$DATE.backup"
else
    echo "Backup verification failed!" >&2
    exit 1
fi

# Cleanup old backups (keep last 90 days)
echo "Cleaning up old backups..."
find $BACKUP_DIR -name "runsafe_audit_*.backup" -mtime +$RETENTION_DAYS -delete

# Log backup status
echo "$(date): Backup completed - runsafe_audit_$DATE.backup" >> $BACKUP_DIR/backup.log

echo "Backup process completed."
```

### Schedule with Cron

```bash
# Daily backup at 2 AM
0 2 * * * /scripts/backup_audit_db.sh

# Weekly full backup on Sundays at 1 AM
0 1 * * 0 /scripts/backup_audit_db.sh
```

## Recovery Procedures

### 1. Full Database Restore

```bash
# Stop services
docker compose down

# Remove existing data volume
docker volume rm saferun_pgdata

# Start database only
docker compose up postgres -d

# Wait for database to be ready
sleep 30

# Restore from backup
docker compose exec -T postgres pg_restore -U postgres -d audit \
  --verbose --clean --if-exists \
  < backups/runsafe_audit_YYYYMMDD_HHMMSS.backup

# Verify restore
docker compose exec postgres psql -U postgres -d audit -c \
  "SELECT COUNT(*) FROM audit_logs;"

# Start all services
docker compose up -d
```

### 2. Point-in-Time Recovery

```bash
# Restore to specific timestamp
docker compose exec postgres psql -U postgres -d audit -c \
  "SELECT * FROM audit_logs WHERE audit_timestamp >= '2025-08-22 00:00:00' 
   AND audit_timestamp <= '2025-08-22 23:59:59';"
```

### 3. Partition Recovery

```bash
# Restore specific month partition
docker compose exec -T postgres pg_restore -U postgres -d audit \
  --table=audit_logs_2025_08 \
  --verbose --clean \
  < backups/runsafe_audit_2025_08_YYYYMMDD.backup
```

## GDPR Compliance Procedures

### Data Subject Rights

#### Right to be Forgotten (Article 17)
```sql
-- Delete all data for a specific subject
SELECT gdpr_delete_subject_data('subject-id-here');
```

#### Right to Data Portability (Article 20)
```sql
-- Export all data for a specific subject
SELECT * FROM gdpr_export_subject_data('subject-id-here');
```

#### Data Retention Enforcement
```sql
-- Manually trigger retention policy (automatically scheduled)
SELECT enforce_retention_policy();
```

### Compliance Monitoring

```bash
# Check data older than 7 years
docker compose exec postgres psql -U postgres -d audit -c \
  "SELECT schemaname||'.'||tablename as partition, 
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
   FROM pg_tables 
   WHERE tablename LIKE 'audit_logs_%' 
   AND substring(tablename from 'audit_logs_(\d{4}_\d{2})')::TEXT < 
       to_char(NOW() - INTERVAL '7 years', 'YYYY_MM');"
```

## Monitoring and Alerts

### Backup Health Check

```bash
# Check last backup age
LAST_BACKUP=$(ls -t /var/backups/runsafe/runsafe_audit_*.backup | head -1)
BACKUP_AGE=$(stat -c %Y "$LAST_BACKUP")
CURRENT_TIME=$(date +%s)
AGE_HOURS=$(( (CURRENT_TIME - BACKUP_AGE) / 3600 ))

if [ $AGE_HOURS -gt 25 ]; then
    echo "WARNING: Last backup is $AGE_HOURS hours old"
    # Send alert to monitoring system
fi
```

### Database Size Monitoring

```sql
-- Monitor database growth
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
    pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
FROM pg_tables 
WHERE tablename LIKE 'audit_logs_%' 
ORDER BY size_bytes DESC;
```

## Security Considerations

### Backup Encryption

```bash
# Encrypt backup files
gpg --cipher-algo AES256 --compress-algo 1 --symmetric \
    backups/runsafe_audit_$DATE.backup

# Decrypt for restore
gpg --decrypt backups/runsafe_audit_$DATE.backup.gpg > \
    backups/runsafe_audit_$DATE.backup
```

### Access Control

- Backup files should be stored with restricted permissions (600)
- Use separate encryption keys for different environments
- Implement backup integrity verification
- Maintain audit trail of backup access

## Disaster Recovery

### RTO/RPO Targets

- **Recovery Time Objective (RTO)**: 4 hours
- **Recovery Point Objective (RPO)**: 24 hours
- **Maximum acceptable data loss**: 1 day of audit logs

### DR Checklist

1. [ ] Verify backup files integrity
2. [ ] Provision new database infrastructure
3. [ ] Restore latest backup
4. [ ] Verify data integrity and completeness
5. [ ] Update connection strings in applications
6. [ ] Test application functionality
7. [ ] Monitor for performance issues
8. [ ] Document incident and lessons learned

## Testing Procedures

### Monthly Backup Test

```bash
# Test restore to separate database
docker run --name test-postgres -e POSTGRES_PASSWORD=test -d postgres:16
docker exec -i test-postgres psql -U postgres -c "CREATE DATABASE audit_test;"
docker exec -i test-postgres pg_restore -U postgres -d audit_test \
    < backups/runsafe_audit_latest.backup
docker exec test-postgres psql -U postgres -d audit_test -c \
    "SELECT COUNT(*) FROM audit_logs;"
docker rm -f test-postgres
```

### Quarterly DR Test

1. Schedule planned outage window
2. Simulate database failure
3. Execute full recovery procedure
4. Verify application functionality
5. Measure RTO/RPO actuals vs targets
6. Update procedures based on findings

## Maintenance

### Partition Maintenance

```sql
-- Create partitions for next 6 months
SELECT create_audit_partitions(6);

-- Check partition sizes
SELECT 
    schemaname||'.'||tablename as partition,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables 
WHERE tablename LIKE 'audit_logs_%'
ORDER BY tablename;
```

### Index Maintenance

```sql
-- Rebuild indexes if needed
REINDEX DATABASE audit;

-- Check index usage
SELECT 
    schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes 
WHERE schemaname = 'public' 
ORDER BY idx_scan DESC;
```

## Troubleshooting

### Common Issues

1. **Backup file corruption**: Verify checksums, re-run backup
2. **Insufficient disk space**: Clean old backups, add storage
3. **Long backup times**: Consider incremental backups, optimize queries
4. **Permission errors**: Check user permissions, file ownership

### Support Contacts

- Database Administrator: [DBA contact]
- GDPR Compliance Officer: [Compliance contact]
- System Administrator: [SysAdmin contact]

---

**Last Updated**: 2025-08-22  
**Document Version**: 1.0  
**Review Schedule**: Quarterly