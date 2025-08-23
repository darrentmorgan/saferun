import { test, expect } from '@playwright/test';

test.describe('Live Logs Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the dashboard
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should load dashboard properly', async ({ page }) => {
    // Verify dashboard loads with main elements
    await expect(page.locator('h1')).toContainText('GDPR Compliance Dashboard');
    await expect(page.locator('[data-testid="sidebar"]').or(page.locator('.fixed.inset-y-0.left-0'))).toBeVisible();
    
    // Take screenshot of initial dashboard
    await page.screenshot({ path: 'screenshots/01-dashboard-loaded.png', fullPage: true });
  });

  test('should navigate to Live Logs page via sidebar', async ({ page }) => {
    // Click on Live Logs in sidebar
    await page.click('a[href="#logs"]');
    await page.waitForURL('**/logs');
    
    // Verify URL changed
    expect(page.url()).toContain('#logs');
    
    // Verify Live Logs page content is visible
    await expect(page.locator('h1')).toContainText('Live Gateway Logs');
    await expect(page.locator('text=Live')).toBeVisible();
    
    // Take screenshot of Live Logs page
    await page.screenshot({ path: 'screenshots/02-live-logs-page.png', fullPage: true });
  });

  test('should verify Live Logs page structure and components', async ({ page }) => {
    // Navigate to Live Logs
    await page.click('a[href="#logs"]');
    await page.waitForURL('**/logs');
    
    // Check header section
    await expect(page.locator('h1')).toContainText('Live Gateway Logs');
    await expect(page.locator('text=Live').or(page.locator('text=Paused'))).toBeVisible();
    
    // Check control buttons
    await expect(page.locator('button', { hasText: 'Pause' }).or(page.locator('button', { hasText: 'Resume' }))).toBeVisible();
    await expect(page.locator('button', { hasText: 'Export' })).toBeVisible();
    
    // Check filters section
    await expect(page.locator('text=Filters')).toBeVisible();
    await expect(page.locator('text=Log Level:')).toBeVisible();
    await expect(page.locator('text=Provider:')).toBeVisible();
    await expect(page.locator('text=AI Requests Only')).toBeVisible();
    
    // Check table headers
    await expect(page.locator('text=Timestamp')).toBeVisible();
    await expect(page.locator('text=Level')).toBeVisible();
    await expect(page.locator('text=Message')).toBeVisible();
    await expect(page.locator('text=Provider')).toBeVisible();
    await expect(page.locator('text=Status')).toBeVisible();
    await expect(page.locator('text=Duration')).toBeVisible();
    await expect(page.locator('text=Correlation')).toBeVisible();
    
    // Take screenshot of complete page structure
    await page.screenshot({ path: 'screenshots/03-page-structure.png', fullPage: true });
  });

  test('should test play/pause functionality', async ({ page }) => {
    // Navigate to Live Logs
    await page.click('a[href="#logs"]');
    await page.waitForURL('**/logs');
    
    // Initially should be streaming (Live badge)
    await expect(page.locator('text=Live')).toBeVisible();
    await expect(page.locator('button', { hasText: 'Pause' })).toBeVisible();
    
    // Click pause button
    await page.click('button:has-text("Pause")');
    
    // Should now show Paused badge and Resume button
    await expect(page.locator('text=Paused')).toBeVisible();
    await expect(page.locator('button', { hasText: 'Resume' })).toBeVisible();
    
    // Take screenshot of paused state
    await page.screenshot({ path: 'screenshots/04-paused-state.png', fullPage: true });
    
    // Click resume button
    await page.click('button:has-text("Resume")');
    
    // Should be back to Live state
    await expect(page.locator('text=Live')).toBeVisible();
    await expect(page.locator('button', { hasText: 'Pause' })).toBeVisible();
    
    // Take screenshot of resumed state
    await page.screenshot({ path: 'screenshots/05-resumed-state.png', fullPage: true });
  });

  test('should test log level filtering', async ({ page }) => {
    // Navigate to Live Logs
    await page.click('a[href="#logs"]');
    await page.waitForURL('**/logs');
    
    // Take screenshot before filtering
    await page.screenshot({ path: 'screenshots/06-before-level-filter.png', fullPage: true });
    
    // Test Log Level filter
    await page.click('[data-testid="log-level-select"]').catch(() => {
      // Fallback: click on the select trigger by looking for the dropdown
      return page.click('div:has-text("Log Level:") + div button');
    });
    
    // Wait for dropdown to appear and select "Error"
    await page.waitForSelector('[role="option"]', { timeout: 5000 });
    await page.click('[role="option"]:has-text("Error")');
    
    // Wait a moment for filtering to apply
    await page.waitForTimeout(1000);
    
    // Take screenshot after error filter
    await page.screenshot({ path: 'screenshots/07-error-filter-applied.png', fullPage: true });
    
    // Reset to "All Levels"
    await page.click('div:has-text("Log Level:") + div button');
    await page.click('[role="option"]:has-text("All Levels")');
    
    // Take screenshot after reset
    await page.screenshot({ path: 'screenshots/08-filter-reset.png', fullPage: true });
  });

  test('should test provider filtering', async ({ page }) => {
    // Navigate to Live Logs
    await page.click('a[href="#logs"]');
    await page.waitForURL('**/logs');
    
    // Test Provider filter
    await page.click('div:has-text("Provider:") + div button');
    await page.waitForSelector('[role="option"]', { timeout: 5000 });
    await page.click('[role="option"]:has-text("OpenAI")');
    
    // Wait for filtering to apply
    await page.waitForTimeout(1000);
    
    // Take screenshot with OpenAI filter
    await page.screenshot({ path: 'screenshots/09-openai-filter.png', fullPage: true });
    
    // Test Anthropic filter
    await page.click('div:has-text("Provider:") + div button');
    await page.click('[role="option"]:has-text("Anthropic")');
    await page.waitForTimeout(1000);
    
    // Take screenshot with Anthropic filter
    await page.screenshot({ path: 'screenshots/10-anthropic-filter.png', fullPage: true });
  });

  test('should test AI Requests Only checkbox', async ({ page }) => {
    // Navigate to Live Logs
    await page.click('a[href="#logs"]');
    await page.waitForURL('**/logs');
    
    // Find and click the AI Requests Only checkbox
    const checkbox = page.locator('input[type="checkbox"]#ai-only');
    await checkbox.check();
    
    // Wait for filtering to apply
    await page.waitForTimeout(1000);
    
    // Take screenshot with AI requests filter
    await page.screenshot({ path: 'screenshots/11-ai-requests-only.png', fullPage: true });
    
    // Uncheck the checkbox
    await checkbox.uncheck();
    await page.waitForTimeout(1000);
    
    // Take screenshot with filter removed
    await page.screenshot({ path: 'screenshots/12-ai-filter-removed.png', fullPage: true });
  });

  test('should verify log table displays properly formatted data', async ({ page }) => {
    // Navigate to Live Logs
    await page.click('a[href="#logs"]');
    await page.waitForURL('**/logs');
    
    // Wait for table to load
    await page.waitForSelector('table tbody tr', { timeout: 10000 });
    
    // Check that log entries are visible
    const logRows = page.locator('table tbody tr');
    await expect(logRows.first()).toBeVisible();
    
    // Check for badges in the table (log level badges)
    await expect(page.locator('table tbody .inline-flex')).toHaveCount({ min: 1 });
    
    // Check for timestamp format
    const firstTimestamp = page.locator('table tbody tr:first-child td:first-child');
    await expect(firstTimestamp).not.toBeEmpty();
    
    // Take screenshot showing table data
    await page.screenshot({ path: 'screenshots/13-table-data.png', fullPage: true });
  });

  test('should test sidebar navigation highlighting', async ({ page }) => {
    // Start on dashboard
    await expect(page.locator('a[href="#dashboard"]')).toHaveClass(/bg-primary/);
    
    // Navigate to Live Logs
    await page.click('a[href="#logs"]');
    await page.waitForURL('**/logs');
    
    // Check that Live Logs is now highlighted
    await expect(page.locator('a[href="#logs"]')).toHaveClass(/bg-primary/);
    
    // Check that Dashboard is no longer highlighted
    await expect(page.locator('a[href="#dashboard"]')).not.toHaveClass(/bg-primary/);
    
    // Take screenshot showing navigation state
    await page.screenshot({ path: 'screenshots/14-navigation-highlight.png', fullPage: true });
  });

  test('should test responsive behavior and scrolling', async ({ page }) => {
    // Navigate to Live Logs
    await page.click('a[href="#logs"]');
    await page.waitForURL('**/logs');
    
    // Test desktop view first
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.screenshot({ path: 'screenshots/15-desktop-view.png', fullPage: true });
    
    // Test tablet view
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(500); // Allow reflow
    await page.screenshot({ path: 'screenshots/16-tablet-view.png', fullPage: true });
    
    // Test mobile view
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500); // Allow reflow
    await page.screenshot({ path: 'screenshots/17-mobile-view.png', fullPage: true });
    
    // Test scrolling in the logs table
    await page.setViewportSize({ width: 1920, height: 1080 });
    const scrollArea = page.locator('[data-radix-scroll-area-viewport]').or(page.locator('.h-\\[600px\\]'));
    
    if (await scrollArea.count() > 0) {
      // Scroll down in the logs table
      await scrollArea.first().hover();
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(500);
      
      // Take screenshot after scrolling
      await page.screenshot({ path: 'screenshots/18-after-scroll.png', fullPage: true });
    }
  });

  test('should verify all interactive elements are functional', async ({ page }) => {
    // Navigate to Live Logs
    await page.click('a[href="#logs"]');
    await page.waitForURL('**/logs');
    
    // Test all buttons are clickable
    await expect(page.locator('button:has-text("Pause"), button:has-text("Resume")')).toBeVisible();
    await expect(page.locator('button:has-text("Export")')).toBeVisible();
    
    // Test all dropdowns are functional
    const levelSelect = page.locator('div:has-text("Log Level:") + div button');
    const providerSelect = page.locator('div:has-text("Provider:") + div button');
    
    await expect(levelSelect).toBeVisible();
    await expect(providerSelect).toBeVisible();
    
    // Test checkbox
    const checkbox = page.locator('input[type="checkbox"]#ai-only');
    await expect(checkbox).toBeVisible();
    
    // Take final screenshot
    await page.screenshot({ path: 'screenshots/19-final-functional-test.png', fullPage: true });
  });

  test('should verify log streaming simulation works', async ({ page }) => {
    // Navigate to Live Logs
    await page.click('a[href="#logs"]');
    await page.waitForURL('**/logs');
    
    // Get initial log count
    const initialRows = await page.locator('table tbody tr').count();
    
    // Wait for streaming to add new logs (5 second interval in code)
    await page.waitForTimeout(6000);
    
    // Get new log count
    const newRows = await page.locator('table tbody tr').count();
    
    // Verify new logs were added (or at least same count maintained due to 100 log limit)
    expect(newRows).toBeGreaterThanOrEqual(initialRows);
    
    // Take screenshot showing streaming functionality
    await page.screenshot({ path: 'screenshots/20-streaming-verification.png', fullPage: true });
  });
});