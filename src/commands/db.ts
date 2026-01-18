import { Command } from "commander";
import { resetDatabase, getDbPath, getDb } from "../db/init.js";
import { getBookCount, getUndeliveredBookCount } from "../db/dao.js";
import { createInterface } from "readline";

async function confirm(message: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (yes/no): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "yes");
    });
  });
}

export const dbCommand = new Command("db")
  .description("Database management commands");

// dre db reset
dbCommand
  .command("reset")
  .description("Reset the database (backup and recreate)")
  .option("--yes", "Skip confirmation prompt")
  .action(async (options) => {
    console.log("\n=== Database Reset ===\n");
    console.log(`Database path: ${getDbPath()}`);

    if (!options.yes) {
      console.log("\nThis will DELETE all data in the database.");
      console.log("A backup will be created before deletion.\n");

      const confirmed = await confirm("Are you sure you want to proceed?");
      if (!confirmed) {
        console.log("\nAborted.");
        return;
      }
    }

    console.log("\nResetting database...");

    try {
      const result = resetDatabase();
      console.log(`\nDatabase reset complete.`);
      console.log(`Backup created at: ${result.backupPath}`);
      console.log("\nThe database will be recreated on next use.");
    } catch (error) {
      console.error(`\nError resetting database: ${error}`);
      process.exit(1);
    }
  });

// dre db info
dbCommand
  .command("info")
  .description("Show database information")
  .action(() => {
    console.log("\n=== Database Info ===\n");
    console.log(`Path: ${getDbPath()}`);

    try {
      // Initialize DB connection
      getDb();

      const totalBooks = getBookCount();
      const undeliveredBooks = getUndeliveredBookCount();

      console.log(`\nBooks:`);
      console.log(`  Total: ${totalBooks}`);
      console.log(`  Undelivered: ${undeliveredBooks}`);
      console.log(`  Delivered: ${totalBooks - undeliveredBooks}`);
    } catch (error) {
      console.error(`\nError reading database: ${error}`);
      process.exit(1);
    }
  });
