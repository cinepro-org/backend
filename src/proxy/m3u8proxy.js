import {
    encodeHeadersParam
} from '../utils/urlHelper.js';
import { getProxyHeaders, getAfterResponseHeaders } from './headerUtils.js';

function resolveUrl(relativeOrAbsolute, baseUrl) {
    if (relativeOrAbsolute.startsWith('http://') || relativeOrAbsolute.startsWith('https://')) {
        return relativeOrAbsolute;
    }

    try {
        const resolved = new URL(relativeOrAbsolute, baseUrl);
        return resolved.href;
    } catch (e) {
        const baseUrlObj = new URL(baseUrl);

        if (relativeOrAbsolute.startsWith('/')) {
            return `${baseUrlObj.origin}${relativeOrAbsolute}`;
        } else {
            const basePath = baseUrlObj.pathname.substring(0, baseUrlObj.pathname.lastIndexOf('/') + 1);
            return `${baseUrlObj.origin}${basePath}${relativeOrAbsolute}`;
        }
    }
}

function isUrlLine(line) {
    if (!line || line.startsWith('#')) return false;
    return line.includes('://') ||
        line.includes('.m3u8') ||
        line.includes('.ts') ||
        line.includes('.key') ||
        !line.startsWith('#');
}

export async function proxyM3U8(targetUrl, headers, res, serverUrl) {
    if (!targetUrl) {
        res.statusCode = 400;
        res.end('URL parameter is required');
        return;
    }

    // Progressive Header Retry Strategy
    const MAX_RETRIES = 4;
    let lastError = null;
    let successfulResponse = null;

    // Default Chrome UA (Modern, consistent with simple-proxy/scraper behavior)
    const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        let fetchHeaders = { ...headers };

        // Attempt 1: Strict - Use provided headers exactly.
        // If no headers provided, default to Chrome UA.
        if (attempt === 1) {
            if (!fetchHeaders || Object.keys(fetchHeaders).length === 0) {
                fetchHeaders['User-Agent'] = CHROME_UA;
            }
        }

        // Attempt 2: Add Default User-Agent if not present (or if Attempt 1 failed).
        if (attempt === 2) {
            fetchHeaders['User-Agent'] = CHROME_UA;
        }

        // Attempt 3: Add Origin derived from Referer + Sec-Fetch headers
        if (attempt === 3) {
            fetchHeaders['User-Agent'] = CHROME_UA;
            fetchHeaders['Sec-Fetch-Dest'] = 'empty';
            fetchHeaders['Sec-Fetch-Mode'] = 'cors';
            fetchHeaders['Sec-Fetch-Site'] = 'cross-site';
            if (fetchHeaders['Referer']) {
                try {
                    const refererUrl = new URL(fetchHeaders['Referer']);
                    fetchHeaders['Origin'] = refererUrl.origin;
                } catch (e) {
                    // Invalid referer, ignore
                }
            }
        }

        // Attempt 4: Try with Origin set to 'null' + Sec-Fetch headers
        if (attempt === 4) {
            fetchHeaders['User-Agent'] = CHROME_UA;
            fetchHeaders['Origin'] = 'null';
            fetchHeaders['Sec-Fetch-Dest'] = 'empty';
            fetchHeaders['Sec-Fetch-Mode'] = 'cors';
            fetchHeaders['Sec-Fetch-Site'] = 'cross-site';
        }

        console.log(`[M3U8 Proxy] Attempt ${attempt}/${MAX_RETRIES} for ${targetUrl}`);
        console.log(`[M3U8 Proxy] Headers:`, JSON.stringify(fetchHeaders));

        try {
            const response = await globalThis.fetch(targetUrl, {
                headers: fetchHeaders
            });

            if (response.ok) {
                console.log(`[M3U8 Proxy] Attempt ${attempt} SUCCESS! Status: ${response.status}`);
                successfulResponse = response;
                break; // Exit loop on success
            } else {
                console.warn(`[M3U8 Proxy] Attempt ${attempt} failed: ${response.status} ${response.statusText}`);
                if (response.status === 403 || response.status === 401 || response.status === 500) {
                    console.warn(`[M3U8 Proxy] Retrying with escalated headers...`);
                }
                lastError = new Error(`Status ${response.status} ${response.statusText}`);
            }
        } catch (err) {
            console.warn(`[M3U8 Proxy] Attempt ${attempt} network error: ${err.message}`);
            lastError = err;
        }
    }

    if (!successfulResponse) {
        console.error(`[M3U8 Proxy] Failed to fetch after ${MAX_RETRIES} attempts. URL: ${targetUrl}`);
        res.statusCode = lastError?.message?.includes('Status') ? parseInt(lastError.message.split(' ')[1]) || 500 : 500;
        res.end(`Failed to fetch M3U8: ${lastError ? lastError.message : 'Unknown error'}`);
        return;
    }

    const response = successfulResponse;

    try {
        const m3u8Content = await response.text();
        const baseProxyUrl = serverUrl;

        let finalContent = '';
        const lines = m3u8Content.split('\n');
        const newLines = [];

        if (m3u8Content.includes("EXT-X-STREAM-INF")) {
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) {
                    newLines.push(line);
                    continue;
                }

                if (trimmed.startsWith('#')) {
                    if (trimmed.startsWith('#EXT-X-KEY:')) {
                        const regex = /URI="([^"]+)"/;
                        const match = trimmed.match(regex);
                        if (match && match[1]) {
                            const keyUrl = resolveUrl(match[1], targetUrl);
                            const proxyKeyUrl = `${baseProxyUrl}/ts-proxy?url=${encodeURIComponent(keyUrl)}&headers=${encodeHeadersParam(headers)}`;
                            newLines.push(trimmed.replace(match[1], proxyKeyUrl));
                        } else {
                            newLines.push(line);
                        }
                    } else if (trimmed.startsWith('#EXT-X-MEDIA:')) {
                        const regex = /URI="([^"]+)"/;
                        const match = trimmed.match(regex);
                        if (match && match[1]) {
                            const mediaUrl = resolveUrl(match[1], targetUrl);
                            const proxyMediaUrl = `${baseProxyUrl}/m3u8-proxy?url=${encodeURIComponent(mediaUrl)}&headers=${encodeHeadersParam(headers)}`;
                            newLines.push(trimmed.replace(match[1], proxyMediaUrl));
                        } else {
                            newLines.push(line);
                        }
                    } else if (trimmed.startsWith('#EXT-X-MAP:')) {
                        const regex = /URI="([^"]+)"/;
                        const match = trimmed.match(regex);
                        if (match && match[1]) {
                            const mapUrl = resolveUrl(match[1], targetUrl);
                            const proxyMapUrl = `${baseProxyUrl}/ts-proxy?url=${encodeURIComponent(mapUrl)}&headers=${encodeHeadersParam(headers)}`;
                            newLines.push(trimmed.replace(match[1], proxyMapUrl));
                        } else {
                            newLines.push(line);
                        }
                    } else {
                        newLines.push(line);
                    }
                } else {
                    const variantUrl = resolveUrl(trimmed, targetUrl);
                    const proxyUrl = `${baseProxyUrl}/m3u8-proxy?url=${encodeURIComponent(variantUrl)}&headers=${encodeHeadersParam(headers)}`;
                    newLines.push(proxyUrl);
                }
            }
        } else {
            // MEDIA PLAYLIST (Segments)
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) {
                    newLines.push(line);
                    continue;
                }

                if (trimmed.startsWith('#')) {
                    if (trimmed.startsWith('#EXT-X-KEY:')) {
                        // Proxy Key URL
                        const regex = /URI="([^"]+)"/;
                        const match = trimmed.match(regex);
                        if (match && match[1]) {
                            const keyUrl = resolveUrl(match[1], targetUrl);
                            const proxyKeyUrl = `${baseProxyUrl}/ts-proxy?url=${encodeURIComponent(keyUrl)}&headers=${encodeHeadersParam(headers)}`;
                            newLines.push(trimmed.replace(match[1], proxyKeyUrl));
                        } else {
                            newLines.push(line);
                        }
                    } else if (trimmed.startsWith('#EXT-X-MAP:')) {
                        // Proxy Init Segment (common in fmp4 HLS)
                        const regex = /URI="([^"]+)"/;
                        const match = trimmed.match(regex);
                        if (match && match[1]) {
                            const mapUrl = resolveUrl(match[1], targetUrl);
                            const proxyMapUrl = `${baseProxyUrl}/ts-proxy?url=${encodeURIComponent(mapUrl)}&headers=${encodeHeadersParam(headers)}`;
                            newLines.push(trimmed.replace(match[1], proxyMapUrl));
                        } else {
                            newLines.push(line);
                        }
                    } else {
                        newLines.push(line);
                    }
                } else {
                    // Segment URL
                    const segmentUrl = resolveUrl(trimmed, targetUrl);
                    const proxyUrl = `${baseProxyUrl}/ts-proxy?url=${encodeURIComponent(segmentUrl)}&headers=${encodeHeadersParam(headers)}`;
                    newLines.push(proxyUrl);
                }
            }
        }

        finalContent = newLines.join('\n');

        // Set response headers using helper
        const responseHeaders = getAfterResponseHeaders(response.headers, targetUrl);
        responseHeaders['Content-Type'] = 'application/vnd.apple.mpegurl';
        responseHeaders['Cache-Control'] = 'no-cache, no-store, must-revalidate';

        // Use h3 to set headers
        for (const [key, value] of Object.entries(responseHeaders)) {
            res.setHeader(key, value);
        }

        res.end(finalContent);

    } catch (error) {
        console.error('[M3U8 Proxy Error]:', error.message);
        if (!res.headersSent) {
            res.statusCode = 500;
            res.end(`M3U8 Proxy error: ${error.message}`);
        }
    }
}
