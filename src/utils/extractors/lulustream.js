import { ErrorObject } from '../../helpers/ErrorObject.js';

// Special Thanks to
// https://github.com/Gujal00/ResolveURL/blob/master/script.module.resolveurl/lib/resolveurl/plugins/lulustream.py

export async function extract_lulustream(url) {
    try {
        // Extract host and media_id from URL
        const match = url.match(
            /(?:\/\/|\.)((?:lulu(?:stream|vi*do*)?|732eg54de642sa|cdn1|streamhihi|d00ds)\.(?:com|sbs|si?te?))\/(?:e\/|d\/)?([0-9a-zA-Z]+)/
        );

        if (!match) {
            return new ErrorObject(
                'Invalid URL',
                'LuluStream',
                400,
                'Could not extract host and media ID from URL',
                true,
                false
            );
        }

        const host = match[1];
        const mediaId = match[2];

        // Construct embed URL
        const webUrl = `https://${host}/e/${mediaId}`;

        // Set up headers - no referer as per Python code (referer=False)
        const headers = {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };

        // Fetch the embed page
        const response = await fetch(webUrl, { headers });

        if (!response.ok) {
            return new ErrorObject(
                'Fetch failed',
                'LuluStream',
                response.status,
                `Failed to fetch embed page: ${response.statusText}`,
                true,
                false
            );
        }

        const html = await response.text();

        // Extract video source using the pattern from Python
        // Pattern: sources: [{file: "URL" or sources: [{file: 'URL'
        const sourceMatch = html.match(/sources:\s*\[{\s*file:\s*["']([^"']+)/);

        if (!sourceMatch || !sourceMatch[1]) {
            return new ErrorObject(
                'No video found',
                'LuluStream',
                404,
                'Could not find video source in page',
                true,
                false
            );
        }

        const videoUrl = sourceMatch[1];

        return {
            file: videoUrl,
            type: 'mp4',
            headers: headers
        };
    } catch (error) {
        return new ErrorObject(
            'Extraction failed',
            'LuluStream',
            500,
            `Error during extraction: ${error.message}`,
            true,
            true
        );
    }
}
