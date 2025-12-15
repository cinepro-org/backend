import { languageMap } from '../../../utils/languages.js';
import { ErrorObject } from '../../../helpers/ErrorObject.js';

const DOMAIN = 'https://uembed.site';

export async function getUembed(media) {
    console.log('[getUembed] Function called');
    console.log('[getUembed] Media input:', JSON.stringify(media, null, 2));

    const apiUrl = `${DOMAIN}/api/videos/tmdb?id=${media.tmdb}${media.type === 'tv' ? `&season=${media.season}&episode=${media.episode}` : ''}`;
    console.log('[getUembed] Generated API URL:', apiUrl);

    try {
        const requestHeaders = {
            Accept: 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            Origin: DOMAIN,
            Referer: `${DOMAIN}/`,
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'sec-ch-ua':
                '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"'
        };

        console.log(
            '[getUembed] Request headers:',
            JSON.stringify(requestHeaders, null, 2)
        );
        console.log('[getUembed] Making fetch request to:', apiUrl);

        let response = await fetch(apiUrl, {
            headers: requestHeaders
        });

        console.log('[getUembed] Fetch response status:', response.status);
        console.log(
            '[getUembed] Fetch response statusText:',
            response.statusText
        );
        console.log('[getUembed] Fetch response ok:', response.ok);

        console.log('[getUembed] Response headers:');
        response.headers.forEach((value, key) => {
            console.log(`[getUembed]   ${key}: ${value}`);
        });

        if (!response.ok) {
            console.log(
                '[getUembed] Response not OK, attempting to read response body'
            );

            let errorBody = '';
            try {
                errorBody = await response.text();
                console.log('[getUembed] Error response body:', errorBody);
            } catch (readError) {
                console.log(
                    '[getUembed] Could not read error response body:',
                    readError.message
                );
            }

            return new ErrorObject(
                'Failed to fetch sources',
                'UEmbed',
                response.status,
                `Failed to fetch sources from ${apiUrl}. Status: ${response.status}. Body: ${errorBody.substring(0, 200)}`,
                true,
                true
            );
        }

        console.log('[getUembed] Response OK, parsing JSON');
        const data = await response.json();
        console.log(
            '[getUembed] Parsed JSON response:',
            JSON.stringify(data, null, 2)
        );

        if (!data || !Array.isArray(data) || data.length === 0) {
            return new ErrorObject(
                'No sources found',
                'UEmbed',
                404,
                'No sources were returned by the API. Ensure the media exists or the API is functioning correctly.',
                true,
                true
            );
        }

        const validVideos = data.filter(video => video && video.file);
        
        if (validVideos.length === 0) {
            return new ErrorObject(
                'No valid sources found',
                'UEmbed',
                404,
                'The API returned videos, but none had valid file URLs. Check the source URLs or API response.',
                true,
                true
            );
        }

        const formattedSources = validVideos.map(video => ({
            file: video.file.trim(),
            type: video.file.includes('.m3u8')
                ? 'hls'
                : video.file.includes('.mp4')
                  ? 'mp4'
                  : 'unknown',
            lang: languageMap[video.language] || video.language || 'English',
            headers: {
                Referer: DOMAIN,
                Origin: DOMAIN,
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
            }
        }));

        if (formattedSources.length === 0) {
            return new ErrorObject(
                'No valid sources found after formatting',
                'UEmbed',
                404,
                'Valid videos were found but could not be formatted properly.',
                true,
                true
            );
        }

        return {
            files: formattedSources,
            subtitles: []
        };
    } catch (error) {
        return new ErrorObject(
            `Unexpected error: ${error.message}`,
            'UEmbed',
            500,
            'Check the implementation or server status.',
            true,
            true
        );
    }
}