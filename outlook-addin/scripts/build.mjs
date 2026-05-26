/**
 * Reads .env (or .env.example), renders a VM-hosted Outlook add-in package into dist/,
 * mirrors the static add-in files into email-dashboard/public/outlook-addin,
 * writes dist/manifest.xml from manifest/manifest.template.xml, writes PNG icons,
 * and creates a zip package for Microsoft 365 admin upload flows.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const require = createRequire(import.meta.url);
const AdmZip = require("adm-zip");

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

function copyDirContents(srcDir, destDir) {
  mkdirp(destDir);
  for (const name of fs.readdirSync(srcDir)) {
    const src = path.join(srcDir, name);
    const dest = path.join(destDir, name);
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      copyDirContents(src, dest);
    } else {
      fs.copyFileSync(src, dest);
    }
  }
}

function createPackageZip(distDir, outputPath) {
  const zip = new AdmZip();
  zip.addLocalFolder(distDir);
  zip.writeZip(outputPath);
}

function main() {
  const envPath = fs.existsSync(path.join(root, ".env"))
    ? path.join(root, ".env")
    : path.join(root, ".env.example");
  const env = { ...loadEnvFile(path.join(root, ".env.example")), ...loadEnvFile(envPath) };

  const ADDIN_ORIGIN = (env.ADDIN_ORIGIN || "").replace(/\/$/, "");
  const DASHBOARD_URL = (env.DASHBOARD_URL || "").replace(/\/$/, "");
  const TASKPANE_URL = (env.TASKPANE_URL || `${DASHBOARD_URL}/outlook`).replace(/\/$/, "");
  if (!ADDIN_ORIGIN || !DASHBOARD_URL || !TASKPANE_URL) {
    console.error("Set ADDIN_ORIGIN, DASHBOARD_URL, and optionally TASKPANE_URL in outlook-addin/.env.");
    process.exit(1);
  }

  const dashboardOrigin = originFromUrl(DASHBOARD_URL);
  const addinOrigin = originFromUrl(ADDIN_ORIGIN);
  const addinAssetBase = `${addinOrigin}/outlook-addin`;

  const dist = path.join(root, "dist");
  const zipPath = path.join(root, "email-intelligence-outlook-addin.zip");
  const runtimeDir = path.join(dist, "outlook-addin");
  const dashboardPublicDir = path.join(root, "..", "email-dashboard", "public", "outlook-addin");
  fs.rmSync(dist, { recursive: true, force: true });
  fs.rmSync(zipPath, { force: true });
  fs.rmSync(dashboardPublicDir, { recursive: true, force: true });
  mkdirp(path.join(runtimeDir, "assets"));

  const png = Buffer.from(PNG_1x1_BASE64, "base64");
  for (const name of ["icon-16.png", "icon-32.png", "icon-64.png", "icon-80.png", "icon-128.png"]) {
    fs.writeFileSync(path.join(runtimeDir, "assets", name), png);
  }

  const templatePath = path.join(root, "manifest", "manifest.template.xml");
  let manifest = fs.readFileSync(templatePath, "utf8");
  manifest = manifest
    .replaceAll("{{ADDIN_ORIGIN}}", ADDIN_ORIGIN)
    .replaceAll("{{ADDIN_ASSET_BASE}}", addinAssetBase)
    .replaceAll("{{DASHBOARD_APP_DOMAIN}}", dashboardOrigin)
    .replaceAll("{{DASHBOARD_URL}}", DASHBOARD_URL)
    .replaceAll("{{TASKPANE_URL}}", TASKPANE_URL);

  fs.writeFileSync(path.join(dist, "manifest.xml"), manifest, "utf8");

  const publicDir = path.join(root, "public");
  for (const name of fs.readdirSync(publicDir)) {
    const src = path.join(publicDir, name);
    if (!fs.statSync(src).isFile()) continue;
    let body = fs.readFileSync(src, "utf8");
    body = body
      .replaceAll("{{ADDIN_ORIGIN}}", ADDIN_ORIGIN)
      .replaceAll("{{ADDIN_ASSET_BASE}}", addinAssetBase)
      .replaceAll("{{DASHBOARD_URL}}", DASHBOARD_URL)
      .replaceAll("{{TASKPANE_URL}}", TASKPANE_URL);
    fs.writeFileSync(path.join(runtimeDir, name), body, "utf8");
  }

  mkdirp(dashboardPublicDir);
  fs.copyFileSync(path.join(dist, "manifest.xml"), path.join(dashboardPublicDir, "manifest.xml"));
  copyDirContents(runtimeDir, dashboardPublicDir);
  createPackageZip(dist, zipPath);

  console.log("Built outlook-addin/dist");
  console.log(`  ADDIN_ORIGIN     ${ADDIN_ORIGIN}`);
  console.log(`  ADDIN_ASSET_BASE ${addinAssetBase}`);
  console.log(`  DASHBOARD_URL    ${DASHBOARD_URL}`);
  console.log(`  TASKPANE_URL     ${TASKPANE_URL}`);
  console.log(`  VM_PUBLIC_DIR    ${dashboardPublicDir}`);
  console.log(`  PACKAGE_ZIP      ${zipPath}`);
}

main();
