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

function safeWriteFileSync(targetPath, data, retries = 5) {
    for (let i = 0; i < retries; i++) {
        try {
            fs.writeFileSync(targetPath, data, 'utf8');
            return;
        } catch (e) {
            if (i === retries - 1) throw e;
            try {
                Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200 * (i + 1));
            } catch (_) {}
        }
    }
}

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
            safeWriteFileSync(filePath, content);
            console.log(`Fixed HTML (${depth} levels deep): ${path.relative(outDir, filePath)}`);
        }
    }
});

console.log('Path fix complete.');
