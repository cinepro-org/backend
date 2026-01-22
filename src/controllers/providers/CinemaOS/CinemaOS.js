import axios from 'axios';
import crypto from 'crypto';
import { ErrorObject } from '../../../helpers/ErrorObject.js';

// debug
const DEBUG = true;
const dbg = (...args) => DEBUG && console.log('[CinemaOS][debug]', ...args);

const BASE_URL = 'https://cinemaos.live';
const USER_AGENT =
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36';

const headers = {
    Origin: BASE_URL,
    Referer: BASE_URL,
    'User-Agent': USER_AGENT
};

export async function getCinemaOS(params) {
    const { tmdb } = params;
    dbg('TMDB ID:', tmdb);

    try {
        // Metadata
        const downloadUrl = `${BASE_URL}/api/downloadLinks?type=movie&tmdbId=${tmdb}`;
        dbg('Metadata URL:', downloadUrl);

        const metaResp = await axios.get(downloadUrl, { headers });
        const downloadData = metaResp?.data?.data?.[0];

        dbg('Metadata received:', !!downloadData);

        if (!downloadData) {
            throw new Error('No metadata returned');
        }

        const releaseYear = downloadData.releaseYear;
        const title = downloadData.movieTitle;
        const imdbId = downloadData.subtitleLink?.split('=').pop();

        dbg('Parsed metadata:', {
            title,
            releaseYear,
            imdbId
        });

        // Hmac
        const secretKey =
            'a8f7e9c2d4b6a1f3e8c9d2b4a7f6e9c2d4b6a1f3e8c9d2b4a7f6e9c2d4b6a1f3';
        const messageString = `media|episodeId:|seasonId:|tmdbId:${tmdb}`;

        const hmacSignature = crypto
            .createHmac('sha256', secretKey)
            .update(messageString)
            .digest('hex');

        dbg('HMAC generated');

        // Encrypted Payload
        const apiParams = new URLSearchParams({
            type: 'movie',
            tmdbId: tmdb,
            imdbId,
            t: title,
            ry: releaseYear,
            secret: hmacSignature
        });

        const cinemaUrl = `${BASE_URL}/api/cinemaos?${apiParams.toString()}`;
        dbg('CinemaOS URL:', cinemaUrl);

        const encResp = await axios.get(cinemaUrl, {
            headers: {
                ...headers,
                Accept: 'application/json',
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        const encData = encResp?.data?.data;
        dbg('Encrypted payload received:', !!encData);

        if (!encData) {
            throw new Error('Empty encrypted response');
        }

        const { encrypted, cin, mao, salt } = encData;

        dbg('Encrypted fields present:', {
            encrypted: !!encrypted,
            iv: !!cin,
            authTag: !!mao,
            salt: !!salt
        });

        // key derivation
        const password = Buffer.from(
            'a1b2c3d4e4f6588658455678901477567890abcdef1234567890abcdef123456',
            'utf8'
        );
        const saltBuf = Buffer.from(salt, 'hex');

        const key = crypto.pbkdf2Sync(password, saltBuf, 100000, 32, 'sha256');

        dbg('Decryption key derived');

        // Decrypt
        const decipher = crypto.createDecipheriv(
            'aes-256-gcm',
            key,
            Buffer.from(cin, 'hex')
        );

        decipher.setAuthTag(Buffer.from(mao, 'hex'));

        const decrypted =
            decipher.update(Buffer.from(encrypted, 'hex'), undefined, 'utf8') +
            decipher.final('utf8');

        dbg('Decryption successful');

        // SOURCES
        const parsed = JSON.parse(decrypted);
        const sources = parsed?.sources || {};

        const validEntries = Object.values(sources).filter(
            (v) => v && typeof v === 'object' && v.url
        );

        dbg('Valid sources found:', validEntries.length);

        if (!validEntries.length) {
            throw new Error('No valid sources found');
        }

        const files = validEntries.map((entry) => ({
            file: entry.url,
            type: 'hls',
            lang: 'en',
            headers: {
                Referer: BASE_URL,
                'User-Agent': USER_AGENT
            }
        }));

        dbg('Returning sources');

        return {
            files,
            subtitles: []
        };
    } catch (error) {
        console.error('[CinemaOS] Error:', error.message);
        dbg('Status:', error.response?.status);
        dbg('Response data:', error.response?.data);

        return new ErrorObject(
            `CinemaOS Error: ${error.message}`,
            'CinemaOS',
            500,
            'Check the implementation or server status',
            true,
            true
        );
    }
}
