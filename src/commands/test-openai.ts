import { Command } from "commander";
import OpenAI from "openai";

export const testOpenaiCommand = new Command("test-openai")
  .description("Test OpenAI API connectivity (does not consume quota)")
  .action(async () => {
    console.log("OpenAI API Connectivity Test\n");
    console.log("=".repeat(50));

    // Check API key
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.log("\nNG: OPENAI_API_KEY is not set");
      console.log("   -> Set OPENAI_API_KEY in your .env file");
      process.exit(1);
    }
    console.log(`\nAPI Key: ${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`);

    const primaryModel = process.env.OPENAI_MODEL_PRIMARY || "gpt-4o-mini";
    const fallbackModel = process.env.OPENAI_MODEL_FALLBACK || "gpt-4o";
    console.log(`Primary Model: ${primaryModel}`);
    console.log(`Fallback Model: ${fallbackModel}`);

    // Test API connection
    console.log("\n[Testing API Connection]");
    const client = new OpenAI({ apiKey });

    try {
      console.log(`  Testing with ${primaryModel}...`);
      const startTime = Date.now();

      const response = await client.chat.completions.create({
        model: primaryModel,
        messages: [
          { role: "user", content: "Reply with only: OK" },
        ],
        max_completion_tokens: 10,
      });

      const elapsed = Date.now() - startTime;
      const content = response.choices[0]?.message?.content?.trim();

      console.log(`  Response: "${content}"`);
      console.log(`  Latency: ${elapsed}ms`);
      console.log(`  Model used: ${response.model}`);
      console.log(`  Tokens: ${response.usage?.total_tokens || "N/A"}`);

      console.log("\n" + "=".repeat(50));
      console.log("\nStatus: OK");
      console.log("OpenAI API is working correctly.");
    } catch (error) {
      console.log("\n" + "=".repeat(50));
      console.log("\nStatus: FAILED");

      if (error instanceof OpenAI.APIError) {
        console.log(`\nError Type: ${error.constructor.name}`);
        console.log(`Status Code: ${error.status}`);
        console.log(`Message: ${error.message}`);

        if (error.status === 401) {
          console.log("\n[Troubleshooting 401 Unauthorized]");
          console.log("  1. Check if your API key is valid and not expired");
          console.log("  2. Verify the key has the correct permissions");
          console.log("  3. Ensure billing is set up on your OpenAI account");
          console.log("  4. Check: https://platform.openai.com/api-keys");
        } else if (error.status === 429) {
          console.log("\n[Troubleshooting 429 Rate Limit]");
          console.log("  1. You've exceeded your rate limit");
          console.log("  2. Check your usage: https://platform.openai.com/usage");
        } else if (error.status === 403) {
          console.log("\n[Troubleshooting 403 Forbidden]");
          console.log("  1. Your account may not have access to this model");
          console.log("  2. Check your organization settings");
        }
      } else {
        console.log(`\nError: ${error}`);
      }

      process.exit(1);
    }
  });
