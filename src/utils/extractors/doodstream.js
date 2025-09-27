import fetch from 'node-fetch';
import { ErrorObject } from '../../helpers/ErrorObject.js';

// special mention to
// special mention to
// https://github.com/Gujal00/ResolveURL/blob/master/script.module.resolveurl/lib/resolveurl/plugins/doodstream.py
export async function extract_doodstream(url) {
    try {
        // extract hostname and media_id from url
        const pattern =
            /(?:\/\/|\.)((?:do*0*o*0*ds?(?:tream|ter|cdn)?|ds2(?:play|video)|v*id(?:ply|e0)|all3do|d-s|do(?:7go|ply))\.(?:[cit]om?|watch|s[ho]|cx|l[ai]|w[sf]|pm|re|yt|stream|pro|work|net))\/(?:d|e)\/([0-9a-zA-Z]+)/;

        const match = url.match(pattern);
        if (!match) {
            return new ErrorObject(
                'Url pattern not supported',
                'DoodStream',
                400,
                'this url format is not supported by doodstream extractor',
                true,
                true
            );
        }

        let host = match[1];
        const mediaId = match[2];

        // normalize problematic hosts
        if (host.endsWith('.cx') || host.endsWith('.wf')) {
            host = 'dood.so';
        }

        // construct web url
        const webUrl = `https://${host}/d/${mediaId}`;

        // setup headers (mimic browser)
        const headers = {
            'User-Agent':
                'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36 Edg/139.0.0.0',
            Referer: 'https://dood.watch/'
        };

        // fetch initial page
        let response = await fetch(webUrl, {
            headers,
            redirect: 'follow'
        });

        if (!response.ok) {
            return new ErrorObject(
                `Failed to fetch doodstream url: status ${response.status}`,
                'DoodStream',
                response.status,
                'Check the url or server status',
                true,
                true
            );
        }

        // check for redirects and update host if needed
        const finalUrl = response.url;
        if (finalUrl !== webUrl) {
            const hostMatch = finalUrl.match(/(?:\/\/|\.)([^\/]+)/);
            if (hostMatch) {
                host = hostMatch[1];
            }
        }

        // update referer header
        headers['Referer'] = `https://${host}/d/${mediaId}`;

        let html = await response.text();

        // check for iframe redirect
        const iframeMatch = html.match(/<iframe\s*src="([^"]+)/);
        if (iframeMatch) {
            const iframeUrl = `https://${host}${iframeMatch[1]}`;

            response = await fetch(iframeUrl, { headers });

            if (!response.ok) {
                return new ErrorObject(
                    'failed to fetch iframe page',
                    'DoodStream',
                    response.status,
                    'iframe page request failed',
                    true,
                    true
                );
            }
            html = await response.text();
        } else {
            // try /e/ endpoint if no iframe is found
            const embedUrl = `https://${host}/e/${mediaId}`;

            response = await fetch(embedUrl, { headers });

            if (!response.ok) {
                return new ErrorObject(
                    'failed to fetch embed page',
                    'DoodStream',
                    response.status,
                    'embed page request failed',
                    true,
                    true
                );
            }
            html = await response.text();
        }

        // extract video source components
        const sourceMatch = html.match(
            /dsplayer\.hotkeys[^']+'([^']+).+?function\s*makePlay.+?return[^?]+([^"]+)/s
        );
        if (!sourceMatch) {
            return new ErrorObject(
                'No video sources found',
                'DoodStream',
                404,
                'the page does not contain any playable video sources',
                true,
                true
            );
        }

        const sourcePath = sourceMatch[1];
        const token = sourceMatch[2];

        // fetch the source url
        const sourceUrl = `https://${host}${sourcePath}`;

        const sourceResponse = await fetch(sourceUrl, { headers });

        if (!sourceResponse.ok) {
            return new ErrorObject(
                'Failed to fetch video source',
                'DoodStream',
                sourceResponse.status,
                'video source request failed',
                true,
                true
            );
        }

        let sourceHtml = await sourceResponse.text();

        // construct final video url
        let videoUrl;
        if (sourceHtml.includes('cloudflarestorage.')) {
            // direct cloudflare storage link
            videoUrl = sourceHtml.trim();
        } else {
            // decode and construct url with token and timestamp
            const decodedSource = doodDecode(sourceHtml);
            const timestamp = Date.now();
            videoUrl = decodedSource + token + timestamp;
        }

        return {
            file: videoUrl,
            type: 'mp4',
            headers: {
                'User-Agent': headers['User-Agent'],
                Referer: headers['Referer']
            }
        };
    } catch (error) {
        console.error('error in extract_doodstream:', error);
        return new ErrorObject(
            `unexpected error: ${error.message}`,
            'DoodStream',
            500,
            'check the implementation or server status',
            true,
            true
        );
    }
}

// helper function to decode doodstream source
function doodDecode(data) {
    const characters =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = data;

    // add 10 random characters from the (python plugin)
    for (let i = 0; i < 10; i++) {
        result += characters[Math.floor(Math.random() * characters.length)];
    }

    return result;
}
