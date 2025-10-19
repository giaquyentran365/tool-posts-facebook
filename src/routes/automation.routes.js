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
const authPlaywright = require('../services/authPlaywright.service');

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

    // Prefer storageState from DB (account cookies) if available, otherwise fallback to auth.json
    const storageStateObj = fbAccountData && fbAccountData.data && fbAccountData.data.account && fbAccountData.data.account.cookies
      ? (typeof fbAccountData.data.account.cookies === 'string' ? JSON.parse(fbAccountData.data.account.cookies) : fbAccountData.data.account.cookies)
      : null;

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
      storageStateObj: storageStateObj,
      postContent: postData.data.post.content,
      postMedia: postData.data.post.images || null,
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

// Auto-login endpoint: server runs Playwright with provided credentials and saves storageState to DB
router.post('/auto-login/:accountId', async (req, res) => {
  try {
    const accountId = req.params.accountId;
    const { email, password, headless = false } = req.body;
    if (!email || !password) return res.status(400).json({ error: true, message: 'email and password required' });

    const result = await authPlaywright.performLoginAndSave(req.user.id, accountId, { email, password }, { headless });
    res.json({ success: true, data: result });
  } catch (e) {
    console.error('Auto-login failed:', e.stack || e);
    res.status(e.statusCode || 500).json({ error: true, message: e.message });
  }
});

module.exports = router;
