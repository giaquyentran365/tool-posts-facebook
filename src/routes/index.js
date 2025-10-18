const express = require("express");

const authRoutes = require("./auth.routes.js");
const groupRoutes = require("./groups.routes.js");
const postRoutes = require("./post.routes.js");
const automationRoutes = require("./automation.routes.js");
const reportRoutes = require("./report.routes.js");
const accountfbRoutes = require("./accountfb.routes.js");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/groups", groupRoutes);
router.use("/posts", postRoutes);
router.use("/automation", automationRoutes);
router.use("/reports", reportRoutes);
router.use("/accountfb", accountfbRoutes);

module.exports = router;
