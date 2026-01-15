const BASE_URL = 'https://vixsrc.to/';
import { ErrorObject } from '../../../helpers/ErrorObject.js';

const HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36',
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9'
};

export async function getVixSrc(params) {
    const { type, tmdb } = params;
    if (type === 'movie') {
        const url = `${BASE_URL}movie/${tmdb}`;
        const response = await fetch(url);
        if (response.status !== 200) {
            return { files: [] };
        }
        const html = await response.text();

        const token = html.match(/['"]token['"]\s*:\s*['"]([^'"]+)['"]/)?.[1];
        const expires = html.match(
            /['"]expires['"]\s*:\s*['"]([^'"]+)['"]/
        )?.[1];
        const playlist = html.match(/url\s*:\s*['"]([^'"]+)['"]/)?.[1];

        return {
            files: {
                file:
                    playlist + `?token=${token}&expires=${expires}&h=1&lang=en`,
                type: 'hls',
                lang: 'en',
                headers: {
                    Referer: `${BASE_URL}movie/${tmdb}`,
                    ...HEADERS
                }
            },
            subtitles: []
        };
    }
}
