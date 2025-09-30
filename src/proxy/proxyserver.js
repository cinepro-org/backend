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

// Default user agent
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
    // Test endpoint to verify proxy is working
    app.get('/proxy/test', (req, res) => {
        if (handleCors(req, res)) return;
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            status: 'Proxy server is working',
            timestamp: new Date().toISOString(),
            userAgent: req.headers['user-agent']
        }));
    });
    
    // Simplified M3U8 Proxy endpoint based on working implementation
    app.get('/m3u8-proxy', (req, res) => {
        if (handleCors(req, res)) return;
        
        console.log('[M3U8 Proxy] Request received:', req.query.url);
        const targetUrl = req.query.url;
        let headers = {};

        try {
            headers = JSON.parse(req.query.headers || '{}');
        } catch (e) {
            console.log('[M3U8 Proxy] Invalid headers JSON:', req.query.headers);
        }

        if (!targetUrl) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'URL parameter required' }));
            return;
        }

        // Get server URL for building proxy URLs
        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
        const host = req.headers.host;
        const serverUrl = `${protocol}://${host}`;

        proxyM3U8(targetUrl, headers, res, serverUrl);
    });

    // Simplified TS/Segment Proxy endpoint
    app.get('/ts-proxy', (req, res) => {
        if (handleCors(req, res)) return;
        
        console.log('[TS Proxy] Request received:', req.query.url);
        const targetUrl = req.query.url;
        let headers = {};

        try {
            headers = JSON.parse(req.query.headers || '{}');
        } catch (e) {
            console.log('[TS Proxy] Invalid headers JSON:', req.query.headers);
        }

        if (!targetUrl) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'URL parameter required' }));
            return;
        }

        proxyTs(targetUrl, headers, req, res);
    });

    // HLS Proxy endpoint (alternative endpoint)
    app.get('/proxy/hls', (req, res) => {
        if (handleCors(req, res)) return;
        
        const targetUrl = req.query.link;
        let headers = {};

        try {
            headers = JSON.parse(req.query.headers || '{}');
        } catch (e) {
            console.log('[HLS Proxy] Invalid headers JSON:', req.query.headers);
        }

        if (!targetUrl) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Link parameter is required' }));
            return;
        }

        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
        const host = req.headers.host;
        const serverUrl = `${protocol}://${host}`;

        proxyM3U8(targetUrl, headers, res, serverUrl);
    });

    // Subtitle Proxy endpoint
    app.get('/sub-proxy', (req, res) => {
        if (handleCors(req, res)) return;
        
        const targetUrl = req.query.url;
        let headers = {};

        try {
            headers = JSON.parse(req.query.headers || '{}');
        } catch (e) {
            console.log('[Sub Proxy] Invalid headers JSON:', req.query.headers);
        }

        if (!targetUrl) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'url parameter required' }));
            return;
        }

        console.log('[Sub Proxy] Fetching:', targetUrl);

        fetch(targetUrl, {
            headers: {
                'User-Agent': DEFAULT_USER_AGENT,
                ...headers
            }
        })
        .then(response => {
            if (!response.ok) {
                res.writeHead(response.status);
                res.end(`Subtitle fetch failed: ${response.status}`);
                return;
            }

            res.setHeader('Content-Type', response.headers.get('content-type') || 'text/vtt');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            
            res.writeHead(200);
            response.body.pipe(res);
        })
        .catch(error => {
            console.error('[Sub Proxy Error]:', error.message);
            res.writeHead(500);
            res.end(`Subtitle Proxy error: ${error.message}`);
        });
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