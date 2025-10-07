import axios from 'axios';
import crypto from 'crypto';
import { ErrorObject } from '../../../helpers/ErrorObject.js';

const DOMAIN = 'https://111movies.com';
const userAgent =
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36';

const headers = {
    Referer: DOMAIN,
    'User-Agent': userAgent,
    'Content-Type': 'image/gif',
    'X-Requested-With': 'XMLHttpRequest'
};

function customEncode(input) {
    const src =
        'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_';
    const dst =
        'MeKUPFfDy_QaGcLwT1bj4xn0g-quZH2vYWE56om3XStdzhl9AICisrN7OVpkJBR8';

    let b64 = Buffer.from(input)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');

    let result = '';
    for (let char of b64) {
        const idx = src.indexOf(char);
        result += idx !== -1 ? dst[idx] : char;
    }
    return result;
}

export async function get111Movies(params) {
    const { tmdb, imdb, season, episode } = params;

    let pageUrl;

    if (season && episode) {
        // TV
        const id = imdb || tmdb; // prefer imdb if available
        pageUrl = `${DOMAIN}/tv/${id}/${season}/${episode}`;
    } else {
        // Movie
        const id = imdb || tmdb;
        pageUrl = `${DOMAIN}/movie/${id}`;
    }

    try {
        // Fetch page
        console.log(pageUrl);
        const res = await axios.get(pageUrl, {
            headers: {
                'User-Agent': userAgent,
                Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                Referer: DOMAIN,
                'Cache-Control': 'no-cache'
            }
        });
        const responseText = res.data;

        console.log(responseText);
        const match = responseText.match(/{\"data\":\"(.*?)\"/);
        if (!match) {
            throw new Error('No data found!');
        }
        const rawData = match[1];

        // AES
        const keyHex =
            '85a893b1171833dffaecf7731235ec416afccc6ffe29d41c16976b83f5e500b2';
        const ivHex = '8648b679a4168c5ed1f41f5d642417e6';
        const key = Buffer.from(keyHex, 'hex');
        const iv = Buffer.from(ivHex, 'hex');

        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        let encrypted = cipher.update(rawData, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        // XOR
        const xorKey = Buffer.from('f6482348', 'hex');
        let xorResult = '';
        for (let i = 0; i < encrypted.length; i++) {
            xorResult += String.fromCharCode(
                encrypted.charCodeAt(i) ^ xorKey[i % xorKey.length]
            );
        }

        // Encode
        const encodedFinal = customEncode(xorResult);

        // API servers
        const staticPath =
            '7ae59bfb/zac/g/APA912UWa5x0rMiGGcNeljgP7t8jA2Rt6lmnqqlv9r-5R9IjA_kbxjGxmWzw23y5WukwjDEAX0UDWlcUeJD-buSc0fwrRH8zieg0PuZJpqXbhUUCMuQCFS1zVPhlSHTkCyDHyolJ-9tBOOGgmIMKsVJRKAHG66Z44BMb9vWN6ByRjF-8vD6v1u1';
        const apiServers = `${DOMAIN}/${staticPath}/${encodedFinal}/sr`;

        const serversRes = await axios.post(apiServers, {}, { headers });
        const servers = serversRes.data;

        const server = servers[Math.floor(Math.random() * servers.length)].data;
        const apiStream = `${DOMAIN}/${staticPath}/${server}`;

        const streamRes = await axios.post(apiStream, {}, { headers });

        return {
            files: {
                file: streamRes.data.url,
                type: 'hls',
                lang: 'en'
            },
            subtitles: []
        };
    } catch (error) {
        return new ErrorObject(
            `Unexpected error: ${error.message}`,
            '111Movies',
            500,
            'Check the implementation or server status',
            true,
            true
        );
    }
}
