import { languageMap } from '../../../utils/languages.js';
import { ErrorObject } from '../../../helpers/ErrorObject.js';

const DOMAIN = 'https://vidrock.net';

export async function getVidRock(media) {
    console.log('[getVidRock] Function called');
    console.log('[getVidRock] Media input:', JSON.stringify(media, null, 2));

    // media should contain: { type, tmdb, season?, episode? }
    const link = getLink(media);
    console.log('[getVidRock] Generated link from getLink():', link);

    try {
        const requestHeaders = {
            Accept: 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            Origin: DOMAIN,
            Referer: `${DOMAIN}/movie/${media.tmdb}`,
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
            '[getVidRock] Request headers:',
            JSON.stringify(requestHeaders, null, 2)
        );
        console.log('[getVidRock] Making fetch request to:', link);

        let sources = await fetch(link, {
            headers: requestHeaders
        });

        console.log('[getVidRock] Fetch response status:', sources.status);
        console.log(
            '[getVidRock] Fetch response statusText:',
            sources.statusText
        );
        console.log('[getVidRock] Fetch response ok:', sources.ok);

        // Log response headers
        console.log('[getVidRock] Response headers:');
        sources.headers.forEach((value, key) => {
            console.log(`[getVidRock]   ${key}: ${value}`);
        });

        if (!sources.ok) {
            console.log(
                '[getVidRock] Response not OK, attempting to read response body'
            );

            // Try to get the response body for more info
            let errorBody = '';
            try {
                errorBody = await sources.text();
                console.log('[getVidRock] Error response body:', errorBody);
            } catch (readError) {
                console.log(
                    '[getVidRock] Could not read error response body:',
                    readError.message
                );
            }

            return new ErrorObject(
                'Failed to scrape sources',
                'Vidrock',
                sources.status,
                `Failed to fetch sources from ${link}. Status: ${sources.status}. Body: ${errorBody.substring(0, 200)}`,
                true,
                true
            );
        }

        console.log('[getVidRock] Response OK, parsing JSON');
        sources = await sources.json();
        console.log(
            '[getVidRock] Parsed JSON response:',
            JSON.stringify(sources, null, 2)
        );

        if (Object.keys(sources).length === 0) {
            return new ErrorObject(
                'No sources found',
                'Vidrock',
                404,
                'No sources were returned by the API. Ensure the media exists or the API is functioning correctly.',
                true,
                true
            );
        }

        const formattedSources = Object.values(sources)
            .filter((source) => source && source.url)
            .map((source) => ({
                file: source.url,
                type: source.url.includes('.m3u8')
                    ? 'hls'
                    : source.url.includes('.mp4')
                      ? 'mp4'
                      : 'unknown',
                lang: languageMap[source.language] || source.language,
                headers: {
                    Referer: `${DOMAIN}/movie/${media.tmdb}`,
                    Origin: DOMAIN,
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
                }
            }));

        if (formattedSources.length === 0) {
            return new ErrorObject(
                'No valid sources found',
                'Vidrock',
                404,
                'The API returned sources, but none were valid. Check the source URLs or API response.',
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
            'Vidrock',
            500,
            'Check the implementation or server status.',
            true,
            true
        );
    }
}

const getLink = (media) => {
    console.log('[getLink] Starting link generation');
    console.log(
        '[getLink] Input media object:',
        JSON.stringify(media, null, 2)
    );

    // Vidrock uses simple base64 encoding of the TMDB ID
    const tmdbString = media.tmdb.toString();
    console.log('[getLink] TMDB ID as string:', tmdbString);

    const encoded = btoa(tmdbString);
    console.log('[getLink] Base64 encoded ID:', encoded);

    let finalUrl;
    if (media.type === 'tv') {
        // For TV shows, you need season and episode
        finalUrl = `https://vidrock.net/api/tv/${encoded}/${media.season}/${media.episode}`;
        console.log('[getLink] Generated TV URL:', finalUrl);
    } else {
        finalUrl = `https://vidrock.net/api/movie/${encoded}`;
        console.log('[getLink] Generated Movie URL:', finalUrl);
    }

    console.log('[getLink] Final URL to fetch:', finalUrl);
    return finalUrl;
};
