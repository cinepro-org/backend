import fetch from 'node-fetch';
import { ErrorObject } from '../../helpers/ErrorObject.js';

//TODO: not finished yet... check: https://github.com/Gujal00/ResolveURL/blob/master/script.module.resolveurl/lib/resolveurl/plugins/streamtape.py

export async function extract_streamtape(url) {
    try {
        let hostname = url.match(/https?:\/\/([^\/]+)/)[1];

        const response = await fetch(url, {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/y130.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                Connection: 'keep-alive',
                Referer: url,
                Host: `${hostname}`,
                Origin: `${hostname}`
            }
        });

        if (!response.ok) {
            return new ErrorObject(
                `Failed to fetch Streamtape URL: Status ${response.status}`,
                'Streamtape',
                response.status,
                'Check the URL or server status.',
                true,
                true
            );
        }

        const html = await response.text();

        const fullUrlRegex = /ById\('.+?=\s*(["']\/\/[^;<]+)/g;
        const allMatches = html.match(fullUrlRegex);
        if (!allMatches) {
            return new ErrorObject(
                'ById URL pattern not found in the response.',
                'Streamtape',
                500,
                'The page structure might have changed.',
                true,
                true
            );
        }
        // Get the last match like Python does with src[-1]
        const lastMatch = allMatches[allMatches.length - 1];
        const fullUrlMatch = lastMatch.match(/ById\('.+?=\s*(["']\/\/[^;<]+)/);

        if (!fullUrlMatch) {
            return new ErrorObject(
                'ideoooolink URL not found in the response.',
                'Streamtape',
                500,
                'The page structure might have changed.',
                true,
                true
            );
        }

        let srcUrl = '';
        const parts = fullUrlMatch[1].replace(/'/g, '"').split('+');

        for (const part of parts) {
            const p1Match = part.match(/"([^"]*)/);
            if (p1Match) {
                let p1 = p1Match[1];
                let p2 = 0;
                if (part.includes('substring')) {
                    const substMatches = part.match(/substring\((\d+)/g);
                    if (substMatches) {
                        for (const sub of substMatches) {
                            // p2 += parseInt(sub.match(/\d+/)[0]);

                            const num = sub.match(/substring\((\d+)/)[1];
                            p2 += parseInt(num);
                        }
                    }
                }
                srcUrl += p1.substring(p2);
                console.log(
                    'Debug: p1:',
                    p1,
                    'p2:',
                    p2,
                    'result:',
                    p1.substring(p2)
                );
            }
        }
        srcUrl += '&stream=1';
        let finalUrl = srcUrl.startsWith('//') ? 'https:' + srcUrl : srcUrl;

        if (!finalUrl) {
            return new ErrorObject(
                'Failed to get the video link.',
                'Streamtape',
                500,
                'The final URL might be invalid or inaccessible.',
                true,
                true
            );
        }

        return {
            file: finalUrl,
            type: 'mp4'
        };
    } catch (error) {
        console.error('Error in extract_streamtape:', error);
        return new ErrorObject(
            `Unexpected error: ${error.message}`,
            'Streamtape',
            500,
            'Check the implementation or server status.',
            true,
            true
        );
    }
}
