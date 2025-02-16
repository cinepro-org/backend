const fetch = (await import('node-fetch')).default;
const { load } = await import('cheerio');

const nepuBase = 'https://nepu.to';
const nepuReferer = 'https://nepu.to/';

export function normalizeTitle(title) {
    let titleTrimmed = title.trim().toLowerCase();
    if (titleTrimmed !== 'the movie' && titleTrimmed.endsWith('the movie')) {
        titleTrimmed = titleTrimmed.replace('the movie', '');
    }
    if (titleTrimmed !== 'the series' && titleTrimmed.endsWith('the series')) {
        titleTrimmed = titleTrimmed.replace('the series', '');
    }
    return titleTrimmed.replace(/['":]/g, '').replace(/[^a-zA-Z0-9]+/g, '_');
}

export function compareTitle(a, b) {
    return normalizeTitle(a) === normalizeTitle(b);
}

export function compareMedia(media, title, releaseYear) {
    // if no year is provided, count as if its the correct year
    const isSameYear = releaseYear.toString() === undefined ? true : media.releaseYear === releaseYear;
    return compareTitle(media.title, title) && isSameYear;
}

export async function getNepu(media) {
    const searchResultRequest = await fetch(`${nepuBase}/ajax/posts?q=${media.title}`, {
        method: 'GET',
        headers: {
            'Referer': nepuReferer,
        },
    });

    const searchResult = await searchResultRequest.text();
    
    if (searchResult.data === undefined) throw new Error('No search results found');

    const show = searchResult.data.find((item) => {
        if (!item) return false;
        if (media.type === 'movie' && item.type !== 'Movie') return false;
        if (media.type === 'show' && item.type !== 'Show') return false;

        const [, title, year] = item.name.match(/^(.*?)\s*(?:\(?\s*(\d{4})(?:\s*-\s*\d{0,4})?\s*\)?)?\s*$/) || [];
        const [, secondTitle] = item.second_name.match(/^(.*?)\s*(?:\(?\s*(\d{4})(?:\s*-\s*\d{0,4})?\s*\)?)?\s*$/) || [];

        return (compareMedia(media, title, Number(year)) || compareMedia(media, secondTitle, Number(year)));
    });

    if (!show) throw new Error('No watchable item found');

    let videoUrl = nepuBase + show.url;

    if (media.type === 'show') {
        videoUrl = `${show.url}/season/${media.season.number}/episode/${media.episode.number}`;
    }

    const videoPageRequest = await fetch(videoUrl, {
        method: 'GET',
        headers: {
            'Referer': nepuReferer,
        },
    });

    const videoPage = await videoPageRequest.text();
    const videoPage$ = load(videoPage);
    const embedId = videoPage$('a[data-embed]').attr('data-embed');

    if (!embedId) throw new Error('No embed found.');

    const playerPageRequest = await fetch(`${nepuBase}/ajax/embed`, {
        method: 'POST',
        headers: {
            'Referer': nepuReferer,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ id: embedId }),
    });

    const playerPage = await playerPageRequest.text();
    const streamUrl = playerPage.match(/"file":"([^"]+)"/);

    if (!streamUrl?.[1]) throw new Error('No stream found.');

    return {
        stream: [
            {
                id: 'primary',
                captions: [],
                playlist: nepuBase + streamUrl[1],
                type: 'hls',
                headers: {
                    Origin: nepuBase,
                    Referer: nepuReferer,
                },
                flags: [],
            },
        ],
    };
}
