/**
 * RunSafe Gateway - PII Detection Engine
 * GDPR-compliant PII detection with configurable patterns
 */

const fs = require('fs');
const path = require('path');
const winston = require('winston');

// Configure logger for PII detection
const piiLogger = winston.createLogger({
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

class PIIDetector {
  constructor(policyPath = '/app/config/policy.json') {
    this.policyPath = policyPath;
    this.policy = null;
    this.patterns = new Map();
    this.loadPolicy();
  }

  /**
   * Load PII detection policy from JSON file
   */
  loadPolicy() {
    try {
      if (fs.existsSync(this.policyPath)) {
        const policyData = fs.readFileSync(this.policyPath, 'utf8');
        this.policy = JSON.parse(policyData);
        this.compilePatterns();
        piiLogger.info('PII detection policy loaded successfully', {
          patternsCount: Object.keys(this.policy.pii_detection?.patterns || {}).length,
          enabled: this.policy.pii_detection?.enabled || false
        });
      } else {
        piiLogger.warn('PII policy file not found, using default patterns', {
          path: this.policyPath
        });
        this.loadDefaultPolicy();
      }
    } catch (error) {
      piiLogger.error('Failed to load PII policy, using defaults', {
        error: error.message,
        path: this.policyPath
      });
      this.loadDefaultPolicy();
    }
  }

  /**
   * Load default PII patterns if policy file is not available
   */
  loadDefaultPolicy() {
    this.policy = {
      pii_detection: {
        enabled: true,
        confidence_threshold: 0.8,
        patterns: {
          email: {
            regex: '\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b',
            description: 'Email Address',
            category: 'contact',
            gdpr_article: 'Article 6',
            risk_level: 'low'
          }
        }
      }
    };
    this.compilePatterns();
  }

  /**
   * Compile regex patterns for efficient detection
   */
  compilePatterns() {
    this.patterns.clear();
    
    if (!this.policy?.pii_detection?.patterns) {
      return;
    }

    for (const [name, config] of Object.entries(this.policy.pii_detection.patterns)) {
      try {
        const flags = config.case_sensitive === false ? 'gi' : 'g';
        const compiledPattern = new RegExp(config.regex, flags);
        
        this.patterns.set(name, {
          pattern: compiledPattern,
          config: config
        });
        
        piiLogger.debug('Compiled PII pattern', {
          name,
          description: config.description,
          category: config.category
        });
      } catch (error) {
        piiLogger.error('Failed to compile PII pattern', {
          name,
          regex: config.regex,
          error: error.message
        });
      }
    }
  }

  /**
   * Check if PII detection is enabled
   */
  isEnabled() {
    return this.policy?.pii_detection?.enabled === true;
  }

  /**
   * Scan text content for PII violations
   * @param {string} text - Text content to scan
   * @param {string} source - Source of the text ('request_body', 'response_body', 'headers')
   * @param {string} correlationId - Request correlation ID for logging
   * @returns {Array} Array of detected violations
   */
  scanText(text, source = 'unknown', correlationId = null) {
    if (!this.isEnabled() || !text || typeof text !== 'string') {
      return [];
    }

    const violations = [];
    const whitelistPhrases = this.policy.pii_detection?.whitelist?.phrases || [];

    // Check if text contains whitelisted phrases (skip detection)
    if (whitelistPhrases.some(phrase => text.toLowerCase().includes(phrase.toLowerCase()))) {
      piiLogger.debug('Skipping PII detection for whitelisted content', {
        correlationId,
        source
      });
      return [];
    }

    // Scan with each compiled pattern
    for (const [name, patternData] of this.patterns) {
      const { pattern, config } = patternData;
      const matches = text.match(pattern);

      if (matches && matches.length > 0) {
        for (const match of matches) {
          const violation = {
            type: name,
            category: config.category,
            description: config.description,
            gdpr_article: config.gdpr_article,
            risk_level: config.risk_level,
            detected_text: match,
            redacted_text: this.redactText(match, config),
            confidence_score: this.calculateConfidence(match, config),
            field_path: null, // Will be set by caller if known
            data_source: source,
            position: text.indexOf(match)
          };

          // Only include violations above confidence threshold
          const threshold = this.policy.pii_detection?.confidence_threshold || 0.8;
          if (violation.confidence_score >= threshold) {
            violations.push(violation);
            
            piiLogger.warn('PII violation detected', {
              correlationId,
              type: name,
              category: config.category,
              risk_level: config.risk_level,
              source,
              confidence: violation.confidence_score
            });
          }
        }
      }
    }

    return violations;
  }

  /**
   * Scan JSON object for PII violations
   * @param {Object} obj - JSON object to scan
   * @param {string} source - Source identifier
   * @param {string} correlationId - Request correlation ID
   * @param {string} prefix - Field path prefix
   * @returns {Array} Array of detected violations
   */
  scanObject(obj, source = 'unknown', correlationId = null, prefix = '') {
    if (!this.isEnabled() || !obj || typeof obj !== 'object') {
      return [];
    }

    const violations = [];

    const scanValue = (value, fieldPath) => {
      if (typeof value === 'string') {
        const textViolations = this.scanText(value, source, correlationId);
        textViolations.forEach(violation => {
          violation.field_path = fieldPath;
          violations.push(violation);
        });
      } else if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value)) {
          value.forEach((item, index) => {
            scanValue(item, `${fieldPath}[${index}]`);
          });
        } else {
          Object.entries(value).forEach(([key, val]) => {
            const newPath = fieldPath ? `${fieldPath}.${key}` : key;
            scanValue(val, newPath);
          });
        }
      }
    };

    scanValue(obj, prefix);
    return violations;
  }

  /**
   * Calculate confidence score for a detection
   * @param {string} match - Detected text
   * @param {Object} config - Pattern configuration
   * @returns {number} Confidence score (0-1)
   */
  calculateConfidence(match, config) {
    let confidence = 0.8; // Base confidence

    // Adjust based on pattern type
    switch (config.category) {
      case 'financial':
        // Higher confidence for structured financial data
        if (match.length >= 15) confidence = 0.95;
        else if (match.length >= 10) confidence = 0.9;
        break;
      
      case 'identifier':
        // Medium-high confidence for identifiers
        confidence = 0.85;
        break;
      
      case 'contact':
        // Medium confidence for contact info
        confidence = 0.75;
        break;
      
      case 'special_category':
        // High confidence for special categories
        confidence = 0.9;
        break;
    }

    // Boost confidence if exact match to examples
    if (config.examples && config.examples.includes(match)) {
      confidence = 0.99;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Redact detected PII text
   * @param {string} text - Original text
   * @param {Object} config - Pattern configuration
   * @returns {string} Redacted text
   */
  redactText(text, config) {
    const redactionConfig = this.policy.pii_detection?.redaction || {
      replacement_char: '*',
      preserve_format: true,
      min_length: 3
    };

    if (redactionConfig.preserve_format) {
      // Preserve format by replacing each character
      return text.replace(/[A-Za-z0-9]/g, redactionConfig.replacement_char);
    } else {
      // Simple replacement
      const length = Math.max(text.length, redactionConfig.min_length);
      return redactionConfig.replacement_char.repeat(length);
    }
  }

  /**
   * Get detection statistics
   * @returns {Object} Detection statistics
   */
  getStats() {
    return {
      enabled: this.isEnabled(),
      patterns_loaded: this.patterns.size,
      confidence_threshold: this.policy?.pii_detection?.confidence_threshold || 0.8,
      policy_loaded: this.policy !== null,
      categories: [...new Set(
        Array.from(this.patterns.values()).map(p => p.config.category)
      )]
    };
  }

  /**
   * Test detection with sample data
   * @returns {Object} Test results
   */
  runTests() {
    const testData = [
      { text: 'My passport is A1234567', expected: 'eu_passport' },
      { text: 'IBAN: DE89370400440532013000', expected: 'iban' },
      { text: 'Credit card 4532015112830366', expected: 'credit_card' },
      { text: 'Email: guest@hotel.com', expected: 'email' },
      { text: 'Phone: +49 30 12345678', expected: 'phone_eu' }
    ];

    const results = {
      total_tests: testData.length,
      passed: 0,
      failed: 0,
      details: []
    };

    testData.forEach((test, index) => {
      const violations = this.scanText(test.text, 'test', `test-${index}`);
      const detected = violations.some(v => v.type === test.expected);
      
      if (detected) {
        results.passed++;
      } else {
        results.failed++;
      }

      results.details.push({
        test: test.text,
        expected: test.expected,
        detected: violations.map(v => v.type),
        passed: detected
      });
    });

    return results;
  }
}

module.exports = PIIDetector;