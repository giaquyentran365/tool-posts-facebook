const { query } = require("../config/database");
const { paginate } = require("../utils/helpers");
const { logAction, logger } = require("../utils/logger");
const fs = require("fs");

class PostService {
  /**
   * Get all posts for a user
   */
  async getPosts(userId, filters = {}) {
    try {
      const { status, page = 1, limit = 20 } = filters;
      const { limit: pageLimit, offset } = paginate(
        parseInt(page),
        parseInt(limit)
      );

      let queryText = `
        SELECT id, title, content, images, status, created_at, updated_at
        FROM posts
        WHERE user_id = $1
      `;

      const params = [userId];

      // Filter by status
      if (status) {
        queryText += ` AND status = $${params.length + 1}`;
        params.push(status);
      }

      queryText += ` ORDER BY created_at DESC LIMIT $${
        params.length + 1
      } OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await query(queryText, params);

      // Get total count
      const countResult = await query(
        "SELECT COUNT(*) FROM posts WHERE user_id = $1" +
          (status ? " AND status = $2" : ""),
        status ? [userId, status] : [userId]
      );

      const totalCount = parseInt(countResult.rows[0].count);

      return {
        success: true,
        data: {
          posts: result.rows,
          pagination: {
            page: parseInt(page),
            limit: pageLimit,
            totalCount,
            totalPages: Math.ceil(totalCount / pageLimit),
          },
        },
      };
    } catch (error) {
      console.error(error);
      logger.error("Failed to get posts:", error);
      throw error;
    }
  }

  /**
   * Get single post by ID
   */
  async getPostById(userId, postId) {
    try {
      const result = await query(
        `SELECT id, title, content, images, status, created_at, updated_at
         FROM posts
         WHERE id = $1 AND user_id = $2`,
        [postId, userId]
      );

      if (result.rows.length === 0) {
        const error = new Error("Post not found");
        error.statusCode = 404;
        throw error;
      }

      return {
        success: true,
        data: { post: result.rows[0] },
      };
    } catch (error) {
      logger.error("Failed to get post:", error);
      throw error;
    }
  }

  /**
   * Create new post
   */
  async createPost(userId, postData) {
    try {
      const { title, content, images = [] } = postData;

      if (!content || content.trim().length === 0) {
        const error = new Error("Post content cannot be empty");
        error.statusCode = 400;
        throw error;
      }

      const result = await query(
        `INSERT INTO posts (user_id, title, content, images, status)
         VALUES ($1, $2, $3, $4, 'DRAFT')
         RETURNING id, title, content, images, status, created_at`,
        [userId, title, content, JSON.stringify(images)]
      );

      const post = result.rows[0];

      logger.success("Post created:", post.id);

      await logAction({
        userId,
        postId: post.id,
        action: "CREATE_POST",
        status: "SUCCESS",
        message: `Post created: ${post.id}`,
      });

      return {
        success: true,
        message: "Post created successfully",
        data: { post },
      };
    } catch (error) {
      logger.error("Failed to create post:", error);
      throw error;
    }
  }

  /**
   * Update post
   */
  async updatePost(userId, postId, updates) {
    try {
      const { title, content, status } = updates;

      // Build update query dynamically
      const updateFields = [];
      const params = [userId, postId];
      let paramIndex = 3;

      if (title !== undefined) {
        updateFields.push(`title = $${paramIndex++}`);
        params.push(title);
      }

      if (content !== undefined) {
        if (content.trim().length === 0) {
          const error = new Error("Post content cannot be empty");
          error.statusCode = 400;
          throw error;
        }
        updateFields.push(`content = $${paramIndex++}`);
        params.push(content);
      }

      if (status !== undefined) {
        const validStatuses = [
          "DRAFT",
          "SCHEDULED",
          "PUBLISHING",
          "PUBLISHED",
          "FAILED",
        ];
        if (!validStatuses.includes(status)) {
          const error = new Error("Invalid status");
          error.statusCode = 400;
          throw error;
        }
        updateFields.push(`status = $${paramIndex++}`);
        params.push(status);
      }

      if (updateFields.length === 0) {
        const error = new Error("No fields to update");
        error.statusCode = 400;
        throw error;
      }

      updateFields.push("updated_at = CURRENT_TIMESTAMP");

      const result = await query(
        `UPDATE posts SET ${updateFields.join(", ")}
         WHERE user_id = $1 AND id = $2
         RETURNING id, title, content, images, status, updated_at`,
        params
      );

      if (result.rows.length === 0) {
        const error = new Error("Post not found");
        error.statusCode = 404;
        throw error;
      }

      logger.success("Post updated:", postId);

      await logAction({
        userId,
        postId,
        action: "UPDATE_POST",
        status: "SUCCESS",
        message: `Post updated: ${postId}`,
      });

      return {
        success: true,
        message: "Post updated successfully",
        data: { post: result.rows[0] },
      };
    } catch (error) {
      logger.error("Failed to update post:", error);
      throw error;
    }
  }

  /**
   * Add images to existing post
   */
  async addImagesToPost(userId, postId, newImages) {
    try {
      // Get current images
      const postResult = await query(
        "SELECT images FROM posts WHERE id = $1 AND user_id = $2",
        [postId, userId]
      );

      if (postResult.rows.length === 0) {
        const error = new Error("Post not found");
        error.statusCode = 404;
        throw error;
      }

      const currentImages = postResult.rows[0].images || [];
      const allImages = [...currentImages, ...newImages];

      // Update post with new images
      const result = await query(
        `UPDATE posts SET images = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND user_id = $3
         RETURNING id, images`,
        [JSON.stringify(allImages), postId, userId]
      );

      logger.success(`Added ${newImages.length} images to post:`, postId);

      await logAction({
        userId,
        postId,
        action: "ADD_IMAGES",
        status: "SUCCESS",
        message: `Added ${newImages.length} images to post`,
      });

      return {
        success: true,
        message: "Images added successfully",
        data: {
          post: result.rows[0],
          addedCount: newImages.length,
        },
      };
    } catch (error) {
      logger.error("Failed to add images:", error);
      throw error;
    }
  }

  /**
   * Delete post
   */
  async deletePost(userId, postId) {
    try {
      // Get post images first to delete files
      const postResult = await query(
        "SELECT images FROM posts WHERE id = $1 AND user_id = $2",
        [postId, userId]
      );

      if (postResult.rows.length === 0) {
        const error = new Error("Post not found");
        error.statusCode = 404;
        throw error;
      }

      const images = postResult.rows[0].images || [];

      // Delete post from database
      await query("DELETE FROM posts WHERE user_id = $1 AND id = $2", [
        userId,
        postId,
      ]);

      // Delete image files
      images.forEach((imagePath) => {
        try {
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
          }
        } catch (err) {
          logger.warn("Failed to delete image file:", imagePath);
        }
      });

      logger.success("Post deleted:", postId);

      await logAction({
        userId,
        postId,
        action: "DELETE_POST",
        status: "SUCCESS",
        message: `Post deleted: ${postId}`,
      });

      return {
        success: true,
        message: "Post deleted successfully",
      };
    } catch (error) {
      logger.error("Failed to delete post:", error);
      throw error;
    }
  }
}

module.exports = new PostService();
