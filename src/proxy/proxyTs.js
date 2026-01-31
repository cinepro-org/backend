// TS/Segment proxy function based on the working implementation
import fetch from 'node-fetch';
import { DEFAULT_USER_AGENT } from './proxyserver.js';
import { getCachedSegment, cacheSegment } from './cache.js';
/**
 * proxy ts/video segments with optimized caching and range support
 *
 * @param {string} targetUrl - the url of the segment to fetch
 * @param {object} headers - custom headers to include in request
 * @param {object} req - express request object
 * @param {object} res - express response object
 * @returns {Promise<void>}
 */
export async function proxyTs(targetUrl, headers, req, res) {
    try {
        // check if segment is already cached in memory
        // this dramatically improves performance for frequently accessed segments
        const cachedData = getCachedSegment(targetUrl);
        if (cachedData) {
            // serve from cache - instant response
            const contentType = 'video/mp2t'; // assume ts for cached segments
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Length', cachedData.length);
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader(
                'Cache-Control',
                'public, max-age=31536000, immutable'
            );
            res.setHeader('X-Cache-Status', 'HIT'); // debug header

            // handle range requests from cache
            if (req.headers.range) {
                const parts = req.headers.range
                    .replace(/bytes=/, '')
                    .split('-');
                const start = parseInt(parts[0], 10);
                const end = parts[1]
                    ? parseInt(parts[1], 10)
                    : cachedData.length - 1;
                const chunksize = end - start + 1;

                res.setHeader(
                    'Content-Range',
                    `bytes ${start}-${end}/${cachedData.length}`
                );
                res.setHeader('Content-Length', chunksize);
                res.writeHead(206);
                res.end(cachedData.slice(start, end + 1));
            } else {
                res.writeHead(200);
                res.end(cachedData);
            }

            return;
        }

        // not in cache - proceed with fetch
        res.setHeader('X-Cache-Status', 'MISS'); // debug header

        // prepare fetch headers with user agent and custom headers
        const fetchHeaders = {
            'User-Agent': DEFAULT_USER_AGENT,
            ...headers
        };

        // forward range header for partial content requests
        // this enables seeking in video player
        if (req.headers.range) {
            fetchHeaders['Range'] = req.headers.range;
        }

        // fetch the segment from origin server
        const response = await fetch(targetUrl, {
            headers: fetchHeaders,
            // increase timeout for large segments
            timeout: 30000
        });

        // handle fetch failures
        if (!response.ok) {
            console.error(
                `[TS Proxy] Failed to fetch ${targetUrl}: ${response.status}`
            );
            res.writeHead(response.status);
            res.end(`TS fetch failed: ${response.status}`);
            return;
        }

        // determine content type - default to mpeg transport stream
        const contentType =
            response.headers.get('content-type') || 'video/mp2t';
        res.setHeader('Content-Type', contentType);

        // forward critical headers for proper playback
        if (response.headers.get('content-length')) {
            res.setHeader(
                'Content-Length',
                response.headers.get('content-length')
            );
        }
        if (response.headers.get('content-range')) {
            res.setHeader(
                'Content-Range',
                response.headers.get('content-range')
            );
        }

        // enable range requests for seeking support
        res.setHeader(
            'Accept-Ranges',
            response.headers.get('accept-ranges') || 'bytes'
        );

        // aggressive caching headers for segments
        // segments are immutable once created, so cache aggressively
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.setHeader(
            'ETag',
            response.headers.get('etag') || `"${Date.now()}"`
        );

        // enable compression if supported
        const acceptEncoding = req.headers['accept-encoding'] || '';
        if (response.headers.get('content-encoding')) {
            res.setHeader(
                'Content-Encoding',
                response.headers.get('content-encoding')
            );
        }

        // set appropriate status code
        // 206 for partial content (range requests)
        // 200 for full content
        if (response.status === 206) {
            res.writeHead(206);
        } else {
            res.writeHead(200);
        }

        // for cacheable segments (not range requests), buffer and cache
        // range requests are streamed directly for memory efficiency
        if (!req.headers.range && response.status === 200) {
            const chunks = [];

            response.body.on('data', (chunk) => {
                chunks.push(chunk);
                // also write to response immediately for no delay
                res.write(chunk);
            });

            response.body.on('end', () => {
                // cache the complete segment
                const fullBuffer = Buffer.concat(chunks);
                cacheSegment(targetUrl, fullBuffer);
                res.end();
            });

            response.body.on('error', (error) => {
                console.error('[TS Proxy] Stream error:', error.message);
                if (!res.headersSent) {
                    res.writeHead(500);
                }
                res.end();
            });
        } else {
            // stream range requests directly without caching
            response.body.pipe(res);

            response.body.on('error', (error) => {
                console.error('[TS Proxy] Stream error:', error.message);
                if (!res.headersSent) {
                    res.writeHead(500);
                }
                res.end();
            });
        }

        // handle pipe errors gracefully
        response.body.on('error', (error) => {
            console.error('[TS Proxy] Stream error:', error.message);
            if (!res.headersSent) {
                res.writeHead(500);
            }
            res.end();
        });

        // log successful proxying
        console.log(
            `[TS Proxy] Successfully proxied segment from ${new URL(targetUrl).hostname}`
        );
    } catch (error) {
        console.error('[TS Proxy Error]:', error.message);
        if (!res.headersSent) {
            res.writeHead(500);
            res.end(`TS Proxy error: ${error.message}`);
        }
    }
}
