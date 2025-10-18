const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { query } = require("../config/database");
const { isValidEmail } = require("../utils/helpers");
const { logAction, logger } = require("../utils/logger");

const SALT_ROUNDS = 10;

class AuthService {
  /**
   * Register new user
   */
  async register(email, password) {
    try {
      // Validate email
      if (!isValidEmail(email)) {
        const error = new Error("Invalid email format");
        error.statusCode = 400;
        throw error;
      }

      // Validate password length
      if (password.length < 6) {
        const error = new Error("Password must be at least 6 characters");
        error.statusCode = 400;
        throw error;
      }

      // Check if user exists
      const existingUser = await query(
        "SELECT id FROM users WHERE email = $1",
        [email]
      );

      if (existingUser.rows.length > 0) {
        const error = new Error("Email already registered");
        error.statusCode = 409;
        throw error;
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

      // Insert user
      const result = await query(
        `INSERT INTO users (email, password) 
         VALUES ($1, $2) 
         RETURNING id, email`,
        [email, hashedPassword]
      );

      const user = result.rows[0];

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
      );

      logger.success("User registered:", email);

      await logAction({
        userId: user.id,
        action: "USER_REGISTER",
        status: "SUCCESS",
        message: `User registered: ${email}`,
      });

      return {
        success: true,
        message: "User registered successfully",
        data: {
          user: {
            id: user.id,
            email: user.email,
            createdAt: user.created_at,
          },
          token,
        },
      };
    } catch (error) {
      logger.error("Registration failed:", error);
      throw error;
    }
  }

  /**
   * Login user
   */
  async login(email, password) {
    try {
      // Get user
      const result = await query(
        "SELECT id, email, password, is_active FROM users WHERE email = $1",
        [email]
      );

      if (result.rows.length === 0) {
        const error = new Error("Invalid email or password");
        error.statusCode = 401;
        throw error;
      }

      const user = result.rows[0];

      // Check if account is active
      if (!user.is_active) {
        const error = new Error("Account is deactivated");
        error.statusCode = 403;
        throw error;
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);

      if (!isValidPassword) {
        const error = new Error("Invalid email or password");
        error.statusCode = 401;
        throw error;
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
      );

      logger.success("User logged in:", email);

      await logAction({
        userId: user.id,
        action: "USER_LOGIN",
        status: "SUCCESS",
        message: `User logged in: ${email}`,
      });

      return {
        success: true,
        message: "Login successful",
        data: {
          user: {
            id: user.id,
            email: user.email,
          },
          token,
        },
      };
    } catch (error) {
      logger.error("Login failed:", error);
      throw error;
    }
  }

  /**
   * Get current user info
   */
  async getCurrentUser(userId) {
    try {
      const result = await query(
        `SELECT id, email, created_at, updated_at 
         FROM users WHERE id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
      }

      const user = result.rows[0];

      return {
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            createdAt: user.created_at,
            updatedAt: user.updated_at,
          },
        },
      };
    } catch (error) {
      logger.error("Failed to get user info:", error);
      throw error;
    }
  }
}

module.exports = new AuthService();
