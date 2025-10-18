const express = require("express");
const router = express.Router();
const authService = require("../services/auth.service");
const { authenticateToken } = require("../middleware/auth.middleware");

// Register new user
router.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: true,
        message: "Email and password are required",
      });
    }

    const result = await authService.register(email, password);
    res.status(201).json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: true,
      message: error.message,
    });
  }
});

// Login user
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: true,
        message: "Email and password are required",
      });
    }

    const result = await authService.login(email, password);
    res.json(result);
  } catch (error) {
    console.log(req);
    res.status(error.statusCode || 500).json({
      error: true,
      message: error.message,
    });
  }
});

// Get current user info
router.get("/me", authenticateToken, async (req, res) => {
  try {
    const result = await authService.getCurrentUser(req.user.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      error: true,
      message: error.message,
    });
  }
});

module.exports = router;
