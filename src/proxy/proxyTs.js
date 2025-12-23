/**
 * TS/Segment Proxy - Optimized for 1080p Streaming on Localhost
 * True streaming with proper backpressure handling
 */

import { pipeline } from 'stream/promises';
import { Readable, PassThrough } from 'stream';

export async function proxyTs(targetUrl, headersParam, req, res) {
    if (process.env.DISABLE_M3U8 === 'true') {
        res.statusCode = 404;
        res.end('TS proxying is disabled');
        return;
    }

    if (!targetUrl) {
        res.statusCode = 400;
        res.end('URL parameter is required');
        return;
    }

    // Parse headers
    let headers = {};
    try {
        headers = typeof headersParam === 'string' ? JSON.parse(headersParam) : (headersParam || {});
    } catch (e) {
        res.statusCode = 400;
        res.end('Invalid headers format');
        return;
    }

    const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    const segmentName = targetUrl.split('/').pop() || 'segment';
    const startTime = Date.now();

    // console.log(`[TS] Starting: ${segmentName}`);

    // Optimized headers for TS segments - NO retry logic
    const fetchHeaders = {
        'User-Agent': CHROME_UA,
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, deflate, br',
        ...headers
    };

    // Remove headers that cause issues for TS
    delete fetchHeaders['Sec-Fetch-Dest'];
    delete fetchHeaders['Sec-Fetch-Mode'];
    delete fetchHeaders['Sec-Fetch-Site'];

    let bytesTransferred = 0;
    let lastProgressLog = startTime;

    try {
        // Fetch with streaming
        const response = await fetch(targetUrl, { headers: fetchHeaders });

        if (!response.ok) {
            console.error(`[TS] ${segmentName} - Source error: ${response.status}`);
            res.statusCode = response.status;
            res.end();
            return;
        }

        // Get content info
        const contentLength = response.headers.get('content-length');
        const contentType = response.headers.get('content-type') || 'video/mp2t';
        const expectedSize = contentLength ? parseInt(contentLength) : 0;

        // console.log(`[TS] ${segmentName} - Size: ${expectedSize} bytes, Type: ${contentType}`);

        // Set response headers IMMEDIATELY
        res.setHeader('Content-Type', contentType);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('Access-Control-Allow-Methods', '*');
        res.setHeader('Cache-Control', 'public, max-age=30');

        if (expectedSize > 0) {
            res.setHeader('Content-Length', expectedSize);
        }

        // Create a pass-through stream for monitoring
        const monitorStream = new PassThrough();

        // Monitor data flow
        monitorStream.on('data', (chunk) => {
            bytesTransferred += chunk.length;

            // Log progress every 500KB or 1 second
            const now = Date.now();
            if (now - lastProgressLog > 1000 || bytesTransferred % (512 * 1024) < chunk.length) {
                const mb = (bytesTransferred / (1024 * 1024)).toFixed(2);
                const pct = expectedSize > 0 ? ((bytesTransferred / expectedSize) * 100).toFixed(1) : '?';
                const elapsed = (now - startTime) / 1000;
                const speed = elapsed > 0 ? (bytesTransferred / elapsed / 1024 / 1024).toFixed(2) : 0;

                // console.log(`[TS] ${segmentName} - ${mb} MB (${pct}%) @ ${speed} MB/s`);
                lastProgressLog = now;
            }
        });

        // Convert ReadableStream to Node.js Readable
        const nodeReadable = Readable.fromWeb(response.body);

        // Use pipeline for proper backpressure handling
        await pipeline(
            nodeReadable,
            monitorStream,
            res
        );

        const totalTime = Date.now() - startTime;
        const mbTotal = (bytesTransferred / (1024 * 1024)).toFixed(2);
        const avgSpeed = totalTime > 0 ? (bytesTransferred / totalTime / 1024).toFixed(1) : 0;

        // console.log(`[TS] ${segmentName} - COMPLETE: ${mbTotal} MB in ${totalTime}ms (${avgSpeed} KB/ms)`);

        // Warn if stream was too slow for 1080p
        if (expectedSize > 0) {
            const bitrate = (bytesTransferred * 8) / (totalTime / 1000); // bits per second
            const requiredBitrate = 5000000; // 5 Mbps minimum for 1080p

            if (bitrate < requiredBitrate) {
                console.warn(`[TS] ${segmentName} - WARNING: Low bitrate ${(bitrate / 1000000).toFixed(2)} Mbps < 5 Mbps required for 1080p`);
            }
        }

    } catch (error) {
        const totalTime = Date.now() - startTime;

        // Don't log canceled requests (client disconnected)
        if (error.code !== 'ECONNRESET' && error.message !== 'aborted') {
            console.error(`[TS] ${segmentName} - ERROR after ${totalTime}ms:`, error.message);
        } else {
            console.log(`[TS] ${segmentName} - Client disconnected after ${totalTime}ms, ${bytesTransferred} bytes sent`);
        }

        // Only send error if headers haven't been sent
        if (!res.headersSent) {
            res.statusCode = 500;
            res.end(`Stream error: ${error.message}`);
        }
        // If headers were sent, just end the response
        else {
            res.end();
        }
    }
}

// Optional: Add a simple health check endpoint
export function getProxyHealth() {
    return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        platform: process.platform,
        memory: {
            rss: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`,
            heap: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`
        }
    };
} 