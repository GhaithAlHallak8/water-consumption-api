#!/usr/bin/env node

import { readFileSync } from "fs";
import { resolve } from "path";

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("\n❌ Error: Please provide the path to your Firebase service account JSON file\n");
  console.log("Usage:");
  console.log("  npm run format-firebase-key path/to/serviceAccountKey.json\n");
  console.log("Example:");
  console.log("  npm run format-firebase-key ~/Downloads/water-api-firebase-adminsdk.json\n");
  process.exit(1);
}

const filePath = resolve(args[0]);

try {
  const fileContent = readFileSync(filePath, "utf-8");
  const jsonData = JSON.parse(fileContent);

  if (jsonData.type !== "service_account") {
    console.error("\n❌ Error: This doesn't appear to be a valid Firebase service account file\n");
    process.exit(1);
  }

  const singleLineJSON = JSON.stringify(jsonData);

  console.log("\n========================================");
  console.log("Firebase Service Account - Formatted for .env.local");
  console.log("========================================\n");
  console.log("Copy this line to your .env.local file:\n");
  console.log(`FIREBASE_SERVICE_ACCOUNT='${singleLineJSON}'`);
  console.log("\n========================================\n");
  console.log("⚠️  Important Security Notes:");
  console.log("1. Never commit .env.local to version control");
  console.log("2. Add .env.local to your .gitignore file");
  console.log("3. Keep this service account key secure");
  console.log("4. For production, use environment variables in your hosting platform\n");
  console.log("Project ID:", jsonData.project_id);
  console.log("Client Email:", jsonData.client_email);
  console.log("\n========================================\n");
} catch (error) {
  if (error instanceof Error) {
    if ("code" in error && error.code === "ENOENT") {
      console.error(`\n❌ Error: File not found at ${filePath}\n`);
    } else if (error instanceof SyntaxError) {
      console.error("\n❌ Error: Invalid JSON file\n");
    } else {
      console.error(`\n❌ Error: ${error.message}\n`);
    }
  }
  process.exit(1);
}
