const express = require("express");
const router = express.Router();
const groupService = require("../services/groups.service");
const { authenticateToken } = require("../middleware/auth.middleware");

// All routes require authentication
router.use(authenticateToken);

// Get all groups
router.get("/", async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const result = await groupService.getGroups(req.user.id, {
      status,
      page,
      limit,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
});

// Get single group
router.get("/:id", async (req, res) => {
  try {
    const result = await groupService.getGroupById(req.user.id, req.params.id);
    res.json(result);
  } catch (error) {
    res
      .status(error.statusCode || 500)
      .json({ error: true, message: error.message });
  }
});

// Add new group
router.post("/", async (req, res) => {
  try {
    const { groupId, groupName, notes } = req.body;
    if (!groupId) {
      return res
        .status(400)
        .json({ error: true, message: "Group ID is required" });
    }
    const result = await groupService.addGroup(req.user.id, {
      groupId,
      groupUrl: `https://facebook.com/groups/${groupId}`,
      groupName: groupName,
      notes,
    });
    res.status(201).json(result);
  } catch (error) {
    res
      .status(error.statusCode || 500)
      .json({ error: true, message: error.message });
  }
});

// Update group
router.put("/:id", async (req, res) => {
  try {
    const { groupName, notes, status } = req.body;
    const result = await groupService.updateGroup(req.user.id, req.params.id, {
      groupUrl,
      groupName,
      notes,
      status,
    });
    res.json(result);
  } catch (error) {
    res
      .status(error.statusCode || 500)
      .json({ error: true, message: error.message });
  }
});

// Delete group
router.delete("/:id", async (req, res) => {
  try {
    const result = await groupService.deleteGroup(req.user.id, req.params.id);
    res.json(result);
  } catch (error) {
    res
      .status(error.statusCode || 500)
      .json({ error: true, message: error.message });
  }
});

module.exports = router;
