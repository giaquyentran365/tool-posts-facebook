#!/usr/bin/env node
// Local helper to open a browser on the user's machine and save auth.json
const fs = require('fs');
const path = require('path');
const os = require('os');
const { chromium } = require('rebrowser-playwright');

const AUTH_PATH = path.resolve(process.cwd(), 'auth.json');

(async function main() {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'rebrowser-profile-'));

    let context;
    let browser;
    try {
        try {
            context = await chromium.launchPersistentContext(tmpBase, {
                headless: false,
                channel: 'chrome',
                args: ['--disable-blink-features=AutomationControlled'],
                viewport: { width: 1280, height: 800 },
            });
        } catch (e) {
            console.warn('Persistent context failed, falling back to non-persistent launch:', e.message);
            browser = await chromium.launch({ headless: false, channel: 'chrome' });
            context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        }

        const page = await context.newPage();
        await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded' });

        console.log('Browser opened. Please complete login manually in the opened window.');

        // Simple poll for c_user cookie or post composer
        const start = Date.now();
        const MAX_WAIT_MS = 5 * 60 * 1000;
        while (Date.now() - start < MAX_WAIT_MS) {
            try {
                const cookies = await context.cookies();
                if (cookies.some(c => c.name === 'c_user')) {
                    await context.storageState({ path: AUTH_PATH });
                    console.log('Saved auth.json at', AUTH_PATH);
                    break;
                }
                const composerCount = await page.locator('[aria-label*="Create a post"], [role="textbox"]').count();
                if (composerCount > 0) {
                    await context.storageState({ path: AUTH_PATH });
                    console.log('Detected composer -> saved auth.json at', AUTH_PATH);
                    break;
                }
            } catch (err) {
                // ignore
            }
            await new Promise(r => setTimeout(r, 2000));
        }

        try { if (context) await context.close(); } catch (_) { }
        try { if (browser) await browser.close(); } catch (_) { }

        console.log('Done. Copy the generated auth.json to the server project root to use automation.');
    } catch (e) {
        console.error('Failed to save auth:', e.stack || e);
        try { if (context) await context.close(); } catch (_) { }
        try { if (browser) await browser.close(); } catch (_) { }
        process.exit(1);
    }
})();
