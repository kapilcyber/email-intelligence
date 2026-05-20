/**
 * Reads .env (or .env.example), copies static files to dist/, injects URLs,
 * writes dist/manifest.xml from manifest/manifest.template.xml, writes PNG icons.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function originFromUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    return `${u.protocol}//${u.host}`;
  } catch {
    throw new Error(`Invalid URL: ${urlStr}`);
  }
}

/** Minimal valid 1×1 PNG (blue pixel) — acceptable placeholder icons for dev. */
const PNG_1x1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function main() {
  const envPath = fs.existsSync(path.join(root, ".env"))
    ? path.join(root, ".env")
    : path.join(root, ".env.example");
  const env = { ...loadEnvFile(path.join(root, ".env.example")), ...loadEnvFile(envPath) };

  const ADDIN_ORIGIN = (env.ADDIN_ORIGIN || "").replace(/\/$/, "");
  const DASHBOARD_URL = (env.DASHBOARD_URL || "").replace(/\/$/, "");
  if (!ADDIN_ORIGIN || !DASHBOARD_URL) {
    console.error("Set ADDIN_ORIGIN and DASHBOARD_URL in outlook-addin/.env (see .env.example).");
    process.exit(1);
  }

  const dashboardOrigin = originFromUrl(DASHBOARD_URL);

  const dist = path.join(root, "dist");
  fs.rmSync(dist, { recursive: true, force: true });
  mkdirp(path.join(dist, "assets"));

  const png = Buffer.from(PNG_1x1_BASE64, "base64");
  for (const name of ["icon-16.png", "icon-32.png", "icon-64.png", "icon-80.png", "icon-128.png"]) {
    fs.writeFileSync(path.join(dist, "assets", name), png);
  }

  const templatePath = path.join(root, "manifest", "manifest.template.xml");
  let manifest = fs.readFileSync(templatePath, "utf8");
  manifest = manifest
    .replaceAll("{{ADDIN_ORIGIN}}", ADDIN_ORIGIN)
    .replaceAll("{{DASHBOARD_APP_DOMAIN}}", dashboardOrigin);

  fs.writeFileSync(path.join(dist, "manifest.xml"), manifest, "utf8");

  const publicDir = path.join(root, "public");
  for (const name of fs.readdirSync(publicDir)) {
    const src = path.join(publicDir, name);
    if (!fs.statSync(src).isFile()) continue;
    let body = fs.readFileSync(src, "utf8");
    body = body
      .replaceAll("{{ADDIN_ORIGIN}}", ADDIN_ORIGIN)
      .replaceAll("{{DASHBOARD_URL}}", DASHBOARD_URL);
    fs.writeFileSync(path.join(dist, name), body, "utf8");
  }

  console.log("Built outlook-addin/dist");
  console.log(`  ADDIN_ORIGIN     ${ADDIN_ORIGIN}`);
  console.log(`  DASHBOARD_URL    ${DASHBOARD_URL}`);
}

main();
