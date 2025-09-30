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

        const arrayBuffer = await response.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);

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
        const urlObj = new URL(url);
        const origin = urlObj.origin;
        if (origin.includes(VIDSRC_HLS_ORIGIN)) {
            return undefined;
        }
        return origin;
    } catch {
        return undefined;
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

// Enhanced CORS middleware based on the working implementation
function handleCors(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range, Accept, Origin, X-Requested-With');
    res.setHeader('Access-Control-Max-Age', '86400');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return true;
    }
    return false;
}

// M3U8 proxy function based on the working implementation
async function proxyM3U8(targetUrl, headers, res, serverUrl) {
    try {
        console.log('[M3U8 Proxy] Fetching:', targetUrl);

        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': DEFAULT_USER_AGENT,
                ...headers
            }
        });

        if (!response.ok) {
            console.log('[M3U8 Proxy] Error:', response.status, response.statusText);
            res.writeHead(response.status);
            res.end(`M3U8 fetch failed: ${response.status}`);
            return;
        }

        const m3u8Content = await response.text();
        console.log('[M3U8 Proxy] Original content length:', m3u8Content.length);

        // Process M3U8 content line by line - key difference from our previous implementation
        const processedLines = m3u8Content
            .split('\n')
            .map(line => {
                line = line.trim();
                
                // Skip empty lines and comments (except special ones)
                if (!line || (line.startsWith('#') && !line.includes('URI='))) {
                    return line;
                }

                // Handle URI in #EXT-X-MEDIA tags (for audio/subtitle tracks)
                if (line.startsWith('#EXT-X-MEDIA:') && line.includes('URI=')) {
                    const uriMatch = line.match(/URI="([^"]+)"/);
                    if (uriMatch) {
                        const mediaUrl = new URL(uriMatch[1], targetUrl).href;
                        const proxyUrl = `${serverUrl}/m3u8-proxy?url=${encodeURIComponent(mediaUrl)}`;
                        return line.replace(uriMatch[1], proxyUrl);
                    }
                    return line;
                }

                // Handle encryption keys
                if (line.startsWith('#EXT-X-KEY:') && line.includes('URI=')) {
                    const uriMatch = line.match(/URI="([^"]+)"/);
                    if (uriMatch) {
                        const keyUrl = new URL(uriMatch[1], targetUrl).href;
                        const proxyUrl = `${serverUrl}/ts-proxy?url=${encodeURIComponent(keyUrl)}`;
                        return line.replace(uriMatch[1], proxyUrl);
                    }
                    return line;
                }

                // Handle segment URLs (non-comment lines)
                if (!line.startsWith('#')) {
                    try {
                        const segmentUrl = new URL(line, targetUrl).href;
                        
                        // Check if it's another m3u8 file (master playlist)
                        if (line.includes('.m3u8') || line.includes('m3u8')) {
                            return `${serverUrl}/m3u8-proxy?url=${encodeURIComponent(segmentUrl)}`;
                        } else {
                            // It's a media segment
                            return `${serverUrl}/ts-proxy?url=${encodeURIComponent(segmentUrl)}`;
                        }
                    } catch (e) {
                        console.log('[M3U8 Proxy] URL parse error for line:', line, e.message);
                        return line; // Return original if URL parsing fails
                    }
                }

                return line;
            });

        const processedContent = processedLines.join('\n');
        console.log('[M3U8 Proxy] Processed content length:', processedContent.length);

        // Set proper headers
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Content-Length', Buffer.byteLength(processedContent));
        res.setHeader('Cache-Control', 'no-cache');
        
        res.writeHead(200);
        res.end(processedContent);

    } catch (error) {
        console.error('[M3U8 Proxy Error]:', error.message);
        res.writeHead(500);
        res.end(`M3U8 Proxy error: ${error.message}`);
    }
}

// TS/Segment proxy function based on the working implementation
async function proxyTs(targetUrl, headers, req, res) {
    try {
        console.log('[TS Proxy] Fetching:', targetUrl);

        // Handle range requests for video playback
        const fetchHeaders = {
            'User-Agent': DEFAULT_USER_AGENT,
            ...headers
        };
        
        // Forward range header if present
        if (req.headers.range) {
            fetchHeaders['Range'] = req.headers.range;
            console.log('[TS Proxy] Range request:', req.headers.range);
        }

        const response = await fetch(targetUrl, {
            headers: fetchHeaders
        });

        console.log('[TS Proxy] Response:', response.status, response.statusText);

        if (!response.ok) {
            console.log('[TS Proxy] Error fetching segment:', targetUrl, '→', response.status);
            res.writeHead(response.status);
            res.end(`TS fetch failed: ${response.status}`);
            return;
        }

        // Set response headers
        const contentType = response.headers.get('content-type') || 'video/mp2t';
        res.setHeader('Content-Type', contentType);
        
        // Forward important headers from upstream
        if (response.headers.get('content-length')) {
            res.setHeader('Content-Length', response.headers.get('content-length'));
        }
        if (response.headers.get('content-range')) {
            res.setHeader('Content-Range', response.headers.get('content-range'));
        }
        if (response.headers.get('accept-ranges')) {
            res.setHeader('Accept-Ranges', response.headers.get('accept-ranges'));
        }
        
        // Set status code for range requests
        if (response.status === 206) {
            res.writeHead(206);
        } else {
            res.writeHead(200);
        }

        // Stream the response directly
        response.body.pipe(res);

    } catch (error) {
        console.error('[TS Proxy Error]:', error.message);
        res.writeHead(500);
        res.end(`TS Proxy error: ${error.message}`);
    }
}

export function createProxyRoutes(app) {
    // Enhanced CORS configuration
    const corsOptions = {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Range', 'Accept', 'Origin', 'X-Requested-With'],
        credentials: false
    };
    
    // Add CORS preflight handling for all proxy routes
    app.options('/m3u8-proxy', cors(corsOptions));
    app.options('/ts-proxy', cors(corsOptions));
    app.options('/proxy/hls', cors(corsOptions));
    app.options('/sub-proxy', cors(corsOptions));
    
    // Test endpoint to verify proxy is working
    app.get('/proxy/test', cors(corsOptions), (req, res) => {
        res.json({ 
            status: 'Proxy server is working',
            timestamp: new Date().toISOString(),
            userAgent: req.headers['user-agent']
        });
    });
    
    // M3U8 Proxy endpoint
    app.get('/m3u8-proxy', cors(corsOptions), async (req, res) => {
        console.log('[M3U8 Proxy] Request received:', req.query.url);
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
            const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
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

                        // Check if this is an m3u8 file (variant playlist) or video segment
                        if (/\.m3u8(\?|$)/i.test(segmentUrl)) {
                            // This is a variant playlist, route to m3u8-proxy
                            const proxyUrl = `${baseProxyUrl}/m3u8-proxy?url=${encodeURIComponent(segmentUrl)}&headers=${encodeURIComponent(JSON.stringify(headers))}`;
                            newLines.push(proxyUrl);
                        } else if (/\.(ts|mp4|m4s|webm|mkv)(\?|$)/i.test(segmentUrl)) {
                            // This is a video segment, route to ts-proxy
                            segmentUrls.push(segmentUrl);
                            const proxyUrl = `${baseProxyUrl}/ts-proxy?url=${encodeURIComponent(segmentUrl)}&headers=${encodeURIComponent(JSON.stringify(headers))}`;
                            newLines.push(proxyUrl);
                        } else {
                            // Handle other segment types that might not have extensions
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
                'public, max-age=300'
            );
            // Set filename for inline playback
            res.setHeader(
                'Content-Disposition',
                `inline; filename="master.m3u8"`
            );

            res.send(newLines.join('\n'));
        } catch (error) {
            console.error('[M3U8 Proxy Error]:', error.message);
            console.error('[M3U8 Proxy Error] URL:', targetUrl);
            
            if (error.name === 'AbortError') {
                return res.status(408).json({ error: 'Request timeout' });
            }
            
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
    app.get('/ts-proxy', cors(corsOptions), async (req, res) => {
        console.log('[TS Proxy] Request received:', req.query.url);
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
            // Check cache first if enabled (skip cache for range requests)
            if (!isCacheDisabled() && !req.headers.range) {
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

            // Handle range requests for video playback
            const fetchHeaders = {
                'User-Agent': DEFAULT_USER_AGENT,
                ...headers
            };
            
            // Forward range header if present
            if (req.headers.range) {
                fetchHeaders['Range'] = req.headers.range;
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            
            const response = await fetch(targetUrl, {
                headers: fetchHeaders,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
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
            const contentType = response.headers.get('content-type') || 
                (targetUrl.includes('.mp4') ? 'video/mp4' :
                 targetUrl.includes('.m4s') ? 'video/iso.segment' :
                 targetUrl.includes('.webm') ? 'video/webm' :
                 'video/mp2t');
            
            res.setHeader('Content-Type', contentType);
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Headers', '*');
            res.setHeader('Access-Control-Allow-Methods', '*');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            res.setHeader('Accept-Ranges', 'bytes');
            
            // Forward important headers from upstream
            if (response.headers.get('content-length')) {
                res.setHeader('Content-Length', response.headers.get('content-length'));
            }
            if (response.headers.get('content-range')) {
                res.setHeader('Content-Range', response.headers.get('content-range'));
            }
            if (response.headers.get('accept-ranges')) {
                res.setHeader('Accept-Ranges', response.headers.get('accept-ranges'));
            }
            
            // Set status code for range requests
            if (response.status === 206) {
                res.status(206);
            }
            
            // Set filename for inline playback
            const filename = targetUrl.includes('.mp4') ? 'media.mp4' : 
                           targetUrl.includes('.webm') ? 'media.webm' : 'media.ts';
            res.setHeader(
                'Content-Disposition',
                `inline; filename="${filename}"`
            );

            // Handle caching for successful responses (but not for range requests)
            if (!isCacheDisabled() && response.ok && !req.headers.range && response.status !== 206) {
                try {
                    const arrayBuffer = await response.arrayBuffer();
                    const data = new Uint8Array(arrayBuffer);
                    
                    const responseHeaders = {};
                    response.headers.forEach((value, key) => {
                        responseHeaders[key] = value;
                    });
                    
                    segmentCache.set(targetUrl, {
                        data,
                        headers: responseHeaders,
                        timestamp: Date.now()
                    });
                    
                    res.send(Buffer.from(data));
                } catch (cacheError) {
                    console.log('[TS Cache Error]:', cacheError.message);
                    // Fallback to streaming if caching fails
                    const fallbackResponse = await fetch(targetUrl, {
                        headers: fetchHeaders
                    });
                    if (fallbackResponse.ok) {
                        fallbackResponse.body.pipe(res);
                    } else {
                        res.status(fallbackResponse.status).json({
                            error: `TS fallback fetch failed: ${fallbackResponse.status}`
                        });
                    }
                }
            } else {
                // Stream the response directly for range requests or when cache is disabled
                response.body.pipe(res);
            }
        } catch (error) {
            console.error('[TS Error]:', error.message);
            console.error('[TS Error] URL:', targetUrl);
            
            if (error.name === 'AbortError') {
                return res.status(408).json({ error: 'Request timeout' });
            }
            
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
    app.get('/proxy/hls', cors(corsOptions), async (req, res) => {
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
            // Set filename for inline playback
            res.setHeader(
                'Content-Disposition',
                `inline; filename="master.m3u8"`
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
    app.get('/sub-proxy', cors(corsOptions), async (req, res) => {
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
        if (finalUrl.includes('.m3u8') || finalUrl.includes('m3u8') || 
            (!finalUrl.includes('.mp4') && !finalUrl.includes('.mkv') && 
             !finalUrl.includes('.webm') && !finalUrl.includes('.avi'))) {
            // Use M3U8 proxy for HLS streams and unknown formats
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
            // Use TS proxy for direct video files (.mp4, .mkv, .webm, .avi)
            const videoOrigin = getOriginFromUrl(finalUrl);
            if (videoOrigin) {
                proxyHeaders = {
                    ...proxyHeaders,
                    Referer: proxyHeaders.Referer || videoOrigin,
                    Origin: proxyHeaders.Origin || videoOrigin
                };
            }

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
