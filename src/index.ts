import { PuppeteerExtraPlugin } from 'puppeteer-extra-plugin';
import { TypedEmitter } from 'tiny-typed-emitter';
import type { HTTPRequest, HTTPResponse, Page } from 'puppeteer';

export type ExtendedPuppeteerHTTPRequest = HTTPRequest & { date: number };

export type ExtendedPuppeteerHTTPResponse = HTTPResponse & { date: number };

export interface NetworkCacheEvents {
    'request': (request: ExtendedPuppeteerHTTPRequest) => void;
    'response': (response: ExtendedPuppeteerHTTPResponse) => void;
}

export type ExtendedPuppeteerPage = {
    networkCache: NetworkCache;
}

declare module 'puppeteer' {
    interface Page extends ExtendedPuppeteerPage { }
}

class NetworkCache {
    /** Page HTTPRequest array. */
    requests: ExtendedPuppeteerHTTPRequest[] = [];
    /** Page HTTPResponse array. */
    responses: ExtendedPuppeteerHTTPResponse[] = [];
    /** EventEmitter for new HTTPRequest / HTTPResponse in cache. Events: "request" | "response" */
    eventEmitter: TypedEmitter<NetworkCacheEvents> = new TypedEmitter<NetworkCacheEvents>();

    constructor() { }

    /**
     * Check the existence of a request and return it (if exists), using RegExp for validation.
     * @param {RegExp} urlRegex - RegExp template to search request by URL.
     * @returns {ExtendedPuppeteerHTTPRequest|null} Represents an HTTP request sent by a page | null (Not found)
     */
    existRequest(urlRegex: RegExp): ExtendedPuppeteerHTTPRequest | undefined {
        return this.requests.find((request) => urlRegex.test(request.url()));
    }

    /**
     * Check the existence of a response and return it (if exists), using RegExp for validation.
     * @param {RegExp} urlRegex - RegExp template to search response by URL.
     * @returns {ExtendedPuppeteerHTTPResponse|null} Represents an HTTP response received by a page | null (Not found)
     */
    existResponse(urlRegex: RegExp): ExtendedPuppeteerHTTPResponse | undefined {
        return this.responses.find((response) => urlRegex.test(response.url()));
    }

    /**
     * Wait for the request to appear, then return it.
     * @param {RegExp} urlRegex - RegExp template to search request by URL.
     * @param {number} [timeout=20000] - Waiting time for a request to be received.
     * @returns {ExtendedPuppeteerHTTPRequest} Represents an HTTP request sent by a page.
     * @throws Will throw an error, if the timeout expires.
     */
    async waitRequest(urlRegex: RegExp, timeout: number = 20000): Promise<ExtendedPuppeteerHTTPRequest> {
        return await new Promise((resolve, reject) => {
            const request = this.existRequest(urlRegex);
            if (request) return resolve(request);

            const listener = (request: ExtendedPuppeteerHTTPRequest): void => {
                if (urlRegex.test(request.url())) {
                    clearTimeout(timeoutTimer);
                    this.eventEmitter.removeListener('request', listener);
                    resolve(request);
                }
            }

            const timeoutTimer = setTimeout(() => {
                this.eventEmitter.removeListener('request', listener);
                reject(new Error('Timeout wait request'));
            }, timeout);

            this.eventEmitter.on('request', listener);
        })
    }

    /**
     * Wait for the response to appear, then return it.
     * @param {RegExp} urlRegex - RegExp template to search response by URL.
     * @param {Number} [timeout=20000] - Waiting time for a response to be received.
     * @returns {ExtendedPuppeteerHTTPResponse} Represents an HTTP response received by a page.
     * @throws Will throw an error, if the timeout expires.
     */
    async waitResponse(urlRegex: RegExp, timeout: number = 20000): Promise<ExtendedPuppeteerHTTPResponse> {
        return await new Promise((resolve, reject) => {
            const response = this.existResponse(urlRegex);
            if (response) return resolve(response);

            const listener = (response: ExtendedPuppeteerHTTPResponse) => {
                if (urlRegex.test(response.url())) {
                    clearTimeout(timeoutTimer);
                    this.eventEmitter.removeListener('response', listener);
                    resolve(response);
                }
            }

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
export default class PuppeteerNetworkCache extends PuppeteerExtraPlugin {
    /** How many HTTP records of the page to keep in the cache. */
    pageCacheLimit: number;
    /** A function that decides whether to save an HTTP request to the cache or not. Receives an HTTPRequest and should return a boolean value. Default: save all requests. */
    requestValidatorFn: (request: ExtendedPuppeteerHTTPRequest) => boolean | Promise<boolean>;
    /** A function that decides whether to save an HTTP response to the cache or not. Receives an HTTPResponse and should return a boolean value. Default: save all responses. */
    responseValidatorFn: (response: ExtendedPuppeteerHTTPResponse) => boolean | Promise<boolean>;

    constructor(
        /** How many HTTP records of the page to keep in the cache. */
        pageCacheLimit: number = 100,
        /** A function that decides whether to save an HTTP request to the cache or not. Receives an HTTPRequest and should return a boolean value. Default: save all requests. */
        requestValidatorFn: (request: ExtendedPuppeteerHTTPRequest) => boolean | Promise<boolean> = () => true,
        /** A function that decides whether to save an HTTP response to the cache or not. Receives an HTTPResponse and should return a boolean value. Default: save all responses. */
        responseValidatorFn: (response: ExtendedPuppeteerHTTPResponse) => boolean | Promise<boolean> = () => true
    ) {
        super();
        this.pageCacheLimit = pageCacheLimit;
        this.requestValidatorFn = requestValidatorFn;
        this.responseValidatorFn = responseValidatorFn;
    }

    override get name() {
        return 'puppeteer-network-cache';
    }

    override async onPageCreated(page: Page) {
        page.networkCache = new NetworkCache();
        page.on('request', async (pptrRequest: HTTPRequest) => {
            const request = {
                ...pptrRequest,
                date: Date.now()
            } as ExtendedPuppeteerHTTPRequest;

            if (await this.requestValidatorFn(request)) {
                page.networkCache.requests.push(request);
                if (page.networkCache.requests.length > this.pageCacheLimit) {
                    page.networkCache.requests = page.networkCache.requests.slice(-this.pageCacheLimit);
                }

                page.networkCache.eventEmitter.emit('request', request);
            }
        });
        page.on('response', async (pptrResponse: HTTPResponse) => {
            const response = {
                ...pptrResponse,
                date: Date.now()
            } as ExtendedPuppeteerHTTPResponse;

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