const fs = require('fs');
const path = require('path');
const os = require('os');
const { chromium } = require('rebrowser-playwright');
const accountFbService = require('./accountfb.service');

class AuthPlaywrightService {
    /**
     * Perform login using Playwright on the server (interactive) and save storageState to DB
     * credentials: { email, password }
     * options: { headless }
     */
    async performLoginAndSave(userId, accountId, credentials = {}, options = {}) {
        const { email, password } = credentials;
        const { headless = false, timeoutMs = 120000 } = options;

        if (!email || !password) {
            const e = new Error('email and password are required');
            e.statusCode = 400;
            throw e;
        }

        const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'rebrowser-profile-'));
        let context;
        let browser;

        try {
            // Launch a persistent context so that storageState and cookies are available
            try {
                context = await chromium.launchPersistentContext(tmpBase, {
                    headless: !!headless,
                    channel: 'chrome',
                    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
                    viewport: { width: 1280, height: 800 },
                    locale: 'en-US',
                    timezoneId: 'Asia/Ho_Chi_Minh',
                });
            } catch (err) {
                // Fallback to non-persistent
                browser = await chromium.launch({ headless: !!headless, channel: 'chrome' });
                context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
            }

            const page = await context.newPage();
            await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded' });

            // Fill login form - multiple selector fallbacks
            const emailSelector = 'input[name="email"], input#email';
            const passSelector = 'input[name="pass"], input#pass';
            const loginBtn = 'button[name="login"], button:has-text("Log In"), button:has-text("Đăng nhập")';

            await page.waitForSelector(emailSelector, { timeout: 10000 });
            await page.fill(emailSelector, email, { timeout: 5000 }).catch(() => { });
            await page.fill(passSelector, password, { timeout: 5000 }).catch(() => { });
            // Try clicking login
            await Promise.race([
                page.click(loginBtn, { timeout: 5000 }).catch(() => { }),
                page.keyboard.press('Enter').catch(() => { }),
            ]);

            // Wait for either c_user cookie or composer or URL change
            const start = Date.now();
            let saved = false;
            while (Date.now() - start < timeoutMs) {
                try {
                    const cookies = await context.cookies();
                    if (cookies.some(c => c.name === 'c_user')) {
                        const storageState = await context.storageState();
                        // Save storageState into DB for this account
                        await accountFbService.updateTokens(userId, accountId, { accessToken: null, cookies: storageState });
                        saved = true;
                        return { success: true, message: 'Logged in and storageState saved', storageState };
                    }

                    // composer detection
                    const composer = await page.locator('[aria-label*="Create a post"], [role="textbox"]').count();
                    if (composer > 0) {
                        const storageState = await context.storageState();
                        await accountFbService.updateTokens(userId, accountId, { accessToken: null, cookies: storageState });
                        saved = true;
                        return { success: true, message: 'Logged in and storageState saved (composer detected)', storageState };
                    }
                } catch (err) {
                    // ignore transient errors
                }
                await new Promise(r => setTimeout(r, 2000));
            }

            if (!saved) {
                throw new Error('Login not detected within timeout (maybe 2FA/checkpoint required)');
            }
        } catch (err) {
            throw err;
        } finally {
            try { if (context) await context.close(); } catch (_) { }
            try { if (browser) await browser.close(); } catch (_) { }
        }
    }
}

module.exports = new AuthPlaywrightService();
