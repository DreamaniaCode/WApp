/**
 * build-electron.js
 * Uses version from package.json for proper installer naming.
 * Run via: npm run electron:build
 */
const { execSync } = require("child_process");
const fs = require("fs");

// Read the package.json version
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const version = pkg.version;

console.log(`\n📦 Building version: ${version}\n`);

try {
    execSync("npm run build", { stdio: "inherit" });
    // path-fixing is no longer necessary as we use standard app:// protocol
    execSync("npm run build:backend", { stdio: "inherit" });
    execSync("npx electron-builder --win", { stdio: "inherit" });
    console.log(`\n✅ Build complete: WApp Manager Setup ${version}.exe\n`);
} catch (err) {
    console.error("\n❌ Build failed:", err.message);
    process.exit(1);
}
