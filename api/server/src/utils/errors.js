// Error types shared across the API server.

/**
 * Error for problems we can attribute to the request or to server
 * configuration. The message is safe to send to the client as-is.
 */
export class ApiError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

/**
 * Error for failures in an upstream service (LocationIQ, LastFM, the PHP
 * db-api). `message` is for the server log; `clientMessage` is the safe
 * text sent to the client.
 */
export class UpstreamError extends Error {
    constructor(message, { status = 502, clientMessage = 'Upstream service error. Please try again later.' } = {}) {
        super(message);
        this.name = 'UpstreamError';
        this.status = status;
        this.clientMessage = clientMessage;
    }
}
