import { ErrorObject } from '../../../helpers/ErrorObject.js';

const DOMAIN = 'https://player.vidzee.wtf/';
const API_DOMAIN = 'https://player.vidzee.wtf/api';

export async function getVidZee(media) {
    const srValues = [1, 2];

    // build correct embed referer depending on type
    const embedReferer =
        media.type === 'movie'
            ? `https://player.vidzee.wtf/embed/movie/${media.tmdb}`
            : `https://player.vidzee.wtf/embed/tv/${media.tmdb}/${media.season}/${media.episode}`;

    const headers = {
        Origin: DOMAIN,
        Referer: embedReferer,
        'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0',
        Accept: '*/*',
        'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        Connection: 'keep-alive'
    };

    let urls = srValues
        .map((sr) => {
            if (media.type === 'movie') {
                return `${API_DOMAIN}/server?id=${media.tmdb}&sr=${sr}`;
            } else if (media.type === 'tv') {
                return `${API_DOMAIN}/server?id=${media.tmdb}&ss=${media.season}&ep=${media.episode}&sr=${sr}`;
            }
            return null;
        })
        .filter(Boolean);

    let allFiles = [];
    for (const url of urls) {
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: headers
            });

            if (!response.ok) {
                // skip to the next server
                continue;
            }

            let data = await response.json();

            if (data.url !== undefined && data.url.length > 0) {
                const files = data.url.map((file) => ({
                    lang: file.lang || 'en',
                    file: file.link,
                    type: file.type || 'hls',
                    headers: {
                        Referer: DOMAIN
                    }
                }));
                allFiles = allFiles.concat(files);
            } else {
            }
        } catch (err) {
            continue;
        }
    }

    if (allFiles.length === 0) {
        return new ErrorObject(
            'No stream URL found',
            'VidZee',
            404,
            'Either it did not find any streams or the response structure changed',
            true,
            false
        );
    }

    return {
        files: allFiles,
        subtitles: [],
        headers: {
            Referer: DOMAIN
        }
    };
}
