const pngToIco = require('png-to-ico');
const fs = require('fs');

pngToIco('public/logo.png')
    .then(buf => {
        fs.writeFileSync('public/icon.ico', buf);
        console.log('Successfully created public/icon.ico');
    })
    .catch(console.error);
