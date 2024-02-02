"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PuppeteerNetworkCache = void 0;
const puppeteer_extra_plugin_1 = require("puppeteer-extra-plugin");
const tiny_typed_emitter_1 = require("tiny-typed-emitter");
class NetworkCache {
    constructor() {
        /** Page HTTPRequest array. */
        this.requests = [];
        /** Page HTTPResponse array. */
        this.responses = [];
        /** EventEmitter for new HTTPRequest / HTTPResponse in cache. Events: "request" | "response" */
        this.eventEmitter = new tiny_typed_emitter_1.TypedEmitter();
    }
    /**
     * Check the existence of a request and return it (if exists), using RegExp for validation.
     * @param {RegExp} urlRegex - RegExp template to search request by URL.
     * @returns {ExtendedHTTPRequest|null} Represents an HTTP request sent by a page | null (Not found)
     */
    existRequest(urlRegex) {
        return this.requests.find((request) => urlRegex.test(request.url()));
    }
    /**
     * Check the existence of a response and return it (if exists), using RegExp for validation.
     * @param {RegExp} urlRegex - RegExp template to search response by URL.
     * @returns {ExtendedHTTPResponse|null} Represents an HTTP response received by a page | null (Not found)
     */
    existResponse(urlRegex) {
        return this.responses.find((response) => urlRegex.test(response.url()));
    }
    /**
     * Wait for the request to appear, then return it.
     * @param {RegExp} urlRegex - RegExp template to search request by URL.
     * @param {number} [timeout=20000] - Waiting time for a request to be received.
     * @returns {ExtendedHTTPRequest} Represents an HTTP request sent by a page.
     * @throws Will throw an error, if the timeout expires.
     */
    async waitRequest(urlRegex, timeout = 20000) {
        return await new Promise((resolve, reject) => {
            const request = this.existRequest(urlRegex);
            if (request)
                return resolve(request);
            const listener = (request) => {
                if (urlRegex.test(request.url())) {
                    clearTimeout(timeoutTimer);
                    this.eventEmitter.removeListener('request', listener);
                    resolve(request);
                }
            };
            const timeoutTimer = setTimeout(() => {
                this.eventEmitter.removeListener('request', listener);
                reject(new Error('Timeout wait request'));
            }, timeout);
            this.eventEmitter.on('request', listener);
        });
    }
    /**
     * Wait for the response to appear, then return it.
     * @param {RegExp} urlRegex - RegExp template to search response by URL.
     * @param {Number} [timeout=20000] - Waiting time for a response to be received.
     * @returns {ExtendedHTTPResponse} Represents an HTTP response received by a page.
     * @throws Will throw an error, if the timeout expires.
     */
    async waitResponse(urlRegex, timeout = 20000) {
        return await new Promise((resolve, reject) => {
            const response = this.existResponse(urlRegex);
            if (response)
                return resolve(response);
            const listener = (response) => {
                if (urlRegex.test(response.url())) {
                    clearTimeout(timeoutTimer);
                    this.eventEmitter.removeListener('response', listener);
                    resolve(response);
                }
            };
            const timeoutTimer = setTimeout(() => {
                this.eventEmitter.removeListener('response', listener);
                reject(new Error('Timeout wait response'));
            }, timeout);
            this.eventEmitter.on('response', listener);
        });
    }
}
/**
 * Saves HTTP requests/responses from browser/pages in cache
 */
class PuppeteerNetworkCache extends puppeteer_extra_plugin_1.PuppeteerExtraPlugin {
    constructor(
    /** How many HTTP records of the page to keep in the cache. */
    pageCacheLimit = 100, 
    /** A function that decides whether to save an HTTP request to the cache or not. Receives an HTTPRequest and should return a boolean value. Default: save all requests. */
    requestValidatorFn = () => true, 
    /** A function that decides whether to save an HTTP response to the cache or not. Receives an HTTPResponse and should return a boolean value. Default: save all responses. */
    responseValidatorFn = () => true) {
        super();
        this.pageCacheLimit = pageCacheLimit;
        this.requestValidatorFn = requestValidatorFn;
        this.responseValidatorFn = responseValidatorFn;
    }
    get name() {
        return 'puppeteer-network-cache';
    }
    async onPageCreated(page) {
        page.networkCache = new NetworkCache();
        page.on('request', async (pptrRequest) => {
            const request = Object.assign(Object.assign({}, pptrRequest), { date: Date.now() });
            if (await this.requestValidatorFn(request)) {
                page.networkCache.requests.push(request);
                if (page.networkCache.requests.length > this.pageCacheLimit) {
                    page.networkCache.requests = page.networkCache.requests.slice(-this.pageCacheLimit);
                }
                page.networkCache.eventEmitter.emit('request', request);
            }
        });
        page.on('response', async (pptrResponse) => {
            const response = Object.assign(Object.assign({}, pptrResponse), { body: async () => {
                    if (pptrResponse.request().resourceType() == 'image') {
                        const buffer = await pptrResponse.buffer();
                        return buffer.toString('base64');
                    }
                    else {
                        return await response.text();
                    }
                }, date: Date.now() });
            if (await this.responseValidatorFn(response)) {
                page.networkCache.responses.push(response);
                if (page.networkCache.responses.length > this.pageCacheLimit) {
                    page.networkCache.responses = page.networkCache.responses.slice(-this.pageCacheLimit);
                }
                page.networkCache.eventEmitter.emit('response', response);
            }
        });
    }
}
exports.PuppeteerNetworkCache = PuppeteerNetworkCache;
//# sourceMappingURL=index.js.map