import { ErrorObject } from '../../../helpers/ErrorObject.js';

const DOMAIN = 'https://player.vidzee.wtf/';
const API_DOMAIN = 'https://player.vidzee.wtf/api/';
const headers = {
    Origin: DOMAIN,
    Referer: DOMAIN,
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36'
};

export async function getVidZee(media) {
    const srValues = [1, 2];
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
       const PROXY = "https://api.codetabs.com/v1/proxy?quest=" + url;
        const response = await fetch(PROXY, {
            method: 'GET',
            headers: headers
        });
        if (!response.ok) {
            return new ErrorObject(
                'Error fetching data from VidZee',
                'VidZee',
                response.status,
                'Check the API URL or your network connection',
                true,
                true
            );
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
