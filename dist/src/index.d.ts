import { PuppeteerExtraPlugin } from 'puppeteer-extra-plugin';
import { TypedEmitter } from 'tiny-typed-emitter';
import type { HTTPRequest, HTTPResponse, Page } from 'puppeteer';
export type ExtendedPuppeteerHTTPRequest = HTTPRequest & {
    date: number;
};
export type ExtendedPuppeteerHTTPResponse = HTTPResponse & {
    date: number;
};
export interface NetworkCacheEvents {
    'request': (request: ExtendedPuppeteerHTTPRequest) => void;
    'response': (response: ExtendedPuppeteerHTTPResponse) => void;
}
export type ExtendedPuppeteerPage = {
    networkCache: NetworkCache;
};
declare module 'puppeteer' {
    interface Page extends ExtendedPuppeteerPage {
    }
}
declare class NetworkCache {
    /** Page HTTPRequest array. */
    requests: ExtendedPuppeteerHTTPRequest[];
    /** Page HTTPResponse array. */
    responses: ExtendedPuppeteerHTTPResponse[];
    /** EventEmitter for new HTTPRequest / HTTPResponse in cache. Events: "request" | "response" */
    eventEmitter: TypedEmitter<NetworkCacheEvents>;
    constructor();
    /**
     * Check the existence of a request and return it (if exists), using RegExp for validation.
     * @param {RegExp} urlRegex - RegExp template to search request by URL.
     * @returns {ExtendedPuppeteerHTTPRequest|null} Represents an HTTP request sent by a page | null (Not found)
     */
    existRequest(urlRegex: RegExp): ExtendedPuppeteerHTTPRequest | undefined;
    /**
     * Check the existence of a response and return it (if exists), using RegExp for validation.
     * @param {RegExp} urlRegex - RegExp template to search response by URL.
     * @returns {ExtendedPuppeteerHTTPResponse|null} Represents an HTTP response received by a page | null (Not found)
     */
    existResponse(urlRegex: RegExp): ExtendedPuppeteerHTTPResponse | undefined;
    /**
     * Wait for the request to appear, then return it.
     * @param {RegExp} urlRegex - RegExp template to search request by URL.
     * @param {number} [timeout=20000] - Waiting time for a request to be received.
     * @returns {ExtendedPuppeteerHTTPRequest} Represents an HTTP request sent by a page.
     * @throws Will throw an error, if the timeout expires.
     */
    waitRequest(urlRegex: RegExp, timeout?: number): Promise<ExtendedPuppeteerHTTPRequest>;
    /**
     * Wait for the response to appear, then return it.
     * @param {RegExp} urlRegex - RegExp template to search response by URL.
     * @param {Number} [timeout=20000] - Waiting time for a response to be received.
     * @returns {ExtendedPuppeteerHTTPResponse} Represents an HTTP response received by a page.
     * @throws Will throw an error, if the timeout expires.
     */
    waitResponse(urlRegex: RegExp, timeout?: number): Promise<ExtendedPuppeteerHTTPResponse>;
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
    pageCacheLimit?: number, 
    /** A function that decides whether to save an HTTP request to the cache or not. Receives an HTTPRequest and should return a boolean value. Default: save all requests. */
    requestValidatorFn?: (request: ExtendedPuppeteerHTTPRequest) => boolean | Promise<boolean>, 
    /** A function that decides whether to save an HTTP response to the cache or not. Receives an HTTPResponse and should return a boolean value. Default: save all responses. */
    responseValidatorFn?: (response: ExtendedPuppeteerHTTPResponse) => boolean | Promise<boolean>);
    get name(): string;
    onPageCreated(page: Page): Promise<void>;
}
export {};
