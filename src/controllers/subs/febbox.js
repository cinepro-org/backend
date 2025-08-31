import { languageMap } from '../../utils/languages.js';

export async function getFebbox(media) {
    const DOMAIN = `https://fed-subs.pstream.mov/`;

    let url;
    if (media.type === 'movie') {
        url = `${DOMAIN}movie/${media.imdb}`;
    } else {
        url = `${DOMAIN}tv/${media.imdb}/${media.season}/${media.episode}`;
    }
    let request = await fetch(url);

    let subs_with_dif_format = await request.json();

    // Fix: Access the subtitles property
    const subs = subs_with_dif_format.subtitles || {};

    // Transform to array of { url, lang, type }
    const subtitles = Object.entries(subs).map(([language, sub]) => {
        // Get language code, fallback to original name if not found
        const langCode = languageMap[language] || language;
        // Infer type from file extension
        const extMatch = sub.subtitle_link?.match(/\.(\w+)$/);
        const type = extMatch ? extMatch[1] : 'srt';
        return {
            url: sub.subtitle_link,
            lang: langCode,
            type
        };
    });

    return {
        files: [],
        subtitles
    };
}
