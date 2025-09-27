import { ErrorObject } from '../../../helpers/ErrorObject.js';

const DOMAIN = 'https://vidsrc.wtf';
const API_DOMAIN = 'https://api.rgshows.me/main';
const headers = {
    Origin: DOMAIN,
    Referer: DOMAIN,
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36'
};

export async function getVidsrcWtf(media) {
    let url;
    if (media.type === 'movie') {
        url = `${API_DOMAIN}/movie/${media.tmdb}`;
    } else if (media.type === 'tv') {
        url = `${API_DOMAIN}/tv/${media.tmdb}/${media.season}/${media.episode}`;
    }

    const response = await fetch(url, {
        method: 'GET',
        headers: headers
    });

    if (!response.ok) {
        return new ErrorObject(
            'Error fetching data from VidSrcWtf',
            'VidSrcWtf',
            response.status,
            'Check the API URL or your network connection',
            true,
            false
        );
    }

    let data = await response.json();

    if (data.stream?.url === undefined || data.stream?.url === null) {
        return new ErrorObject(
            'No stream URL found',
            'VidSrcWtf',
            404,
            'Either it did not find any streams or the response structure changed',
            true,
            false
        );
    }

    return {
        files: {
            lang: 'en',
            file: data.stream.url,
            type: 'hls',
            headers: {
                Referer: DOMAIN
            }
        },
        subtitles: []
    };
}
