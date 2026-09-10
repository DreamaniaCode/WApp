const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  
  const fileUrl = 'file:///' + path.resolve('landing/index.html').replace(/\\/g, '/');
  await page.goto(fileUrl, { waitUntil: 'load' });
  
  // 1. Screenshot navbar
  const nav = await page.$('nav');
  if (nav) {
    await nav.screenshot({ path: 'scratch_navbar_logo.png' });
    console.log('Saved scratch_navbar_logo.png');
  }

  // 2. Open chatbot and screenshot chatbot window
  await page.click('#cb-fab');
  await new Promise(r => setTimeout(r, 600));
  const cb = await page.$('#cb-window');
  if (cb) {
    await cb.screenshot({ path: 'scratch_chatbot_logo.png' });
    console.log('Saved scratch_chatbot_logo.png');
  }

  // 3. Screenshot footer
  const footer = await page.$('footer');
  if (footer) {
    await footer.screenshot({ path: 'scratch_footer_logo.png' });
    console.log('Saved scratch_footer_logo.png');
  }

  await browser.close();
})();
