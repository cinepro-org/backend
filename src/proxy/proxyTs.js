// TS/Segment proxy function based on the working implementation
import fetch from 'node-fetch';
import { DEFAULT_USER_AGENT } from './proxyserver.js';

export async function proxyTs(targetUrl, headers, req, res) {
    try {
        // Handle range requests for video playback
        const fetchHeaders = {
            'User-Agent': DEFAULT_USER_AGENT,
            ...headers
        };

        // Forward range header if present
        if (req.headers.range) {
            fetchHeaders['Range'] = req.headers.range;
        }

        const response = await fetch(targetUrl, {
            headers: fetchHeaders
        });

        if (!response.ok) {
            res.writeHead(response.status);
            res.end(`TS fetch failed: ${response.status}`);
            return;
        }

        // Set response headers
        const contentType =
            response.headers.get('content-type') || 'video/mp2t';
        res.setHeader('Content-Type', contentType);

        // Forward important headers from upstream
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
        if (response.headers.get('accept-ranges')) {
            res.setHeader(
                'Accept-Ranges',
                response.headers.get('accept-ranges')
            );
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