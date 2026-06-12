import fs from "fs";
import path from "path";
import { logger } from "../lib/logger";

// tsx runs with CWD = workspace root (/home/runner/workspace),
// but __dirname = absolute path to this source file's directory.
// Try both common resolutions so the loader is robust.
function findAssetsDir(): string {
  const candidates = [
    // tsx: __dirname is the src directory
    path.join(__dirname, "../../assets"),
    // fallback: relative to workspace root
    path.join(process.cwd(), "artifacts/api-server/assets"),
    // fallback: adjacent to package root
    path.join(process.cwd(), "assets"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "emblem.jpg"))) {
      logger.info({ dir }, "assetsService: found assets directory");
      return dir;
    }
  }
  logger.warn({ candidates }, "assetsService: assets directory not found, graphics will use SVG fallbacks");
  return candidates[0]!;
}

const ASSETS_DIR = findAssetsDir();

function loadAsDataUri(filename: string): string {
  const filePath = path.join(ASSETS_DIR, filename);
  try {
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filename).toLowerCase();
    const mime = ext === ".png" ? "image/png" : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return "";
  }
}

// Loaded once at module init — cached for lifetime of process
export const EMBLEM_DATA_URI: string = loadAsDataUri("emblem.jpg");
export const FLAG_DATA_URI: string   = loadAsDataUri("flag.jpg");
