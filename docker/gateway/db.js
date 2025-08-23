/**
 * RunSafe Gateway - PostgreSQL Database Client
 * GDPR-compliant audit logging with connection pooling
 */

const { Pool } = require('pg');
const winston = require('winston');

// Configure logger for database operations
const dbLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Database configuration
const dbConfig = {
  connectionString: process.env.DB_URL || 'postgres://postgres:postgres@postgres:5432/audit',
  max: parseInt(process.env.DB_POOL_MAX) || 20,
  min: parseInt(process.env.DB_POOL_MIN) || 2,
  idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT) || 30000,
  connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT) || 2000,
  allowExitOnIdle: true,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

// Create connection pool
const pool = new Pool(dbConfig);

// Handle pool errors to prevent crashes
pool.on('error', (err, client) => {
  dbLogger.error('Unexpected error on idle PostgreSQL client', {
    error: err.message,
    stack: err.stack
  });
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  dbLogger.info('Shutting down database pool...');
  await pool.end();
});

process.on('SIGINT', async () => {
  dbLogger.info('Shutting down database pool...');
  await pool.end();
  process.exit(0);
});

/**
 * Database health check
 */
async function healthCheck() {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return { healthy: true, timestamp: new Date().toISOString() };
  } catch (error) {
    dbLogger.error('Database health check failed', { error: error.message });
    return { 
      healthy: false, 
      error: error.message, 
      timestamp: new Date().toISOString() 
    };
  }
}

/**
 * Log audit entry to database
 * @param {Object} auditData - Audit log data
 * @returns {Promise<Object>} - Inserted audit log record
 */
async function logAuditEntry(auditData) {
  const {
    correlationId,
    sessionId = null,
    workflowId = null,
    dataSubjectId = null,
    isPersonalData = false,
    method,
    endpoint,
    provider,
    userAgent = null,
    clientIp = null,
    requestHeaders = {},
    requestBody = {},
    responseStatus = null,
    responseHeaders = {},
    responseBody = {},
    responseTimeMs = null,
    requestSizeBytes = null,
    responseSizeBytes = null,
    errorMessage = null,
    errorCode = null,
    metadata = {}
  } = auditData;

  const query = `
    INSERT INTO audit_logs (
      correlation_id, session_id, workflow_id, data_subject_id, is_personal_data,
      method, endpoint, provider, user_agent, client_ip,
      request_headers, request_body, response_status, response_headers, response_body,
      response_time_ms, request_size_bytes, response_size_bytes,
      error_message, error_code, metadata
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
    ) RETURNING audit_id, audit_timestamp, correlation_id
  `;

  const values = [
    correlationId, sessionId, workflowId, dataSubjectId, isPersonalData,
    method, endpoint, provider, userAgent, clientIp,
    JSON.stringify(requestHeaders), JSON.stringify(requestBody), 
    responseStatus, JSON.stringify(responseHeaders), JSON.stringify(responseBody),
    responseTimeMs, requestSizeBytes, responseSizeBytes,
    errorMessage, errorCode, JSON.stringify(metadata)
  ];

  try {
    const result = await pool.query(query, values);
    const auditRecord = result.rows[0];
    
    dbLogger.info('Audit entry logged to database', {
      auditId: auditRecord.audit_id,
      correlationId: auditRecord.correlation_id,
      endpoint,
      provider
    });
    
    return auditRecord;
  } catch (error) {
    dbLogger.error('Failed to log audit entry to database', {
      error: error.message,
      correlationId,
      endpoint,
      provider
    });
    throw error;
  }
}

/**
 * Log PII violation to database
 * @param {Object} violationData - PII violation data
 * @returns {Promise<Object>} - Inserted violation record
 */
async function logPiiViolation(violationData) {
  const {
    auditId,
    violationType,
    violationCategory,
    detectedText,
    redactedText,
    confidenceScore = null,
    fieldPath = null,
    dataSource,
    gdprArticle = null,
    legalBasis = null
  } = violationData;

  const query = `
    INSERT INTO pii_violations (
      audit_id, violation_type, violation_category, detected_text, redacted_text,
      confidence_score, field_path, data_source, gdpr_article, legal_basis
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
    ) RETURNING violation_id, detected_at
  `;

  const values = [
    auditId, violationType, violationCategory, detectedText, redactedText,
    confidenceScore, fieldPath, dataSource, gdprArticle, legalBasis
  ];

  try {
    const result = await pool.query(query, values);
    const violationRecord = result.rows[0];
    
    dbLogger.warn('PII violation logged to database', {
      violationId: violationRecord.violation_id,
      auditId,
      violationType,
      violationCategory
    });
    
    return violationRecord;
  } catch (error) {
    dbLogger.error('Failed to log PII violation to database', {
      error: error.message,
      auditId,
      violationType
    });
    throw error;
  }
}

/**
 * Get recent audit logs
 * @param {Object} options - Query options
 * @returns {Promise<Array>} - Array of audit log records
 */
async function getRecentAuditLogs(options = {}) {
  const {
    limit = 100,
    offset = 0,
    provider = null,
    timeRange = '24 hours'
  } = options;

  let query = `
    SELECT 
      audit_id, audit_timestamp, correlation_id, method, endpoint, provider,
      response_status, response_time_ms, is_personal_data, error_message
    FROM audit_logs 
    WHERE audit_timestamp >= NOW() - INTERVAL '${timeRange}'
  `;

  const values = [];
  let paramIndex = 1;

  if (provider) {
    query += ` AND provider = $${paramIndex}`;
    values.push(provider);
    paramIndex++;
  }

  query += ` ORDER BY audit_timestamp DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  values.push(limit, offset);

  try {
    const result = await pool.query(query, values);
    return result.rows;
  } catch (error) {
    dbLogger.error('Failed to retrieve audit logs', {
      error: error.message,
      options
    });
    throw error;
  }
}

/**
 * Get recent PII violations
 * @param {Object} options - Query options
 * @returns {Promise<Array>} - Array of violation records
 */
async function getRecentViolations(options = {}) {
  const {
    limit = 50,
    timeRange = '24 hours'
  } = options;

  const query = `
    SELECT 
      v.violation_id, v.violation_type, v.violation_category, v.detected_at,
      v.detected_text, v.redacted_text, v.confidence_score, v.field_path,
      v.data_source, v.gdpr_article, v.legal_basis,
      a.correlation_id, a.endpoint, a.provider,
      CASE 
        WHEN v.confidence_score >= 0.8 THEN 'high'
        WHEN v.confidence_score >= 0.6 THEN 'medium'
        ELSE 'low'
      END as risk_level
    FROM pii_violations v
    JOIN audit_logs a ON v.audit_id = a.audit_id
    WHERE v.detected_at >= NOW() - INTERVAL '${timeRange}'
    ORDER BY v.detected_at DESC
    LIMIT $1
  `;

  try {
    const result = await pool.query(query, [limit]);
    return result.rows;
  } catch (error) {
    dbLogger.error('Failed to retrieve PII violations', {
      error: error.message,
      options
    });
    throw error;
  }
}

/**
 * Update system metadata
 * @param {string} key - Metadata key
 * @param {any} value - Metadata value
 * @param {string} description - Description of the metadata
 * @returns {Promise<Object>} - Updated metadata record
 */
async function updateSystemMetadata(key, value, description = null) {
  const query = `
    INSERT INTO system_metadata (key, value, description, updated_by)
    VALUES ($1, $2, $3, 'gateway')
    ON CONFLICT (key) 
    DO UPDATE SET 
      value = EXCLUDED.value,
      description = COALESCE(EXCLUDED.description, system_metadata.description),
      updated_at = NOW(),
      updated_by = 'gateway'
    RETURNING *
  `;

  const values = [key, JSON.stringify(value), description];

  try {
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    dbLogger.error('Failed to update system metadata', {
      error: error.message,
      key
    });
    throw error;
  }
}

/**
 * Execute raw SQL query (for testing and admin operations)
 * @param {string} query - SQL query
 * @param {Array} values - Query parameters
 * @returns {Promise<Object>} - Query result
 */
async function executeQuery(query, values = []) {
  try {
    const result = await pool.query(query, values);
    return result;
  } catch (error) {
    dbLogger.error('Query execution failed', {
      error: error.message,
      query: query.substring(0, 100) + '...'
    });
    throw error;
  }
}

module.exports = {
  pool,
  healthCheck,
  logAuditEntry,
  logPiiViolation,
  getRecentAuditLogs,
  getRecentViolations,
  updateSystemMetadata,
  executeQuery,
  dbLogger
};