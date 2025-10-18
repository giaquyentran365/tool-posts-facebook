const { query } = require("../config/database");
const { paginate } = require("../utils/helpers");
const { logAction, logger } = require("../utils/logger");
const bcrypt = require("bcrypt");

class AccountFbService {
  /**
   * Get all Facebook accounts
   */
  async getAccounts(userId, filters = {}) {
    try {
      const { status, page = 1, limit = 20 } = filters;
      const { limit: pageLimit, offset } = paginate(
        parseInt(page),
        parseInt(limit)
      );

      let queryText = `
        SELECT id, email, status, notes, tags, created_at, updated_at
        FROM account_fbs
        WHERE user_id = $1
      `;

      const params = [userId];

      if (status) {
        params.push(status);
        queryText += ` AND status = ${params.length}`;
      }

      queryText += ` ORDER BY created_at DESC LIMIT ${
        params.length + 1
      } OFFSET ${params.length + 2}`;
      params.push(pageLimit, offset);

      const result = await query(queryText, params);

      // Get total count
      const countResult = await query(
        "SELECT COUNT(*) FROM account_fbs WHERE user_id = $1" +
          (status ? " AND status = $2" : ""),
        status ? [userId, status] : [userId]
      );

      const totalCount = parseInt(countResult.rows[0].count);

      return {
        success: true,
        data: {
          accounts: result.rows,
          pagination: {
            page: parseInt(page),
            limit: pageLimit,
            totalCount,
            totalPages: Math.ceil(totalCount / pageLimit),
          },
        },
      };
    } catch (error) {
      logger.error("Failed to get Facebook accounts:", error);
      throw error;
    }
  }

  /**
   * Get single Facebook account by ID
   */
  async getAccountById(userId, accountId) {
    try {
      const result = await query(
        `SELECT * FROM account_fbs WHERE id = $1 AND user_id = $2`,
        [accountId, userId]
      );

      if (result.rows.length === 0) {
        const error = new Error("Facebook account not found");
        error.statusCode = 404;
        throw error;
      }

      const account = result.rows[0];
      // Mask sensitive data
      if (account.password) account.password = "********";
      if (account.access_token)
        account.access_token = account.access_token.substring(0, 20) + "...";

      return {
        success: true,
        data: { account },
      };
    } catch (error) {
      logger.error("Failed to get Facebook account:", error);
      throw error;
    }
  }

  /**
   * Add new Facebook account
   */
  async addAccount(userId, accountData) {
    try {
      const { email, password, twoFaSecret, notes, tags } = accountData;

      // Check if account already exists
      const existing = await query(
        "SELECT id FROM account_fbs WHERE user_id = $1 AND email = $2",
        [userId, email]
      );

      if (existing.rows.length > 0) {
        const error = new Error("Facebook account already exists");
        error.statusCode = 409;
        throw error;
      }

      // Encrypt password if provided
      let encryptedPassword = null;
      if (password) {
        encryptedPassword = await bcrypt.hash(password, 10);
      }

      // Insert account
      const result = await query(
        `INSERT INTO account_fbs 
         (user_id, email, password, two_fa_secret, notes, tags, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE')
         RETURNING id, email, status, created_at`,
        [
          userId,
          email,
          encryptedPassword,
          twoFaSecret ?? "",
          notes,
          tags ? JSON.stringify(tags) : null,
        ]
      );

      const account = result.rows[0];

      logger.success("Facebook account added:", email);

      await logAction({
        userId,
        action: "ADD_FB_ACCOUNT",
        status: "SUCCESS",
        message: `Facebook account added: ${email}`,
      });

      return {
        success: true,
        message: "Facebook account added successfully",
        data: { account },
      };
    } catch (error) {
      console.error(error);
      logger.error("Failed to add Facebook account:", error);
      throw error;
    }
  }

  /**
   * Update Facebook account
   */
  async updateAccount(userId, accountId, updates) {
    try {
      const { email, password, twoFaSecret, notes, tags, status } = updates;

      const updateFields = [];
      const params = [userId, accountId];
      let paramIndex = 3;

      if (email !== undefined) {
        updateFields.push(`email = ${paramIndex++}`);
        params.push(email);
      }

      if (password !== undefined && password !== "") {
        const encryptedPassword = await bcrypt.hash(password, 10);
        updateFields.push(`password = ${paramIndex++}`);
        params.push(encryptedPassword);
      }

      if (twoFaSecret !== undefined) {
        updateFields.push(`two_fa_secret = ${paramIndex++}`);
        params.push(twoFaSecret);
      }

      if (notes !== undefined) {
        updateFields.push(`notes = ${paramIndex++}`);
        params.push(notes);
      }

      if (tags !== undefined) {
        updateFields.push(`tags = ${paramIndex++}`);
        params.push(JSON.stringify(tags));
      }

      if (status !== undefined) {
        updateFields.push(`status = ${paramIndex++}`);
        params.push(status);
      }

      if (updateFields.length === 0) {
        const error = new Error("No fields to update");
        error.statusCode = 400;
        throw error;
      }

      updateFields.push("updated_at = CURRENT_TIMESTAMP");

      const result = await query(
        `UPDATE account_fbs SET ${updateFields.join(", ")}
         WHERE user_id = $1 AND id = $2
         RETURNING id, email, status, updated_at`,
        params
      );

      if (result.rows.length === 0) {
        const error = new Error("Facebook account not found");
        error.statusCode = 404;
        throw error;
      }

      logger.success("Facebook account updated:", accountId);

      return {
        success: true,
        message: "Facebook account updated successfully",
        data: { account: result.rows[0] },
      };
    } catch (error) {
      logger.error("Failed to update Facebook account:", error);
      throw error;
    }
  }

  /**
   * Update account tokens (after login)
   */
  async updateTokens(userId, accountId, tokenData) {
    try {
      const { accessToken, cookies } = tokenData;

      const result = await query(
        `UPDATE account_fbs 
         SET access_token = $1, cookies = $2, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $3 AND id = $4
         RETURNING id, email, status`,
        [accessToken, JSON.stringify(cookies), userId, accountId]
      );

      if (result.rows.length === 0) {
        const error = new Error("Facebook account not found");
        error.statusCode = 404;
        throw error;
      }

      logger.success("Tokens updated for account:", accountId);

      return {
        success: true,
        message: "Tokens updated successfully",
        data: { account: result.rows[0] },
      };
    } catch (error) {
      logger.error("Failed to update tokens:", error);
      throw error;
    }
  }

  /**
   * Update account status
   */
  async updateAccountStatus(userId, accountId, status) {
    try {
      const result = await query(
        `UPDATE account_fbs 
         SET status = $1, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $2 AND id = $3
         RETURNING id, email, status`,
        [status, userId, accountId]
      );

      if (result.rows.length === 0) {
        const error = new Error("Facebook account not found");
        error.statusCode = 404;
        throw error;
      }

      logger.success(`Account status updated to ${status}:`, accountId);

      return {
        success: true,
        message: "Account status updated successfully",
        data: { account: result.rows[0] },
      };
    } catch (error) {
      logger.error("Failed to update account status:", error);
      throw error;
    }
  }

  /**
   * Delete Facebook account
   */
  async deleteAccount(userId, accountId) {
    try {
      const result = await query(
        "DELETE FROM account_fbs WHERE user_id = $1 AND id = $2 RETURNING id, email",
        [userId, accountId]
      );

      if (result.rows.length === 0) {
        const error = new Error("Facebook account not found");
        error.statusCode = 404;
        throw error;
      }

      logger.success("Facebook account deleted:", accountId);

      await logAction({
        userId,
        action: "DELETE_FB_ACCOUNT",
        status: "SUCCESS",
        message: `Facebook account deleted: ${result.rows[0].email}`,
      });

      return {
        success: true,
        message: "Facebook account deleted successfully",
      };
    } catch (error) {
      logger.error("Failed to delete Facebook account:", error);
      throw error;
    }
  }
}

module.exports = new AccountFbService();
