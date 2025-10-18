const { pool, query } = require("./database");
const { logger } = require("../utils/logger");

class MigrationService {
  /**
   * Run full database migration
   */
  async migrate() {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      console.log("Starting database migration...");

      await this.dropTables(client);

      await this.createTables(client);

      await this.createIndexes(client);

      await this.createTriggers(client);

      await client.query("COMMIT");

      console.log("Database migration completed successfully!");

      return {
        success: true,
        message: "Database migration completed successfully",
        tables: ["users", "groups", "posts", "logs"],
      };
    } catch (error) {
      await client.query("ROLLBACK");
      console.log("Migration failed:", error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Drop all tables
   */
  async dropTables(client) {
    console.log(" Dropping existing tables...");

    await client.query("DROP TABLE IF EXISTS logs CASCADE");
    await client.query("DROP TABLE IF EXISTS posts CASCADE");
    await client.query("DROP TABLE IF EXISTS groups CASCADE");
    await client.query("DROP TABLE IF EXISTS users CASCADE");

    console.log("Tables dropped");
  }

  /**
   * Create all tables
   */
  async createTables(client) {
    console.log("Creating tables...");

    // Users table
    await client.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        key VARCHAR(255) UNIQUE,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Users table created");

    // Groups table
    await client.query(`
      CREATE TABLE groups (
        id SERIAL PRIMARY KEY,
        user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
        group_id BIGINT NOT NULL,
        group_url TEXT NOT NULL,
        group_name VARCHAR(255),
        status VARCHAR(50) DEFAULT 'UNKNOWN',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, group_id)
      )
    `);
    console.log("Groups table created");

    // Posts table
    await client.query(`
      CREATE TABLE posts (
        id SERIAL PRIMARY KEY,
        user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255),
        content TEXT NOT NULL,
        images JSONB,
        status VARCHAR(50) DEFAULT 'DRAFT',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Posts table created");

    // Logs table
    await client.query(`
      CREATE TABLE logs (
        id SERIAL PRIMARY KEY,
        user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
        post_id BIGINT REFERENCES posts(id) ON DELETE SET NULL,
        group_id BIGINT REFERENCES groups(id) ON DELETE SET NULL,
        action VARCHAR(100) NOT NULL,
        status VARCHAR(50) NOT NULL,
        message TEXT,
        error_details JSONB,
        execution_time BIGINT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Accounts FB table created");

    // AccountFB table
    await client.query(`
    CREATE TABLE account_fbs (
      id SERIAL PRIMARY KEY,
      user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
      email VARCHAR(255) NOT NULL,
      password TEXT,
      access_token TEXT,
      cookies JSONB,
      two_fa_secret TEXT,
      status VARCHAR(50) DEFAULT 'ACTIVE',
      notes TEXT,
      tags JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, email)
    )
    `);
    console.log("Accounts FB table created");
  }

  /**
   * Create indexes
   */
  async createIndexes(client) {
    console.log("🔍 Creating indexes...");

    await client.query("CREATE INDEX idx_users_email ON users(email)");
    await client.query("CREATE INDEX idx_groups_user_id ON groups(user_id)");
    await client.query("CREATE INDEX idx_groups_status ON groups(status)");
    await client.query("CREATE INDEX idx_posts_user_id ON posts(user_id)");
    await client.query("CREATE INDEX idx_posts_status ON posts(status)");
    await client.query("CREATE INDEX idx_logs_user_id ON logs(user_id)");
    await client.query("CREATE INDEX idx_logs_created_at ON logs(created_at)");
    await client.query("CREATE INDEX idx_logs_status ON logs(status)");
    await client.query(
      "CREATE INDEX idx_account_fbs_user_id ON account_fbs(user_id)"
    );
    await client.query(
      "CREATE INDEX idx_account_fbs_status ON account_fbs(status)"
    );
    await client.query(
      "CREATE INDEX idx_account_fbs_email ON account_fbs(email)"
    );

    console.log("Indexes created");
  }

  /**
   * Create triggers
   */
  async createTriggers(client) {
    console.log("Creating triggers...");

    // Function for updated_at
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);

    // Triggers
    await client.query(`
      CREATE TRIGGER update_users_updated_at 
      BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);

    await client.query(`
      CREATE TRIGGER update_groups_updated_at 
      BEFORE UPDATE ON groups
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);

    await client.query(`
      CREATE TRIGGER update_posts_updated_at 
      BEFORE UPDATE ON posts
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);

    await client.query(`
      CREATE TRIGGER update_account_fbs_updated_at 
      BEFORE UPDATE ON account_fbs
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);

    console.log("Triggers created");
  }

  /**
   * Seed sample data
   */
  async seed() {
    const bcrypt = require("bcrypt");

    try {
      console.log("Seeding sample data...");

      // Create demo user
      const hashedPassword = await bcrypt.hash("demo123", 10);

      const userResult = await query(
        `INSERT INTO users (email, password) 
         VALUES ($1, $2, $3) 
         RETURNING id, email`,
        ["demo@example.com", hashedPassword]
      );

      const userId = userResult.rows[0].id;
      console.log(`Demo user created: demo@example.com / demo123`);

      // Create demo groups
      const groups = [
        {
          url: "https://facebook.com/groups/demo-group-1",
          name: "Demo Group 1",
        },
        {
          url: "https://facebook.com/groups/demo-group-2",
          name: "Demo Group 2",
        },
        {
          url: "https://facebook.com/groups/demo-group-3",
          name: "Demo Group 3",
        },
      ];

      for (const group of groups) {
        await query(
          `INSERT INTO groups (user_id, group_id, group_url, group_name, status)
           VALUES ($1, $2, $3, $4, 'JOINED')`,
          [userId, group.url.split("/").pop(), group.url, group.name]
        );
      }
      console.log("Demo groups created (3)");

      // Create demo post
      await query(
        `INSERT INTO posts (user_id, title, content, status)
         VALUES ($1, $2, $3, 'DRAFT')`,
        [userId, "Demo Post", "This is a demo post for testing! 🚀"]
      );
      console.log("Demo post created");

      return {
        success: true,
        message: "Sample data seeded successfully",
        demoUser: {
          email: "demo@example.com",
          password: "demo123",
        },
      };
    } catch (error) {
      console.log("Seeding failed:", error);
      throw error;
    }
  }

  /**
   * Check database status
   */
  async status() {
    try {
      const tables = ["users", "groups", "posts", "logs"];
      const status = {};

      for (const table of tables) {
        const result = await query(`SELECT COUNT(*) as count FROM ${table}`);
        status[table] = parseInt(result.rows[0].count);
      }

      return {
        success: true,
        data: {
          connected: true,
          tables: status,
          totalRecords: Object.values(status).reduce((a, b) => a + b, 0),
        },
      };
    } catch (error) {
      return {
        success: false,
        data: {
          connected: false,
          error: error.message,
        },
      };
    }
  }

  /**
   * Reset database (drop + migrate + seed)
   */
  async reset() {
    try {
      console.log("Resetting database...");

      await this.migrate();
      await this.seed();

      console.log("Database reset completed!");

      return {
        success: true,
        message: "Database reset completed successfully",
      };
    } catch (error) {
      console.log("Reset failed:", error);
      throw error;
    }
  }
}

module.exports = new MigrationService();
