#!/usr/bin/env node
import { Command } from "commander";
import { config } from "dotenv";
import { doctorCommand } from "./commands/doctor.js";
import { jobCommand } from "./commands/job.js";
import { feedbackCommand } from "./commands/feedback.js";
import { runDueCommand } from "./commands/run-due.js";

// Load environment variables
config();

const program = new Command();

program
  .name("vibe")
  .description(
    "CLI for searching, summarizing, and notifying about topics of interest"
  )
  .version("1.0.0");

// Register commands
program.addCommand(doctorCommand);
program.addCommand(jobCommand);
program.addCommand(feedbackCommand);
program.addCommand(runDueCommand);

program.parse();
