const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const postService = require("../services/post.service");
const { authenticateToken } = require("../middleware/auth.middleware");

// Create uploads directory if not exists
const uploadDir = "./uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "post-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed (jpeg, jpg, png, gif)"));
    }
  },
});

// All routes require authentication
router.use(authenticateToken);

// Get all posts
router.get("/", async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const result = await postService.getPosts(req.user.id, {
      status,
      page,
      limit,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
});

// Get single post
router.get("/:id", async (req, res) => {
  try {
    const result = await postService.getPostById(req.user.id, req.params.id);
    res.json(result);
  } catch (error) {
    res
      .status(error.statusCode || 500)
      .json({ error: true, message: error.message });
  }
});

// Create new post
router.post("/", upload.array("images", 10), async (req, res) => {
  try {
    const { title, content } = req.body;

    if (!content) {
      return res
        .status(400)
        .json({ error: true, message: "Content is required" });
    }

    // Get uploaded image paths
    const images = req.files ? req.files.map((file) => file.path) : [];

    const result = await postService.createPost(req.user.id, {
      title,
      content,
      images,
    });

    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: true, message: error.message });
  }
});

// Update post
router.put("/:id", async (req, res) => {
  try {
    const { title, content, status } = req.body;
    const result = await postService.updatePost(req.user.id, req.params.id, {
      title,
      content,
      status,
    });
    res.json(result);
  } catch (error) {
    res
      .status(error.statusCode || 500)
      .json({ error: true, message: error.message });
  }
});

// Upload images to existing post
router.post("/:id/images", upload.array("images", 10), async (req, res) => {
  try {
    const images = req.files ? req.files.map((file) => file.path) : [];

    if (images.length === 0) {
      return res
        .status(400)
        .json({ error: true, message: "No images uploaded" });
    }

    const result = await postService.addImagesToPost(
      req.user.id,
      req.params.id,
      images
    );
    res.json(result);
  } catch (error) {
    res
      .status(error.statusCode || 500)
      .json({ error: true, message: error.message });
  }
});

// Delete post
router.delete("/:id", async (req, res) => {
  try {
    const result = await postService.deletePost(req.user.id, req.params.id);
    res.json(result);
  } catch (error) {
    res
      .status(error.statusCode || 500)
      .json({ error: true, message: error.message });
  }
});

module.exports = router;
