/**
 * Fetch utilities with timeout and retry logic
 * Handles transient failures with exponential backoff
 */

import fetch from 'node-fetch';

// Status codes that should trigger a retry
const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504, 520, 521, 522, 523, 524];

/**
 * Fetch with a timeout
 * @param {string} url - URL to fetch
 * @param {object} options - Fetch options
 * @param {number} timeoutMs - Timeout in milliseconds (default 15s)
 * @returns {Promise<Response>} - Fetch response
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        return response;
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Fetch with retry logic and exponential backoff
 * @param {string} url - URL to fetch
 * @param {object} options - Fetch options
 * @param {number} maxRetries - Maximum retry attempts (default 3)
 * @param {number} baseBackoffMs - Base backoff time in ms (default 500)
 * @param {number} timeoutMs - Timeout per request in ms (default 15000)
 * @returns {Promise<Response>} - Fetch response
 */
export async function fetchWithRetry(
    url,
    options = {},
    maxRetries = 3,
    baseBackoffMs = 500,
    timeoutMs = 15000
) {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetchWithTimeout(url, options, timeoutMs);

            // If response is OK or not retryable, return it
            if (response.ok || !RETRYABLE_STATUS_CODES.includes(response.status)) {
                return response;
            }

            // Retryable error - log and continue loop
            lastError = new Error(`HTTP ${response.status}`);

            if (attempt < maxRetries) {
                const backoffMs = baseBackoffMs * Math.pow(2, attempt);
                await sleep(backoffMs);
            }
        } catch (error) {
            lastError = error;

            // Only retry on timeout/network errors, not on other errors
            if (error.name === 'AbortError' || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
                if (attempt < maxRetries) {
                    const backoffMs = baseBackoffMs * Math.pow(2, attempt);
                    await sleep(backoffMs);
                    continue;
                }
            }

            // Non-retryable error, throw immediately
            throw error;
        }
    }

    throw lastError;
}

/**
 * Simple sleep utility
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wrap a promise with a timeout
 * @param {Promise} promise - The promise to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} operationName - Name of operation for error message
 * @returns {Promise} - The promise with timeout
 */
export function withTimeout(promise, timeoutMs, operationName = 'Operation') {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(
                () => reject(new Error(`${operationName} timed out after ${timeoutMs}ms`)),
                timeoutMs
            )
        )
    ]);
}
