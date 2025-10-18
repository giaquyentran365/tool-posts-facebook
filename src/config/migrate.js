#!/usr/bin/env node

require("dotenv").config();
const migrationService = require("./migration.service");

const command = process.argv[2];

const commands = {
  migrate: async () => {
    console.log("Running migration...\n");
    await migrationService.migrate();
    process.exit(0);
  },

  seed: async () => {
    console.log("Seeding data...\n");
    const result = await migrationService.seed();
    console.log("\nDemo Credentials:");
    console.log(`   Email: ${result.demoUser.email}`);
    console.log(`   Password: ${result.demoUser.password}`);
    process.exit(0);
  },

  reset: async () => {
    console.log("Resetting database...\n");
    const result = await migrationService.reset();
    console.log("\nDemo Credentials:");
    console.log(`   Email: demo@example.com`);
    console.log(`   Password: demo123`);
    process.exit(0);
  },

  status: async () => {
    console.log("Checking database status...\n");
    const result = await migrationService.status();
    console.log(JSON.stringify(result.data, null, 2));
    process.exit(0);
  },

  help: () => {
    console.log(`
📚 Database Migration Tool

Usage:
  node migrate.js [command]

Commands:
  migrate    Run database migration (create tables, indexes, triggers)
  seed       Seed sample data (demo user + 3 groups + 1 post)
  reset      Reset database (migrate + seed)
  status     Check database status
  help       Show this help message

Examples:
  node migrate.js migrate
  node migrate.js seed
  node migrate.js reset
  node migrate.js status
    `);
    process.exit(0);
  },
};

(async () => {
  try {
    const cmd = commands[command] || commands.help;
    await cmd();
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
})();
