const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, 'out');

if (!fs.existsSync(outDir)) {
    console.error('out directory not found');
    process.exit(1);
}

function walk(dir, callback) {
    fs.readdirSync(dir).forEach(f => {
        let dirPath = path.join(dir, f);
        let isDirectory = fs.statSync(dirPath).isDirectory();
        isDirectory ? walk(dirPath, callback) : callback(path.join(dir, f));
    });
}

console.log('Fixing paths in out directory...');

walk(outDir, (filePath) => {
    // ONLY fix HTML attribute paths (href/src/srcset) in .html files.
    // NEVER modify compiled JavaScript chunks or runtime files as that corrupts Turbopack/Webpack module resolution.
    if (filePath.endsWith('.html')) {
        let content = fs.readFileSync(filePath, 'utf8');
        let originalContent = content;

        const relativePathToOut = path.relative(outDir, path.dirname(filePath));
        const depth = relativePathToOut === '' ? 0 : relativePathToOut.split(path.sep).length;
        const prefix = depth === 0 ? './' : '../'.repeat(depth);

        // Fix HTML tag attributes but NEVER touch /_next/ (Next.js Turbopack chunks require /_next/)
        content = content.replace(/(href|src|srcset)=(["'])\/(?!_next)/g, `$1=$2${prefix}`);

        if (content !== originalContent) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Fixed HTML (${depth} levels deep): ${path.relative(outDir, filePath)}`);
        }
    }
});

console.log('Path fix complete.');
