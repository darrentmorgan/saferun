const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');
const { createProxyMiddleware } = require('http-proxy-middleware');
require('dotenv').config();

// Import database client
const db = require('./db');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 8080;

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

// Only parse JSON for our API endpoints, not proxy endpoints
// This prevents bodyParser from interfering with proxy middleware
app.use('/api/*', bodyParser.json({ limit: '10mb' }));
app.use('/health', bodyParser.json({ limit: '10mb' }));

// Request correlation ID middleware
app.use((req, res, next) => {
  req.correlationId = uuidv4();
  res.set('X-Correlation-ID', req.correlationId);
  next();
});

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
        
        await db.logAuditEntry({
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
          metadata: {
            userAgent: req.get('User-Agent'),
            timestamp: new Date().toISOString()
          }
        });
        
        logger.info('AI request logged to database', {
          correlationId: req.correlationId,
          provider,
          endpoint
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
    logger.info('GDPR AUDIT - OpenAI Chat Request', {
      correlationId: req.correlationId,
      target: 'https://api.openai.com/v1/chat/completions',
      method: req.method,
      hasAuth: !!req.get('Authorization'),
      userAgent: req.get('User-Agent'),
      contentType: req.get('Content-Type'),
      contentLength: req.get('Content-Length'),
      timestamp: new Date().toISOString()
    });
  },
  onProxyRes: (proxyRes, req, res) => {
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
    // Re-stream the body for POST requests
    if (req.body && req.method === 'POST') {
      const bodyData = JSON.stringify(req.body);
      proxyReq.setHeader('Content-Type', 'application/json');
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
      proxyReq.write(bodyData);
    }
    
    logger.info('GDPR AUDIT - OpenAI Chat Request (root-level)', {
      correlationId: req.correlationId,
      target: 'https://api.openai.com/v1/chat/completions',
      method: req.method,
      hasAuth: !!req.get('Authorization'),
      userAgent: req.get('User-Agent'),
      bodySize: req.body ? JSON.stringify(req.body).length : 0,
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