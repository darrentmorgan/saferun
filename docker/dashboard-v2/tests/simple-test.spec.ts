import { test, expect } from '@playwright/test';

test.describe('Dashboard Basic Functionality', () => {
  test('should load the page and take initial screenshot', async ({ page }) => {
    // Navigate to the dashboard
    await page.goto('/');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
    
    // Wait a bit more for React to render
    await page.waitForTimeout(3000);
    
    // Take a screenshot to see what's actually rendered
    await page.screenshot({ path: 'screenshots/01-initial-load.png', fullPage: true });
    
    // Check if there are any visible elements
    const bodyText = await page.textContent('body');
    console.log('Page content:', bodyText?.substring(0, 200));
    
    // Simple assertion that the page loaded
    await expect(page.locator('body')).toBeVisible();
  });
  
  test('should identify dashboard elements', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Check for any h1 elements
    const h1Elements = page.locator('h1');
    const h1Count = await h1Elements.count();
    console.log(`Found ${h1Count} h1 elements`);
    
    if (h1Count > 0) {
      for (let i = 0; i < h1Count; i++) {
        const text = await h1Elements.nth(i).textContent();
        console.log(`H1 ${i}: ${text}`);
      }
    }
    
    // Check for sidebar
    const sidebar = page.locator('.fixed.inset-y-0.left-0').or(page.locator('[data-testid="sidebar"]'));
    const sidebarVisible = await sidebar.isVisible().catch(() => false);
    console.log('Sidebar visible:', sidebarVisible);
    
    // Take screenshot showing current state
    await page.screenshot({ path: 'screenshots/02-element-check.png', fullPage: true });
  });
  
  test('should find navigation links', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    // Look for any links
    const links = page.locator('a');
    const linkCount = await links.count();
    console.log(`Found ${linkCount} links`);
    
    if (linkCount > 0) {
      for (let i = 0; i < Math.min(linkCount, 10); i++) {
        const href = await links.nth(i).getAttribute('href');
        const text = await links.nth(i).textContent();
        console.log(`Link ${i}: "${text}" -> ${href}`);
      }
    }
    
    // Take screenshot
    await page.screenshot({ path: 'screenshots/03-links-check.png', fullPage: true });
  });
});