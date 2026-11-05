import { chmod, readFile, writeFile } from "node:fs/promises";

const apiKey = process.env.OPENAI_API_KEY_INPUT?.trim();
if (!apiKey) {
  console.error("No provider key was supplied; .env was not changed.");
  process.exit(1);
}

const envPath = new URL("../.env", import.meta.url);
let lines = [];
try {
  lines = (await readFile(envPath, "utf8")).split(/\r?\n/);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

function setVariable(name, value) {
  const matcher = new RegExp(`^\\s*${name}\\s*=`);
  let updated = false;
  lines = lines.filter((line) => {
    if (!matcher.test(line)) return true;
    if (updated) return false;
    updated = true;
    return true;
  });
  const index = lines.findIndex((line) => matcher.test(line));
  const entry = `${name}=${JSON.stringify(value)}`;
  if (index >= 0) lines[index] = entry;
  else lines.push(entry);
}

function hasValue(name) {
  const matcher = new RegExp(`^\\s*${name}\\s*=`);
  const line = lines.find((candidate) => matcher.test(candidate));
  if (!line) return false;
  const value = line.slice(line.indexOf("=") + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
  return value.length > 0;
}

setVariable("AI_LOCAL_DEV", "true");
setVariable("PORT", "8787");
if (!hasValue("OPENAI_MODEL")) setVariable("OPENAI_MODEL", "gpt-4o-mini");
setVariable("OPENAI_API_KEY", apiKey);
const content = `${lines.filter((line, index, all) => index < all.length - 1 || line !== "").join("\n").replace(/\n*$/, "")}\n`;
await writeFile(envPath, content, { mode: 0o600 });
await chmod(envPath, 0o600);
console.log("Saved the AI service settings in the ignored .env file.");
