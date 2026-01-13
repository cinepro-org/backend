// M3U8 proxy function based on the working implementation
import fetch from 'node-fetch';
import { DEFAULT_USER_AGENT } from './proxyserver.js';

export async function proxyM3U8(targetUrl, headers, res, serverUrl) {
    try {
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': DEFAULT_USER_AGENT,
                ...headers
            }
        });

        if (!response.ok) {
            res.writeHead(response.status);
            res.end(`M3U8 fetch failed: ${response.status}`);
            return;
        }

        const m3u8Content = await response.text();

        // Process M3U8 content line by line - key difference from our previous implementation
        const processedLines = m3u8Content.split('\n').map((line) => {
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
                    return line; // Return original if URL parsing fails
                }
            }

            return line;
        });

        const processedContent = processedLines.join('\n');

        // set proper headers for m3u8 manifest
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        res.setHeader('Content-Length', Buffer.byteLength(processedContent));

        // cache strategy for manifests
        // master playlists can be cached longer (60 seconds)
        // media playlists should be cached shorter (10 seconds) for live content
        // for vod content, longer cache is acceptable
        const isMasterPlaylist = processedContent.includes('#EXT-X-STREAM-INF');
        const isVod = processedContent.includes('#EXT-X-ENDLIST');

        if (isVod) {
            // vod content - manifest doesn't change, cache for 5 minutes
            res.setHeader('Cache-Control', 'public, max-age=300');
        } else if (isMasterPlaylist) {
            // master playlist - cache for 1 minute
            res.setHeader('Cache-Control', 'public, max-age=60');
        } else {
            // media playlist for live content - cache for 10 seconds
            res.setHeader('Cache-Control', 'public, max-age=10');
        }

        // add etag for cache validation
        const etag = `"${Buffer.from(processedContent).toString('base64').substring(0, 32)}"`;
        res.setHeader('ETag', etag);

        // enable cors for manifest
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader(
            'Access-Control-Expose-Headers',
            'Content-Length, Content-Type, Cache-Control'
        );

        res.writeHead(200);
        res.end(processedContent);
    } catch (error) {
        console.error('[M3U8 Proxy Error]:', error.message);
        res.writeHead(500);
        res.end(`M3U8 Proxy error: ${error.message}`);
    }
}
