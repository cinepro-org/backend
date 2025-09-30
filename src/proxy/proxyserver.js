import cors from 'cors';
import fetch from 'node-fetch';
import { VIDSRC_HLS_ORIGIN } from '../controllers/providers/VidSrc/VidSrc.js';
import { ErrorObject } from '../helpers/ErrorObject.js';

// Add cache system similar to pstream
const CACHE_MAX_SIZE = 2000;
const CACHE_EXPIRY_MS = 2 * 60 * 60 * 1000; // 2 hours
const segmentCache = new Map();

// Check if caching is disabled
const isCacheDisabled = () => process.env.DISABLE_CACHE === 'true';

function cleanupCache() {
    const now = Date.now();
    let expiredCount = 0;

    for (const [url, entry] of segmentCache.entries()) {
        if (now - entry.timestamp > CACHE_EXPIRY_MS) {
            segmentCache.delete(url);
            expiredCount++;
        }
    }

    // Remove oldest entries if cache is too big
    if (segmentCache.size > CACHE_MAX_SIZE) {
        const entries = Array.from(segmentCache.entries()).sort(
            (a, b) => a[1].timestamp - b[1].timestamp
        );

        const toRemove = entries.slice(0, segmentCache.size - CACHE_MAX_SIZE);
        for (const [url] of toRemove) {
            segmentCache.delete(url);
        }
    }

    return segmentCache.size;
}

// Start cleanup interval
setInterval(cleanupCache, 30 * 60 * 1000); // every 30 minutes

function getCachedSegment(url) {
    if (isCacheDisabled()) return undefined;

    const entry = segmentCache.get(url);
    if (entry) {
        if (Date.now() - entry.timestamp > CACHE_EXPIRY_MS) {
            segmentCache.delete(url);
            return undefined;
        }
        return entry;
    }
    return undefined;
}

async function prefetchSegment(url, headers) {
    if (isCacheDisabled() || segmentCache.size >= CACHE_MAX_SIZE) {
        return;
    }

    const existing = segmentCache.get(url);
    const now = Date.now();
    if (existing && now - existing.timestamp <= CACHE_EXPIRY_MS) {
        return; // already cached and fresh
    }

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'User-Agent': DEFAULT_USER_AGENT,
                ...headers
            }
        });

        if (!response.ok) {
            // failed to prefetch
            return;
        }

        const data = new Uint8Array(await response.arrayBuffer());

        const responseHeaders = {};
        response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
        });

        segmentCache.set(url, {
            data,
            headers: responseHeaders,
            timestamp: Date.now()
        });
    } catch (error) {
        if (process.argv.includes('--debug')) {
            console.log(`Prefetch error: ${error.message}`);
        }
    }
}

// defaultt user agent i think adding the user agent in the url it self wil mess things up
const DEFAULT_USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function getOriginFromUrl(url) {
    try {
        let origin = new URL(url).origin;
        if (origin.includes(VIDSRC_HLS_ORIGIN)) {
            return undefined;
        }
        return;
    } catch {
        return url;
    }
}

function extractOriginalUrl(proxyUrl) {
    try {
        const url = new URL(proxyUrl);

        // Pattern 1: /proxy/encodedUrl (like hls1.vid1.site/proxy/...)
        if (url.pathname.includes('/proxy/')) {
            const proxyMatch = url.pathname.match(/\/proxy\/(.+)$/);
            if (proxyMatch) {
                let decoded = decodeURIComponent(proxyMatch[1]);
                while (decoded.includes('%2F')) {
                    try {
                        decoded = decodeURIComponent(decoded);
                    } catch {
                        break;
                    }
                }
                return decoded;
            }
        }

        // for patterns like ?url=encodedUrl (like madplay.site/api/holly/proxy?url=...)
        if (url.searchParams.has('url')) {
            return decodeURIComponent(url.searchParams.get('url'));
        }

        // Pattern 3: Other common proxy patterns using regex
        const commonProxyPatterns = [
            /\/api\/[^\/]+\/proxy\?url=(.+)$/, // /api/*/proxy?url=
            /\/proxy\?.*url=([^&]+)/, // /proxy?url= (with other params)
            /\/stream\/proxy\/(.+)$/, // /stream/proxy/
            /\/p\/(.+)$/ // Short proxy like /p/
        ];

        for (const pattern of commonProxyPatterns) {
            const match = proxyUrl.match(pattern);
            if (match) {
                return decodeURIComponent(match[1]);
            }
        }

        return proxyUrl; // Return as-is if no proxy pattern found
    } catch {
        return proxyUrl;
    }
}

export function createProxyRoutes(app) {
    // M3U8 Proxy endpoint
    app.get('/m3u8-proxy', cors(), async (req, res) => {
        const targetUrl = req.query.url;
        let headers = {};

        try {
            headers = JSON.parse(req.query.headers || '{}');
        } catch (e) {
            if (process.argv.includes('--debug')) {
                console.log('Invalid headers JSON');
            }
        }

        if (!targetUrl) {
            return res.status(400).json({ error: 'URL parameter required' });
        }

        try {
            const response = await fetch(targetUrl, {
                headers: {
                    'User-Agent': DEFAULT_USER_AGENT,
                    ...headers
                }
            });

            if (process.argv.includes('--debug')) {
                console.log(
                    `[M3U8] Response: ${response.status} ${response.statusText}`
                );
                console.log('[M3U8] Request Headers', headers);
                console.log('[M3U8] Response Headers');
                response.headers.forEach((v, k) =>
                    console.log(`   ${k}: ${v}`)
                );
            }
            if (!response.ok) {
                return res.status(response.status).json({
                    error: `M3U8 fetch failed: ${response.status}`
                });
            }

            let m3u8Content = await response.text();
            const lines = m3u8Content.split('\n');
            const newLines = [];
            const segmentUrls = [];

            // Get base URL for proxying
            const protocol = req.headers['x-forwarded-proto'] || 'http';
            const host = req.headers.host;
            const baseProxyUrl = `${protocol}://${host}`;

            for (const line of lines) {
                if (line.startsWith('#')) {
                    if (line.startsWith('#EXT-X-KEY:')) {
                        // Handle encryption keys
                        const regex = /https?:\/\/[^""\s]+/g;
                        const keyUrl = regex.exec(line)?.[0];
                        if (keyUrl) {
                            const proxyUrl = `${baseProxyUrl}/ts-proxy?url=${encodeURIComponent(keyUrl)}&headers=${encodeURIComponent(JSON.stringify(headers))}`;
                            newLines.push(line.replace(keyUrl, proxyUrl));

                            if (!isCacheDisabled()) {
                                prefetchSegment(keyUrl, headers);
                            }
                        } else {
                            newLines.push(line);
                        }
                    } else if (
                        line.startsWith('#EXT-X-MEDIA:') ||
                        line.startsWith('#EXT-X-I-FRAME-STREAM-INF:')
                    ) {
                        // Handle audio tracks, subtitle tracks, and i-frame streams
                        const uriMatch = line.match(/URI="([^"]+)"/);
                        if (uriMatch) {
                            let mediaUrl = uriMatch[1];
                            try {
                                // Resolve relative URLs
                                mediaUrl = new URL(mediaUrl, targetUrl).href;
                                const proxyUrl = `${baseProxyUrl}/m3u8-proxy?url=${encodeURIComponent(mediaUrl)}&headers=${encodeURIComponent(JSON.stringify(headers))}`;
                                newLines.push(
                                    line.replace(uriMatch[1], proxyUrl)
                                );
                            } catch {
                                newLines.push(line); // Keep original if URL parsing fails
                            }
                        } else {
                            newLines.push(line);
                        }
                    } else {
                        newLines.push(line);
                    }
                } else if (line.trim() && !line.startsWith('#')) {
                    try {
                        const segmentUrl = new URL(line, targetUrl).href;

                        // Check if this is an m3u8 file (variant playlist) or TS segment
                        if (/\.m3u8(\?|$)/i.test(segmentUrl)) {
                            // This is a variant playlist, route to m3u8-proxy
                            const proxyUrl = `${baseProxyUrl}/m3u8-proxy?url=${encodeURIComponent(segmentUrl)}&headers=${encodeURIComponent(JSON.stringify(headers))}`;
                            newLines.push(proxyUrl);
                        } else if (/\.ts(\?|$)/i.test(segmentUrl)) {
                            // This is a TS segment, route to ts-proxy
                            segmentUrls.push(segmentUrl);
                            const proxyUrl = `${baseProxyUrl}/ts-proxy?url=${encodeURIComponent(segmentUrl)}&headers=${encodeURIComponent(JSON.stringify(headers))}`;
                            newLines.push(proxyUrl);
                        }
                    } catch {
                        newLines.push(line);
                    }
                } else {
                    newLines.push(line);
                }
            }

            // Prefetch segments if cache enabled
            if (segmentUrls.length > 0 && !isCacheDisabled()) {
                cleanupCache();

                // Prefetch in background, don't wait
                Promise.all(
                    segmentUrls.map((url) => prefetchSegment(url, headers))
                ).catch((err) => {
                    if (process.argv.includes('--debug')) {
                        console.log('Prefetch error:', err.message);
                    }
                });
            }

            // Set proper headers
            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Headers', '*');
            res.setHeader('Access-Control-Allow-Methods', '*');
            res.setHeader(
                'Cache-Control',
                'no-cache, no-store, must-revalidate'
            );
            // Set filename
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="master.m3u8"`
            );

            res.send(newLines.join('\n'));
        } catch (error) {
            res.status(500).json(
                new ErrorObject(
                    `M3U8 Proxy unexpected error: ${error.message}`,
                    'M3U8 Proxy',
                    500,
                    'Check implementation or site status',
                    true,
                    true
                ).toJSON()
            );
        }
    });

    // TS/Segment Proxy endpoint
    app.get('/ts-proxy', cors(), async (req, res) => {
        const targetUrl = req.query.url;
        let headers = {};

        try {
            headers = JSON.parse(req.query.headers || '{}');
        } catch (e) {
            console.log(
                'Invalid headers JSON for TS proxy:',
                req.query.headers
            );
        }

        if (!targetUrl) {
            return res.status(400).json({ error: 'URL parameter required' });
        }

        try {
            // Check cache first if enabled
            if (!isCacheDisabled()) {
                const cachedSegment = getCachedSegment(targetUrl);

                if (cachedSegment) {
                    console.log(`[TS Cache Hit] ${targetUrl}`);

                    res.setHeader(
                        'Content-Type',
                        cachedSegment.headers['content-type'] || 'video/mp2t'
                    );
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    res.setHeader('Access-Control-Allow-Headers', '*');
                    res.setHeader('Access-Control-Allow-Methods', '*');
                    res.setHeader('Cache-Control', 'public, max-age=3600');

                    return res.send(Buffer.from(cachedSegment.data));
                }
            }

            console.log(`[TS] Fetching: ${targetUrl}`);

            const response = await fetch(targetUrl, {
                headers: {
                    'User-Agent': DEFAULT_USER_AGENT,
                    ...headers
                }
            });
            console.log(
                `[TS Proxy] Response: ${response.status} ${response.statusText}`
            );
            console.log(`[TS Proxy] Request Headers:`, headers);
            console.log(`[TS Proxy] Response Headers:`);
            response.headers.forEach((v, k) => console.log(`   ${k}: ${v}`));

            if (!response.ok) {
                console.log(
                    `[TS Proxy] Error fetching segment ${targetUrl} → ${response.status}`
                );
                return res.status(response.status).json({
                    error: `TS fetch failed: ${response.status}`
                });
            }

            // Set headers for segment
            res.setHeader('Content-Type', 'video/mp2t');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Headers', '*');
            res.setHeader('Access-Control-Allow-Methods', '*');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            // set filename for TS segments
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="media.mp4"`
            );

            // Stream the response directly
            response.body.pipe(res);
        } catch (error) {
            console.log('[TS Error]:', error.message);
            res.status(500).json(
                new ErrorObject(
                    `TS Proxy unexpected error: ${error.message}`,
                    'TS Proxy',
                    500,
                    'Check implementation or site status',
                    true,
                    true
                ).toJSON()
            );
        }
    });

    // HLS Proxy endpoint
    app.get('/proxy/hls', cors(), async (req, res) => {
        const targetUrl = req.query.link;
        let headers = {};

        try {
            headers = JSON.parse(req.query.headers || '{}');
        } catch (e) {
            console.log(
                'Invalid headers JSON for HLS proxy:',
                req.query.headers
            );
        }

        if (!targetUrl) {
            return res
                .status(400)
                .json({ error: 'Link parameter is required' });
        }

        try {
            console.log(`[HLS Proxy] Fetching: ${targetUrl}`);
            console.log(`[HLS Proxy] Headers: ${JSON.stringify(headers)}`);

            const response = await fetch(targetUrl, {
                headers: {
                    'User-Agent': DEFAULT_USER_AGENT,
                    ...headers
                }
            });

            console.log(
                `[HLS Proxy] Response: ${response.status} ${response.statusText}`
            );
            console.log('[HLS Proxy] Response Headers: ');
            response.headers.forEach((v, k) => console.log(`   ${k}: ${v}`));
            console.log('[HLS Proxy] Request Headers: ', headers);

            if (!response.ok) {
                console.log(
                    `[HLS Proxy] Error: ${response.status} for ${targetUrl}`
                );
                return res.status(response.status).json({
                    error: `Failed to fetch HLS: ${response.status}`
                });
            }

            let m3u8Content = await response.text();

            const lines = m3u8Content.split('\n');
            const newLines = [];

            for (const line of lines) {
                if (line.startsWith('#')) {
                    // Handle encryption keys
                    if (line.startsWith('#EXT-X-KEY:')) {
                        const regex = /https?:\/\/[^""\s]+/g;
                        const keyUrl = regex.exec(line)?.[0];
                        if (keyUrl) {
                            const proxyUrl = `/ts-proxy?url=${encodeURIComponent(
                                keyUrl
                            )}&headers=${encodeURIComponent(JSON.stringify(headers))}`;
                            newLines.push(line.replace(keyUrl, proxyUrl));
                        } else {
                            newLines.push(line);
                        }
                    } else {
                        newLines.push(line);
                    }
                } else if (line.trim()) {
                    // Handle segment URLs
                    try {
                        const segmentUrl = new URL(line, targetUrl).href;
                        const proxyUrl = `/ts-proxy?url=${encodeURIComponent(
                            segmentUrl
                        )}&headers=${encodeURIComponent(JSON.stringify(headers))}`;
                        newLines.push(proxyUrl);
                    } catch {
                        newLines.push(line); // Keep original if URL parsing fails
                    }
                } else {
                    newLines.push(line); // Keep empty lines
                }
            }

            res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Headers', '*');
            res.setHeader('Access-Control-Allow-Methods', '*');
            // Set filename
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="master.m3u8"`
            );

            console.log(
                `[HLS Proxy] Successfully proxied HLS for: ${targetUrl}`
            );
            res.send(newLines.join('\n'));
        } catch (error) {
            console.error('[HLS Proxy Error]:', error.message);
            res.status(500).json(
                new ErrorObject(
                    `HLS Proxy unexpected error: ${error.message}`,
                    'HLS Proxy',
                    500,
                    'Check implementation or site status',
                    true,
                    true
                ).toJSON()
            );
        }
    });
    // subtitle Proxy endpoint
    app.get('/sub-proxy', cors(), async (req, res) => {
        const targetUrl = req.query.url;
        let headers = {};

        try {
            headers = JSON.parse(req.query.headers || '{}');
        } catch (e) {
            console.log(
                'invalid headers JSON for subtitle proxy:',
                req.query.headers
            );
        }

        if (!targetUrl) {
            return res.status(400).json({ error: 'url parameter required' });
        }

        try {
            console.log(`subtitle proxy fetching: ${targetUrl}`);

            const response = await fetch(targetUrl, {
                headers: {
                    'User-Agent': DEFAULT_USER_AGENT,
                    ...headers
                }
            });

            console.log(
                `subtitle proxy response: ${response.status} ${response.statusText}`
            );
            if (!response.ok) {
                return res.status(response.status).json({
                    error: `subtitle fetch failed: ${response.status}`
                });
            }

            // Copy the content type from the upstream response
            res.setHeader(
                'Content-Type',
                response.headers.get('content-type') || 'text/vtt'
            );
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Headers', '*');
            res.setHeader('Access-Control-Allow-Methods', '*');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            res.setHeader(
                'Content-Disposition',
                'inline; filename="subtitle.vtt"'
            );

            // stream directly
            response.body.pipe(res);
        } catch (error) {
            console.error('[Subtitle Proxy Error]:', error.message);
            res.status(500).json(
                new ErrorObject(
                    `Subtitle Proxy unexpected error: ${error.message}`,
                    'Subtitle Proxy',
                    500,
                    'Check implementation or site status',
                    true,
                    true
                ).toJSON()
            );
        }
    });
}

export function processApiResponse(apiResponse, serverUrl) {
    if (!apiResponse.files) return apiResponse;

    const processedFiles = apiResponse.files.map((file) => {
        if (!file.file || typeof file.file !== 'string') return file;

        let finalUrl = file.file;
        let proxyHeaders = file.headers || {};

        // Extract original URL if it's wrapped in external proxy
        finalUrl = extractOriginalUrl(finalUrl);

        // proxy ALL URLs through our system
        if (!finalUrl.includes('.mp4') && !finalUrl.includes('.mkv')) {
            // Use M3U8 proxy for HLS streams
            const m3u8Origin = getOriginFromUrl(finalUrl);
            if (m3u8Origin) {
                proxyHeaders = {
                    ...proxyHeaders,
                    Referer: proxyHeaders.Referer || m3u8Origin,
                    Origin: proxyHeaders.Origin || m3u8Origin
                };
            }

            const localProxyUrl = `${serverUrl}/m3u8-proxy?url=${encodeURIComponent(finalUrl)}&headers=${encodeURIComponent(JSON.stringify(proxyHeaders))}`;

            return {
                ...file,
                file: localProxyUrl,
                type: 'hls',
                headers: proxyHeaders
            };
        } else {
            // we can Use TS proxy for direct video files
            const videoOrigin = getOriginFromUrl(finalUrl);
            proxyHeaders = {
                ...proxyHeaders,
                Referer: proxyHeaders.Referer || videoOrigin,
                Origin: proxyHeaders.Origin || videoOrigin
            };

            const localProxyUrl = `${serverUrl}/ts-proxy?url=${encodeURIComponent(finalUrl)}&headers=${encodeURIComponent(JSON.stringify(proxyHeaders))}`;

            return {
                ...file,
                file: localProxyUrl,
                type: file.type || 'mp4',
                headers: proxyHeaders
            };
        }
    });

    const processedSubtitles = (apiResponse.subtitles || []).map((sub) => {
        if (!sub.url || typeof sub.url !== 'string') return sub;

        const localProxyUrl = `${serverUrl}/sub-proxy?url=${encodeURIComponent(sub.url)}`;
        return {
            ...sub,
            url: localProxyUrl
        };
    });

    return {
        ...apiResponse,
        files: processedFiles,
        subtitles: processedSubtitles
    };
}

export { extractOriginalUrl };
