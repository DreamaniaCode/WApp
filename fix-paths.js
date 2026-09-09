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
    if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
        let content = fs.readFileSync(filePath, 'utf8');
        let originalContent = content;

        // Calculate how many levels deep this file is
        // e.g. out/index.html -> 0 levels deep
        // e.g. out/404/index.html -> 1 level deep
        const relativePathToOut = path.relative(outDir, path.dirname(filePath));
        const depth = relativePathToOut === '' ? 0 : relativePathToOut.split(path.sep).length;
        const prefix = depth === 0 ? './' : '../'.repeat(depth);

        // 1. Fix HTML attributes: replace "/_next", "/logo.png", "/favicon.ico", etc.
        // We target href="/", src="/", and srcset="/"
        // We use a more careful regex that preserves the quote type
        content = content.replace(/(href|src|srcset)=(["'])\//g, `$1=$2${prefix}`);

        // 2. Fix dynamic imports and data fetches in JS files and inline scripts
        // This includes Next.js internal chunks AND any images/files in the public folder
        // We replace any "path starting with /" that matches common patterns
        const assetsToFix = ['_next/', 'logo.png', 'contacts_template.csv', 'favicon.ico'];
        assetsToFix.forEach(asset => {
            // Regex explanation:
            // ([^.])   - Not preceded by a dot (prevents breaking ./ or ../)
            // \/${asset} - The path starting with a slash
            const regex = new RegExp(`([^.])\\/${asset.replace('.', '\\.')}`, 'g');
            content = content.replace(regex, `$1${prefix}${asset}`);
        });

        if (content !== originalContent) {
            fs.writeFileSync(filePath, content, 'utf8');
            console.log(`Fixed (${depth} levels deep): ${path.relative(outDir, filePath)}`);
        }
    }
});

console.log('Path fix complete.');
