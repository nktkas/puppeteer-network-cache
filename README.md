# puppeteer-network-cache

> A class for puppeteer to save all HTTP requests/responses to a cache. There is a filtering function and a limit on the number of records.

## Usage

```js
import puppeteer from 'puppetee';
import { NetworkCache } from 'puppeteer-network-cache';

puppeteer.launch().then(async browser => {
    const page = await browser.newPage();

    const networkCache = new NetworkCache(page);

    page.goto('https://example.com');

    let request = await networkCache.waitRequest(/https:\/\/example.com/);
    let response = await networkCache.waitResponse(/https:\/\/example.com/);
});
```
