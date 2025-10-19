#!/usr/bin/env node

import { randomBytes } from "crypto";

function generateApiKey(length: number = 32): string {
  return randomBytes(length).toString("base64url");
}

const apiKey = generateApiKey();

console.log("\n========================================");
console.log("Generated API Key for Water Sensor Device");
console.log("========================================\n");
console.log(`API_KEY=${apiKey}\n`);
console.log("Instructions:");
console.log("1. Add this to your .env.local file");
console.log("2. Update the API_KEY value in your ESP8266 device code");
console.log("3. Keep this key secret and secure\n");
console.log("========================================\n");

export { generateApiKey };
