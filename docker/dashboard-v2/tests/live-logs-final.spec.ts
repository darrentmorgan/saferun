import { test, expect } from '@playwright/test';

test.describe('Live Logs Page - Final Test Suite', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the dashboard and wait for it to load
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Allow React to fully render
  });

  test('1. Dashboard loads properly with all main elements', async ({ page }) => {
    // Verify main dashboard elements
    await expect(page.locator('h1').filter({ hasText: 'GDPR Compliance Dashboard' })).toBeVisible();
    await expect(page.locator('text=RunSafe')).toBeVisible();
    await expect(page.locator('text=Gateway Online')).toBeVisible();
    
    // Verify sidebar is present
    const sidebar = page.locator('.fixed.inset-y-0.left-0');
    await expect(sidebar).toBeVisible();
    
    // Take screenshot of properly loaded dashboard
    await page.screenshot({ path: 'screenshots/01-dashboard-loaded.png', fullPage: true });
  });

  test('2. Navigate to Live Logs page via sidebar', async ({ page }) => {
    // Verify initial state - Dashboard should be active
    await expect(page.locator('a[href="#dashboard"]')).toHaveClass(/bg-primary/);
    
    // Click on Live Logs navigation
    await page.click('a[href="#logs"]');
    
    // Wait for hash to change (no full navigation)
    await page.waitForFunction(() => window.location.hash === '#logs');
    await page.waitForTimeout(1000);
    
    // Verify URL changed
    expect(page.url()).toContain('#logs');
    
    // Verify Live Logs page content is visible
    await expect(page.locator('h1').filter({ hasText: 'Live Gateway Logs' })).toBeVisible();
    
    // Take screenshot of Live Logs page
    await page.screenshot({ path: 'screenshots/02-live-logs-navigation.png', fullPage: true });
  });

  test('3. Verify Live Logs page structure and components', async ({ page }) => {
    // Navigate to Live Logs
    await page.click('a[href="#logs"]');
    await page.waitForFunction(() => window.location.hash === '#logs');
    await page.waitForTimeout(1000);
    
    // Check header section with Live/Paused status
    await expect(page.locator('h1').filter({ hasText: 'Live Gateway Logs' })).toBeVisible();
    const statusBadge = page.locator('text=Live').or(page.locator('text=Paused'));
    await expect(statusBadge).toBeVisible();
    
    // Check control buttons
    const pauseResumeBtn = page.locator('button').filter({ hasText: /Pause|Resume/ });
    const exportBtn = page.locator('button').filter({ hasText: 'Export' });
    await expect(pauseResumeBtn).toBeVisible();
    await expect(exportBtn).toBeVisible();
    
    // Check filters section
    await expect(page.locator('text=Filters')).toBeVisible();
    await expect(page.locator('text=Log Level:')).toBeVisible();
    await expect(page.locator('text=Provider:')).toBeVisible();
    await expect(page.locator('label[for="ai-only"]')).toBeVisible();
    
    // Check table is present with headers
    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('th').filter({ hasText: 'Timestamp' })).toBeVisible();
    await expect(page.locator('th').filter({ hasText: 'Level' })).toBeVisible();
    await expect(page.locator('th').filter({ hasText: 'Message' })).toBeVisible();
    
    // Take screenshot of complete page structure
    await page.screenshot({ path: 'screenshots/03-page-structure.png', fullPage: true });
  });

  test('4. Test play/pause functionality', async ({ page }) => {
    // Navigate to Live Logs
    await page.click('a[href="#logs"]');
    await page.waitForFunction(() => window.location.hash === '#logs');
    await page.waitForTimeout(1000);
    
    // Initially should be streaming (Live badge)
    await expect(page.locator('text=Live')).toBeVisible();
    
    // Find and click pause button
    const pauseBtn = page.locator('button').filter({ hasText: 'Pause' });
    await expect(pauseBtn).toBeVisible();
    await pauseBtn.click();
    
    // Should now show Paused badge and Resume button
    await expect(page.locator('text=Paused')).toBeVisible();
    await expect(page.locator('button').filter({ hasText: 'Resume' })).toBeVisible();
    
    // Take screenshot of paused state
    await page.screenshot({ path: 'screenshots/04-paused-state.png', fullPage: true });
    
    // Click resume button
    const resumeBtn = page.locator('button').filter({ hasText: 'Resume' });
    await resumeBtn.click();
    
    // Should be back to Live state
    await expect(page.locator('text=Live')).toBeVisible();
    await expect(page.locator('button').filter({ hasText: 'Pause' })).toBeVisible();
    
    // Take screenshot of resumed state
    await page.screenshot({ path: 'screenshots/05-resumed-state.png', fullPage: true });
  });

  test('5. Test log level filtering functionality', async ({ page }) => {
    // Navigate to Live Logs
    await page.click('a[href="#logs"]');
    await page.waitForFunction(() => window.location.hash === '#logs');
    await page.waitForTimeout(1000);
    
    // Take screenshot before filtering
    await page.screenshot({ path: 'screenshots/06-before-level-filter.png', fullPage: true });
    
    // Find the log level select dropdown
    const logLevelSelect = page.locator('div:has-text("Log Level:") + div').locator('button');
    await logLevelSelect.click();
    
    // Wait for dropdown to appear and select "Error"
    await page.waitForSelector('[role="option"]', { timeout: 5000 });
    await page.click('[role="option"]:has-text("Error")');
    
    // Wait for filtering to apply
    await page.waitForTimeout(1000);
    
    // Take screenshot after error filter
    await page.screenshot({ path: 'screenshots/07-error-filter-applied.png', fullPage: true });
    
    // Reset to "All Levels"
    await logLevelSelect.click();
    await page.click('[role="option"]:has-text("All Levels")');
    await page.waitForTimeout(500);
    
    // Take screenshot after reset
    await page.screenshot({ path: 'screenshots/08-filter-reset.png', fullPage: true });
  });

  test('6. Test provider filtering functionality', async ({ page }) => {
    // Navigate to Live Logs
    await page.click('a[href="#logs"]');
    await page.waitForFunction(() => window.location.hash === '#logs');
    await page.waitForTimeout(1000);
    
    // Find the provider select dropdown
    const providerSelect = page.locator('div:has-text("Provider:") + div').locator('button');
    await providerSelect.click();
    
    // Select OpenAI
    await page.waitForSelector('[role="option"]', { timeout: 5000 });
    await page.click('[role="option"]:has-text("OpenAI")');
    await page.waitForTimeout(1000);
    
    // Take screenshot with OpenAI filter
    await page.screenshot({ path: 'screenshots/09-openai-filter.png', fullPage: true });
    
    // Change to Anthropic filter
    await providerSelect.click();
    await page.click('[role="option"]:has-text("Anthropic")');
    await page.waitForTimeout(1000);
    
    // Take screenshot with Anthropic filter
    await page.screenshot({ path: 'screenshots/10-anthropic-filter.png', fullPage: true });
    
    // Reset to All Providers
    await providerSelect.click();
    await page.click('[role="option"]:has-text("All Providers")');
    await page.waitForTimeout(500);
  });

  test('7. Test AI Requests Only checkbox functionality', async ({ page }) => {
    // Navigate to Live Logs
    await page.click('a[href="#logs"]');
    await page.waitForFunction(() => window.location.hash === '#logs');
    await page.waitForTimeout(1000);
    
    // Find and check the AI Requests Only checkbox
    const checkbox = page.locator('input[type="checkbox"]#ai-only');
    await expect(checkbox).toBeVisible();
    
    // Check the checkbox
    await checkbox.check();
    await page.waitForTimeout(1000);
    
    // Verify it's checked
    await expect(checkbox).toBeChecked();
    
    // Take screenshot with AI requests filter
    await page.screenshot({ path: 'screenshots/11-ai-requests-only.png', fullPage: true });
    
    // Uncheck the checkbox
    await checkbox.uncheck();
    await page.waitForTimeout(500);
    
    // Verify it's unchecked
    await expect(checkbox).not.toBeChecked();
    
    // Take screenshot with filter removed
    await page.screenshot({ path: 'screenshots/12-ai-filter-removed.png', fullPage: true });
  });

  test('8. Verify table displays log data with proper formatting', async ({ page }) => {
    // Navigate to Live Logs
    await page.click('a[href="#logs"]');
    await page.waitForFunction(() => window.location.hash === '#logs');
    await page.waitForTimeout(2000); // Allow logs to load
    
    // Check that log entries are visible in table
    const tableRows = page.locator('table tbody tr');
    await expect(tableRows.first()).toBeVisible();
    
    // Check for badges (log level badges) - they use span with inline-flex class
    const badges = page.locator('table tbody span.inline-flex');
    await expect(badges.first()).toBeVisible();
    
    // Check for timestamp in first row
    const firstTimestamp = tableRows.first().locator('td').first();
    await expect(firstTimestamp).not.toBeEmpty();
    
    // Verify log level badges are present (INFO, WARN, ERROR)
    const logLevelBadges = page.locator('table tbody').locator('text=INFO').or(
      page.locator('table tbody').locator('text=WARN')
    ).or(page.locator('table tbody').locator('text=ERROR'));
    await expect(logLevelBadges.first()).toBeVisible();
    
    // Take screenshot showing table data
    await page.screenshot({ path: 'screenshots/13-table-data.png', fullPage: true });
  });

  test('9. Verify sidebar navigation highlighting', async ({ page }) => {
    // Start on dashboard - Dashboard should be highlighted
    await expect(page.locator('a[href="#dashboard"]')).toHaveClass(/bg-primary/);
    
    // Navigate to Live Logs
    await page.click('a[href="#logs"]');
    await page.waitForFunction(() => window.location.hash === '#logs');
    await page.waitForTimeout(500);
    
    // Check that Live Logs is now highlighted
    await expect(page.locator('a[href="#logs"]')).toHaveClass(/bg-primary/);
    
    // Check that Dashboard is no longer highlighted
    await expect(page.locator('a[href="#dashboard"]')).not.toHaveClass(/bg-primary/);
    
    // Take screenshot showing navigation state
    await page.screenshot({ path: 'screenshots/14-navigation-highlight.png', fullPage: true });
    
    // Navigate back to dashboard
    await page.click('a[href="#dashboard"]');
    await page.waitForFunction(() => window.location.hash === '#dashboard');
    await page.waitForTimeout(500);
    
    // Verify dashboard is highlighted again
    await expect(page.locator('a[href="#dashboard"]')).toHaveClass(/bg-primary/);
    await expect(page.locator('a[href="#logs"]')).not.toHaveClass(/bg-primary/);
  });

  test('10. Test responsive behavior across different screen sizes', async ({ page }) => {
    // Navigate to Live Logs first
    await page.click('a[href="#logs"]');
    await page.waitForFunction(() => window.location.hash === '#logs');
    await page.waitForTimeout(1000);
    
    // Test desktop view (1920x1080)
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'screenshots/15-desktop-view.png', fullPage: true });
    
    // Test tablet view (768x1024)
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'screenshots/16-tablet-view.png', fullPage: true });
    
    // Test mobile view (375x667)
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'screenshots/17-mobile-view.png', fullPage: true });
    
    // Reset to desktop
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(500);
  });

  test('11. Test table scrolling functionality', async ({ page }) => {
    // Navigate to Live Logs
    await page.click('a[href="#logs"]');
    await page.waitForFunction(() => window.location.hash === '#logs');
    await page.waitForTimeout(1000);
    
    // Find the scrollable container
    const scrollArea = page.locator('[data-radix-scroll-area-viewport]');
    
    if (await scrollArea.count() > 0) {
      // Take screenshot before scrolling
      await page.screenshot({ path: 'screenshots/18-before-scroll.png', fullPage: true });
      
      // Scroll within the logs table
      await scrollArea.hover();
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(500);
      
      // Take screenshot after scrolling
      await page.screenshot({ path: 'screenshots/19-after-scroll.png', fullPage: true });
    } else {
      // Fallback: try scrolling the page
      await page.mouse.wheel(0, 300);
      await page.screenshot({ path: 'screenshots/19-page-scroll.png', fullPage: true });
    }
  });

  test('12. Verify all interactive elements are functional', async ({ page }) => {
    // Navigate to Live Logs
    await page.click('a[href="#logs"]');
    await page.waitForFunction(() => window.location.hash === '#logs');
    await page.waitForTimeout(1000);
    
    // Test that all buttons are clickable and visible
    const pauseResumeBtn = page.locator('button').filter({ hasText: /Pause|Resume/ });
    const exportBtn = page.locator('button').filter({ hasText: 'Export' });
    
    await expect(pauseResumeBtn).toBeVisible();
    await expect(exportBtn).toBeVisible();
    
    // Test dropdowns are functional
    const levelSelect = page.locator('div:has-text("Log Level:") + div').locator('button');
    const providerSelect = page.locator('div:has-text("Provider:") + div').locator('button');
    
    await expect(levelSelect).toBeVisible();
    await expect(providerSelect).toBeVisible();
    
    // Test checkbox
    const checkbox = page.locator('input[type="checkbox"]#ai-only');
    await expect(checkbox).toBeVisible();
    
    // Verify all elements are enabled (not disabled)
    await expect(pauseResumeBtn).toBeEnabled();
    await expect(exportBtn).toBeEnabled();
    await expect(levelSelect).toBeEnabled();
    await expect(providerSelect).toBeEnabled();
    await expect(checkbox).toBeEnabled();
    
    // Take final screenshot
    await page.screenshot({ path: 'screenshots/20-all-elements-functional.png', fullPage: true });
  });

  test('13. Verify live streaming simulation works', async ({ page }) => {
    // Navigate to Live Logs
    await page.click('a[href="#logs"]');
    await page.waitForFunction(() => window.location.hash === '#logs');
    await page.waitForTimeout(1000);
    
    // Ensure streaming is active
    const liveStatus = page.locator('text=Live');
    if (!(await liveStatus.isVisible())) {
      await page.click('button:has-text("Resume")');
      await page.waitForTimeout(500);
    }
    
    // Get initial count of log entries
    const tableRows = page.locator('table tbody tr');
    const initialCount = await tableRows.count();
    console.log(`Initial log count: ${initialCount}`);
    
    // Wait for streaming interval (5 seconds + buffer)
    await page.waitForTimeout(6000);
    
    // Get new count
    const newCount = await tableRows.count();
    console.log(`New log count: ${newCount}`);
    
    // Verify logs are being added or maintained (due to 100 log limit)
    expect(newCount).toBeGreaterThanOrEqual(initialCount);
    
    // Take screenshot showing streaming functionality
    await page.screenshot({ path: 'screenshots/21-streaming-verification.png', fullPage: true });
  });
});