const { downloadArtifact } = require('@electron/get');
const extract = require('extract-zip');
const fs = require('fs');
const path = require('path');
const version = require('./node_modules/electron/package.json').version;

async function fix() {
  console.log("Downloading electron version", version);
  const zipPath = await downloadArtifact({ version, artifactName: 'electron', platform: process.platform, arch: process.arch });
  console.log("Downloaded to", zipPath);
  const distPath = path.join(__dirname, 'node_modules', 'electron', 'dist');
  await extract(zipPath, { dir: distPath });
  console.log("Extracted to", distPath);
  fs.writeFileSync(path.join(__dirname, 'node_modules', 'electron', 'path.txt'), 'electron.exe');
  fs.writeFileSync(path.join(distPath, 'version'), version);
  console.log("Done");
}

fix().catch(console.error);
