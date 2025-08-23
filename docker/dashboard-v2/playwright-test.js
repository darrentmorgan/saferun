import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function runDashboardTests() {
  const browser = await chromium.launch({ 
    headless: false, // Set to true for automated CI
    devtools: true,
    slowMo: 500 // Slow down for better observation
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: './test-results/videos/' }
  });
  
  const page = await context.newPage();
  
  // Set up console and error logging
  const consoleErrors = [];
  const networkErrors = [];
  const jsErrors = [];
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push({
        type: 'console',
        message: msg.text(),
        timestamp: new Date().toISOString()
      });
      console.log('Console Error:', msg.text());
    } else if (msg.type() === 'warn') {
      console.log('Console Warning:', msg.text());
    }
  });
  
  page.on('pageerror', error => {
    jsErrors.push({
      type: 'javascript',
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    console.log('JavaScript Error:', error.message);
  });
  
  page.on('requestfailed', request => {
    networkErrors.push({
      type: 'network',
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText,
      timestamp: new Date().toISOString()
    });
    console.log('Network Error:', request.url(), request.failure()?.errorText);
  });
  
  // Track network responses
  const apiResponses = [];
  page.on('response', response => {
    const url = response.url();
    if (url.includes('/api/') || url.includes('localhost:')) {
      apiResponses.push({
        url: url,
        status: response.status(),
        statusText: response.statusText(),
        timestamp: new Date().toISOString()
      });
      
      if (response.status() >= 400) {
        console.log(`API Error: ${response.status()} - ${url}`);
      }
    }
  });

  const testResults = {
    timestamp: new Date().toISOString(),
    tests: [],
    consoleErrors: [],
    networkErrors: [],
    jsErrors: [],
    apiResponses: [],
    screenshots: []
  };

  try {
    console.log('Starting dashboard testing...');
    
    // Test 1: Dashboard Overview Page
    console.log('\n=== Testing Dashboard Overview ===');
    try {
      await page.goto('http://localhost:8081/#dashboard', { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });
      
      await page.waitForTimeout(3000); // Allow time for React to render
      
      const dashboardTest = {
        name: 'Dashboard Overview',
        url: 'http://localhost:8081/#dashboard',
        status: 'unknown',
        issues: [],
        screenshots: []
      };
      
      // Check if page loaded
      const title = await page.title();
      console.log('Page Title:', title);
      
      // Take initial screenshot
      const dashboardScreenshot = `dashboard-overview-${Date.now()}.png`;
      await page.screenshot({ 
        path: `./test-results/${dashboardScreenshot}`,
        fullPage: true 
      });
      dashboardTest.screenshots.push(dashboardScreenshot);
      
      // Check for KPI cards
      const kpiCards = await page.locator('.kpi-card, .stat-card, [data-testid="kpi-card"]').count();
      console.log(`Found ${kpiCards} KPI cards`);
      
      if (kpiCards === 0) {
        dashboardTest.issues.push('No KPI cards found on dashboard');
      }
      
      // Check for violations feed
      const violationsFeed = await page.locator('.violations-feed, .feed, [data-testid="violations-feed"]').count();
      console.log(`Found ${violationsFeed} violations feed elements`);
      
      // Check for loading states
      const loadingElements = await page.locator('.loading, .spinner, [data-testid="loading"]').count();
      console.log(`Found ${loadingElements} loading elements`);
      
      // Check for error messages
      const errorElements = await page.locator('.error, .alert-error, [role="alert"]').count();
      console.log(`Found ${errorElements} error elements`);
      
      if (errorElements > 0) {
        const errorTexts = await page.locator('.error, .alert-error, [role="alert"]').allTextContents();
        dashboardTest.issues.push(`Error messages found: ${errorTexts.join(', ')}`);
      }
      
      dashboardTest.status = dashboardTest.issues.length === 0 ? 'passed' : 'failed';
      testResults.tests.push(dashboardTest);
      
    } catch (error) {
      testResults.tests.push({
        name: 'Dashboard Overview',
        status: 'error',
        error: error.message,
        issues: [`Failed to load dashboard: ${error.message}`]
      });
    }
    
    // Test 2: Live Logs Page
    console.log('\n=== Testing Live Logs Page ===');
    try {
      await page.goto('http://localhost:8081/#logs', { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });
      
      await page.waitForTimeout(3000);
      
      const logsTest = {
        name: 'Live Logs Page',
        url: 'http://localhost:8081/#logs',
        status: 'unknown',
        issues: [],
        screenshots: []
      };
      
      // Take screenshot
      const logsScreenshot = `logs-page-${Date.now()}.png`;
      await page.screenshot({ 
        path: `./test-results/${logsScreenshot}`,
        fullPage: true 
      });
      logsTest.screenshots.push(logsScreenshot);
      
      // Check for logs table/list
      const logElements = await page.locator('.log-entry, .logs-table, table, .log-item').count();
      console.log(`Found ${logElements} log elements`);
      
      // Check for filters
      const filterElements = await page.locator('input[type="search"], select, .filter, [data-testid="filter"]').count();
      console.log(`Found ${filterElements} filter elements`);
      
      // Check for empty state
      const emptyState = await page.locator('.empty, .no-data, .empty-state').count();
      if (emptyState > 0) {
        const emptyTexts = await page.locator('.empty, .no-data, .empty-state').allTextContents();
        console.log(`Empty state messages: ${emptyTexts.join(', ')}`);
      }
      
      // Check for error states
      const errorElements = await page.locator('.error, .alert-error, [role="alert"]').count();
      if (errorElements > 0) {
        const errorTexts = await page.locator('.error, .alert-error, [role="alert"]').allTextContents();
        logsTest.issues.push(`Error messages found: ${errorTexts.join(', ')}`);
      }
      
      logsTest.status = logsTest.issues.length === 0 ? 'passed' : 'failed';
      testResults.tests.push(logsTest);
      
    } catch (error) {
      testResults.tests.push({
        name: 'Live Logs Page',
        status: 'error',
        error: error.message,
        issues: [`Failed to load logs page: ${error.message}`]
      });
    }
    
    // Test 3: Violations Page
    console.log('\n=== Testing Violations Page ===');
    try {
      await page.goto('http://localhost:8081/#violations', { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });
      
      await page.waitForTimeout(3000);
      
      const violationsTest = {
        name: 'Violations Page',
        url: 'http://localhost:8081/#violations',
        status: 'unknown',
        issues: [],
        screenshots: []
      };
      
      // Take screenshot
      const violationsScreenshot = `violations-page-${Date.now()}.png`;
      await page.screenshot({ 
        path: `./test-results/${violationsScreenshot}`,
        fullPage: true 
      });
      violationsTest.screenshots.push(violationsScreenshot);
      
      // Check for violations table
      const tableElements = await page.locator('table, .violations-table, .data-table').count();
      console.log(`Found ${tableElements} table elements`);
      
      // Check for pagination
      const paginationElements = await page.locator('.pagination, .page-nav, [aria-label*="pagination"]').count();
      console.log(`Found ${paginationElements} pagination elements`);
      
      // Check for export buttons
      const exportButtons = await page.locator('button:has-text("Export"), button:has-text("Download"), .export-btn').count();
      console.log(`Found ${exportButtons} export buttons`);
      
      // Check for search functionality
      const searchElements = await page.locator('input[type="search"], input[placeholder*="search" i]').count();
      console.log(`Found ${searchElements} search elements`);
      
      // Test search if available
      if (searchElements > 0) {
        try {
          await page.fill('input[type="search"], input[placeholder*="search" i]', 'test');
          await page.waitForTimeout(1000);
          console.log('Search functionality tested');
        } catch (searchError) {
          violationsTest.issues.push(`Search functionality failed: ${searchError.message}`);
        }
      }
      
      // Check for error states
      const errorElements = await page.locator('.error, .alert-error, [role="alert"]').count();
      if (errorElements > 0) {
        const errorTexts = await page.locator('.error, .alert-error, [role="alert"]').allTextContents();
        violationsTest.issues.push(`Error messages found: ${errorTexts.join(', ')}`);
      }
      
      violationsTest.status = violationsTest.issues.length === 0 ? 'passed' : 'failed';
      testResults.tests.push(violationsTest);
      
    } catch (error) {
      testResults.tests.push({
        name: 'Violations Page',
        status: 'error',
        error: error.message,
        issues: [`Failed to load violations page: ${error.message}`]
      });
    }
    
    // Test 4: Navigation
    console.log('\n=== Testing Navigation ===');
    try {
      const navigationTest = {
        name: 'Navigation',
        status: 'unknown',
        issues: [],
        screenshots: []
      };
      
      // Go back to dashboard
      await page.goto('http://localhost:8081/#dashboard');
      await page.waitForTimeout(1000);
      
      // Check sidebar navigation
      const navLinks = await page.locator('nav a, .nav-link, .sidebar a').count();
      console.log(`Found ${navLinks} navigation links`);
      
      if (navLinks === 0) {
        navigationTest.issues.push('No navigation links found');
      } else {
        // Test navigation links
        const links = await page.locator('nav a, .nav-link, .sidebar a').all();
        for (let i = 0; i < Math.min(links.length, 3); i++) {
          try {
            const linkText = await links[i].textContent();
            console.log(`Testing navigation to: ${linkText}`);
            await links[i].click();
            await page.waitForTimeout(1000);
            
            // Check if URL changed
            const currentUrl = page.url();
            console.log(`Navigation result: ${currentUrl}`);
          } catch (navError) {
            navigationTest.issues.push(`Navigation link ${i} failed: ${navError.message}`);
          }
        }
      }
      
      // Check active states
      const activeElements = await page.locator('.active, .current, [aria-current]').count();
      console.log(`Found ${activeElements} active navigation elements`);
      
      // Take navigation screenshot
      const navScreenshot = `navigation-${Date.now()}.png`;
      await page.screenshot({ 
        path: `./test-results/${navScreenshot}`,
        fullPage: true 
      });
      navigationTest.screenshots.push(navScreenshot);
      
      navigationTest.status = navigationTest.issues.length === 0 ? 'passed' : 'failed';
      testResults.tests.push(navigationTest);
      
    } catch (error) {
      testResults.tests.push({
        name: 'Navigation',
        status: 'error',
        error: error.message,
        issues: [`Navigation testing failed: ${error.message}`]
      });
    }
    
    // Test 5: Responsive Behavior
    console.log('\n=== Testing Responsive Behavior ===');
    try {
      const responsiveTest = {
        name: 'Responsive Behavior',
        status: 'unknown',
        issues: [],
        screenshots: []
      };
      
      // Test mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(1000);
      
      const mobileScreenshot = `mobile-view-${Date.now()}.png`;
      await page.screenshot({ 
        path: `./test-results/${mobileScreenshot}`,
        fullPage: true 
      });
      responsiveTest.screenshots.push(mobileScreenshot);
      
      // Test tablet viewport
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.waitForTimeout(1000);
      
      const tabletScreenshot = `tablet-view-${Date.now()}.png`;
      await page.screenshot({ 
        path: `./test-results/${tabletScreenshot}`,
        fullPage: true 
      });
      responsiveTest.screenshots.push(tabletScreenshot);
      
      // Reset to desktop
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.waitForTimeout(1000);
      
      console.log('Responsive testing completed');
      responsiveTest.status = 'passed';
      testResults.tests.push(responsiveTest);
      
    } catch (error) {
      testResults.tests.push({
        name: 'Responsive Behavior',
        status: 'error',
        error: error.message,
        issues: [`Responsive testing failed: ${error.message}`]
      });
    }
    
    // Collect final results
    testResults.consoleErrors = consoleErrors;
    testResults.networkErrors = networkErrors;
    testResults.jsErrors = jsErrors;
    testResults.apiResponses = apiResponses;
    
  } catch (globalError) {
    console.error('Global test error:', globalError);
    testResults.globalError = globalError.message;
  } finally {
    // Save results
    const resultsDir = './test-results';
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }
    
    fs.writeFileSync(
      path.join(resultsDir, 'test-results.json'), 
      JSON.stringify(testResults, null, 2)
    );
    
    // Generate summary report
    generateReport(testResults);
    
    await context.close();
    await browser.close();
  }
  
  return testResults;
}

function generateReport(results) {
  console.log('\n' + '='.repeat(60));
  console.log('DASHBOARD TEST RESULTS SUMMARY');
  console.log('='.repeat(60));
  
  console.log(`Test Run: ${results.timestamp}`);
  console.log(`Total Tests: ${results.tests.length}`);
  
  const passed = results.tests.filter(t => t.status === 'passed').length;
  const failed = results.tests.filter(t => t.status === 'failed').length;
  const errors = results.tests.filter(t => t.status === 'error').length;
  
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`💥 Errors: ${errors}`);
  
  console.log('\n--- CONSOLE ERRORS ---');
  if (results.consoleErrors.length === 0) {
    console.log('✅ No console errors detected');
  } else {
    results.consoleErrors.forEach((error, i) => {
      console.log(`${i + 1}. ${error.message}`);
    });
  }
  
  console.log('\n--- NETWORK ERRORS ---');
  if (results.networkErrors.length === 0) {
    console.log('✅ No network errors detected');
  } else {
    results.networkErrors.forEach((error, i) => {
      console.log(`${i + 1}. ${error.method} ${error.url} - ${error.failure}`);
    });
  }
  
  console.log('\n--- JAVASCRIPT ERRORS ---');
  if (results.jsErrors.length === 0) {
    console.log('✅ No JavaScript errors detected');
  } else {
    results.jsErrors.forEach((error, i) => {
      console.log(`${i + 1}. ${error.message}`);
    });
  }
  
  console.log('\n--- API RESPONSES ---');
  const apiErrors = results.apiResponses.filter(r => r.status >= 400);
  if (apiErrors.length === 0) {
    console.log('✅ No API errors detected');
  } else {
    apiErrors.forEach((error, i) => {
      console.log(`${i + 1}. ${error.status} ${error.statusText} - ${error.url}`);
    });
  }
  
  console.log('\n--- TEST DETAILS ---');
  results.tests.forEach(test => {
    const status = test.status === 'passed' ? '✅' : 
                   test.status === 'failed' ? '❌' : '💥';
    console.log(`${status} ${test.name}`);
    
    if (test.issues && test.issues.length > 0) {
      test.issues.forEach(issue => {
        console.log(`   ⚠️  ${issue}`);
      });
    }
    
    if (test.error) {
      console.log(`   💥 ${test.error}`);
    }
  });
  
  console.log('\n--- RECOMMENDATIONS ---');
  if (results.consoleErrors.length > 0) {
    console.log('🔧 Fix console errors to improve debugging experience');
  }
  if (results.networkErrors.length > 0) {
    console.log('🔧 Investigate network failures and API connectivity');
  }
  if (results.jsErrors.length > 0) {
    console.log('🔧 Resolve JavaScript errors for better stability');
  }
  if (apiErrors.length > 0) {
    console.log('🔧 Check API endpoints and server responses');
  }
  
  console.log('\n--- FILES GENERATED ---');
  console.log('📁 test-results/test-results.json - Complete test data');
  console.log('📸 test-results/*.png - Screenshots of issues found');
  console.log('🎥 test-results/videos/ - Test execution recordings');
  
  console.log('\n' + '='.repeat(60));
}

// Run the tests
runDashboardTests().catch(console.error);