import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const requiredFiles = [
  "index.html",
  "manifest.json",
  "sw.js",
  "styles.css",
  "script.js",
  "config.js",
  "assets/background.mp4",
  "assets/background-mobile.mp4",
  "icons/icon-192.svg",
  "icons/icon-512.svg",
];

const fail = (message) => {
  console.error(`PWA check failed: ${message}`);
  process.exitCode = 1;
};

for (const file of requiredFiles) {
  if (!fs.existsSync(path.join(root, file))) {
    fail(`Missing ${file}`);
  }
}

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));

if (!html.includes('rel="manifest"')) fail("index.html does not link manifest.json");
if (!html.includes("serviceWorker")) fail("index.html does not register a service worker");
if (!html.includes("background-mobile.mp4")) fail("mobile background video is not referenced");

if (manifest.display !== "standalone") fail("manifest display must be standalone");
if (!manifest.start_url) fail("manifest start_url is missing");
if (!manifest.scope) fail("manifest scope is missing");
if (!manifest.icons?.some((icon) => icon.sizes === "192x192")) {
  fail("manifest is missing a 192x192 icon");
}
if (!manifest.icons?.some((icon) => icon.sizes === "512x512")) {
  fail("manifest is missing a 512x512 icon");
}
if (!manifest.icons?.some((icon) => icon.purpose?.includes("maskable"))) {
  fail("manifest is missing a maskable icon");
}

for (const asset of requiredFiles.filter((file) => file !== "sw.js")) {
  if (!sw.includes(`./${asset}`) && asset !== "index.html") {
    fail(`service worker cache does not include ${asset}`);
  }
}
if (!sw.includes('event.request.mode === "navigate"')) {
  fail("service worker is missing navigation fallback");
}

if (!process.exitCode) {
  console.log("PWA check passed.");
}
