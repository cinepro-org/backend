import { languageMap } from '../../../utils/languages.js';
import { ErrorObject } from '../../../helpers/ErrorObject.js';

const DOMAIN = 'https://vidrock.net';

export async function getVidrock(media) {
    const link = getLink(media);

    try {
        let sources = await fetch(link, {
            headers: {
                Referer: `${DOMAIN}/`,
                Origin: DOMAIN,
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'
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
            .filter((source) => source && source.url) // Ensure source and url are valid
            .map((source) => ({
                file: source.url,
                type: source.url.includes('.m3u8')
                    ? 'hls'
                    : source.url.includes('.mp4')
                      ? 'mp4'
                      : 'unknown',
                lang: languageMap[source.language] || source.language,
                headers: {
                    Referer: DOMAIN,
                    Origin: DOMAIN
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
    const C = media.tmdb
        .toString()
        .split('')
        .map((digit) => {
            const encoding = 'abcdefghij';
            return encoding[parseInt(digit)];
        })
        .join('');
    const B = C.split('').reverse().join('');
    const A = btoa(B);
    const D = btoa(A);
    if (media.type === 'tv') {
        return `https://vidrock.net/api/tv/${D}`;
    } else {
        return `https://vidrock.net/api/movie/${D}`;
    }
};
