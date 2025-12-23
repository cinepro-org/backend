import fetch from 'node-fetch';
import { extractOriginalUrl } from './parser.js';
import { handleCors } from './handleCors.js';
import { proxyM3U8 } from './m3u8proxy.js';
import { proxyTs } from './proxyTs.js';

// Default user agent
export const DEFAULT_USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export function createProxyRoutes(app) {
    // Test endpoint to verify proxy is working
    app.get('/proxy/status', (req, res) => {
        if (handleCors(req, res)) return;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
            JSON.stringify({
                status: 'Proxy server is working',
                timestamp: new Date().toISOString(),
                userAgent: req.headers['user-agent']
            })
        );
    });

    // Simplified M3U8 Proxy endpoint based on working implementation
    app.get('/m3u8-proxy', (req, res) => {
        if (handleCors(req, res)) return;

        try {
            const targetUrl = req.query.url;
            let headers = {};

            try {
                headers = JSON.parse(req.query.headers || '{}');
            } catch (e) {
                console.warn('[Proxy] Failed to parse headers JSON:', e.message);
            }

            if (!targetUrl) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'URL parameter required' }));
                return;
            }

            // Get server URL for building proxy URLs
            const protocol =
                req.headers['x-forwarded-proto'] || req.protocol || 'http';
            const host = req.headers.host;
            const serverUrl = `${protocol}://${host}`;

            proxyM3U8(targetUrl, headers, res, serverUrl).catch(err => {
                console.error('[M3U8 Proxy Internal Error]:', err);
                if (!res.headersSent) {
                    res.writeHead(500);
                    res.end(`Internal M3U8 Proxy Error: ${err.message}`);
                }
            });
        } catch (error) {
            console.error('[M3U8 Proxy Route Error]:', error);
            if (!res.headersSent) {
                res.writeHead(500);
                res.end(`M3U8 Route Error: ${error.message}`);
            }
        }
    });

    // Simplified TS/Segment Proxy endpoint
    app.get('/ts-proxy', (req, res) => {
        if (handleCors(req, res)) return;

        try {
            const targetUrl = req.query.url;
            let headers = {};

            try {
                headers = JSON.parse(req.query.headers || '{}');
            } catch (e) {
                console.warn('[Proxy] Failed to parse headers JSON:', e.message);
            }

            if (!targetUrl) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'URL parameter required' }));
                return;
            }

            proxyTs(targetUrl, headers, req, res).then((r) => r).catch(err => {
                console.error('[TS Proxy Internal Error]:', err);
                if (!res.headersSent) {
                    res.writeHead(500);
                    res.end(`Internal TS Proxy Error: ${err.message}`);
                }
            });
        } catch (error) {
            console.error('[TS Proxy Route Error]:', error);
            if (!res.headersSent) {
                res.writeHead(500);
                res.end(`TS Route Error: ${error.message}`);
            }
        }
    });

    // HLS Proxy endpoint (alternative endpoint)
    app.get('/proxy/hls', (req, res) => {
        if (handleCors(req, res)) return;

        const targetUrl = req.query.link;
        let headers = {};

        try {
            headers = JSON.parse(req.query.headers || '{}');
        } catch (e) {
            // Invalid headers JSON
        }

        if (!targetUrl) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Link parameter is required' }));
            return;
        }

        const protocol =
            req.headers['x-forwarded-proto'] || req.protocol || 'http';
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
            // Invalid headers JSON
        }

        if (!targetUrl) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'url parameter required' }));
            return;
        }

        fetch(targetUrl, {
            headers: {
                'User-Agent': DEFAULT_USER_AGENT,
                ...headers
            }
        })
            .then((response) => {
                if (!response.ok) {
                    res.writeHead(response.status);
                    res.end(`Subtitle fetch failed: ${response.status}`);
                    return;
                }

                res.setHeader(
                    'Content-Type',
                    response.headers.get('content-type') || 'text/vtt'
                );
                res.setHeader('Cache-Control', 'public, max-age=3600');

                res.writeHead(200);
                response.body.pipe(res);
            })
            .catch((error) => {
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
        // Create proxy headers strictly from what is provided
        // Do NOT invent Origin or Referer if not present. Trust the extractor.

        if (
            finalUrl.includes('.m3u8') ||
            finalUrl.includes('m3u8') ||
            (!finalUrl.includes('.mp4') &&
                !finalUrl.includes('.mkv') &&
                !finalUrl.includes('.webm') &&
                !finalUrl.includes('.avi'))
        ) {
            // Use M3U8 proxy for HLS streams and unknown formats

            const localProxyUrl = `${serverUrl}/m3u8-proxy?url=${encodeURIComponent(finalUrl)}&headers=${encodeURIComponent(JSON.stringify(proxyHeaders))}`;

            return {
                ...file,
                file: localProxyUrl,
                type: 'hls',
                headers: proxyHeaders
            };
        } else {
            // Use TS proxy for direct video files (.mp4, .mkv, .webm, .avi)

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
