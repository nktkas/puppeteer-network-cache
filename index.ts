import type { HTTPRequest, HTTPResponse, Page } from "puppeteer-core";
import { TypedEventTarget } from "typescript-event-target";

/** Extended HTTPRequest. */
export type ExtendedHTTPRequest =
    & HTTPRequest
    & {
        /** The date when the request was made. */
        date: number;
    };

/** Extended HTTPResponse. */
export type ExtendedHTTPResponse =
    & HTTPResponse
    & {
        /** The date when the response was received. */
        date: number;
    };

/** Custom event for HTTP requests. */
export class RequestEvent extends Event {
    readonly request: ExtendedHTTPRequest;

    constructor(request: ExtendedHTTPRequest) {
        super("request");
        this.request = request;
    }
}

/** Custom event for HTTP responses. */
export class ResponseEvent extends Event {
    readonly response: ExtendedHTTPResponse;

    constructor(response: ExtendedHTTPResponse) {
        super("response");
        this.response = response;
    }
}

/** Event map for custom events of NetworkCache. */
interface NetworkCacheEventMap {
    /** Event for Exteded HTTP requests. */
    request: RequestEvent;

    /** Event for Exteded HTTP responses. */
    response: ResponseEvent;
}

/** Class for monitoring HTTP requests and responses of a page. */
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

    /** EventTarget for HTTPRequest / HTTPResponse events. */
    readonly eventTarget: TypedEventTarget<NetworkCacheEventMap> = new TypedEventTarget<NetworkCacheEventMap>();

    /**
     * Create a new instance of NetworkCache.
     * @param page - Puppeteer page instance.
     */
    constructor(page: Page) {
        this.eventTarget.addEventListener("request", async (event) => {
            if (await this.requestValidatorFn(event.request)) {
                this.requests.push(event.request);

                if (this.requests.length > this.cacheLimit) {
                    this.requests = this.requests.slice(-this.cacheLimit);
                }
            }
        });

        this.eventTarget.addEventListener("response", async (event) => {
            if (await this.responseValidatorFn(event.response)) {
                this.responses.push(event.response);

                if (this.responses.length > this.cacheLimit) {
                    this.responses = this.responses.slice(-this.cacheLimit);
                }
            }
        });

        page.on("request", (pptrRequest) => {
            const request = Object.assign({}, pptrRequest, {
                date: Date.now(),
            });

            this.eventTarget.dispatchTypedEvent(
                "request",
                new RequestEvent(request),
            );
        });

        page.on("response", (pptrResponse) => {
            const response = Object.assign({}, pptrResponse, {
                date: Date.now(),
            });

            this.eventTarget.dispatchTypedEvent(
                "response",
                new ResponseEvent(response),
            );
        });
    }

    /**
     * Check the existence of a request and return it (if exists), using RegExp for validation.
     * @param urlRegex - RegExp template to search request by URL.
     * @returns Represents an HTTP request sent by a page | undefined (Not found)
     */
    existRequest(urlRegex: RegExp): ExtendedHTTPRequest | undefined {
        return this.requests.find((request) => urlRegex.test(request.url()));
    }

    /**
     * Check the existence of a response and return it (if exists), using RegExp for validation.
     * @param urlRegex - RegExp template to search response by URL.
     * @returns Represents an HTTP response received by a page | undefined (Not found)
     */
    existResponse(urlRegex: RegExp): ExtendedHTTPResponse | undefined {
        return this.responses.find((response) => urlRegex.test(response.url()));
    }

    /**
     * Wait for the request to appear, then return it.
     * @param urlRegex - RegExp template to search request by URL.
     * @param timeout - Waiting time for a request to be received.
     * @returns Represents an HTTP request sent by a page.
     */
    waitRequest(urlRegex: RegExp, timeout: number = 20000): Promise<ExtendedHTTPRequest> {
        return new Promise((resolve, reject) => {
            const existingRequest = this.existRequest(urlRegex);
            if (existingRequest) return resolve(existingRequest);

            const listener = (event: RequestEvent): void => {
                if (urlRegex.test(event.request.url())) {
                    clearTimeout(timeoutTimer);
                    this.eventTarget.removeEventListener("request", listener);
                    resolve(event.request);
                }
            };

            const timeoutTimer = setTimeout(() => {
                this.eventTarget.removeEventListener("request", listener);
                reject(new TimeoutError("Timeout wait request"));
            }, timeout);

            this.eventTarget.addEventListener("request", listener);
        });
    }

    /**
     * Wait for the response to appear, then return it.
     * @param urlRegex - RegExp template to search response by URL.
     * @param timeout - Waiting time for a response to be received.
     * @returns Represents an HTTP response received by a page.
     */
    waitResponse(urlRegex: RegExp, timeout: number = 20000): Promise<ExtendedHTTPResponse> {
        return new Promise((resolve, reject) => {
            const existingResponse = this.existResponse(urlRegex);
            if (existingResponse) return resolve(existingResponse);

            const listener = (event: ResponseEvent): void => {
                if (urlRegex.test(event.response.url())) {
                    clearTimeout(timeoutTimer);
                    this.eventTarget.removeEventListener("response", listener);
                    resolve(event.response);
                }
            };

            const timeoutTimer = setTimeout(() => {
                this.eventTarget.removeEventListener("response", listener);
                reject(new TimeoutError("Timeout wait response"));
            }, timeout);

            this.eventTarget.addEventListener("response", listener);
        });
    }
}

/** Error class for timeout. */
export class TimeoutError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "TimeoutError";
    }
}
