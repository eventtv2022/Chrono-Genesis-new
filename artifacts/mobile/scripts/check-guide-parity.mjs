import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const guidePath = new URL("../USER_GUIDE_RU.md", import.meta.url);
const screenPath = new URL("../app/user-guide.tsx", import.meta.url);
const markdown = readFileSync(guidePath, "utf8").replace(/\r\n/g, "\n").trimEnd();
const screen = readFileSync(screenPath, "utf8");
const match = screen.match(/const guideMarkdown = `([\s\S]*?)`;\s*\nconst lines/);

if (!match) {
  console.error(`Could not find guideMarkdown in ${fileURLToPath(screenPath)}`);
  process.exit(1);
}

const bundledGuide = match[1].replace(/\r\n/g, "\n").trimEnd();

if (markdown !== bundledGuide) {
  console.error("The Markdown guide and in-app guide are out of sync.");
  process.exit(1);
}

console.log("The Markdown guide and in-app guide match.");
