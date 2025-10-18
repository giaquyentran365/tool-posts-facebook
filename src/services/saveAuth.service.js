// Auto-detect manual login completion and save storage state to auth.json
const fs = require("fs");
const path = require("path");
const os = require("os");
const { chromium } = require("rebrowser-playwright");

const AUTH_PATH = path.resolve(process.cwd(), "auth.json");
const MAX_WAIT_MS = 5 * 60 * 1000; // 5 minutes
const POLL_INTERVAL_MS = 2000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  // prepare temp profile directory
  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "rebrowser-profile-"));

  const context = await chromium.launchPersistentContext(tmpBase, {
    headless: false,
    channel: "chrome",
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
    timezoneId: "Asia/Ho_Chi_Minh",
  });

  try {
    const page = await context.newPage();
    await page.goto("https://www.facebook.com/login", {
      waitUntil: "domcontentloaded",
    });

    console.log(
      "Browser opened. Please complete login in the opened window (no need to press Enter)."
    );
    const start = Date.now();
    let saved = false;

    while (Date.now() - start < MAX_WAIT_MS) {
      try {
        // 1) check for common "logged in" UI: composer/post box or profile/avatar
        const composerCount = await page
          .locator('[aria-label*="Create a post"], [role="textbox"]')
          .count();
        if (composerCount > 0) {
          await context.storageState({ path: AUTH_PATH });
          console.log("Detected composer -> saved auth.json");
          saved = true;
          break;
        }

        // 2) check cookies for c_user (Facebook logged-in cookie)
        const cookies = await context.cookies();
        if (cookies.some((c) => c.name === "c_user")) {
          await context.storageState({ path: AUTH_PATH });
          console.log("Detected c_user cookie -> saved auth.json");
          saved = true;
          break;
        }

        // 3) check URL isn't login/checkpoint anymore
        const url = page.url();
        if (
          !/login|checkpoint|two_factor|two_step_verification|authentication/i.test(
            url
          )
        ) {
          // extra check: if homepage loaded and not login
          const body = (await page.content()).toLowerCase();
          if (
            !body.includes("log in") &&
            !body.includes("sign up") &&
            !body.includes("two-step")
          ) {
            await context.storageState({ path: AUTH_PATH });
            console.log("URL changed away from login -> saved auth.json");
            saved = true;
            break;
          }
        }

        // 4) detect explicit challenge (captcha) page to inform UI if needed
        if (
          /checkpoint|two_factor|two_step_verification|authentication/i.test(
            page.url()
          )
        ) {
          console.warn(
            "Challenge page detected. Continue solving manually in the browser."
          );
          // keep waiting: user may solve the challenge in the same window
        }
      } catch (err) {
        // ignore transient errors during checks
      }

      await sleep(POLL_INTERVAL_MS);
    }

    if (!saved) {
      console.error(
        "Timeout: login/auth not detected within timeout. auth.json not saved."
      );
      await context.close();
      process.exitCode = 2;
      return;
    }

    // close and finish
    await context.close();
    console.log("Done. auth.json is saved at:", AUTH_PATH);
    process.exit(0);
  } catch (e) {
    console.error("Fatal error while saving auth:", e);
    try {
      await context.close();
    } catch (_) { }
    process.exitCode = 1;
  }
})();
