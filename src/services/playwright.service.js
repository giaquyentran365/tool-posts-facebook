const fs = require("fs");
const path = require("path");
const { chromium } = require("rebrowser-playwright");

module.exports = {
  async postToGroupsAutomation(params) {
    const {
      groupIds,
      postId,
      authStatePath,
      storageStateObj,
      delayMinMs,
      delayMaxMs,
      headless = false,
      proxy = null,
      userDataDir = null,
    } = params;

    // If neither file nor object storageState provided, throw
    if (!storageStateObj) {
      throw new Error(`No storage state provided`);
    }

    const browserOpts = {
      headless,
      channel: "chrome",
      args: [
        "--no-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-notifications",
      ],
      viewport: { width: 1280, height: 800 },
      locale: "en-US",
      timezoneId: "Asia/Ho_Chi_Minh",
      storageState: authStatePath,
    };

    if (proxy) browserOpts.proxy = proxy;
    if (userDataDir) browserOpts.storageState = undefined;

    let context;
    let browser;

    try {
      if (userDataDir) {
        context = await chromium.launchPersistentContext(
          userDataDir,
          browserOpts
        );
      } else {
        browser = await chromium.launch({ headless: headless, channel: 'chrome', args: browserOpts.args });
        context = await browser.newContext({ storageState: storageStateObj });
      }

      const page = await context.newPage();
      await page.goto("https://www.facebook.com/", {
        waitUntil: "domcontentloaded",
      });
      console.log("✅ Logged in. Starting group posting...");

      for (const groupId of groupIds) {
        const groupUrl = `https://www.facebook.com/groups/${groupId}`;
        console.log(`\n➡ Navigating to group: ${groupUrl}`);
        await page.goto(groupUrl, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(6000);

        const composerButtonSelector = 'div[role="button"] span:has-text("Bạn viết gì đi...")';
        const hasComposerButton = await page.locator(composerButtonSelector).count();

        if (!hasComposerButton) {
          console.log(
            `⚠ Composer button not found in group ${groupId}. Skipping...`
          );
          continue;
        }

        await page.locator(foundComposer).first().click({ delay: 100 });
        await page.waitForTimeout(2000);

        // Wait for textbox inside popup
        const textBoxSelector = 'div[role="dialog"] div[role="textbox"]';
        await page.waitForSelector(textBoxSelector, { timeout: 10000 });
        await page.locator(textBoxSelector).click();
        await page.keyboard.type(
          `Automated post ID ${postId} to group ${groupId}`,
          { delay: 30 }
        );

        // Find Post button (new layout)
        const postButtonSelector =
          'div[role="dialog"] div[aria-label="Đăng"], div[role="button"]:has-text("Post")';
        const hasPostButton = await page.locator(postButtonSelector).count();

        if (hasPostButton) {
          await page.locator(postButtonSelector).click();
          console.log(`✅ Posted to group ${groupId}`);
        } else {
          console.log(`⚠ Post button not found for group ${groupId}`);
        }

        // Random delay between posts
        const delay = this.randomDelay(delayMinMs, delayMaxMs);
        console.log(
          `⏳ Waiting ${Math.round(delay / 1000)}s before next group...`
        );
        await page.waitForTimeout(delay);
      }

      console.log("\n🎯 Finished posting to all groups.");
    } catch (err) {
      console.error("Automation failed:", err);
    } finally {
      if (context) await context.close();
      if (browser) await browser.close();
    }

    return { success: true };
  },

  async checkLoggedIn(page) {
    try {
      const cookies = await page.context().cookies();
      const cUser = cookies.find((c) => c.name === "c_user");
      if (!cUser) return false;
      const isHomeVisible = await page.locator('div[role="feed"]').count();
      return !!isHomeVisible;
    } catch {
      return false;
    }
  },

  randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },
};
