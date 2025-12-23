/**
 * Source Validation Module
 * Validates HLS and MP4 sources before returning to frontend
 * Filters out dead/unreachable streams
 */

import { fetchWithTimeout } from './fetchHelper.js';
import { buildProxyHeaders } from './urlHelper.js';

// Validation timeout (shorter than regular fetch since we just need to check if it works)
const VALIDATION_TIMEOUT = 8000;

// Maximum concurrent validations to avoid overwhelming the server
const MAX_CONCURRENT_VALIDATIONS = 5;

/**
 * Validate an HLS source by checking if the m3u8 playlist is accessible
 * @param {string} url - The HLS playlist URL
 * @param {object} headers - Headers to send with request
 * @returns {Promise<boolean>} - Whether the source is valid
 */
export async function validateHlsSource(url, headers = {}) {
    try {
        const response = await fetchWithTimeout(
            url,
            {
                method: 'GET', // GET instead of HEAD since some servers don't support HEAD
                headers: buildProxyHeaders(url, headers)
            },
            VALIDATION_TIMEOUT
        );

        if (!response.ok) {
            return false;
        }

        // Check content type is m3u8
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('mpegurl') || contentType.includes('m3u8')) {
            return true;
        }

        // Some servers don't set proper content type, check the content
        const text = await response.text();
        return text.includes('#EXTM3U') || text.includes('#EXT-X-');
    } catch (error) {
        // Network error, timeout, etc.
        return false;
    }
}

/**
 * Validate an MP4/video source by checking if it's accessible
 * @param {string} url - The video URL
 * @param {object} headers - Headers to send with request
 * @returns {Promise<boolean>} - Whether the source is valid
 */
export async function validateMp4Source(url, headers = {}) {
    try {
        const response = await fetchWithTimeout(
            url,
            {
                method: 'HEAD', // HEAD is fine for direct video files
                headers: buildProxyHeaders(url, headers)
            },
            VALIDATION_TIMEOUT
        );

        if (!response.ok) {
            return false;
        }

        // Check content type is video
        const contentType = response.headers.get('content-type') || '';
        return contentType.includes('video/') ||
            contentType.includes('application/octet-stream');
    } catch (error) {
        return false;
    }
}

/**
 * Validate a source based on its type
 * @param {object} file - File object with {file, type, headers}
 * @returns {Promise<boolean>} - Whether the source is valid
 */
export async function validateSource(file) {
    if (!file || !file.file) return false;

    const url = file.file;
    const headers = file.headers || {};
    const type = file.type || 'hls';

    if (type === 'hls' || url.includes('.m3u8') || url.includes('m3u8')) {
        return validateHlsSource(url, headers);
    } else {
        return validateMp4Source(url, headers);
    }
}

/**
 * Validate and filter an array of files, keeping only valid sources
 * Uses concurrency limiting to avoid overwhelming servers
 * @param {object[]} files - Array of file objects
 * @param {boolean} shouldValidate - Whether to actually validate (can skip for speed)
 * @returns {Promise<object[]>} - Array of validated file objects
 */
export async function validateAndFilterFiles(files, shouldValidate = true) {
    if (!files || files.length === 0) return [];
    if (!shouldValidate) return files;

    const validFiles = [];
    const chunks = chunkArray(files, MAX_CONCURRENT_VALIDATIONS);

    console.log(`[VALIDATE] Starting validation of ${files.length} sources...`);

    for (const chunk of chunks) {
        const results = await Promise.all(
            chunk.map(async (file) => {
                const isValid = await validateSource(file);
                if (!isValid) {
                    console.log(`[VALIDATE] FAILED: ${file.source || 'unknown'} - ${file.file?.substring(0, 80)}...`);
                } else {
                    console.log(`[VALIDATE] PASSED: ${file.source || 'unknown'}`);
                }
                return { file, isValid };
            })
        );

        for (const { file, isValid } of results) {
            if (isValid) {
                validFiles.push(file);
            }
        }

        // If we found enough valid sources, we can stop early
        if (validFiles.length >= 3) {
            // Add remaining unchecked files (assume they might work)
            const remainingChunks = chunks.slice(chunks.indexOf(chunk) + 1);
            for (const remaining of remainingChunks) {
                validFiles.push(...remaining);
            }
            break;
        }
    }

    console.log(`[VALIDATE] Result: ${validFiles.length}/${files.length} passed`);
    return validFiles;
}

/**
 * Quick validation - just check if URL looks valid without network request
 * @param {object} file - File object with {file, type}
 * @returns {boolean} - Whether the source looks valid
 */
export function quickValidate(file) {
    if (!file || !file.file) return false;

    const url = file.file;

    // Must be HTTPS
    if (!url.startsWith('https://')) return false;

    // Should contain valid domain
    try {
        new URL(url);
    } catch {
        return false;
    }

    // Filter out known bad patterns
    const badPatterns = [
        'undefined',
        'null',
        '{v1}',
        '{v2}',
        '%7Bv', // URL-encoded {v
        '",\"', // Malformed JSON in URL
        '67streams.online', // Consistently fails with socket errors
    ];

    for (const pattern of badPatterns) {
        if (url.includes(pattern)) return false;
    }

    return true;
}

/**
 * Split array into chunks
 * @param {any[]} array - Array to split
 * @param {number} size - Chunk size
 * @returns {any[][]} - Array of chunks
 */
function chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}
