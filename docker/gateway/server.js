const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');
const { createProxyMiddleware } = require('http-proxy-middleware');
require('dotenv').config();

// Import database client and PII detector
const db = require('./db');
const PIIDetector = require('./pii-detector');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 8080;

// Initialize PII detector
const piiDetector = new PIIDetector('/app/config/policy.json');

// In-memory log storage for dashboard display
let recentLogs = [];

// Custom transport to store logs for dashboard
class DashboardTransport extends winston.transports.Console {
  log(info, callback) {
    // Store in memory for dashboard
    recentLogs.push({
      timestamp: info.timestamp,
      level: info.level,
      message: info.message,
      correlationId: info.correlationId,
      ...info
    });
    
    // Keep only last 100 logs
    if (recentLogs.length > 100) {
      recentLogs = recentLogs.slice(-100);
    }
    
    super.log(info, callback);
  }
}

// Configure Winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new DashboardTransport({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Middleware setup
app.use(cors());

// Parse JSON for API endpoints only (NOT for proxy endpoints to avoid conflicts)
app.use('/api/*', bodyParser.json({ limit: '10mb' }));
app.use('/health', bodyParser.json({ limit: '10mb' }));
// NOTE: Removed /v1/* body parser to avoid conflicts with proxy middleware

// Request correlation ID middleware
app.use((req, res, next) => {
  req.correlationId = uuidv4();
  res.set('X-Correlation-ID', req.correlationId);
  next();
});

// PII Detection middleware moved here - must be BEFORE proxy definitions
const getRawBody = require('raw-body');

// Enhanced request logging middleware with database integration
app.use((req, res, next) => {
  const startTime = Date.now();
  req.startTime = startTime;
  
  logger.info('Incoming request', {
    correlationId: req.correlationId,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress
  });

  // Capture request data for AI endpoints
  if (req.url.includes('/chat/completions') || req.url.includes('/embeddings') || req.url.includes('/messages')) {
    req.isAIRequest = true;
    req.capturedRequestBody = null;
    req.capturedResponseBody = null;
    
    // Store original request data
    const originalSend = res.send;
    res.send = function(data) {
      req.capturedResponseBody = data;
      return originalSend.call(this, data);
    };
  }

  res.on('finish', async () => {
    const duration = Date.now() - startTime;
    
    logger.info('Request completed', {
      correlationId: req.correlationId,
      statusCode: res.statusCode,
      duration: `${duration}ms`
    });

    // Log AI requests to database
    if (req.isAIRequest) {
      try {
        const provider = req.url.includes('/messages') ? 'anthropic' : 'openai';
        const endpoint = req.url;
        
        // Check for PII data to mark personal data flag
        const hasPersonalData = req.piiViolations && req.piiViolations.length > 0;
        
        const auditRecord = await db.logAuditEntry({
          correlationId: req.correlationId,
          method: req.method,
          endpoint,
          provider,
          userAgent: req.get('User-Agent'),
          clientIp: req.ip || req.connection.remoteAddress,
          requestHeaders: req.headers,
          requestBody: req.body || {},
          responseStatus: res.statusCode,
          responseHeaders: res.getHeaders(),
          responseBody: {},
          responseTimeMs: duration,
          requestSizeBytes: req.get('Content-Length') ? parseInt(req.get('Content-Length')) : null,
          responseSizeBytes: null,
          isPersonalData: hasPersonalData,
          metadata: {
            userAgent: req.get('User-Agent'),
            timestamp: new Date().toISOString(),
            pii_violations_count: req.piiViolations ? req.piiViolations.length : 0
          }
        });
        
        // Log PII violations to database if any were detected
        if (req.piiViolations && req.piiViolations.length > 0) {
          for (const violation of req.piiViolations) {
            try {
              await db.logPiiViolation({
                auditId: auditRecord.audit_id,
                violationType: violation.type,
                violationCategory: violation.category,
                detectedText: violation.detected_text,
                redactedText: violation.redacted_text,
                confidenceScore: violation.confidence_score,
                fieldPath: violation.field_path,
                dataSource: violation.data_source,
                gdprArticle: violation.gdpr_article,
                legalBasis: violation.category === 'special_category' ? 'Explicit consent required' : 'Legitimate interest'
              });
            } catch (violationError) {
              logger.error('Failed to log PII violation to database', {
                correlationId: req.correlationId,
                violationType: violation.type,
                error: violationError.message
              });
            }
          }
          
          logger.warn('PII violations logged to database', {
            correlationId: req.correlationId,
            provider,
            endpoint,
            violationsCount: req.piiViolations.length,
            riskLevels: req.piiViolations.map(v => v.risk_level)
          });
        }

        // Log enforcement actions if any were applied
        if (req.enforcementResult && req.enforcementResult.appliedActions.length > 0) {
          try {
            await db.logEnforcementAction({
              auditId: auditRecord.audit_id,
              correlationId: req.correlationId,
              enforcementMode: piiDetector.getEnforcementMode(),
              action: req.enforcementResult.action,
              appliedActions: req.enforcementResult.appliedActions,
              blockReason: req.enforcementResult.blockReason,
              warnings: req.enforcementResult.warnings,
              violationsCount: req.piiViolations.length,
              dataModified: req.enforcementResult.modified,
              processingTimeMs: Date.now() - req.startTime
            });

            logger.info('Enforcement action logged to database', {
              correlationId: req.correlationId,
              provider,
              endpoint,
              action: req.enforcementResult.action,
              appliedActions: req.enforcementResult.appliedActions
            });
          } catch (enforcementError) {
            logger.error('Failed to log enforcement action to database', {
              correlationId: req.correlationId,
              action: req.enforcementResult.action,
              error: enforcementError.message
            });
          }
        }
        
        logger.info('AI request logged to database', {
          correlationId: req.correlationId,
          provider,
          endpoint,
          hasPersonalData,
          violationsCount: req.piiViolations ? req.piiViolations.length : 0
        });
      } catch (error) {
        logger.error('Failed to log AI request to database', {
          correlationId: req.correlationId,
          error: error.message
        });
      }
    }
  });

  next();
});

// Transform authentication headers for Anthropic
const transformAuthForAnthropic = (proxyReq, req, res) => {
  const authHeader = req.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const apiKey = authHeader.substring(7);
    proxyReq.setHeader('x-api-key', apiKey);
    proxyReq.removeHeader('Authorization');
    logger.info('Transformed Bearer token to x-api-key for Anthropic', {
      correlationId: req.correlationId,
      hasApiKey: !!apiKey
    });
  }
  proxyReq.setHeader('anthropic-version', '2023-06-01');
};

// PII Detection middleware for AI proxy endpoints
// This middleware parses and stores the body for PII scanning while preserving it for proxying
app.use(['/v1/chat/completions', '/v1/embeddings', '/v1/messages', '/chat/completions', '/embeddings'], async (req, res, next) => {
  logger.info('PII middleware triggered', {
    correlationId: req.correlationId,
    method: req.method,
    url: req.url,
    contentType: req.get('Content-Type')
  });
  
  if (req.method === 'POST' || req.method === 'PUT') {
    try {
      // Get raw body buffer
      const buffer = await getRawBody(req, {
        length: req.get('Content-Length'),
        limit: '10mb',
        encoding: 'utf8'
      });
      
      const bodyString = buffer.toString();
      
      // Parse JSON body for PII scanning
      req.body = JSON.parse(bodyString);
      // Store raw body for proxy streaming
      req.rawBody = bodyString;
      
      // Initialize PII tracking and scan immediately
      req.piiViolations = [];
      req.enforcementResult = null;
      
      if (req.body && typeof req.body === 'object') {
        const requestViolations = piiDetector.scanObject(req.body, 'request_body', req.correlationId);
        req.piiViolations.push(...requestViolations);
        
        if (requestViolations.length > 0) {
          // Apply enforcement policy
          req.enforcementResult = piiDetector.applyEnforcement(req.body, requestViolations, 'request');
          
          logger.warn('PII detected in AI request - applying enforcement', {
            correlationId: req.correlationId,
            violations: requestViolations.length,
            types: requestViolations.map(v => v.type),
            riskLevels: requestViolations.map(v => v.risk_level),
            enforcementMode: piiDetector.getEnforcementMode(),
            action: req.enforcementResult.action,
            appliedActions: req.enforcementResult.appliedActions
          });

          // Block request if enforcement says to block
          if (req.enforcementResult.action === 'block') {
            logger.error('Request blocked due to PII policy violation', {
              correlationId: req.correlationId,
              reason: req.enforcementResult.blockReason,
              violations: requestViolations.map(v => ({
                type: v.type,
                risk: v.risk_level,
                category: v.category
              }))
            });

            return res.status(403).json({
              error: 'Request blocked by GDPR policy',
              message: req.enforcementResult.blockReason,
              correlation_id: req.correlationId,
              policy_violations: requestViolations.map(v => ({
                type: v.type,
                risk_level: v.risk_level,
                category: v.category,
                gdpr_article: v.gdpr_article
              }))
            });
          }

          // Use sanitized data if enforcement modified it
          if (req.enforcementResult.modified) {
            req.body = req.enforcementResult.sanitizedData;
            req.rawBody = JSON.stringify(req.body);
            
            logger.info('Request data sanitized by enforcement policy', {
              correlationId: req.correlationId,
              originalSize: bodyString.length,
              sanitizedSize: req.rawBody.length,
              appliedActions: req.enforcementResult.appliedActions
            });
          }

          // Log warnings
          if (req.enforcementResult.warnings && req.enforcementResult.warnings.length > 0) {
            req.enforcementResult.warnings.forEach(warning => {
              logger.warn('GDPR Policy Warning', {
                correlationId: req.correlationId,
                warning
              });
            });
          }
        }
      }
      
      logger.info('Body parsed for PII scanning', {
        correlationId: req.correlationId,
        bodySize: bodyString.length,
        hasBody: !!req.body,
        piiViolations: req.piiViolations.length
      });
      
      next();
    } catch (error) {
      logger.error('Failed to parse request body for PII scanning', {
        correlationId: req.correlationId,
        error: error.message
      });
      // Continue anyway
      req.body = {};
      req.piiViolations = [];
      req.rawBody = '';
      next();
    }
  } else {
    req.piiViolations = [];
    next();
  }
});

// OpenAI Models endpoint  
app.use('/v1/models', createProxyMiddleware({
  target: 'https://api.openai.com',
  changeOrigin: true,
  secure: true,
  timeout: 30000,
  proxyTimeout: 30000,
  followRedirects: true,
  xfwd: false,
  headers: {
    'Connection': 'keep-alive',
    'Accept-Encoding': 'gzip, deflate'
  },
  onProxyReq: (proxyReq, req, res) => {
    logger.info('Proxying to OpenAI Models', {
      correlationId: req.correlationId,
      target: 'https://api.openai.com/v1/models',
      method: req.method,
      hasAuth: !!req.get('Authorization')
    });
  },
  onProxyRes: (proxyRes, req, res) => {
    logger.info('OpenAI Models response received', {
      correlationId: req.correlationId,
      statusCode: proxyRes.statusCode
    });
  },
  onError: (err, req, res) => {
    logger.error('OpenAI Models proxy error', {
      correlationId: req.correlationId,
      error: err.message,
      code: err.code
    });
    
    let statusCode = 500;
    if (err.code === 'ECONNRESET' || err.message.includes('socket hang up')) {
      statusCode = 502;
    } else if (err.code === 'ETIMEDOUT' || err.message.includes('timeout')) {
      statusCode = 504;
    }
    
    if (!res.headersSent) {
      res.status(statusCode).json({
        error: 'Gateway error',
        correlationId: req.correlationId
      });
    }
  }
}));

// OpenAI Chat Completions endpoint
app.use('/v1/chat/completions', createProxyMiddleware({
  target: 'https://api.openai.com',
  changeOrigin: true,
  secure: true,
  timeout: 120000, // 2 minutes for chat completions  
  proxyTimeout: 120000,
  onProxyReq: (proxyReq, req, res) => {
    // DEBUG: Log that we're in the proxy handler (PII scanning already done in middleware)
    logger.info('DEBUG: onProxyReq called for chat completions', {
      correlationId: req.correlationId,
      hasBody: !!req.body,
      hasRawBody: !!req.rawBody,
      piiViolationsCount: req.piiViolations ? req.piiViolations.length : 0,
      method: req.method,
      contentType: req.get('Content-Type')
    });
    
    // Re-stream the raw body for POST/PUT requests (PII already scanned in middleware)
    if (req.rawBody && (req.method === 'POST' || req.method === 'PUT')) {
      try {
        proxyReq.setHeader('Content-Type', 'application/json');
        proxyReq.setHeader('Content-Length', Buffer.byteLength(req.rawBody));
        proxyReq.write(req.rawBody);
        
        logger.debug('Request body re-streamed to proxy', {
          correlationId: req.correlationId,
          bodySize: req.rawBody.length,
          piiViolations: req.piiViolations ? req.piiViolations.length : 0
        });
      } catch (error) {
        logger.error('Failed to re-stream body to proxy', {
          correlationId: req.correlationId,
          error: error.message
        });
      }
    }
    
    logger.info('GDPR AUDIT - OpenAI Chat Request', {
      correlationId: req.correlationId,
      target: 'https://api.openai.com/v1/chat/completions',
      method: req.method,
      hasAuth: !!req.get('Authorization'),
      userAgent: req.get('User-Agent'),
      contentType: req.get('Content-Type'),
      contentLength: req.get('Content-Length'),
      piiViolations: req.piiViolations ? req.piiViolations.length : 0,
      timestamp: new Date().toISOString()
    });
  },
  onProxyRes: (proxyRes, req, res) => {
    // Initialize response violations array if not exists
    if (!req.piiViolations) req.piiViolations = [];
    
    // Buffer response data for PII scanning
    let responseBody = '';
    proxyRes.on('data', (chunk) => {
      responseBody += chunk.toString();
    });
    
    proxyRes.on('end', async () => {
      // Scan response for PII
      if (responseBody && proxyRes.headers['content-type']?.includes('application/json')) {
        try {
          const responseData = JSON.parse(responseBody);
          const responseViolations = piiDetector.scanObject(responseData, 'response_body', req.correlationId);
          req.piiViolations.push(...responseViolations);
          
          if (responseViolations.length > 0) {
            logger.warn('PII detected in AI response', {
              correlationId: req.correlationId,
              violations: responseViolations.length,
              types: responseViolations.map(v => v.type),
              riskLevels: responseViolations.map(v => v.risk_level)
            });
          }
        } catch (parseError) {
          logger.debug('Could not parse response for PII scanning', {
            correlationId: req.correlationId,
            error: parseError.message
          });
        }
      }
      
      // Log all PII violations to database
      if (req.piiViolations.length > 0) {
        try {
          for (const violation of req.piiViolations) {
            await db.logPIIViolation(
              req.correlationId,
              violation.type,
              violation.category,
              violation.detected_text,
              violation.redacted_text,
              violation.confidence_score,
              violation.field_path,
              violation.data_source,
              violation.gdpr_article
            );
          }
          
          logger.info('PII violations logged to database', {
            correlationId: req.correlationId,
            violations: req.piiViolations.length
          });
        } catch (dbError) {
          logger.error('Failed to log PII violations to database', {
            correlationId: req.correlationId,
            error: dbError.message
          });
        }
      }
    });
    
    logger.info('GDPR AUDIT - OpenAI Chat Response', {
      correlationId: req.correlationId,
      statusCode: proxyRes.statusCode,
      contentType: proxyRes.headers['content-type'],
      timestamp: new Date().toISOString()
    });
  },
  onError: (err, req, res) => {
    logger.error('OpenAI Chat Completions proxy error', {
      correlationId: req.correlationId,
      error: err.message,
      code: err.code,
      stack: err.stack
    });
    
    // Provide more helpful error messages
    let errorMessage = 'Gateway error';
    let errorDetail = err.message;
    let statusCode = 500;
    
    if (err.code === 'ECONNRESET' || err.message.includes('socket hang up')) {
      errorMessage = 'Connection to OpenAI failed';
      errorDetail = 'Network connection was reset during request';
      statusCode = 502;
    } else if (err.code === 'ETIMEDOUT' || err.message.includes('timeout')) {
      errorMessage = 'Request timeout';
      errorDetail = 'Request to OpenAI timed out';
      statusCode = 504;
    } else if (err.code === 'ENOTFOUND' || err.message.includes('ENOTFOUND')) {
      errorMessage = 'DNS resolution failed';
      errorDetail = 'Could not resolve OpenAI API hostname';
      statusCode = 502;
    }
    
    if (!res.headersSent) {
      res.status(statusCode).json({
        error: {
          message: errorMessage,
          detail: errorDetail,
          correlationId: req.correlationId,
          suggestion: 'Check your OpenAI API key is valid and active'
        }
      });
    }
  }
}));

// OpenAI Embeddings endpoint
app.use('/v1/embeddings', createProxyMiddleware({
  target: 'https://api.openai.com',
  changeOrigin: true,
  secure: true,
  timeout: 120000,
  proxyTimeout: 120000,
  followRedirects: true,
  xfwd: false,
  headers: {
    'Connection': 'keep-alive',
    'Accept-Encoding': 'gzip, deflate'
  },
  onProxyReq: (proxyReq, req, res) => {
    logger.info('GDPR AUDIT - OpenAI Embeddings Request', {
      correlationId: req.correlationId,
      target: 'https://api.openai.com/v1/embeddings',
      method: req.method,
      hasAuth: !!req.get('Authorization'),
      contentType: req.get('Content-Type'),
      contentLength: req.get('Content-Length'),
      timestamp: new Date().toISOString()
    });
  },
  onProxyRes: (proxyRes, req, res) => {
    logger.info('GDPR AUDIT - OpenAI Embeddings Response', {
      correlationId: req.correlationId,
      statusCode: proxyRes.statusCode,
      timestamp: new Date().toISOString()
    });
  },
  onError: (err, req, res) => {
    logger.error('OpenAI Embeddings proxy error', {
      correlationId: req.correlationId,
      error: err.message,
      code: err.code
    });
    
    let statusCode = 500;
    if (err.code === 'ECONNRESET' || err.message.includes('socket hang up')) {
      statusCode = 502;
    } else if (err.code === 'ETIMEDOUT' || err.message.includes('timeout')) {
      statusCode = 504;
    }
    
    if (!res.headersSent) {
      res.status(statusCode).json({
        error: 'Gateway error',
        correlationId: req.correlationId
      });
    }
  }
}));

// Anthropic Messages endpoint
app.use('/v1/messages', createProxyMiddleware({
  target: 'https://api.anthropic.com',
  changeOrigin: true,
  onProxyReq: (proxyReq, req, res) => {
    transformAuthForAnthropic(proxyReq, req, res);
    
    logger.info('GDPR AUDIT - Anthropic Messages Request', {
      correlationId: req.correlationId,
      target: 'https://api.anthropic.com/v1/messages',
      method: req.method,
      hasApiKey: !!proxyReq.getHeader('x-api-key'),
      timestamp: new Date().toISOString()
    });
  },
  onProxyRes: (proxyRes, req, res) => {
    logger.info('GDPR AUDIT - Anthropic Messages Response', {
      correlationId: req.correlationId,
      statusCode: proxyRes.statusCode,
      timestamp: new Date().toISOString()
    });
  },
  onError: (err, req, res) => {
    logger.error('Anthropic Messages proxy error', {
      correlationId: req.correlationId,
      error: err.message
    });
    res.status(500).json({
      error: 'Gateway error',
      correlationId: req.correlationId
    });
  }
}));

// Dashboard logs API endpoint - enhanced with database integration
app.get('/api/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const source = req.query.source || 'memory'; // 'memory' or 'database'
    
    let logs;
    
    if (source === 'database') {
      // Get logs from database
      const dbLogs = await db.getRecentAuditLogs({ limit });
      logs = dbLogs.map(log => ({
        timestamp: log.audit_timestamp,
        level: 'info',
        message: `${log.method} ${log.endpoint} - ${log.response_status}`,
        correlationId: log.correlation_id,
        method: log.method,
        endpoint: log.endpoint,
        provider: log.provider,
        responseStatus: log.response_status,
        responseTime: log.response_time_ms ? `${log.response_time_ms}ms` : null,
        isPersonalData: log.is_personal_data,
        errorMessage: log.error_message
      }));
    } else {
      // Get logs from memory (existing behavior)
      logs = recentLogs.slice(-limit);
    }
    
    logger.info('Dashboard logs requested', {
      correlationId: req.correlationId,
      logCount: logs.length,
      requestedLimit: limit,
      source
    });
    
    res.json(logs);
  } catch (error) {
    logger.error('Failed to retrieve logs', {
      correlationId: req.correlationId,
      error: error.message
    });
    
    res.status(500).json({
      error: 'Failed to retrieve logs',
      correlationId: req.correlationId
    });
  }
});

// Database audit logs API
app.get('/api/audit-logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const provider = req.query.provider || null;
    const timeRange = req.query.timeRange || '24 hours';
    
    const auditLogs = await db.getRecentAuditLogs({
      limit,
      provider,
      timeRange
    });
    
    logger.info('Audit logs retrieved from database', {
      correlationId: req.correlationId,
      count: auditLogs.length,
      provider,
      timeRange
    });
    
    res.json({
      logs: auditLogs,
      metadata: {
        count: auditLogs.length,
        limit,
        provider,
        timeRange,
        source: 'database'
      }
    });
  } catch (error) {
    logger.error('Failed to retrieve audit logs', {
      correlationId: req.correlationId,
      error: error.message
    });
    
    res.status(500).json({
      error: 'Failed to retrieve audit logs',
      correlationId: req.correlationId
    });
  }
});

// PII violations API
app.get('/api/violations', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const timeRange = req.query.timeRange || '24 hours';
    
    const violations = await db.getRecentViolations({
      limit,
      timeRange
    });
    
    logger.info('PII violations retrieved from database', {
      correlationId: req.correlationId,
      count: violations.length,
      timeRange
    });
    
    res.json({
      violations,
      metadata: {
        count: violations.length,
        limit,
        timeRange,
        source: 'database'
      }
    });
  } catch (error) {
    logger.error('Failed to retrieve PII violations', {
      correlationId: req.correlationId,
      error: error.message
    });
    
    res.status(500).json({
      error: 'Failed to retrieve PII violations',
      correlationId: req.correlationId
    });
  }
});

// Get detailed violation information
app.get('/api/violations/:id', async (req, res) => {
  try {
    const violationId = req.params.id;
    
    logger.info('Violation detail requested', {
      correlationId: req.correlationId,
      violationId
    });

    const violationDetail = await db.getViolationDetail(violationId);

    if (!violationDetail) {
      return res.status(404).json({
        error: 'Violation not found',
        violationId,
        correlationId: req.correlationId
      });
    }

    res.json({
      violation: violationDetail,
      correlationId: req.correlationId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to retrieve violation detail', {
      correlationId: req.correlationId,
      violationId: req.params.id,
      error: error.message
    });
    
    res.status(500).json({
      error: 'Failed to retrieve violation detail',
      correlationId: req.correlationId
    });
  }
});

// PII Detection status and statistics
app.get('/api/pii-status', (req, res) => {
  try {
    const stats = piiDetector.getStats();
    
    logger.info('PII detection status requested', {
      correlationId: req.correlationId,
      enabled: stats.enabled
    });
    
    res.json({
      detection_engine: {
        enabled: stats.enabled,
        patterns_loaded: stats.patterns_loaded,
        confidence_threshold: stats.confidence_threshold,
        categories: stats.categories
      },
      policy: {
        loaded: stats.policy_loaded,
        file_path: '/app/config/policy.json'
      },
      compliance: {
        gdpr_articles: ['Article 6', 'Article 9'],
        risk_levels: ['low', 'medium', 'high'],
        data_categories: ['contact', 'financial', 'identifier', 'special_category']
      },
      features: {
        request_scanning: true,
        response_scanning: true,
        database_logging: true,
        whitelist_filtering: true,
        format_preserving_redaction: true
      }
    });
  } catch (error) {
    logger.error('Failed to get PII detection status', {
      correlationId: req.correlationId,
      error: error.message
    });
    
    res.status(500).json({
      error: 'Failed to get PII detection status',
      correlationId: req.correlationId
    });
  }
});

// API endpoints discovery
app.get('/api/endpoints', (req, res) => {
  res.json({
    gateway: 'RunSafe GDPR Compliance Gateway',
    version: '1.0.0',
    correlationId: req.correlationId,
    mode: 'api-proxy',
    usage: {
      note: 'For Stage 1: Use gateway endpoints directly in n8n workflows',
      openai_base_url: 'http://gateway:8080 (recommended)',
      openai_base_url_alternative: 'http://gateway:8080/v1 (also supported)',
      anthropic_base_url: 'http://gateway:8080/v1'
    },
    supportedEndpoints: {
      openai: {
        baseUrl: 'https://api.openai.com',
        monitored: [
          '/v1/chat/completions',
          '/v1/embeddings'
        ],
        transparent: [
          '/v1/models'
        ]
      },
      anthropic: {
        baseUrl: 'https://api.anthropic.com', 
        monitored: [
          '/v1/messages'
        ]
      }
    }
  });
});

// Policy enforcement configuration endpoints
app.get('/api/policy/enforcement', (req, res) => {
  try {
    const enforcementMode = piiDetector.getEnforcementMode();
    const policyConfig = piiDetector.policy?.gdpr || {};
    
    res.json({
      correlationId: req.correlationId,
      enforcement: {
        current_mode: enforcementMode,
        available_modes: ['monitor', 'warn', 'block', 'sanitize'],
        actions: policyConfig.actions || {},
        max_retention_days: policyConfig.max_retention_days || 1095,
        block_special_categories: policyConfig.block_special_categories || [],
        mask_fields: policyConfig.mask_fields || []
      },
      statistics: piiDetector.getStats()
    });
  } catch (error) {
    logger.error('Failed to get enforcement configuration', {
      correlationId: req.correlationId,
      error: error.message
    });
    
    res.status(500).json({
      error: 'Failed to get enforcement configuration',
      correlationId: req.correlationId
    });
  }
});

app.post('/api/policy/enforcement/mode', express.json(), (req, res) => {
  try {
    const { mode, actions } = req.body;
    
    // Validate mode
    const validModes = ['monitor', 'warn', 'block', 'sanitize'];
    if (!validModes.includes(mode)) {
      return res.status(400).json({
        error: 'Invalid enforcement mode',
        validModes,
        correlationId: req.correlationId
      });
    }

    // Update policy configuration
    if (!piiDetector.policy.gdpr) {
      piiDetector.policy.gdpr = {};
    }
    
    piiDetector.policy.gdpr.mode = mode;
    
    if (actions) {
      piiDetector.policy.gdpr.actions = { ...piiDetector.policy.gdpr.actions, ...actions };
    }

    logger.info('Enforcement mode updated', {
      correlationId: req.correlationId,
      newMode: mode,
      actions,
      updatedBy: req.ip
    });

    res.json({
      success: true,
      correlationId: req.correlationId,
      enforcement: {
        mode: piiDetector.getEnforcementMode(),
        actions: piiDetector.policy.gdpr.actions
      }
    });
  } catch (error) {
    logger.error('Failed to update enforcement mode', {
      correlationId: req.correlationId,
      error: error.message
    });
    
    res.status(500).json({
      error: 'Failed to update enforcement mode',
      correlationId: req.correlationId
    });
  }
});

app.get('/api/policy/test', (req, res) => {
  try {
    const testResults = piiDetector.runTests();
    
    res.json({
      correlationId: req.correlationId,
      test_results: testResults,
      enforcement_mode: piiDetector.getEnforcementMode(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to run PII detection tests', {
      correlationId: req.correlationId,
      error: error.message
    });
    
    res.status(500).json({
      error: 'Failed to run tests',
      correlationId: req.correlationId
    });
  }
});

app.post('/api/policy/test-enforcement', express.json(), (req, res) => {
  try {
    const { data, mode } = req.body;
    
    if (!data) {
      return res.status(400).json({
        error: 'Test data is required',
        correlationId: req.correlationId
      });
    }

    // Temporarily change mode for testing if provided
    const originalMode = piiDetector.getEnforcementMode();
    if (mode && mode !== originalMode) {
      piiDetector.policy.gdpr.mode = mode;
    }

    try {
      // Scan for PII violations
      const violations = piiDetector.scanObject(data, 'test_data', req.correlationId);
      
      // Apply enforcement
      const enforcementResult = piiDetector.applyEnforcement(data, violations, 'test');
      
      res.json({
        correlationId: req.correlationId,
        test_data: data,
        violations_detected: violations.length,
        violations: violations.map(v => ({
          type: v.type,
          risk_level: v.risk_level,
          category: v.category,
          detected_text: v.detected_text,
          redacted_text: v.redacted_text
        })),
        enforcement_result: {
          action: enforcementResult.action,
          modified: enforcementResult.modified,
          block_reason: enforcementResult.blockReason,
          warnings: enforcementResult.warnings,
          applied_actions: enforcementResult.appliedActions
        },
        sanitized_data: enforcementResult.sanitizedData,
        test_mode: mode || originalMode,
        timestamp: new Date().toISOString()
      });
    } finally {
      // Restore original mode
      if (mode && mode !== originalMode) {
        piiDetector.policy.gdpr.mode = originalMode;
      }
    }
  } catch (error) {
    logger.error('Failed to test enforcement', {
      correlationId: req.correlationId,
      error: error.message
    });
    
    res.status(500).json({
      error: 'Failed to test enforcement',
      correlationId: req.correlationId
    });
  }
});

// Health check endpoint with database status
app.get('/health', async (req, res) => {
  try {
    const dbHealth = await db.healthCheck();
    
    res.json({
      status: dbHealth.healthy ? 'healthy' : 'degraded',
      gateway: 'RunSafe GDPR Compliance Gateway',
      correlationId: req.correlationId,
      database: {
        status: dbHealth.healthy ? 'connected' : 'disconnected',
        timestamp: dbHealth.timestamp,
        error: dbHealth.error || null
      },
      features: {
        audit_logging: dbHealth.healthy,
        in_memory_logs: true,
        pii_detection: false // Stage 3
      }
    });
  } catch (error) {
    logger.error('Health check failed', {
      correlationId: req.correlationId,
      error: error.message
    });
    
    res.status(503).json({
      status: 'unhealthy',
      gateway: 'RunSafe GDPR Compliance Gateway',
      correlationId: req.correlationId,
      error: error.message
    });
  }
});

// Root-level OpenAI endpoints (fallback for Base URL without /v1)
app.use('/chat/completions', createProxyMiddleware({
  target: 'https://api.openai.com/v1',
  changeOrigin: true,
  secure: true,
  timeout: 120000, // 2 minutes for chat completions
  proxyTimeout: 120000,
  logLevel: 'debug',
  onProxyReq: (proxyReq, req, res) => {
    // DEBUG: Log that we're in the root-level proxy handler (PII scanning already done in middleware)
    logger.info('DEBUG: onProxyReq called for chat completions (root-level)', {
      correlationId: req.correlationId,
      hasBody: !!req.body,
      hasRawBody: !!req.rawBody,
      piiViolationsCount: req.piiViolations ? req.piiViolations.length : 0,
      method: req.method
    });
    
    // Re-stream the raw body for POST requests (PII already scanned in middleware)
    if (req.rawBody && req.method === 'POST') {
      try {
        proxyReq.setHeader('Content-Type', 'application/json');
        proxyReq.setHeader('Content-Length', Buffer.byteLength(req.rawBody));
        proxyReq.write(req.rawBody);
      } catch (error) {
        logger.error('Failed to re-stream body to proxy (root-level)', {
          correlationId: req.correlationId,
          error: error.message
        });
      }
    }
    
    logger.info('GDPR AUDIT - OpenAI Chat Request (root-level)', {
      correlationId: req.correlationId,
      target: 'https://api.openai.com/v1/chat/completions',
      method: req.method,
      hasAuth: !!req.get('Authorization'),
      userAgent: req.get('User-Agent'),
      bodySize: req.rawBody ? req.rawBody.length : 0,
      piiViolations: req.piiViolations ? req.piiViolations.length : 0,
      timestamp: new Date().toISOString()
    });
  },
  onProxyRes: (proxyRes, req, res) => {
    logger.info('GDPR AUDIT - OpenAI Chat Response (root-level)', {
      correlationId: req.correlationId,
      statusCode: proxyRes.statusCode,
      contentType: proxyRes.headers['content-type'],
      timestamp: new Date().toISOString()
    });
  },
  onError: (err, req, res) => {
    logger.error('OpenAI Chat Completions proxy error (root-level)', {
      correlationId: req.correlationId,
      error: err.message,
      code: err.code
    });
    
    if (!res.headersSent) {
      res.status(502).json({
        error: {
          message: 'Connection to OpenAI failed',
          detail: err.message,
          correlationId: req.correlationId,
          suggestion: 'Check your OpenAI API key is valid and active'
        }
      });
    }
  }
}));

app.use('/models', createProxyMiddleware({
  target: 'https://api.openai.com/v1',
  changeOrigin: true,
  secure: true,
  timeout: 30000,
  proxyTimeout: 30000,
  followRedirects: true,
  xfwd: false,
  headers: {
    'Connection': 'keep-alive',
    'Accept-Encoding': 'gzip, deflate'
  },
  onProxyReq: (proxyReq, req, res) => {
    logger.info('Proxying to OpenAI Models (root-level)', {
      correlationId: req.correlationId,
      target: 'https://api.openai.com/v1/models',
      method: req.method,
      hasAuth: !!req.get('Authorization')
    });
  },
  onProxyRes: (proxyRes, req, res) => {
    logger.info('OpenAI Models response received (root-level)', {
      correlationId: req.correlationId,
      statusCode: proxyRes.statusCode
    });
  },
  onError: (err, req, res) => {
    logger.error('OpenAI Models proxy error (root-level)', {
      correlationId: req.correlationId,
      error: err.message,
      code: err.code
    });
    
    let statusCode = 500;
    if (err.code === 'ECONNRESET' || err.message.includes('socket hang up')) {
      statusCode = 502;
    } else if (err.code === 'ETIMEDOUT' || err.message.includes('timeout')) {
      statusCode = 504;
    }
    
    if (!res.headersSent) {
      res.status(statusCode).json({
        error: 'Gateway error',
        correlationId: req.correlationId
      });
    }
  }
}));

app.use('/embeddings', createProxyMiddleware({
  target: 'https://api.openai.com/v1',
  changeOrigin: true,
  secure: true,
  timeout: 120000,
  proxyTimeout: 120000,
  followRedirects: true,
  xfwd: false,
  headers: {
    'Connection': 'keep-alive',
    'Accept-Encoding': 'gzip, deflate'
  },
  onProxyReq: (proxyReq, req, res) => {
    logger.info('GDPR AUDIT - OpenAI Embeddings Request (root-level)', {
      correlationId: req.correlationId,
      target: 'https://api.openai.com/v1/embeddings',
      method: req.method,
      hasAuth: !!req.get('Authorization'),
      contentType: req.get('Content-Type'),
      contentLength: req.get('Content-Length'),
      timestamp: new Date().toISOString()
    });
  },
  onProxyRes: (proxyRes, req, res) => {
    logger.info('GDPR AUDIT - OpenAI Embeddings Response (root-level)', {
      correlationId: req.correlationId,
      statusCode: proxyRes.statusCode,
      timestamp: new Date().toISOString()
    });
  },
  onError: (err, req, res) => {
    logger.error('OpenAI Embeddings proxy error (root-level)', {
      correlationId: req.correlationId,
      error: err.message,
      code: err.code
    });
    
    let statusCode = 500;
    if (err.code === 'ECONNRESET' || err.message.includes('socket hang up')) {
      statusCode = 502;
    } else if (err.code === 'ETIMEDOUT' || err.message.includes('timeout')) {
      statusCode = 504;
    }
    
    if (!res.headersSent) {
      res.status(statusCode).json({
        error: 'Gateway error',
        correlationId: req.correlationId
      });
    }
  }
}));

// Export violations as CSV
app.get('/api/export/violations/csv', async (req, res) => {
  try {
    const {
      riskLevel = 'all',
      violationType = 'all',
      provider = 'all',
      gdprArticle = 'all',
      timeRange = '30 days'
    } = req.query;

    logger.info('CSV export requested', {
      correlationId: req.correlationId,
      filters: { riskLevel, violationType, provider, gdprArticle, timeRange }
    });

    // Get violations data with same filtering as violations API
    const violations = await db.getRecentViolations({
      limit: 10000, // Export all violations
      timeRange
    });

    // Apply additional filters
    let filteredViolations = violations;
    if (riskLevel !== 'all') {
      filteredViolations = filteredViolations.filter(v => v.risk_level === riskLevel);
    }
    if (violationType !== 'all') {
      filteredViolations = filteredViolations.filter(v => v.violation_type === violationType);
    }
    if (provider !== 'all') {
      filteredViolations = filteredViolations.filter(v => v.provider === provider);
    }
    if (gdprArticle !== 'all') {
      filteredViolations = filteredViolations.filter(v => v.gdpr_article === gdprArticle);
    }

    // Generate CSV content
    const csvHeaders = [
      'Violation ID',
      'Detected At',
      'Violation Type',
      'Violation Category', 
      'Risk Level',
      'Detected Text',
      'Redacted Text',
      'Confidence Score',
      'Field Path',
      'Data Source',
      'GDPR Article',
      'Legal Basis',
      'Correlation ID',
      'Endpoint',
      'Provider'
    ];

    let csvContent = csvHeaders.join(',') + '\n';

    filteredViolations.forEach(violation => {
      const row = [
        violation.violation_id,
        violation.detected_at,
        violation.violation_type,
        violation.violation_category,
        violation.risk_level,
        `"${(violation.detected_text || '').replace(/"/g, '""')}"`,
        `"${(violation.redacted_text || '').replace(/"/g, '""')}"`,
        violation.confidence_score || '',
        `"${(violation.field_path || '').replace(/"/g, '""')}"`,
        violation.data_source,
        violation.gdpr_article || '',
        `"${(violation.legal_basis || '').replace(/"/g, '""')}"`,
        violation.correlation_id,
        violation.endpoint,
        violation.provider
      ];
      csvContent += row.join(',') + '\n';
    });

    // Set CSV headers
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `runsafe-violations-${timestamp}.csv`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Pragma', 'no-cache');

    logger.info('CSV export completed', {
      correlationId: req.correlationId,
      violationCount: filteredViolations.length,
      filename
    });

    res.send(csvContent);

  } catch (error) {
    logger.error('CSV export failed', {
      correlationId: req.correlationId,
      error: error.message
    });

    res.status(500).json({
      error: 'Failed to export violations as CSV',
      correlationId: req.correlationId,
      message: error.message
    });
  }
});

// Export violations as PDF (basic HTML to PDF conversion)
app.get('/api/export/violations/pdf', async (req, res) => {
  try {
    const {
      riskLevel = 'all',
      violationType = 'all', 
      provider = 'all',
      gdprArticle = 'all',
      timeRange = '30 days'
    } = req.query;

    logger.info('PDF export requested', {
      correlationId: req.correlationId,
      filters: { riskLevel, violationType, provider, gdprArticle, timeRange }
    });

    // Get violations data
    const violations = await db.getRecentViolations({
      limit: 10000,
      timeRange
    });

    // Apply filters (same as CSV)
    let filteredViolations = violations;
    if (riskLevel !== 'all') {
      filteredViolations = filteredViolations.filter(v => v.risk_level === riskLevel);
    }
    if (violationType !== 'all') {
      filteredViolations = filteredViolations.filter(v => v.violation_type === violationType);
    }
    if (provider !== 'all') {
      filteredViolations = filteredViolations.filter(v => v.provider === provider);
    }
    if (gdprArticle !== 'all') {
      filteredViolations = filteredViolations.filter(v => v.gdpr_article === gdprArticle);
    }

    // Calculate statistics
    const stats = {
      total: filteredViolations.length,
      high: filteredViolations.filter(v => v.risk_level === 'high').length,
      medium: filteredViolations.filter(v => v.risk_level === 'medium').length,
      low: filteredViolations.filter(v => v.risk_level === 'low').length,
      byType: {}
    };

    filteredViolations.forEach(v => {
      stats.byType[v.violation_type] = (stats.byType[v.violation_type] || 0) + 1;
    });

    // Generate HTML content for PDF
    const reportDate = new Date().toISOString().split('T')[0];
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>RunSafe GDPR Compliance Report</title>
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
            .stats { display: flex; gap: 20px; margin: 20px 0; }
            .stat-card { border: 1px solid #ddd; padding: 15px; border-radius: 5px; min-width: 120px; }
            .high-risk { background-color: #fee; border-color: #fcc; }
            .medium-risk { background-color: #fef5e7; border-color: #f4b942; }
            .low-risk { background-color: #f0f8ff; border-color: #87ceeb; }
            .violations-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            .violations-table th, .violations-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            .violations-table th { background-color: #f2f2f2; font-weight: bold; }
            .risk-high { background-color: #fee; }
            .risk-medium { background-color: #fef5e7; }
            .risk-low { background-color: #f0f8ff; }
            .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>RunSafe GDPR Compliance Report</h1>
            <p><strong>Generated:</strong> ${reportDate}</p>
            <p><strong>Time Range:</strong> ${timeRange}</p>
            <p><strong>Filters:</strong> Risk Level: ${riskLevel}, Type: ${violationType}, Provider: ${provider}, GDPR Article: ${gdprArticle}</p>
        </div>
        
        <div class="stats">
            <div class="stat-card">
                <h3>Total Violations</h3>
                <h2>${stats.total}</h2>
            </div>
            <div class="stat-card high-risk">
                <h3>High Risk</h3>
                <h2>${stats.high}</h2>
            </div>
            <div class="stat-card medium-risk">
                <h3>Medium Risk</h3>
                <h2>${stats.medium}</h2>
            </div>
            <div class="stat-card low-risk">
                <h3>Low Risk</h3>
                <h2>${stats.low}</h2>
            </div>
        </div>

        <h2>Violation Details</h2>
        <table class="violations-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Risk</th>
                    <th>Provider</th>
                    <th>Detected Data</th>
                    <th>GDPR Article</th>
                    <th>Confidence</th>
                </tr>
            </thead>
            <tbody>
                ${filteredViolations.map(v => `
                    <tr class="risk-${v.risk_level}">
                        <td>${new Date(v.detected_at).toLocaleDateString()}</td>
                        <td>${v.violation_type}</td>
                        <td>${v.risk_level.toUpperCase()}</td>
                        <td>${v.provider}</td>
                        <td>${v.redacted_text || v.detected_text || 'N/A'}</td>
                        <td>${v.gdpr_article || 'N/A'}</td>
                        <td>${v.confidence_score ? (v.confidence_score * 100).toFixed(1) + '%' : 'N/A'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>

        <div class="footer">
            <p><strong>RunSafe GDPR Compliance Gateway</strong></p>
            <p>This report contains sensitive PII detection data. Handle according to your organization's data protection policies.</p>
            <p>Report ID: ${req.correlationId}</p>
        </div>
    </body>
    </html>`;

    // Set PDF headers  
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `runsafe-compliance-report-${timestamp}.html`;
    
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Pragma', 'no-cache');

    logger.info('PDF export completed (HTML format)', {
      correlationId: req.correlationId,
      violationCount: filteredViolations.length,
      filename
    });

    res.send(htmlContent);

  } catch (error) {
    logger.error('PDF export failed', {
      correlationId: req.correlationId,
      error: error.message
    });

    res.status(500).json({
      error: 'Failed to export violations as PDF',
      correlationId: req.correlationId,
      message: error.message
    });
  }
});

// GDPR Article 30 compliance report
app.get('/api/export/gdpr-article-30', async (req, res) => {
  try {
    const {
      timeRange = '30 days',
      organizationName = 'Hotel Organization',
      controllerName = 'Data Protection Officer',
      reportingPeriod = new Date().toISOString().split('T')[0]
    } = req.query;

    logger.info('GDPR Article 30 report requested', {
      correlationId: req.correlationId,
      timeRange,
      organizationName
    });

    // Get all violations for the time period
    const violations = await db.getRecentViolations({
      limit: 10000,
      timeRange
    });

    // Analyze violations by type and legal basis
    const violationStats = {};
    const legalBasisStats = {};
    let totalPersonalDataRequests = 0;

    violations.forEach(violation => {
      // Count by violation type
      if (!violationStats[violation.violation_type]) {
        violationStats[violation.violation_type] = {
          count: 0,
          gdprArticle: violation.gdpr_article,
          dataCategory: violation.violation_category,
          examples: []
        };
      }
      violationStats[violation.violation_type].count++;
      violationStats[violation.violation_type].examples.push(violation.redacted_text || '[REDACTED]');

      // Count by legal basis
      const basis = violation.legal_basis || 'Not specified';
      legalBasisStats[basis] = (legalBasisStats[basis] || 0) + 1;
      
      totalPersonalDataRequests++;
    });

    // Generate Article 30 compliant report
    const article30Report = {
      reportMetadata: {
        reportTitle: 'GDPR Article 30 - Record of Processing Activities',
        organizationName,
        controllerName,
        reportingPeriod,
        timeRange,
        generatedDate: new Date().toISOString(),
        correlationId: req.correlationId
      },
      
      processingActivity: {
        activityName: 'AI-Powered Hotel Guest Services',
        activityDescription: 'Automated guest service interactions using AI providers (OpenAI, Anthropic) for concierge, booking, and customer support services',
        legalBasisForProcessing: Object.keys(legalBasisStats),
        dataController: {
          name: organizationName,
          contact: controllerName,
          representative: 'IT Department'
        }
      },

      dataProcessingSummary: {
        totalRequests: totalPersonalDataRequests,
        timePeriod: timeRange,
        dataTypes: Object.keys(violationStats).map(type => ({
          dataType: type,
          count: violationStats[type].count,
          gdprArticle: violationStats[type].gdprArticle,
          category: violationStats[type].dataCategory,
          legalBasis: violations.find(v => v.violation_type === type)?.legal_basis,
          retentionPeriod: '3 years (audit logs)',
          examples: violationStats[type].examples.slice(0, 3)
        }))
      },

      technicalMeasures: {
        dataProtectionMeasures: [
          'Real-time PII detection and redaction',
          'Immutable audit logs with cryptographic signatures',
          'Correlation ID tracking for full request tracing',
          'Automatic risk level classification',
          'GDPR compliance monitoring dashboard'
        ],
        dataProcessors: [
          {
            name: 'OpenAI',
            location: 'United States',
            adequacyDecision: 'Data Processing Agreement required',
            dataTransferred: violations.filter(v => v.provider === 'openai').length + ' requests'
          },
          {
            name: 'Anthropic',
            location: 'United States', 
            adequacyDecision: 'Data Processing Agreement required',
            dataTransferred: violations.filter(v => v.provider === 'anthropic').length + ' requests'
          }
        ]
      },

      riskAssessment: {
        highRiskViolations: violations.filter(v => v.risk_level === 'high').length,
        mediumRiskViolations: violations.filter(v => v.risk_level === 'medium').length,
        lowRiskViolations: violations.filter(v => v.risk_level === 'low').length,
        
        specialCategoryData: {
          detected: violations.filter(v => v.gdpr_article === 'Article 9').length,
          types: [...new Set(violations.filter(v => v.gdpr_article === 'Article 9').map(v => v.violation_type))],
          additionalSafeguards: [
            'Explicit consent verification required for Article 9 data',
            'Enhanced monitoring for special category personal data',
            'Automatic blocking recommended for health and biometric data'
          ]
        }
      },

      complianceStatus: {
        monitoringEnabled: true,
        auditTrailComplete: true,
        dataSubjectRights: {
          accessRight: 'Supported via audit log exports',
          rectificationRight: 'Manual process required',
          erasureRight: 'Supported with 30-day retention override',
          portabilityRight: 'Supported via CSV/PDF exports'
        },
        recommendedActions: [
          violations.filter(v => v.risk_level === 'high').length > 0 ? 
            'Immediate review required for high-risk violations' : 
            'Continue monitoring current low-risk operations',
          violations.filter(v => v.gdpr_article === 'Article 9').length > 0 ?
            'Implement additional safeguards for special category data' :
            'Standard safeguards sufficient for current data types',
          'Regular compliance audits recommended every 90 days'
        ]
      }
    };

    // Set headers for JSON report
    const filename = `gdpr-article-30-report-${reportingPeriod}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');

    logger.info('GDPR Article 30 report generated', {
      correlationId: req.correlationId,
      totalViolations: totalPersonalDataRequests,
      highRiskCount: violations.filter(v => v.risk_level === 'high').length,
      filename
    });

    res.json(article30Report);

  } catch (error) {
    logger.error('GDPR Article 30 report generation failed', {
      correlationId: req.correlationId,
      error: error.message
    });

    res.status(500).json({
      error: 'Failed to generate GDPR Article 30 report',
      correlationId: req.correlationId,
      message: error.message
    });
  }
});

// Health check endpoint for dashboard (proxy to /health)
app.get('/api/health', async (req, res) => {
  try {
    const dbHealth = await db.healthCheck();
    
    res.json({
      status: dbHealth.healthy ? 'healthy' : 'degraded',
      gateway: 'RunSafe GDPR Compliance Gateway',
      correlationId: req.correlationId,
      database: {
        status: dbHealth.healthy ? 'connected' : 'disconnected',
        timestamp: dbHealth.timestamp,
        error: dbHealth.error || null
      },
      features: {
        audit_logging: dbHealth.healthy,
        in_memory_logs: true,
        pii_detection: true, // Stage 3 complete
        export_functionality: true // Stage 4 complete
      }
    });
  } catch (error) {
    logger.error('Dashboard health check failed', {
      correlationId: req.correlationId,
      error: error.message
    });
    
    res.status(503).json({
      status: 'unhealthy',
      gateway: 'RunSafe GDPR Compliance Gateway',
      correlationId: req.correlationId,
      error: error.message
    });
  }
});

// Catch-all for unmatched routes
app.use('*', (req, res) => {
  logger.warn('Route not found', {
    correlationId: req.correlationId,
    method: req.method,
    url: req.url
  });
  
  res.status(404).json({
    error: 'Route not found',
    correlationId: req.correlationId,
    suggestion: 'Use /api/endpoints to see available routes',
    available_base_urls: [
      'http://gateway:8080 (root level)',
      'http://gateway:8080/v1 (with /v1 prefix)'
    ]
  });
});

// Start server
app.listen(PORT, () => {
  logger.info('RunSafe Gateway started', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    mode: 'api-proxy-stage-1'
  });
});