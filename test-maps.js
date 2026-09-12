const p = require('puppeteer');

(async () => {
    try {
        const browser = await p.launch({
            executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setCookie({ name: 'CONSENT', value: 'YES+cb.20230101-00-p0.en+FX+777', domain: '.google.com' });

        console.log("Navigating to maps...");
        await page.goto(`https://www.google.com/maps/search/dentiste+paris`, { waitUntil: 'networkidle2', timeout: 30000 });
        
        // Wait for results container or navigation redirect to settle
        try {
            await page.waitForSelector('div[role="feed"], a.hfpxzc, a[href*="/maps/place/"]', { timeout: 15000 });
        } catch (_) {}
        await new Promise(resolve => setTimeout(resolve, 3000));

        console.log("Extracting links from feed...");
        let placeItems = [];
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                placeItems = await page.evaluate(() => {
                    const links = Array.from(document.querySelectorAll('a.hfpxzc, a[href*="/maps/place/"]'));
                    return links.map(a => {
                        let name = a.getAttribute('aria-label') || '';
                        name = name.replace(/^Visiter le site Web de\s+/i, '')
                            .replace(/^Visitez le site Web de\s+/i, '')
                            .replace(/^Visit website for\s+/i, '')
                            .replace(/^Website for\s+/i, '')
                            .split('·')[0].trim();
                        return { name, href: a.href };
                    }).filter(x => x.name && x.href);
                });
                if (placeItems.length > 0) break;
            } catch (err) {
                console.log(`Retry attempt ${attempt + 1} after context reset...`);
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        console.log(`Found ${placeItems.length} place links. Inspecting with cookie on detailPage...`);

        const results = [];
        for (const item of placeItems.slice(0, 2)) {
            const detailPage = await browser.newPage();
            try {
                await detailPage.setCookie({ name: 'CONSENT', value: 'YES+cb.20230101-00-p0.en+FX+777', domain: '.google.com' });
                await detailPage.goto(item.href, { waitUntil: 'networkidle2', timeout: 15000 });
                await new Promise(r => setTimeout(r, 2000));

                const pageDump = await detailPage.evaluate(() => {
                    const text = document.body.innerText;
                    const phoneRegex = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{2,4}[\s.-]?\d{2,4}/g;
                    const matches = text.match(phoneRegex) || [];
                    const buttons = Array.from(document.querySelectorAll('button, a')).map(b => ({
                        tag: b.tagName,
                        aria: b.getAttribute('aria-label'),
                        itemId: b.getAttribute('data-item-id'),
                        text: b.innerText
                    })).filter(x => (x.aria && x.aria.includes('phone') || x.aria && x.aria.includes('téléphone') || (x.itemId && x.itemId.includes('phone')) || (x.text && x.text.includes('01 '))));

                    return {
                        sampleButtons: buttons.slice(0, 5),
                        matches: matches.slice(0, 10)
                    };
                });
                console.log(`Page dump for ${item.name}:`, JSON.stringify(pageDump, null, 2));
            } finally {
                await detailPage.close();
            }
        }

        console.log("Leads extracted:", JSON.stringify(results, null, 2));

        await browser.close();
    } catch (e) {
        console.error(e);
    }
})();
