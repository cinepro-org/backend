import { ErrorObject } from '../../helpers/ErrorObject.js';
// Special Thanks to
// https://github.com/Gujal00/ResolveURL/blob/master/script.module.resolveurl/lib/resolveurl/plugins/vidmoly.py

export async function extract_vidmoly(url) {
    try {
        // Extract media_id from URL
        const match = url.match(
            /(?:\/\/|\.)(vidmoly\.(?:me|to|net))\/(?:embed-|w\/)?([0-9a-zA-Z]+)/
        );
        if (!match) {
            return new ErrorObject(
                'Invalid URL',
                'VidMoly',
                400,
                'Could not extract media ID from URL',
                true,
                false
            );
        }

        const host = match[1];
        const mediaId = match[2];

        // Construct embed URL
        const webUrl = `https://${host}/embed-${mediaId}.html`;

        // Set up headers similar to Python version
        const headers = {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0',
            Referer: webUrl,
            'Sec-Fetch-Dest': 'iframe'
        };

        // Fetch the embed page
        const response = await fetch(webUrl, { headers });
        if (!response.ok) {
            return new ErrorObject(
                'Fetch failed',
                'VidMoly',
                response.status,
                `Failed to fetch embed page: ${response.statusText}`,
                true,
                false
            );
        }

        const html = await response.text();

        // Extract video source using regex pattern from Python version
        // Pattern: sources: [{file:"URL"
        const sourceMatch = html.match(/sources:\s*\[{file:"([^"]+)"/);

        if (!sourceMatch || !sourceMatch[1]) {
            return new ErrorObject(
                'No video found',
                'VidMoly',
                404,
                'Could not find video source in page',
                true,
                false
            );
        }

        const videoUrl = sourceMatch[1];

        // Filter out .mpd files (DASH manifests) as per Python blacklist
        if (videoUrl.includes('.mpd')) {
            return new ErrorObject(
                'Unsupported format',
                'VidMoly',
                400,
                'Only MPD format found, not supported',
                true,
                false
            );
        }

        return {
            file: videoUrl,
            type: 'mp4',
            headers: headers
        };
    } catch (error) {
        return new ErrorObject(
            'Extraction failed',
            'VidMoly',
            500,
            `Error during extraction: ${error.message}`,
            true,
            true
        );
    }
}
