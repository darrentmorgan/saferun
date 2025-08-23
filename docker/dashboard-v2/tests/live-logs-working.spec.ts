import { test, expect } from '@playwright/test';

test.describe('Live Logs Page - Working Test Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  });

  test('Complete Live Logs functionality test', async ({ page }) => {
    // 1. Dashboard loads properly
    await expect(page.locator('h1').filter({ hasText: 'GDPR Compliance Dashboard' })).toBeVisible();
    await expect(page.locator('text=RunSafe')).toBeVisible();
    await page.screenshot({ path: 'screenshots/final-01-dashboard.png', fullPage: true });

    // 2. Navigate to Live Logs
    await page.click('a[href="#logs"]');
    await page.waitForFunction(() => window.location.hash === '#logs');
    await page.waitForTimeout(1000);
    
    // Verify navigation worked
    expect(page.url()).toContain('#logs');
    await expect(page.locator('h1').filter({ hasText: 'Live Gateway Logs' })).toBeVisible();
    await page.screenshot({ path: 'screenshots/final-02-live-logs-page.png', fullPage: true });

    // 3. Verify sidebar highlighting
    await expect(page.locator('a[href="#logs"]')).toHaveClass(/bg-primary/);
    await expect(page.locator('a[href="#dashboard"]')).not.toHaveClass(/bg-primary/);
    
    // 4. Test page structure
    await expect(page.locator('text=Filters')).toBeVisible();
    await expect(page.locator('text=Log Level:')).toBeVisible();
    await expect(page.locator('text=Provider:')).toBeVisible();
    await expect(page.locator('label[for="ai-only"]')).toBeVisible();
    await expect(page.locator('table')).toBeVisible();
    await page.screenshot({ path: 'screenshots/final-03-page-structure.png', fullPage: true });

    // 5. Test pause/resume functionality
    const liveBadge = page.locator('div.inline-flex').filter({ hasText: 'Live' }).first();
    await expect(liveBadge).toBeVisible();
    
    const pauseBtn = page.locator('button').filter({ hasText: 'Pause' }).first();
    await pauseBtn.click();
    
    const pausedBadge = page.locator('div.inline-flex').filter({ hasText: 'Paused' }).first();
    await expect(pausedBadge).toBeVisible();
    await page.screenshot({ path: 'screenshots/final-04-paused-state.png', fullPage: true });

    const resumeBtn = page.locator('button').filter({ hasText: 'Resume' }).first();
    await resumeBtn.click();
    await expect(liveBadge).toBeVisible();
    await page.screenshot({ path: 'screenshots/final-05-resumed-state.png', fullPage: true });

    // 6. Test log level filtering
    const logLevelSelect = page.locator('div:has-text("Log Level:") + div').locator('button');
    await logLevelSelect.click();
    await page.waitForSelector('[role="option"]');
    await page.click('[role="option"]:has-text("Error")');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'screenshots/final-06-error-filter.png', fullPage: true });

    // Reset filter
    await logLevelSelect.click();
    await page.click('[role="option"]:has-text("All Levels")');
    await page.waitForTimeout(500);

    // 7. Test provider filtering
    const providerSelect = page.locator('div:has-text("Provider:") + div').locator('button');
    await providerSelect.click();
    await page.click('[role="option"]:has-text("OpenAI")');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'screenshots/final-07-provider-filter.png', fullPage: true });

    // Reset provider filter
    await providerSelect.click();
    await page.click('[role="option"]:has-text("All Providers")');
    await page.waitForTimeout(500);

    // 8. Test AI requests checkbox
    const checkbox = page.locator('input[type="checkbox"]#ai-only');
    await checkbox.check();
    await expect(checkbox).toBeChecked();
    await page.screenshot({ path: 'screenshots/final-08-checkbox-checked.png', fullPage: true });
    
    await checkbox.uncheck();
    await expect(checkbox).not.toBeChecked();

    // 9. Verify table data
    const tableRows = page.locator('table tbody tr');
    await expect(tableRows.first()).toBeVisible();
    
    // Check for log level badges
    const logBadges = page.locator('table tbody span.inline-flex');
    await expect(logBadges.first()).toBeVisible();
    await page.screenshot({ path: 'screenshots/final-09-table-data.png', fullPage: true });

    // 10. Test responsive behavior
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'screenshots/final-10-tablet-view.png', fullPage: true });

    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'screenshots/final-11-mobile-view.png', fullPage: true });

    // Reset to desktop
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(500);

    // 11. Test navigation back to dashboard
    await page.click('a[href="#dashboard"]');
    await page.waitForFunction(() => window.location.hash === '#dashboard');
    await expect(page.locator('a[href="#dashboard"]')).toHaveClass(/bg-primary/);
    await expect(page.locator('a[href="#logs"]')).not.toHaveClass(/bg-primary/);
    await page.screenshot({ path: 'screenshots/final-12-back-to-dashboard.png', fullPage: true });

    console.log('✅ All Live Logs functionality tests completed successfully!');
  });
});