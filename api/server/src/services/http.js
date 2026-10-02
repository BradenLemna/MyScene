// Shared fetch wrapper for all upstream calls (LocationIQ, LastFM, PHP db-api).
//
//   - applies a timeout via AbortController
//   - tolerates non-JSON bodies (error pages, empty responses)
//   - wraps every failure in UpstreamError so routes can answer with a clean
//     JSON error instead of an unhandled rejection
//   - never logs URLs (which would leak API keys) or request bodies

import { UpstreamError } from '../utils/errors.js';

export async function fetchJson(url, {
    timeoutMs = 10000,
    method = 'GET',
    body,
    passthrough = [],
    upstreamName = 'service',
} = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
        response = await fetch(url, {
            method,
            headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });
    } catch (err) {
        if (err.name === 'AbortError') {
            throw new UpstreamError(`Upstream ${upstreamName} timed out after ${timeoutMs}ms`, { status: 504 });
        }
        throw new UpstreamError(`Failed to reach upstream ${upstreamName}: ${err.message}`);
    } finally {
        clearTimeout(timer);
    }

    let text = '';
    try {
        text = await response.text();
    } catch (err) {
        throw new UpstreamError(`Upstream ${upstreamName} returned an unreadable body: ${err.message}`);
    }

    let data = null;
    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            data = null; // non-JSON body — handled by the caller via response.ok
        }
    }

    if (!response.ok) {
        const parsedError = data && typeof data === 'object' && typeof data.error === 'string'
            ? data.error
            : null;

        // Statuses the client should see verbatim (e.g. 404 "artist not found"
        // coming back from the PHP db-api).
        const isPassthrough = passthrough.includes(response.status);
        throw new UpstreamError(
            `Upstream ${upstreamName} responded with HTTP ${response.status}: ${text.slice(0, 500)}`,
            {
                status: isPassthrough ? response.status : 502,
                clientMessage: isPassthrough
                    ? (parsedError ?? `Upstream error (HTTP ${response.status}).`)
                    : 'Upstream service error. Please try again later.',
            },
        );
    }

    return { status: response.status, data };
}
