const puppeteer = require('whatsapp-web.js/node_modules/puppeteer'); // Might be available in the root depending on setup, but let's try standard require first.

(async () => {
    try {
        const p = require('puppeteer');
        const browser = await p.launch({ headless: true });
        const page = await browser.newPage();
        await page.setCookie({ name: 'CONSENT', value: 'YES+cb.20230101-00-p0.en+FX+777', domain: '.google.com' });

        console.log("Navigating to maps...");
        await page.goto(`https://www.google.com/maps/search/plombier+in+paris`, { waitUntil: 'networkidle2' });
        await new Promise(resolve => setTimeout(resolve, 5000));

        console.log("Extracting text...");
        const text = await page.evaluate(() => document.body.innerText + "\n" + document.documentElement.innerHTML);

        const phoneRegex = /(?:\+(?:[0-9]\s*){1,3})?[0-9](?:[\s.-]*[0-9]){8,13}/g;
        const matches = [...new Set(text.match(phoneRegex) || [])];

        const numbers = matches.filter(n => {
            const digits = n.replace(/\D/g, '');
            // Filter out obvious non-phone numbers (like years, very short numbers)
            return digits.length >= 9 && digits.length <= 15 && n.trim().length > 8;
        });

        console.log("Results found:", numbers.length);
        console.log(numbers.slice(0, 5)); // log first 5 to check

        await browser.close();
    } catch (e) {
        console.error(e);
    }
})();
