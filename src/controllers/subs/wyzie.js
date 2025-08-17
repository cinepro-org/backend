import { searchSubtitles } from 'wyzie-lib';

export async function getWyzie(media) {
    let subtitlesWithNerdyAmountOfInformation = await searchSubtitles({
        tmdb_id: media.tmdb,
        imdb_id: media.imdb,
        season: media.season,
        episode: media.episode,
        title: media.title,
        year: media.year
    });

    return {
        files: [],
        subtitles: subtitlesWithNerdyAmountOfInformation.map((sub) => ({
            url: sub.url,
            lang: sub.language,
            type: sub.format
        }))
    };
}
