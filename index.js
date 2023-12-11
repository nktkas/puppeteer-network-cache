/**
 * @typedef {Object} NetworkResourceTiming
 * @property {Number} requestTime - Timing's requestTime is a baseline in seconds, while the other numbers are ticks in milliseconds relatively to this requestTime.
 * @property {Number} proxyStart - Started resolving proxy.
 * @property {Number} proxyEnd - Finished resolving proxy.
 * @property {Number} dnsStart - Started DNS address resolve.
 * @property {Number} dnsEnd - Finished DNS address resolve.
 * @property {Number} connectStart - Started connecting to the remote host.
 * @property {Number} connectEnd - Connected to the remote host.
 * @property {Number} sslStart - Started SSL handshake.
 * @property {Number} sslEnd - Finished SSL handshake.
 * @property {Number} workerStart - Started running ServiceWorker. EXPERIMENTAL
 * @property {Number} workerReady - Finished Starting ServiceWorker. EXPERIMENTAL
 * @property {Number} workerFetchStart - Started fetch event. EXPERIMENTAL
 * @property {Number} workerRespondWithSettled - Settled fetch event respondWith promise. EXPERIMENTAL
 * @property {Number} sendStart - Started sending request.
 * @property {Number} sendEnd - Finished sending request.
 * @property {Number} pushStart - Time the server started pushing request. EXPERIMENTAL
 * @property {Number} pushEnd - Time the server finished pushing request. EXPERIMENTAL
 * @property {Number} receiveHeadersStart - Started receiving response headers. EXPERIMENTAL
 * @property {Number} receiveHeadersEnd - Finished receiving response headers.
 */

/**
 * @typedef {Object} SecurityDetails
 * @property {String} issuer - The name of the issuer of the certificate.
 * @property {String} protocol - The security protocol being used.
 * @property {String[]} subjectAlternativeNames - The list of subject alternative names (SANs) of the certificate.
 * @property {String} subjectName - The name of the subject to which the certificate was issued.
 * @property {Number} validFrom - Unix timestamp marking the start of the certificate's validity.
 * @property {Number} validTo - Unix timestamp marking the end of the certificate's validity.
 */

/**
 * @typedef {Object} HTTPRequest - Represents an HTTP request sent by a page.
 * @property {String} url - The URL of the response.
 * @property {String} method - The HTTP request method used. GET | HEAD | POST | PUT | DELETE | CONNECT | OPTIONS | TRACE | PATCH
 * @property {Object<string, string>[]} headers - An object with HTTP headers associated with the request. All header names are lower-case.
 * @property {String|undefined} postData - The request's post body, if any.
 * @property {String} resourceType - Contains the request's resource type as it was perceived by the rendering engine. Allowed Values: document, stylesheet, image, media, font, script, textTrack, xhr, fetch, prefetch, eventSource, webSocket, manifest, signedExchange, ping, CSPViolationReport, preflight, other
 * @property {Number} date - Time to receive the request in milliseconds.
 */

/**
 * @typedef {Object} HTTPResponse - Represents an HTTP response received by a page.
 * @property {String} url - The URL of the response.
 * @property {Object} remoteAddress - The IP address and port number used to connect to the remote server.
 * @property {String} remoteAddress.ip
 * @property {Number} remoteAddress.port
 * @property {String} method - The HTTP request method used. GET | HEAD | POST | PUT | DELETE | CONNECT | OPTIONS | TRACE | PATCH
 * @property {Number} status - The HTTP status code of the response. Informational (100 – 199) | Successful (200 – 299) | Redirection (300 – 399) | Client error (400 – 499) | Server error (500 – 599).
 * @property {Object<string, string>[]} headers - An object with HTTP headers associated with the response. All header names are lower-case.
 * @property {Buffer|undefined} buffer - Buffer with the response body.
 * @property {String|undefined} body - Text representation of the response body.
 * @property {Number} date - Time to receive the response in milliseconds.
 * @property {Boolean} fromCache - True if the response was served from either the browser's disk cache or memory cache.
 * @property {NetworkResourceTiming|null} timing - Timing information related to the response.
 * @property {SecurityDetails} securityDetails - SecurityDetails if the response was received over the secure connection, or null otherwise.
 * @property {HTTPRequest} request - A matching HTTPRequest object.
 */

import { PuppeteerExtraPlugin } from 'puppeteer-extra-plugin';
import EventEmitter from 'eventemitter3';

/**
 * Saves HTTP requests/responses from browser/pages in cache
 */
export default class PuppeteerNetworkCache extends PuppeteerExtraPlugin {
    /**
     * @param {Number} [browserCacheLimit=200] - How many HTTP records of the browser to keep in the cache.
     * @param {Number} [pageCacheLimit=100] - How many HTTP records of the page to keep in the cache.
     * @param {Function} [requestValidatorFn] - A function that decides whether to save an HTTP request to the cache or not. Receives an HTTPRequest and should return a boolean value. Default: save all requests.
     * @param {Function} [responseValidatorFn] - A function that decides whether to save an HTTP response to the cache or not. Receives an HTTPResponse and should return a boolean value. Default: save all responses.
     */
    constructor(browserCacheLimit, pageCacheLimit, requestValidatorFn, responseValidatorFn) {
        super();
        this.browserCacheLimit = browserCacheLimit ?? 200;
        this.pageCacheLimit = pageCacheLimit ?? 100;
        this.requestValidatorFn = requestValidatorFn ?? (() => true);
        this.responseValidatorFn = responseValidatorFn ?? (() => true);
    }

    get name() {
        return 'puppeteer-network-cache';
    }

    onBrowser(browser) {
        browser.networkCache = {
            /**
             * Browser HTTPRequest array.
             */
            requests: [],

            /**
             * Browser HTTPResponse array.
             */
            responses: [],

            /**
             * EventEmitter for new HTTPRequest / HTTPResponse in cache. Events: "request" | "response"
             */
            eventEmitter: new EventEmitter(),
        }

        browser.networkCache.eventEmitter.on('request', (request) => {
            browser.networkCache.requests.unshift(request);

            if (browser.networkCache.requests.length > this.browserCacheLimit) {
                browser.networkCache.requests = browser.networkCache.requests.slice(0, this.browserCacheLimit);
            }
        });
        browser.networkCache.eventEmitter.on('response', (response) => {
            browser.networkCache.responses.unshift(response);

            if (browser.networkCache.responses.length > this.browserCacheLimit) {
                browser.networkCache.responses = browser.networkCache.responses.slice(0, this.browserCacheLimit);
            }
        });
    }

    onPageCreated(page) {
        page.networkCache = {
            /**
             * Page HTTPRequest array.
             */
            requests: [],

            /**
             * Page HTTPResponse array.
             */
            responses: [],

            /**
             * EventEmitter for new HTTPRequest / HTTPResponse in cache. Events: "request" | "response"
             */
            eventEmitter: new EventEmitter(),

            /**
             * Check the existence of a request and return it (if exists), using RegExp for validation.
             * @param {RegExp} urlRegex - RegExp template to search request by URL.
             * @param {Boolean} [globalCache=false] - Search request in the whole browser or only on the page.
             * @returns {HTTPRequest|null} Represents an HTTP request sent by a page | null (Not found)
             */
            existRequest: (urlRegex, globalCache = false) => {
                const networkCache = globalCache ? page.browser().networkCache : page.networkCache;
                return networkCache.requests.find((request) => urlRegex.test(request.url)) ?? null;
            },

            /**
             * Check the existence of a response and return it (if exists), using RegExp for validation.
             * @param {RegExp} urlRegex - RegExp template to search response by URL.
             * @param {Boolean} [globalCache=false] - Search response in the whole browser or only on the page.
             * @returns {HTTPResponse|null} Represents an HTTP response received by a page | null (Not found)
             */
            existResponse: (urlRegex, globalCache = false) => {
                const networkCache = globalCache ? page.browser().networkCache : page.networkCache;
                return networkCache.responses.find((response) => urlRegex.test(response.url)) ?? null;
            },

            /**
             * Wait for the request to appear, then return it.
             * @param {RegExp} urlRegex - RegExp template to search request by URL.
             * @param {Number} [timeout=20000] - Waiting time for a request to be received.
             * @param {Boolean} [globalCache=false] - Search request in the whole browser or only on the page.
             * @returns {HTTPRequest} Represents an HTTP request sent by a page.
             * @throws Will throw an error, if the timeout expires.
             */
            waitRequest: async (urlRegex, timeout = 20000, globalCache = false) => {
                return await new Promise((r, j) => {
                    let request = page.networkCache.existRequest(urlRegex);
                    if (request) return r(request);

                    const networkCache = globalCache ? page.browser().networkCache : page.networkCache;
                    const listener = function listener(request) {
                        if (urlRegex.test(request.url)) {
                            clearTimeout(timeoutTimer);
                            networkCache.eventEmitter.removeListener('request', listener);
                            return r(request);
                        }
                    };
                    let timeoutTimer = setTimeout(() => {
                        networkCache.eventEmitter.removeListener('request', listener);
                        return j(new Error('Timeout wait request', { cause: { urlRegex, timeout, networkCache: page.networkCache } }));
                    }, timeout);

                    networkCache.eventEmitter.on('request', listener);

                });
            },

            /**
             * Wait for the response to appear, then return it.
             * @param {RegExp} urlRegex - RegExp template to search response by URL.
             * @param {Number} [timeout=20000] - Waiting time for a response to be received.
             * @param {Boolean} [globalCache=false] - Search response in the whole browser or only on the page.
             * @returns {HTTPResponse} Represents an HTTP response received by a page.
             * @throws Will throw an error, if the timeout expires.
             */
            waitResponse: async (urlRegex, timeout = 20000, globalCache = false) => {
                return await new Promise((r, j) => {
                    let response = page.networkCache.existResponse(urlRegex);
                    if (response) return r(response);

                    const networkCache = globalCache ? page.browser().networkCache : page.networkCache;
                    const listener = function (response) {
                        if (urlRegex.test(response.url)) {
                            clearTimeout(timeoutTimer);
                            networkCache.eventEmitter.removeListener('response', listener);
                            return r(response);
                        }
                    };
                    let timeoutTimer = setTimeout(() => {
                        networkCache.eventEmitter.removeListener('response', listener);
                        return j(new Error('Timeout wait response', { cause: { urlRegex, timeout, networkCache: page.networkCache } }));
                    }, timeout);
                    networkCache.eventEmitter.on('response', listener);
                });
            },
        }

        page.on('request', async (pptrRequest) => {
            let request = formatPptrHTTPRequest(pptrRequest);
            request.date = Date.now();

            if (await this.requestValidatorFn(request)) {
                page.networkCache.requests.unshift(request);
                page.networkCache.eventEmitter.emit('request', request);
                page.browser().networkCache.eventEmitter.emit('request', request);

                if (page.networkCache.requests.length > this.pageCacheLimit) {
                    page.networkCache.requests = page.networkCache.requests.slice(0, this.pageCacheLimit);
                }
            }
        });
        page.on('response', async (pptrResponse) => {
            let response = await formatPptrHTTPResponse(pptrResponse);
            response.date = Date.now();

            if (await this.responseValidatorFn(response)) {
                page.networkCache.responses.unshift(response);
                page.networkCache.eventEmitter.emit('response', response);
                page.browser().networkCache.eventEmitter.emit('response', response);

                if (page.networkCache.responses.length > this.pageCacheLimit) {
                    page.networkCache.responses = page.networkCache.responses.slice(0, this.pageCacheLimit);
                }
            }
        });
    }
}

function formatPptrHTTPRequest(request) {
    let url = request.url();
    let method = request.method();
    let headers = request.headers();
    let postData = request.postData();
    let resourceType = request.resourceType();

    return { url, method, headers, postData, resourceType };
}
async function formatPptrHTTPResponse(response) {
    let request = formatPptrHTTPRequest(response.request());
    let url = response.url();
    let remoteAddress = response.remoteAddress();
    let status = response.status();
    let headers = response.headers();
    let buffer;
    let body;
    if (status !== 204 && (status <= 299 || status >= 400)) {
        buffer = await response.buffer();
        if (request.resourceType() == 'image') {
            body = await buffer.toString('base64');
        } else {
            body = await response.text();
        }
    }
    let fromCache = response.fromCache();
    let timing = null;
    let securityDetails = null;
    if (fromCache) {
        timing = response.timing();
        securityDetails = {
            issuer: response.securityDetails().issuer(),
            protocol: response.securityDetails().protocol(),
            subjectAlternativeNames: response.securityDetails().subjectAlternativeNames(),
            subjectName: response.securityDetails().subjectName(),
            validFrom: response.securityDetails().validFrom(),
            validTo: response.securityDetails().validTo(),
        };
    }

    return { request, url, remoteAddress, status, headers, buffer, body, fromCache, timing, securityDetails };
}