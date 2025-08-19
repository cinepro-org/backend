import fetch from 'node-fetch';
import { languageMap } from '../../../utils/languages.js';
import { ErrorObject } from '../../../helpers/ErrorObject.js';

const DOMAIN = 'https://embed.su';
const headers = {
    'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Referer: DOMAIN,
    Origin: DOMAIN
};

export async function getEmbedsu(media) {
    const tmdb_id = media.tmdb;
    const s = media.season;
    const e = media.episode;

    try {
        const urlSearch =
            s && e
                ? `${DOMAIN}/embed/tv/${tmdb_id}/${s}/${e}`
                : `${DOMAIN}/embed/movie/${tmdb_id}`;
        const htmlSearch = await fetch(urlSearch, { headers });
        if (!htmlSearch.ok)
            return new ErrorObject(
                'Embed page structure has changed or is down',
                'EmbedSu',
                500,
                'please check if the backend can access embed.su without being blocked',
                true,
                true
            );
        const textSearch = await htmlSearch.text();

        const hashEncodeMatch = textSearch.match(
            /JSON\.parse\(atob\(\`([^\`]+)/i
        );
        const hashEncode = hashEncodeMatch ? hashEncodeMatch[1] : '';

        if (!hashEncode)
            return new ErrorObject(
                'Embed does not have source hash',
                'EmbedSu',
                500,
                undefined,
                true,
                true
            );

        const hashDecode = JSON.parse(await stringAtob(hashEncode));
        const mEncrypt = hashDecode.hash;
        if (!mEncrypt)
            return new ErrorObject(
                'Something changed in the embedsu logic',
                'EmbedSu',
                500,
                undefined,
                true,
                true
            );

        const firstDecode = (await stringAtob(mEncrypt))
            .split('.')
            .map((item) => item.split('').reverse().join(''));
        const secondDecode = JSON.parse(
            await stringAtob(firstDecode.join('').split('').reverse().join(''))
        );

        if (!secondDecode || secondDecode.length === 0)
            return new ErrorObject(
                'Something changed in the embedsu logic',
                'EmbedSu',
                500,
                undefined,
                true,
                true
            );

        let originalPlaylist = '';
        let tracks = [];

        for (const item of secondDecode) {
            if (item.name.toLowerCase() !== 'viper') continue;

            const urlDirect = `${DOMAIN}/api/e/${item.hash}`;

            let dataDirect = await fetch(urlDirect, {
                headers: {
                    Referer: DOMAIN,
                    'User-Agent': headers['User-Agent'],
                    Accept: '*/*'
                }
            });

            if (!dataDirect.ok)
                return new ErrorObject(
                    'Embed.su API is down, or the hash path has changed',
                    'EmbedSu',
                    500,
                    undefined,
                    true,
                    true
                );

            dataDirect = await dataDirect.json();

            if (!dataDirect.source) continue;

            originalPlaylist = dataDirect.source;

            tracks = dataDirect.subtitles
                .map((sub) => ({
                    url: sub.file,
                    lang: languageMap[sub.label.split(/[\s-]/)[0]] || sub.label,
                    type: sub.file.split('.').pop()
                }))
                .filter((track) => track.lang);
        }

        return {
            files: [
                {
                    file: originalPlaylist.replace(
                        'embed.su/api/proxy/viper/',
                        ''
                    ),
                    type: 'hls',
                    lang: 'en'
                }
            ],
            subtitles: tracks
        };
    } catch (e) {
        return new ErrorObject(
            'An error occurred' + e,
            'EmbedSu',
            500,
            undefined,
            true,
            true
        );
    }
}

/**
 * @description Decode a base64 string
 * @param input {string} The base64 encoded string
 * @returns {Promise<string>} The decoded string
 */
async function stringAtob(input) {
    const chars =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let str = input.replace(/=+$/, '');
    let output = '';

    if (str.length % 4 === 1) {
        throw new ErrorObject(
            'The string is not correctly encoded',
            'EmbedSu',
            500,
            'The string is not correctly encoded',
            true,
            true
        );
    }

    for (
        let bc = 0, bs = 0, buffer, i = 0;
        (buffer = str.charAt(i++));
        ~buffer && ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4)
            ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))))
            : 0
    ) {
        buffer = chars.indexOf(buffer);
    }

    return output;
}
