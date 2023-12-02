# puppeteer-extra-plugin-network-cache

> A plugin for [puppeteer-extra](https://github.com/berstend/puppeteer-extra) to save HTTP requests/responses to cache.

## Install

```bash
npm install git+https://github.com/nktkas/puppeteer-extra-plugin-network-cache.git
```

## Usage

```js
import puppeteer from 'puppeteer-extra';
import PuppeteerNetworkCache from 'puppeteer-extra-plugin-network-cache';

puppeteer.use(new PuppeteerNetworkCache());

puppeteer.launch().then(async browser => {
    const page = await browser.newPage();
    page.goto('https://example.com');

    let request = await page.networkCache.waitRequest(/https:\/\/example.com/);
    let response = await page.networkCache.waitResponse(/https:\/\/example.com/);
});
```
