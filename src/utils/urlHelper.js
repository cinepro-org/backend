/**
 * Centralized URL utilities for the scraper backend
 * Handles template variable replacement, origin extraction, and header building
 */

/**
 * Replace template placeholders in URLs like {v1}, {v2}, etc. with actual domains
 * @param {string} url - The URL to process
 * @returns {string} - The URL with placeholders replaced
 */
export function replaceTemplateVars(url) {
    if (!url || typeof url !== 'string') return url;

    let result = url;

    // Replace patterns like tmstr4.{v1}, tmstr4.{v2}, etc.
    result = result.replace(/tmstr4\.\{v[1-5]\}/g, 'tmstr4.shadowlandschronicles.com');

    // Replace patterns like app2.{v5}
    result = result.replace(/app2\.\{v[1-5]\}/g, 'app2.shadowlandschronicles.com');

    // Catch any remaining {vN} patterns
    result = result.replace(/\{v[1-5]\}/g, 'shadowlandschronicles.com');

    // Fix malformed tmstr.. patterns (empty placeholder result)
    result = result.replace(/tmstr\.\./g, 'tmstr4.shadowlandschronicles.com');

    return result;
}

/**
 * Extract origin (protocol + host) from a URL
 * @param {string} url - The URL to extract origin from
 * @returns {string|null} - The origin or null if invalid
 */
export function getOriginFromUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.origin;
    } catch {
        return null;
    }
}

/**
 * Build proper proxy headers with Referer/Origin for requests
 * @param {string} targetUrl - The target URL being proxied
 * @param {object} existingHeaders - Any existing headers to merge
 * @returns {object} - Headers object with proper Referer/Origin
 */
export function buildProxyHeaders(targetUrl, existingHeaders = {}) {
    const sourceOrigin = getOriginFromUrl(targetUrl);

    return {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Referer': existingHeaders.Referer || sourceOrigin || targetUrl,
        'Origin': existingHeaders.Origin || sourceOrigin,
        ...existingHeaders
    };
}

/**
 * Parse headers from URL query parameter
 * @param {string} headersParam - JSON string of headers from query param
 * @returns {object} - Parsed headers object
 */
export function parseHeadersParam(headersParam) {
    if (!headersParam) return {};
    try {
        return JSON.parse(headersParam);
    } catch {
        return {};
    }
}

/**
 * Encode headers for URL query parameter
 * @param {object} headers - Headers object to encode
 * @returns {string} - URL-encoded JSON string
 */
export function encodeHeadersParam(headers) {
    return encodeURIComponent(JSON.stringify(headers));
}
