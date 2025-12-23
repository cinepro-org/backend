/**
 * Fmovies4u Provider with Enhanced Retry Logic
 * Scrapes streams from fmovies4u.com API with Smart Retry & Fallback
 */

import axios from 'axios';
import { ErrorObject } from '../../../helpers/ErrorObject.js';

const BASE_URL = 'https://fmovies4u.com';
const API_ENDPOINT = `${BASE_URL}/api/scrape`;
const SOURCE_ORDER = 'flixhq,soapyto,embed2,catflix,gamma';

const requestHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/event-stream',
    'Referer': BASE_URL,
    'Origin': BASE_URL
};

/**
 * Robust SSE Parser with Error Detection
 */
function parseSSE(sseText) {
    const events = [];
    const blocks = sseText.split(/\n\n/); // SSE events are separated by double newlines

    for (const block of blocks) {
        const lines = block.split('\n');
        let eventType = 'message';
        let data = '';

        for (const line of lines) {
            if (line.startsWith('event:')) {
                eventType = line.replace('event:', '').trim();
            } else if (line.startsWith('data:')) {
                data += line.replace('data:', '').trim();
            }
        }

        if (data) {
            try {
                events.push({ event: eventType, data: JSON.parse(data) });
            } catch {
                events.push({ event: eventType, data });
            }
        }
    }
    return events;
}

/**
 * Extract actual stream URL and headers from fmovies4u proxy URL
 * Handles both full URLs and file2/ paths
 */
function extractStreamFromFmoviesUrl(proxyUrl) {
    try {
        const urlObj = new URL(proxyUrl);
        let headers = {};
        let streamUrl = '';

        const encodedUrl = urlObj.searchParams.get('url');
        if (encodedUrl) {
            let decodedUrl = decodeURIComponent(encodedUrl);

            if (decodedUrl.startsWith('file2/')) {
                streamUrl = `${BASE_URL}/${decodedUrl}`;
            } else if (decodedUrl.startsWith('//')) {
                streamUrl = 'https:' + decodedUrl;
            } else if (!decodedUrl.startsWith('http://') && !decodedUrl.startsWith('https://')) {
                streamUrl = `${BASE_URL}/${decodedUrl}`;
            } else {
                streamUrl = decodedUrl;
            }
        } else {
            streamUrl = proxyUrl;
        }

        const headersParam = urlObj.searchParams.get('headers');
        if (headersParam) {
            try {
                headers = JSON.parse(decodeURIComponent(headersParam));
            } catch {
                try {
                    headers = JSON.parse(headersParam);
                } catch {
                    headers = {};
                }
            }
        }

        return { url: streamUrl, headers };
    } catch {
        return { url: proxyUrl, headers: {} };
    }
}

/**
 * Smart delay function with exponential backoff
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if response indicates server error/cold start
 */
function isServerError(response) {
    if (!response) return true;

    // Check for HTTP errors
    if (response.status >= 500) return true;

    // Check for HTML error pages (cold start)
    if (response.data && typeof response.data === 'string') {
        const errorIndicators = [
            '<!DOCTYPE html>',
            '<html',
            'nginx',
            'cloudflare',
            'error',
            '502 Bad Gateway',
            '503 Service Unavailable',
            '504 Gateway Timeout'
        ];

        const dataStr = response.data.substring(0, 500).toLowerCase();
        return errorIndicators.some(indicator => dataStr.includes(indicator.toLowerCase()));
    }

    return false;
}

/**
 * Get streams with Smart Retry Logic
 */
export async function getFmovies4u(media, attempt = 1) {
    const maxRetries = 5; // Increased retries for cold start
    const baseDelay = 1000; // Base delay in ms

    try {
        const { tmdb, title, episode, season, imdb, year } = media;
        const isTV = !!episode;

        const params = new URLSearchParams({
            type: isTV ? 'show' : 'movie',
            tmdbId: tmdb.toString(),
            title: title || '',
            sourceOrder: SOURCE_ORDER
        });

        if (imdb) params.append('imdbId', imdb);
        if (year) params.append('releaseYear', year.toString());
        if (isTV) {
            params.append('seasonNumber', season.toString());
            params.append('episodeNumber', episode.toString());
            params.append('season', season.toString());
            params.append('episode', episode.toString());
        }

        const apiUrl = `${API_ENDPOINT}?${params.toString()}`;
        console.log(`[Fmovies4u] Attempt ${attempt}/${maxRetries}:`, apiUrl);

        let response;
        try {
            response = await axios.get(apiUrl, {
                headers: requestHeaders,
                timeout: 30000, // Increased timeout
                responseType: 'text',
                validateStatus: function (status) {
                    return status < 600; // Accept all status codes < 600
                }
            });
        } catch (networkError) {
            // Network errors (timeout, DNS, etc.)
            console.log(`[Fmovies4u] Network error: ${networkError.message}`);
            if (attempt < maxRetries) {
                const retryDelay = Math.min(baseDelay * Math.pow(2, attempt - 1), 10000);
                console.log(`[Fmovies4u] Retrying in ${retryDelay}ms...`);
                await delay(retryDelay);
                return getFmovies4u(media, attempt + 1);
            }
            throw networkError;
        }

        // Check for server errors/cold start
        if (isServerError(response)) {
            console.log(`[Fmovies4u] Server error detected (Status: ${response.status})`);
            if (attempt < maxRetries) {
                // Immediate retry for cold start (no delay for first retry, then exponential)
                const retryDelay = attempt === 1 ? 0 : Math.min(baseDelay * Math.pow(2, attempt - 2), 8000);
                console.log(`[Fmovies4u] Retrying in ${retryDelay}ms...`);
                if (retryDelay > 0) await delay(retryDelay);
                return getFmovies4u(media, attempt + 1);
            }
        }

        // If we got HTML instead of SSE, it's likely an error page
        if (response.data && response.data.trim().startsWith('<!DOCTYPE') ||
            response.data && response.data.trim().startsWith('<html')) {
            console.log(`[Fmovies4u] Received HTML instead of SSE`);
            if (attempt < maxRetries) {
                const retryDelay = Math.min(baseDelay * Math.pow(2, attempt - 1), 10000);
                console.log(`[Fmovies4u] Retrying in ${retryDelay}ms...`);
                await delay(retryDelay);
                return getFmovies4u(media, attempt + 1);
            }
            return new ErrorObject('Server returned HTML error page', 'Fmovies4u', 500);
        }

        const events = parseSSE(response.data);

        // Check for explicit error events in the stream
        const hasErrorEvent = events.some(e => e.event === 'error');
        const completedEvents = events.filter(e => e.event === 'completed' && e.data?.stream);

        // RETRY LOGIC: If error event found OR no completion event found
        if (hasErrorEvent || completedEvents.length === 0) {
            if (attempt < maxRetries) {
                // Quick retry for empty/no streams
                const retryDelay = 500; // Short delay for these cases
                console.log(`[Fmovies4u] Error/Empty received. Retrying in ${retryDelay}ms...`);
                await delay(retryDelay);
                return getFmovies4u(media, attempt + 1);
            }
            return new ErrorObject('No streams found after retries', 'Fmovies4u', 404);
        }

        const files = [];
        const subtitles = [];

        for (const event of completedEvents) {
            const { sourceId, stream } = event.data;
            if (!Array.isArray(stream)) continue;

            for (const s of stream) {
                if (s.playlist) {
                    const { url: streamUrl, headers: extractedHeaders } = extractStreamFromFmoviesUrl(s.playlist);

                    if (!streamUrl) continue;

                    files.push({
                        file: streamUrl,
                        type: 'hls',
                        source: `Fmovies4u-${sourceId}`,
                        headers: { ...extractedHeaders, ...s.headers }
                    });
                }

                if (s.captions) {
                    s.captions.forEach(c => {
                        if (c.url) subtitles.push({ url: c.url, lang: c.language || 'English' });
                    });
                }
            }
        }

        return { files, subtitles };

    } catch (error) {
        console.log(`[Fmovies4u] Final attempt failed: ${error.message}`);

        // Even on final error, try one immediate retry if it's a cold start type error
        if (attempt === 1 && error.message.includes('timeout') || error.message.includes('network')) {
            console.log(`[Fmovies4u] Immediate retry for network/timeout error...`);
            await delay(500);
            return getFmovies4u(media, attempt + 1);
        }

        return new ErrorObject(error.message, 'Fmovies4u', 500);
    }
}