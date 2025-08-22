-- RunSafe GDPR Compliance Platform - Database Schema
-- PostgreSQL 16 optimized schema for audit logging
-- Created: 2025-08-22

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Main audit logs table with time-based partitioning for GDPR compliance
CREATE TABLE audit_logs (
    audit_id BIGSERIAL NOT NULL,
    audit_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Request identification
    correlation_id UUID NOT NULL DEFAULT uuid_generate_v4(),
    session_id TEXT,
    workflow_id TEXT,
    
    -- GDPR compliance fields
    data_subject_id TEXT,
    retention_period INTERVAL DEFAULT INTERVAL '7 years',
    is_personal_data BOOLEAN DEFAULT FALSE,
    
    -- API request details
    method TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    provider TEXT NOT NULL, -- 'openai', 'anthropic', etc.
    user_agent TEXT,
    client_ip INET,
    
    -- Request/Response data
    request_headers JSONB,
    request_body JSONB,
    response_status INTEGER,
    response_headers JSONB,
    response_body JSONB,
    
    -- Performance metrics
    response_time_ms INTEGER,
    request_size_bytes INTEGER,
    response_size_bytes INTEGER,
    
    -- Error tracking
    error_message TEXT,
    error_code TEXT,
    
    -- Additional metadata
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (audit_timestamp);

-- Create initial partitions for current and next 3 months
CREATE TABLE audit_logs_2025_08 PARTITION OF audit_logs
    FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');

CREATE TABLE audit_logs_2025_09 PARTITION OF audit_logs
    FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');

CREATE TABLE audit_logs_2025_10 PARTITION OF audit_logs
    FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');

CREATE TABLE audit_logs_2025_11 PARTITION OF audit_logs
    FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');

-- PII violations table for GDPR compliance tracking
CREATE TABLE pii_violations (
    violation_id BIGSERIAL PRIMARY KEY,
    audit_id BIGINT,
    
    -- Violation details
    violation_type TEXT NOT NULL, -- 'passport', 'iban', 'credit_card', 'email', 'phone'
    violation_category TEXT NOT NULL, -- 'special_category', 'personal_data', 'identifier'
    detected_text TEXT NOT NULL,
    redacted_text TEXT NOT NULL,
    confidence_score DECIMAL(3,2), -- 0.00 to 1.00
    
    -- Location in request/response
    field_path TEXT, -- JSON path where PII was found
    data_source TEXT NOT NULL, -- 'request_body', 'response_body', 'headers'
    
    -- GDPR Article references
    gdpr_article TEXT, -- 'Article 9', 'Article 6', etc.
    legal_basis TEXT,
    
    -- Timestamps
    detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    
    -- Note: Foreign key constraint removed due to partitioned table limitations
    -- Will be enforced at application level
);

-- System metadata table for configuration and monitoring
CREATE TABLE system_metadata (
    metadata_id BIGSERIAL PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_by TEXT NOT NULL DEFAULT 'system'
);

-- Performance indexes for audit_logs
CREATE INDEX idx_audit_timestamp ON audit_logs (audit_timestamp);
CREATE INDEX idx_audit_correlation ON audit_logs (correlation_id);
CREATE INDEX idx_audit_provider ON audit_logs (provider, audit_timestamp);
CREATE INDEX idx_audit_endpoint ON audit_logs (endpoint, audit_timestamp);

-- GDPR compliance indexes
CREATE INDEX idx_audit_data_subject ON audit_logs (data_subject_id, audit_timestamp) 
    WHERE data_subject_id IS NOT NULL;
CREATE INDEX idx_audit_personal_data ON audit_logs (is_personal_data, audit_timestamp) 
    WHERE is_personal_data = TRUE;

-- JSONB indexes for flexible queries
CREATE INDEX idx_audit_request_body_gin ON audit_logs USING GIN (request_body);
CREATE INDEX idx_audit_response_body_gin ON audit_logs USING GIN (response_body);
CREATE INDEX idx_audit_metadata_gin ON audit_logs USING GIN (metadata);

-- PII violations indexes
CREATE INDEX idx_violations_audit_id ON pii_violations (audit_id);
CREATE INDEX idx_violations_type ON pii_violations (violation_type, detected_at);
CREATE INDEX idx_violations_category ON pii_violations (violation_category, detected_at);

-- Function to automatically create future partitions
CREATE OR REPLACE FUNCTION create_audit_partitions(months_ahead INTEGER DEFAULT 3)
RETURNS VOID AS $$
DECLARE
    start_date DATE;
    end_date DATE;
    partition_name TEXT;
    i INTEGER;
BEGIN
    -- Start from beginning of current month
    start_date := date_trunc('month', CURRENT_DATE);
    
    FOR i IN 0..months_ahead LOOP
        end_date := start_date + INTERVAL '1 month';
        partition_name := 'audit_logs_' || to_char(start_date, 'YYYY_MM');
        
        -- Check if partition already exists
        IF NOT EXISTS (
            SELECT 1 FROM pg_tables 
            WHERE tablename = partition_name
        ) THEN
            EXECUTE format(
                'CREATE TABLE %I PARTITION OF audit_logs FOR VALUES FROM (%L) TO (%L)',
                partition_name, start_date, end_date
            );
            RAISE NOTICE 'Created partition: %', partition_name;
        END IF;
        
        start_date := end_date;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- GDPR right to be forgotten function
CREATE OR REPLACE FUNCTION gdpr_delete_subject_data(subject_id TEXT)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
    current_count INTEGER := 0;
    partition_name TEXT;
BEGIN
    -- Delete from all partitions
    FOR partition_name IN 
        SELECT schemaname||'.'||tablename 
        FROM pg_tables 
        WHERE tablename LIKE 'audit_logs_%'
    LOOP
        EXECUTE format('DELETE FROM %s WHERE data_subject_id = $1', partition_name) 
        USING subject_id;
        GET DIAGNOSTICS current_count = ROW_COUNT;
        deleted_count := deleted_count + current_count;
    END LOOP;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function for GDPR data export
CREATE OR REPLACE FUNCTION gdpr_export_subject_data(subject_id TEXT)
RETURNS TABLE(
    audit_timestamp TIMESTAMP WITH TIME ZONE,
    endpoint TEXT,
    provider TEXT,
    has_personal_data BOOLEAN,
    retention_expires TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.audit_timestamp,
        a.endpoint,
        a.provider,
        a.is_personal_data,
        a.created_at + a.retention_period as retention_expires
    FROM audit_logs a
    WHERE a.data_subject_id = subject_id
    ORDER BY a.audit_timestamp;
END;
$$ LANGUAGE plpgsql;

-- Data retention policy enforcement
CREATE OR REPLACE FUNCTION enforce_retention_policy()
RETURNS VOID AS $$
DECLARE
    partition_name TEXT;
    cutoff_date TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Calculate cutoff date (7 years by default)
    cutoff_date := NOW() - INTERVAL '7 years';
    
    -- Drop old partitions that exceed retention period
    FOR partition_name IN 
        SELECT schemaname||'.'||tablename 
        FROM pg_tables 
        WHERE tablename LIKE 'audit_logs_%'
        AND substring(tablename from 'audit_logs_(\d{4}_\d{2})')::TEXT < 
            to_char(cutoff_date, 'YYYY_MM')
    LOOP
        EXECUTE format('DROP TABLE IF EXISTS %s CASCADE', partition_name);
        RAISE NOTICE 'Dropped old partition for GDPR compliance: %', partition_name;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Insert initial system metadata
INSERT INTO system_metadata (key, value, description) VALUES
('schema_version', '"1.0.0"', 'Database schema version'),
('gdpr_retention_years', '7', 'Default GDPR data retention period in years'),
('pii_detection_enabled', 'true', 'Whether PII detection is active'),
('audit_enabled', 'true', 'Whether audit logging is active'),
('last_retention_check', 'null', 'Last time retention policy was enforced');

-- Create views for common queries
CREATE VIEW recent_violations AS
SELECT 
    v.violation_id,
    v.violation_type,
    v.violation_category,
    v.detected_text,
    v.confidence_score,
    a.provider,
    a.endpoint,
    a.correlation_id,
    v.detected_at
FROM pii_violations v
JOIN audit_logs a ON v.audit_id = a.audit_id
WHERE v.detected_at >= NOW() - INTERVAL '24 hours'
ORDER BY v.detected_at DESC;

CREATE VIEW audit_summary AS
SELECT 
    provider,
    DATE(audit_timestamp) as audit_date,
    COUNT(*) as total_requests,
    COUNT(*) FILTER (WHERE is_personal_data = true) as personal_data_requests,
    AVG(response_time_ms) as avg_response_time,
    COUNT(*) FILTER (WHERE response_status >= 400) as error_count
FROM audit_logs
WHERE audit_timestamp >= NOW() - INTERVAL '30 days'
GROUP BY provider, DATE(audit_timestamp)
ORDER BY audit_date DESC, provider;

-- Set optimal table parameters for high-volume logging
-- Note: Storage parameters applied to partitions individually, not parent table

ALTER TABLE pii_violations SET (
    fillfactor = 90,
    autovacuum_vacuum_scale_factor = 0.2
);

-- Create monthly partition maintenance job (manual trigger for now)
-- Future: Can be automated with pg_cron extension
-- SELECT create_audit_partitions(6);

COMMENT ON TABLE audit_logs IS 'GDPR-compliant audit logging for AI API requests and responses';
COMMENT ON TABLE pii_violations IS 'PII detection violations for GDPR compliance monitoring';
COMMENT ON TABLE system_metadata IS 'System configuration and operational metadata';

-- Grant permissions (will be configured per environment)
-- GRANT SELECT, INSERT ON audit_logs TO runsafe_gateway;
-- GRANT SELECT, INSERT ON pii_violations TO runsafe_gateway;
-- GRANT SELECT, UPDATE ON system_metadata TO runsafe_gateway;