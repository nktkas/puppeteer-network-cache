import { PuppeteerExtraPlugin } from 'puppeteer-extra-plugin';
import EventEmitter from 'eventemitter3';

/**
 * @typedef {Object} HTTPResponse - Represents an HTTP response received by a page
 * @property {String} url - URL of the request
 * @property {String} method - HTTP request methods. GET | HEAD | POST | PUT | DELETE | CONNECT | OPTIONS | TRACE | PATCH
 * @property {Number} status - HTTP response status codes. Informational (100 – 199) | Successful (200 – 299) | Redirection (300 – 399) | Client error (400 – 499) | Server error (500 – 599)
 * @property {Object<string, string>[]} headers - An object with HTTP response headers
 * @property {Buffer} buffer - Buffer with the response body
 * @property {String} body - Text representation of the response body
 * @property {Number} date - Time to receive the response in milliseconds
 */

/**
 * @typedef {Object} HTTPRequest - Represents an HTTP request sent by a page
 * @property {String} url - URL of the request
 * @property {String} method - HTTP request methods. GET | HEAD | POST | PUT | DELETE | CONNECT | OPTIONS | TRACE | PATCH
 * @property {Object<string, string>[]} headers - An object with HTTP request headers
 * @property {String|undefined} postData - The request's post body, if any
 * @property {Number} date - Time to receive the request in milliseconds
 */

/**
 * Saves all HTTP requests/responses from browser/pages to memory
 */
export default class PuppeteerNetworkCache extends PuppeteerExtraPlugin {
    /**
     * @param {Number} [cacheLimit=1000] - How many HTTP records to keep in memory
     */
    constructor(cacheLimit = 1000) {
        super();
        this.cacheLimit = cacheLimit;
    }

    get name() {
        return 'puppeteer-network-cache';
    }

    onBrowser(browser) {
        browser.networkCache = {
            /**
             * Browser HTTPResponse array
             */
            response: [],

            /**
             * Browser HTTPRequest array
             */
            request: [],

            /**
             * Creates events: request (HTTPRequest) | response (HTTPResponse)
             */
            event: new EventEmitter(),
        }

        browser.networkCache.event.on('response', (response) => {
            browser.networkCache.response.unshift(response);

            browser.networkCache.response = browser.networkCache.response.slice(0, this.cacheLimit);
        });
        browser.networkCache.event.on('request', (request) => {
            browser.networkCache.request.unshift(request);

            browser.networkCache.request = browser.networkCache.request.slice(0, this.cacheLimit);
        });
    }

    onPageCreated(page) {
        page.networkCache = {
            /**
             * Browser HTTPResponse array
             */
            response: [],

            /**
             * Browser HTTPRequest array
             */
            request: [],

            /**
             * Creates events: request (HTTPRequest) | response (HTTPResponse)
             */
            event: new EventEmitter(),

            /**
             * Check the existence of a response and return it (if exists), using RegExp for validation
             * @param {RegExp} urlRegex - RegExp template to search response by URL
             * @param {Boolean} [globalCache=false] - Search response in the whole browser or only on the page
             * @returns {HTTPResponse|null} Represents an HTTP response received by a page | null (Not found)
             */
            existResponse: (urlRegex, globalCache = false) => {
                const networkCache = globalCache ? page.browser().networkCache : page.networkCache;
                return networkCache.response.find((response) => urlRegex.test(response.url)) ?? null;
            },

            /**
             * Check the existence of a request and return it (if exists), using RegExp for validation
             * @param {RegExp} urlRegex - RegExp template to search request by URL
             * @param {Boolean} [globalCache=false] - Search request in the whole browser or only on the page
             * @returns {HTTPRequest|null} Represents an HTTP request sent by a page | null (Not found)
             */
            existRequest: (urlRegex, globalCache = false) => {
                const networkCache = globalCache ? page.browser().networkCache : page.networkCache;
                return networkCache.request.find((request) => urlRegex.test(request.url)) ?? null;
            },

            /**
             * Wait for the response to appear, then return it
             * @param {RegExp} urlRegex - RegExp template to search response by URL
             * @param {Number} [timeout=20000] - Waiting time for a response to be received
             * @param {Boolean} [globalCache=false] - Search response in the whole browser or only on the page
             * @returns {HTTPResponse} Represents an HTTP response received by a page
             * @throws Will throw an error, if the timeout expires
             */
            waitResponse: async (urlRegex, timeout = 20000, globalCache = false) => {
                return await new Promise((r, j) => {
                    let response = page.networkCache.existResponse(urlRegex);
                    if (response) return r(response);

                    const networkCache = globalCache ? page.browser().networkCache : page.networkCache;
                    const listener = function (response) {
                        if (urlRegex.test(response.url)) {
                            clearTimeout(timeoutTimer);
                            networkCache.event.removeListener('response', listener);
                            return r(response);
                        }
                    };
                    let timeoutTimer = setTimeout(() => {
                        networkCache.event.removeListener('response', listener);
                        return j(new Error('Timeout wait response', { cause: { urlRegex, timeout, networkCache: page.networkCache } }));
                    }, timeout);
                    networkCache.event.on('response', listener);
                });
            },

            /**
             * Wait for the request to appear, then return it
             * @param {RegExp} urlRegex - RegExp template to search request by URL
             * @param {Number} [timeout=20000] - Waiting time for a request to be received
             * @param {Boolean} [globalCache=false] - Search request in the whole browser or only on the page
             * @returns {HTTPRequest} Represents an HTTP request sent by a page
             * @throws Will throw an error, if the timeout expires
             */
            waitRequest: async (urlRegex, timeout = 20000, globalCache = false) => {
                return await new Promise((r, j) => {
                    let request = this.existRequest(urlRegex);
                    if (request) return r(request);

                    const networkCache = globalCache ? page.browser().networkCache : page.networkCache;
                    const listener = function listener(request) {
                        if (urlRegex.test(request.url)) {
                            clearTimeout(timeoutTimer);
                            networkCache.event.removeListener('request', listener);
                            return r(request);
                        }
                    };
                    let timeoutTimer = setTimeout(() => {
                        networkCache.event.removeListener('request', listener);
                        return j(new Error('Timeout wait request', { cause: { urlRegex, timeout, networkCache: page.networkCache } }));
                    }, timeout);

                    networkCache.event.on('request', listener);

                });
            },
        }

        page.on('response', async (response) => {
            let url = response.url();
            let status = response.status();
            let headers = response.headers();
            let buffer;
            let body;
            if (status !== 204 && (status <= 299 || status >= 400)) {
                buffer = await response.buffer();
                if (response.request().resourceType() == 'image') {
                    body = await buffer.toString('base64');
                } else {
                    body = await response.text();
                }
            }
            let date = Date.now();

            response = { url, status, headers, buffer, body, date };

            page.networkCache.response.unshift(response);
            page.networkCache.event.emit('response', response);
            page.browser().networkCache.event.emit('response', response);

            page.networkCache.response = page.networkCache.response.slice(0, this.cacheLimit);
        });
        page.on('request', (request) => {
            let url = request.url();
            let method = request.method();
            let headers = request.headers();
            let postData = request.postData();
            let date = Date.now();

            request = { url, method, headers, postData, date };

            page.networkCache.request.unshift(request);
            page.networkCache.event.emit('request', request);
            page.browser().networkCache.event.emit('request', request);

            page.networkCache.request = page.networkCache.request.slice(0, this.cacheLimit);
        });
    }
}