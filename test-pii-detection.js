#!/usr/bin/env node

/**
 * RunSafe Stage 3 - PII Detection End-to-End Test Suite
 * Tests PII detection with realistic hotel guest scenarios
 */

const axios = require('axios');
const fs = require('fs');

// Configuration
const GATEWAY_URL = 'http://localhost:8080';
const TEST_API_KEY = process.env.OPENAI_API_KEY;

if (!TEST_API_KEY) {
  console.error('❌ OPENAI_API_KEY environment variable is required');
  process.exit(1);
}

// Hotel guest scenarios with embedded PII data
const HOTEL_FIXTURES = [
  {
    name: "EU Business Traveler",
    content: "I'm checking in tomorrow. My passport is A1234567 and I'll pay with IBAN DE89370400440532013000. Please arrange airport pickup to my email guest@luxuryhotel.com",
    expectedViolations: ['eu_passport', 'iban', 'email'],
    riskLevels: ['medium', 'high', 'low']
  },
  {
    name: "Credit Card Payment",
    content: "Hi, I need to update my payment method. My new card number is 4532015112830366. Can you charge the room to this card?",
    expectedViolations: ['credit_card'],
    riskLevels: ['high']
  },
  {
    name: "Phone Contact Update",
    content: "Please update my contact info. My new number is +49 30 12345678 and backup email is manager@hotelchain.de",
    expectedViolations: ['phone_eu', 'email'],
    riskLevels: ['low', 'low']
  },
  {
    name: "Health Information (Article 9)",
    content: "I have diabetes and need to inform the restaurant about my dietary restrictions. Also, please ensure my room has medical equipment access.",
    expectedViolations: ['health_keywords'],
    riskLevels: ['high']
  },
  {
    name: "Biometric Request (Article 9)", 
    content: "Your hotel app wants to use facial recognition for check-in. I'm concerned about my biometric data privacy.",
    expectedViolations: ['biometric_keywords'],
    riskLevels: ['high']
  },
  {
    name: "Clean Request (No PII)",
    content: "What time is breakfast served? Also, can you recommend local restaurants?",
    expectedViolations: [],
    riskLevels: []
  }
];

class PIITestRunner {
  constructor() {
    this.results = [];
    this.totalTests = 0;
    this.passedTests = 0;
    this.failedTests = 0;
  }

  async runAllTests() {
    console.log('🚀 Starting RunSafe PII Detection End-to-End Tests\n');
    
    // Test gateway health first
    const isHealthy = await this.testGatewayHealth();
    if (!isHealthy) {
      console.error('❌ Gateway health check failed. Aborting tests.');
      return false;
    }

    // Run PII detection tests
    for (const fixture of HOTEL_FIXTURES) {
      await this.testPIIDetection(fixture);
    }

    // Print summary
    this.printTestSummary();
    
    // Save results
    await this.saveTestResults();
    
    return this.failedTests === 0;
  }

  async testGatewayHealth() {
    try {
      console.log('🔍 Checking gateway health...');
      const response = await axios.get(`${GATEWAY_URL}/health`);
      
      if (response.data.status === 'healthy') {
        console.log('✅ Gateway is healthy\n');
        return true;
      } else {
        console.log('❌ Gateway health check failed:', response.data);
        return false;
      }
    } catch (error) {
      console.log('❌ Gateway unreachable:', error.message);
      return false;
    }
  }

  async testPIIDetection(fixture) {
    this.totalTests++;
    console.log(`📋 Testing: ${fixture.name}`);
    console.log(`📝 Content: "${fixture.content}"`);
    console.log(`🎯 Expected violations: [${fixture.expectedViolations.join(', ')}]`);

    try {
      // Send AI request through gateway
      const startTime = Date.now();
      const response = await axios.post(`${GATEWAY_URL}/v1/chat/completions`, {
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "user",
            content: fixture.content
          }
        ],
        max_tokens: 50
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TEST_API_KEY}`
        }
      });

      const duration = Date.now() - startTime;
      const correlationId = response.headers['x-correlation-id'];

      // Wait a moment for database logging
      await this.sleep(1000);

      // Check PII violations in database
      const violations = await this.queryViolations(correlationId);
      
      // Validate results
      const testResult = this.validateTestResult(fixture, violations, duration, correlationId);
      this.results.push(testResult);

      if (testResult.passed) {
        this.passedTests++;
        console.log('✅ PASSED');
      } else {
        this.failedTests++;
        console.log('❌ FAILED');
        console.log(`   Reason: ${testResult.failureReason}`);
      }

      console.log(`   Violations found: ${violations.length}`);
      console.log(`   Response time: ${duration}ms`);
      console.log(`   Correlation ID: ${correlationId}\n`);

    } catch (error) {
      this.failedTests++;
      console.log('❌ FAILED - Request error:', error.message);
      console.log('');
      
      this.results.push({
        fixture: fixture.name,
        passed: false,
        failureReason: `Request failed: ${error.message}`,
        violations: [],
        duration: 0,
        correlationId: null
      });
    }
  }

  async queryViolations(correlationId) {
    // Query the gateway's PII violations API
    try {
      const response = await axios.get(`${GATEWAY_URL}/api/violations?limit=50`);
      if (response.data && response.data.violations) {
        // Filter violations by correlation ID if provided
        if (correlationId) {
          return response.data.violations.filter(v => v.correlation_id === correlationId);
        }
        return response.data.violations;
      }
      return [];
    } catch (error) {
      console.log('⚠️  Could not query violations API:', error.message);
      return [];
    }
  }

  validateTestResult(fixture, actualViolations, duration, correlationId) {
    const actualTypes = actualViolations.map(v => v.violation_type);
    const expectedTypes = fixture.expectedViolations;

    // Check if we found all expected violations
    const missingViolations = expectedTypes.filter(type => !actualTypes.includes(type));
    const extraViolations = actualTypes.filter(type => !expectedTypes.includes(type));

    const passed = missingViolations.length === 0 && extraViolations.length === 0;
    
    let failureReason = '';
    if (!passed) {
      if (missingViolations.length > 0) {
        failureReason += `Missing violations: [${missingViolations.join(', ')}]. `;
      }
      if (extraViolations.length > 0) {
        failureReason += `Unexpected violations: [${extraViolations.join(', ')}]. `;
      }
    }

    return {
      fixture: fixture.name,
      passed,
      failureReason,
      violations: actualViolations,
      expectedViolations: expectedTypes,
      actualViolations: actualTypes,
      duration,
      correlationId
    };
  }

  printTestSummary() {
    console.log('=' .repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('=' .repeat(60));
    console.log(`Total Tests: ${this.totalTests}`);
    console.log(`Passed: ${this.passedTests} ✅`);
    console.log(`Failed: ${this.failedTests} ❌`);
    console.log(`Success Rate: ${Math.round((this.passedTests / this.totalTests) * 100)}%`);
    console.log('');

    if (this.failedTests > 0) {
      console.log('❌ FAILED TESTS:');
      this.results
        .filter(r => !r.passed)
        .forEach(result => {
          console.log(`   • ${result.fixture}: ${result.failureReason}`);
        });
      console.log('');
    }

    console.log('✅ PASSED TESTS:');
    this.results
      .filter(r => r.passed)
      .forEach(result => {
        console.log(`   • ${result.fixture}: ${result.violations.length} violations detected`);
      });
  }

  async saveTestResults() {
    const timestamp = new Date().toISOString();
    const testReport = {
      timestamp,
      summary: {
        total: this.totalTests,
        passed: this.passedTests,
        failed: this.failedTests,
        successRate: Math.round((this.passedTests / this.totalTests) * 100)
      },
      results: this.results
    };

    const filename = `pii-test-results-${timestamp.replace(/[:.]/g, '-')}.json`;
    fs.writeFileSync(filename, JSON.stringify(testReport, null, 2));
    console.log(`📄 Test results saved to: ${filename}`);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run tests if called directly
if (require.main === module) {
  const runner = new PIITestRunner();
  runner.runAllTests()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Test runner failed:', error);
      process.exit(1);
    });
}

module.exports = PIITestRunner;