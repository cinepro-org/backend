import { languageMap } from '../../../utils/languages.js';
import { ErrorObject } from '../../../helpers/ErrorObject.js';

const DOMAIN = 'https://vidrock.net';

export async function getVidRock(media) {
    // media should contain: { type, tmdb, season?, episode? }
    const link = getLink(media);

    try {
        let sources = await fetch(link, {
            headers: {
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
            }
        });

        if (!sources.ok) {
            return new ErrorObject(
                'Failed to scrape sources',
                'Vidrock',
                sources.status,
                `Failed to fetch sources from ${link}. Check the URL or server status.`,
                true,
                true
            );
        }

        sources = await sources.json();
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
    // Vidrock uses simple base64 encoding of the TMDB ID
    const encoded = btoa(media.tmdb.toString());

    if (media.type === 'tv') {
        // For TV shows, you need season and episode
        return `https://vidrock.net/api/tv/${encoded}/${media.season}/${media.episode}`;
    } else {
        return `https://vidrock.net/api/movie/${encoded}`;
    }
};
