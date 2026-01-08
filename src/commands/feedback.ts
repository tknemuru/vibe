import { Command } from "commander";
import {
  getItemsNeedingFeedback,
  addFeedback,
  getItemByHash,
  hasItemFeedback,
  getDomainFeedbackStats,
} from "../db/dao.js";

function shortenHash(hash: string): string {
  return hash.slice(0, 8);
}

function findItemByShortHash(shortHash: string): string | null {
  // Get all items needing feedback and find matching hash
  const items = getItemsNeedingFeedback();
  const match = items.find((i) => i.item_hash.startsWith(shortHash));
  return match?.item_hash || null;
}

export const feedbackCommand = new Command("feedback")
  .description("Manage feedback for delivered items");

// vibe feedback inbox
feedbackCommand
  .command("inbox")
  .description("List items awaiting feedback")
  .option("-l, --limit <limit>", "Maximum items to show", "20")
  .action((options) => {
    const limit = parseInt(options.limit, 10);
    const items = getItemsNeedingFeedback();

    if (items.length === 0) {
      console.log("\nNo items awaiting feedback.");
      console.log("New items will appear here after they are delivered via email.\n");
      return;
    }

    console.log("\nItems awaiting feedback:\n");
    console.log("  ID        Domain                     Title");
    console.log("  " + "-".repeat(70));

    const displayItems = items.slice(0, limit);
    for (const item of displayItems) {
      const id = shortenHash(item.item_hash);
      const domain = item.domain.padEnd(25).slice(0, 25);
      const title = item.title.length > 35 ? item.title.slice(0, 32) + "..." : item.title;
      console.log(`  ${id}  ${domain}  ${title}`);
    }

    if (items.length > limit) {
      console.log(`\n  ... and ${items.length - limit} more items`);
    }

    console.log(`\n  Total: ${items.length} item(s) awaiting feedback`);
    console.log("\n  Usage:");
    console.log("    vibe feedback good <ID>...   Mark items as good");
    console.log("    vibe feedback bad <ID>...    Mark items as bad\n");
  });

// vibe feedback good
feedbackCommand
  .command("good <ids...>")
  .description("Mark items as good (+1 rating)")
  .action((ids: string[]) => {
    let successCount = 0;
    let errorCount = 0;

    for (const shortId of ids) {
      const fullHash = findItemByShortHash(shortId);

      if (!fullHash) {
        // Try direct lookup
        const item = getItemByHash(shortId);
        if (!item) {
          console.error(`  Error: Item "${shortId}" not found`);
          errorCount++;
          continue;
        }
      }

      const hash = fullHash || shortId;
      const item = getItemByHash(hash);

      if (!item) {
        console.error(`  Error: Item "${shortId}" not found`);
        errorCount++;
        continue;
      }

      if (hasItemFeedback(hash)) {
        console.log(`  Skip: "${shortId}" already has feedback`);
        continue;
      }

      addFeedback(hash, 1);
      console.log(`  Good: ${shortenHash(hash)} - ${item.title.slice(0, 40)}...`);
      successCount++;
    }

    console.log(`\nAdded ${successCount} good rating(s)`);
    if (errorCount > 0) {
      console.log(`${errorCount} error(s) occurred`);
    }
  });

// vibe feedback bad
feedbackCommand
  .command("bad <ids...>")
  .description("Mark items as bad (-1 rating)")
  .action((ids: string[]) => {
    let successCount = 0;
    let errorCount = 0;

    for (const shortId of ids) {
      const fullHash = findItemByShortHash(shortId);

      if (!fullHash) {
        const item = getItemByHash(shortId);
        if (!item) {
          console.error(`  Error: Item "${shortId}" not found`);
          errorCount++;
          continue;
        }
      }

      const hash = fullHash || shortId;
      const item = getItemByHash(hash);

      if (!item) {
        console.error(`  Error: Item "${shortId}" not found`);
        errorCount++;
        continue;
      }

      if (hasItemFeedback(hash)) {
        console.log(`  Skip: "${shortId}" already has feedback`);
        continue;
      }

      addFeedback(hash, -1);
      console.log(`  Bad: ${shortenHash(hash)} - ${item.title.slice(0, 40)}...`);
      successCount++;
    }

    console.log(`\nAdded ${successCount} bad rating(s)`);
    if (errorCount > 0) {
      console.log(`${errorCount} error(s) occurred`);
    }
  });

// vibe feedback stats
feedbackCommand
  .command("stats")
  .description("Show feedback statistics")
  .action(() => {
    const stats = getDomainFeedbackStats();

    if (stats.size === 0) {
      console.log("\nNo feedback recorded yet.\n");
      return;
    }

    console.log("\nFeedback statistics by domain:\n");
    console.log("  Domain                     Good  Bad   Net");
    console.log("  " + "-".repeat(50));

    const entries: [string, { good: number; bad: number }][] = Array.from(stats.entries());
    entries.sort((a, b) => (b[1].good - b[1].bad) - (a[1].good - a[1].bad));

    for (const [domain, { good, bad }] of entries) {
      const net = good - bad;
      const netStr = net >= 0 ? `+${net}` : `${net}`;
      console.log(
        `  ${domain.padEnd(25)}  ${good.toString().padStart(4)}  ${bad.toString().padStart(4)}  ${netStr.padStart(5)}`
      );
    }

    const totalGood = entries.reduce((sum, entry) => sum + entry[1].good, 0);
    const totalBad = entries.reduce((sum, entry) => sum + entry[1].bad, 0);
    console.log("  " + "-".repeat(50));
    console.log(
      `  ${"Total".padEnd(25)}  ${totalGood.toString().padStart(4)}  ${totalBad.toString().padStart(4)}  ${(totalGood - totalBad >= 0 ? "+" : "") + (totalGood - totalBad)}`
    );
    console.log();
  });
