const p = require('puppeteer');

(async () => {
    try {
        const browser = await p.launch({ headless: true });
        const page = await browser.newPage();
        await page.setCookie({ name: 'CONSENT', value: 'YES+cb.20230101-00-p0.en+FX+777', domain: '.google.com' });

        console.log("Navigating to maps...");
        await page.goto(`https://www.google.com/maps/search/plombier+in+paris`, { waitUntil: 'networkidle2' });
        await new Promise(resolve => setTimeout(resolve, 8000));

        console.log("Extracting entries...");
        const leads = await page.evaluate(() => {
            const results = [];

            // On Google maps, the results list items usually have a class like "hfpxzc" or role="article"
            // Let's just find all elements that have an aria-label and also contain a phone-like string in their innerText
            const allElements = document.querySelectorAll('a, div[role="article"]');

            allElements.forEach(el => {
                const name = el.getAttribute('aria-label');
                if (!name) return;

                // Let's find the parent container that has the text
                let parent = el.parentElement;
                while (parent && parent.innerText && parent.innerText.length < 500) {
                    const text = parent.innerText;
                    const phoneRegex = /(?:\+(?:[0-9]\s*){1,3})?[0-9](?:[\s.-]*[0-9]){8,13}/g;
                    const matches = text.match(phoneRegex);

                    if (matches) {
                        const numbers = matches.filter(n => {
                            const digits = n.replace(/\D/g, '');
                            return digits.length >= 9 && digits.length <= 15;
                        });

                        if (numbers.length > 0) {
                            results.push({ name: name, number: numbers[0] });
                            break; // Stop going up the tree for this element
                        }
                    }
                    parent = parent.parentElement;
                }
            });

            // Deduplicate by number
            const unique = Array.from(new Map(results.map(item => [item.number, item])).values());
            return unique;
        });

        console.log("Leads found:", leads.length);
        console.dir(leads, { depth: null });

        await browser.close();
    } catch (e) {
        console.error(e);
    }
})();
