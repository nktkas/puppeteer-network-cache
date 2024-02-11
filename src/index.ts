import { PuppeteerExtraPlugin } from 'puppeteer-extra-plugin';
import { TypedEmitter } from 'tiny-typed-emitter';
import type { HTTPRequest, HTTPResponse, Page } from 'puppeteer';

export type ExtendedHTTPRequest = HTTPRequest & { date: number };

export type ExtendedHTTPResponse = HTTPResponse & {
    body: () => Promise<string>,
    date: number
};

export type ExtendedPageMethods = {
    networkCache: NetworkCache;
}

export interface NetworkCacheEvents {
    'request': (request: ExtendedHTTPRequest) => void;
    'response': (response: ExtendedHTTPResponse) => void;
}

declare module 'puppeteer' {
    interface Page extends ExtendedPageMethods { }
}

declare module 'puppeteer-core' {
    interface Page extends ExtendedPageMethods { }
}

export class NetworkCache {
    /** How many HTTP records should be stored in the cache. */
    cacheLimit: number = 100;

    /** Page HTTPRequest array. */
    requests: ExtendedHTTPRequest[] = [];

    /** Page HTTPResponse array. */
    responses: ExtendedHTTPResponse[] = [];

    /** A function that decides whether to save an HTTP request to the cache or not. Default: save all requests. */
    requestValidatorFn: (request: ExtendedHTTPRequest) => boolean | Promise<boolean> = () => true;

    /** A function that decides whether to save an HTTP response to the cache or not. Default: save all responses. */
    responseValidatorFn: (response: ExtendedHTTPResponse) => boolean | Promise<boolean> = () => true;

    /** EventEmitter for HTTPRequest / HTTPResponse. 
     * 
     *  Events:
     *  1) request
     *  2) response
     */
    eventEmitter: TypedEmitter<NetworkCacheEvents> = new TypedEmitter<NetworkCacheEvents>();

    constructor() {
        this.eventEmitter.on('request', async (request: ExtendedHTTPRequest) => {
            if (await this.requestValidatorFn(request)) {
                this.requests.push(request);
                if (this.requests.length > this.cacheLimit) {
                    this.requests = this.requests.slice(-this.cacheLimit);
                }
            }
        });
        this.eventEmitter.on('response', async (response: ExtendedHTTPResponse) => {
            if (await this.responseValidatorFn(response)) {
                this.responses.push(response);
                if (this.responses.length > this.cacheLimit) {
                    this.responses = this.responses.slice(-this.cacheLimit);
                }
            }
        });
    }

    /**
     * Check the existence of a request and return it (if exists), using RegExp for validation.
     * @param {RegExp} urlRegex - RegExp template to search request by URL.
     * @returns {ExtendedHTTPRequest|undefined} Represents an HTTP request sent by a page | undefined (Not found)
     */
    existRequest(urlRegex: RegExp): ExtendedHTTPRequest | undefined {
        return this.requests.find((request) => urlRegex.test(request.url()));
    }

    /**
     * Check the existence of a response and return it (if exists), using RegExp for validation.
     * @param {RegExp} urlRegex - RegExp template to search response by URL.
     * @returns {ExtendedHTTPResponse|undefined} Represents an HTTP response received by a page | undefined (Not found)
     */
    existResponse(urlRegex: RegExp): ExtendedHTTPResponse | undefined {
        return this.responses.find((response) => urlRegex.test(response.url()));
    }

    /**
     * Wait for the request to appear, then return it.
     * @param {RegExp} urlRegex - RegExp template to search request by URL.
     * @param {number} [timeout=20000] - Waiting time for a request to be received.
     * @returns {ExtendedHTTPRequest} Represents an HTTP request sent by a page.
     * @throws Will throw an error, if the timeout expires.
     */
    async waitRequest(urlRegex: RegExp, timeout: number = 20000): Promise<ExtendedHTTPRequest> {
        return await new Promise((resolve, reject) => {
            const request = this.existRequest(urlRegex);
            if (request) return resolve(request);

            const listener = (request: ExtendedHTTPRequest): void => {
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
     * @returns {ExtendedHTTPResponse} Represents an HTTP response received by a page.
     * @throws Will throw an error, if the timeout expires.
     */
    async waitResponse(urlRegex: RegExp, timeout: number = 20000): Promise<ExtendedHTTPResponse> {
        return await new Promise((resolve, reject) => {
            const response = this.existResponse(urlRegex);
            if (response) return resolve(response);

            const listener = (response: ExtendedHTTPResponse) => {
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
export class PuppeteerNetworkCache extends PuppeteerExtraPlugin {
    override get name() {
        return 'puppeteer-network-cache';
    }

    override async onPageCreated(page: Page) {
        page.networkCache = new NetworkCache();

        page.on('request', (pptrRequest: HTTPRequest) => {
            const request = {
                ...pptrRequest,
                date: Date.now()
            } as ExtendedHTTPRequest;

            page.networkCache.eventEmitter.emit('request', request);
        });

        page.on('response', (pptrResponse: HTTPResponse) => {
            const response = {
                ...pptrResponse,
                body: async () => {
                    if (pptrResponse.request().resourceType() == 'image') {
                        const buffer = await pptrResponse.buffer();
                        return buffer.toString('base64');
                    } else {
                        return await response.text();
                    }
                },
                date: Date.now()
            } as ExtendedHTTPResponse;

            page.networkCache.eventEmitter.emit('response', response);
        });
    }
}