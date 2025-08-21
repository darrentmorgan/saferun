const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');
const { createProxyMiddleware } = require('http-proxy-middleware');
require('dotenv').config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 8080;

// Configure Winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
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

// Middleware setup
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Request correlation ID middleware
app.use((req, res, next) => {
  req.correlationId = uuidv4();
  res.set('X-Correlation-ID', req.correlationId);
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  
  logger.info('Incoming request', {
    correlationId: req.correlationId,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info('Request completed', {
      correlationId: req.correlationId,
      statusCode: res.statusCode,
      duration: `${duration}ms`
    });
  });

  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    correlationId: req.correlationId
  });
});

// OpenAI proxy endpoint
app.use('/v1/chat/completions', createProxyMiddleware({
  target: 'https://api.openai.com',
  changeOrigin: true,
  onProxyReq: (proxyReq, req, res) => {
    logger.info('Proxying to OpenAI', {
      correlationId: req.correlationId,
      target: 'https://api.openai.com/v1/chat/completions',
      method: req.method
    });
  },
  onProxyRes: (proxyRes, req, res) => {
    logger.info('OpenAI response received', {
      correlationId: req.correlationId,
      statusCode: proxyRes.statusCode
    });
  },
  onError: (err, req, res) => {
    logger.error('Proxy error', {
      correlationId: req.correlationId,
      error: err.message
    });
    res.status(500).json({
      error: 'Gateway error',
      correlationId: req.correlationId
    });
  }
}));

// Anthropic proxy endpoint
app.use('/v1/messages', createProxyMiddleware({
  target: 'https://api.anthropic.com',
  changeOrigin: true,
  onProxyReq: (proxyReq, req, res) => {
    logger.info('Proxying to Anthropic', {
      correlationId: req.correlationId,
      target: 'https://api.anthropic.com/v1/messages',
      method: req.method
    });
  },
  onProxyRes: (proxyRes, req, res) => {
    logger.info('Anthropic response received', {
      correlationId: req.correlationId,
      statusCode: proxyRes.statusCode
    });
  },
  onError: (err, req, res) => {
    logger.error('Proxy error', {
      correlationId: req.correlationId,
      error: err.message
    });
    res.status(500).json({
      error: 'Gateway error',
      correlationId: req.correlationId
    });
  }
}));

// Test endpoint for development
app.post('/test-detection', (req, res) => {
  logger.info('Test detection endpoint called', {
    correlationId: req.correlationId,
    body: req.body
  });
  
  res.json({
    message: 'Test endpoint - PII detection not yet implemented',
    correlationId: req.correlationId,
    receivedData: req.body
  });
});

// 404 handler
app.use('*', (req, res) => {
  logger.warn('Route not found', {
    correlationId: req.correlationId,
    method: req.method,
    url: req.url
  });
  
  res.status(404).json({
    error: 'Route not found',
    correlationId: req.correlationId
  });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    correlationId: req.correlationId,
    error: err.message,
    stack: err.stack
  });
  
  res.status(500).json({
    error: 'Internal server error',
    correlationId: req.correlationId
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`RunSafe Gateway started on port ${PORT}`, {
    environment: process.env.NODE_ENV || 'development',
    port: PORT
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});