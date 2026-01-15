#!/usr/bin/env node
import { Command } from "commander";
import { config } from "dotenv";
import { doctorCommand } from "./commands/doctor.js";
import { jobCommand } from "./commands/job.js";
import { runDueCommand } from "./commands/run-due.js";
import { dbCommand } from "./commands/db.js";
import { mailCommand } from "./commands/mail.js";
import { createServeCommand } from "./commands/serve.js";

// Load environment variables
config();

const program = new Command();

program
  .name("vibe")
  .description(
    "CLI for collecting and notifying about books of interest"
  )
  .version("3.0.0");

// Register commands
program.addCommand(doctorCommand);
program.addCommand(jobCommand);
program.addCommand(runDueCommand);
program.addCommand(dbCommand);
program.addCommand(mailCommand);
program.addCommand(createServeCommand());

program.parse();
