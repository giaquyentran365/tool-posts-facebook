const express = require("express");
const router = express.Router();
const accountFbService = require("../services/accountfb.service");
const { authenticateToken } = require("../middleware/auth.middleware");

// All routes require authentication
router.use(authenticateToken);

// Get all Facebook accounts
router.get("/", async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const result = await accountFbService.getAccounts(req.user.id, {
      status,
      page,
      limit,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
});

// Get single Facebook account
router.get("/:id", async (req, res) => {
  try {
    const result = await accountFbService.getAccountById(
      req.user.id,
      req.params.id
    );
    res.json(result);
  } catch (error) {
    res
      .status(error.statusCode || 500)
      .json({ error: true, message: error.message });
  }
});

// Add new Facebook account
router.post("/", async (req, res) => {
  try {
    const { email, password, twoFaSecret, notes, tags } = req.body;

    if (!email) {
      return res
        .status(400)
        .json({ error: true, message: "Email is required" });
    }

    const result = await accountFbService.addAccount(req.user.id, {
      email,
      password,
      twoFaSecret,
      notes,
      tags,
    });

    res.status(201).json(result);
  } catch (error) {
    res
      .status(error.statusCode || 500)
      .json({ error: true, message: error.message });
  }
});

// Update Facebook account
router.put("/:id", async (req, res) => {
  try {
    const updates = req.body;
    const result = await accountFbService.updateAccount(
      req.user.id,
      req.params.id,
      updates
    );
    res.json(result);
  } catch (error) {
    res
      .status(error.statusCode || 500)
      .json({ error: true, message: error.message });
  }
});

// Update account tokens/cookies
router.post("/:id/update-tokens", async (req, res) => {
  try {
    const { accessToken, cookies } = req.body;
    const result = await accountFbService.updateTokens(
      req.user.id,
      req.params.id,
      {
        accessToken,
        cookies,
      }
    );
    res.json(result);
  } catch (error) {
    res
      .status(error.statusCode || 500)
      .json({ error: true, message: error.message });
  }
});

// Save Playwright storageState (cookies/localStorage) sent from browser after interactive login
router.post('/:id/save-storage', async (req, res) => {
  try {
    const storageState = req.body.storageState || req.body;
    if (!storageState) {
      return res.status(400).json({ error: true, message: 'storageState is required in request body' });
    }

    // Reuse updateTokens to store cookies JSON; accessToken remains unchanged
    const result = await accountFbService.updateTokens(req.user.id, req.params.id, {
      accessToken: null,
      cookies: storageState,
    });

    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: true, message: error.message });
  }
});

// Update account status
router.post("/:id/status", async (req, res) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        error: true,
        message: "Status is required",
      });
    }

    const result = await accountFbService.updateAccountStatus(
      req.user.id,
      req.params.id,
      status
    );
    res.json(result);
  } catch (error) {
    res
      .status(error.statusCode || 500)
      .json({ error: true, message: error.message });
  }
});

// Delete Facebook account
router.delete("/:id", async (req, res) => {
  try {
    const result = await accountFbService.deleteAccount(
      req.user.id,
      req.params.id
    );
    res.json(result);
  } catch (error) {
    res
      .status(error.statusCode || 500)
      .json({ error: true, message: error.message });
  }
});

module.exports = router;
