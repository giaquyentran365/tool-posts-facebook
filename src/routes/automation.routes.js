const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const os = require("os");
const { chromium } = require("rebrowser-playwright");
const postService = require("../services/post.service");
const groupsService = require("../services/groups.service");
const accountfbService = require("../services/accountfb.service");
const { authenticateToken } = require("../middleware/auth.middleware");
const playwrightService = require("../services/playwright.service");

router.use(authenticateToken);

router.post("/post-to-groups", async (req, res) => {
  try {
    const { postId, fbAccountId, headless = true, delayMin = 30, delayMax = 60 } = req.body;

    if (!postId) {
      return res.status(400).json({ error: true, message: "postId is required" });
    }

    if (!fbAccountId) {
      return res.status(400).json({ error: true, message: "fbAccountId is required" });
    }

    const authPath = path.resolve(__dirname, "../../auth.json");
    if (!fs.existsSync(authPath)) {
      return res.status(401).json({
        error: true,
        message: "Session not found. Please login again using saveAuthAuto.js or the UI login.",
      });
    }

    const [postData, fbAccountData, groupList] = await Promise.all([
      postService.getPostById(req.user.id, postId),
      accountfbService.getAccountById(req.user.id, fbAccountId),
      groupsService.getGroups(req.user.id),
    ]);
    if (!postData.data.post) {
      return res.status(404).json({ error: true, message: "Post not found in database." });
    }
    if (!fbAccountData.data) {
      return res.status(404).json({ error: true, message: "Facebook account not found." });
    }
    if (!groupList.data.groups || groupList.data.groups.length === 0) {
      return res.status(400).json({ error: true, message: "No groups linked to this account." });
    }

    const params = {
      userId: req.user.id,
      postId,
      fbAccountId,
      groupIds: groupList.data.groups.map((g) => g.group_id),
      cookieString: fbAccountData.cookie || null,
      credentials: {
        email: fbAccountData.email,
        password: fbAccountData.password,
      },
      headless,
      delayMinMs: delayMin,
      delayMaxMs: delayMax,
      authStatePath: authPath,
      postContent: postData.content,
      postMedia: postData.media_url || null,
    };

    const result = await playwrightService.postToGroupsAutomation(params);

    res.json({ success: true, data: result });
  } catch (error) {
    console.log(error);
    console.error("Automation error:", error);
    let message = error.message || "Automation failed";
    let status = error.statusCode || 500;

    if (message.includes("Session invalid") || message.includes("storageState")) {
      status = 401;
      message = "Session invalid or expired. Please re-login.";
    }

    res.status(status).json({ error: true, message });
  }
});

router.post("/save-auth", async (req, res) => {
  const AUTH_PATH = path.resolve(process.cwd(), "auth.json");

  const MAX_WAIT_MS = 5 * 60 * 1000;
  const POLL_INTERVAL_MS = 2000;

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  try {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "rebrowser-profile-"));

    const context = await chromium.launchPersistentContext(tmpBase, {
      headless: false,
      channel: "chrome",
      args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
      viewport: { width: 1280, height: 800 },
      locale: "en-US",
      timezoneId: "Asia/Ho_Chi_Minh",
    });

    const page = await context.newPage();
    await page.goto("https://www.facebook.com/login", {
      waitUntil: "domcontentloaded",
    });

    console.log("Browser opened. Please complete login manually...");

    const start = Date.now();
    let saved = false;

    while (Date.now() - start < MAX_WAIT_MS) {
      try {
        // 1 Check post composer (logged-in)
        const composerCount = await page
          .locator('[aria-label*="Create a post"], [role="textbox"]')
          .count();

        if (composerCount > 0) {
          await context.storageState({ path: AUTH_PATH });
          saved = true;
          console.log("✅ Detected composer -> saved auth.json");
          break;
        }

        // 2 Check c_user cookie
        const cookies = await context.cookies();
        if (cookies.some((c) => c.name === "c_user")) {
          await context.storageState({ path: AUTH_PATH });
          saved = true;
          console.log("✅ Detected c_user cookie -> saved auth.json");
          break;
        }

        // 3 Check URL (away from login/checkpoint)
        const url = page.url();
        if (
          !/login|checkpoint|two_factor|two_step_verification|authentication/i.test(url)
        ) {
          const body = (await page.content()).toLowerCase();
          if (
            !body.includes("log in") &&
            !body.includes("sign up") &&
            !body.includes("two-step")
          ) {
            await context.storageState({ path: AUTH_PATH });
            saved = true;
            console.log("✅ URL changed -> saved auth.json");
            break;
          }
        }
      } catch (err) {
      }

      await sleep(POLL_INTERVAL_MS);
    }

    await context.close();

    if (!saved) {
      console.warn("⚠ Timeout: auth.json not saved within 5 minutes.");
      return res.status(408).json({
        error: true,
        message: "Timeout: login not detected. Please try again.",
      });
    }

    return res.json({
      success: true,
      message: "auth.json saved successfully.",
      path: AUTH_PATH,
    });
  } catch (e) {
    console.error("❌ Error during auth saving:", e);
    return res.status(500).json({
      error: true,
      message: "Failed to save auth.json",
      details: e.message,
    });
  }
});

module.exports = router;
