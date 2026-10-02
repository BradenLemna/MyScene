// Small request-validation helpers shared across the route files.
// Every helper throws an ApiError (400) so asyncHandler can turn the
// rejection into a clean JSON error response.

import { ApiError } from './errors.js';

/**
 * Read a required string query parameter (trimmed).
 * Throws a 400 when the parameter is missing or empty.
 */
export function requireQuery(req, name) {
    const raw = req.query[name];
    const value = Array.isArray(raw) ? raw[0] : raw;
    const text = typeof value === 'string' ? value.trim() : '';
    if (text === '') {
        throw new ApiError(`Missing required query parameter: ${name}.`, 400);
    }
    return text;
}

/**
 * Ensure required fields are present in a parsed JSON body as non-empty
 * strings. Throws a 400 listing the missing fields otherwise.
 * Returns the body for further use.
 */
export function requireFields(body, fields) {
    const data = body && typeof body === 'object' ? body : {};
    const missing = fields.filter((field) => {
        const value = data[field];
        return typeof value !== 'string' || value.trim() === '';
    });
    if (missing.length > 0) {
        throw new ApiError(`Missing required field(s): ${missing.join(', ')}.`, 400);
    }
    return data;
}

/** Trimmed string from the body, or null when absent / empty / non-string. */
export function strField(body, field) {
    const value = body ? body[field] : undefined;
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
}

/**
 * Optional numeric field from the body: finite numbers pass through, numeric
 * strings are parsed, absent/null/empty values become null. Anything else
 * throws a 400 so the database never receives a bogus coordinate.
 */
export function floatField(body, field) {
    const value = body ? body[field] : undefined;
    if (value === undefined || value === null || value === '') {
        return null;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
        return Number(value);
    }
    throw new ApiError(`Field "${field}" must be a number.`, 400);
}
