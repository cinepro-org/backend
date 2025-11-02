import axios from 'axios';
import crypto from 'crypto';
import { ErrorObject } from '../../../helpers/ErrorObject.js';

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
    console.log('CinemaOS: Starting with tmdb:', tmdb);

    try {
        // 1. Get movie metadata directly (no auth needed)
        const downloadUrl = `${BASE_URL}/api/downloadLinks?type=movie&tmdbId=${tmdb}`;
        console.log('CinemaOS: Requesting metadata from:', downloadUrl);

        const downloadData = (await axios.get(downloadUrl, { headers })).data
            .data[0];

        console.log(
            'CinemaOS: Metadata received:',
            downloadData ? 'YES' : 'NO'
        );

        const releaseYear = downloadData.releaseYear;
        const title = downloadData.movieTitle;
        const imdbId = downloadData.subtitleLink.split('=').pop();

        console.log(
            'CinemaOS: Extracted - Title:',
            title,
            'Year:',
            releaseYear,
            'IMDb:',
            imdbId
        );

        // 3. Get encrypted response
        // Construct URL with only valid parameters
        const params = new URLSearchParams({
            type: 'movie',
            tmdbId: tmdb,
            imdbId: imdbId
        });

        // Only add if they exist
        if (title) params.append('t', title);
        if (releaseYear) params.append('ry', releaseYear);

        const cinemaUrl = `${BASE_URL}/api/cinemaos?${params.toString()}`;
        console.log('CinemaOS: Requesting encrypted data from:', cinemaUrl);

        // Try with additional headers that might be required
        const cinemaHeaders = {
            ...headers,
            Accept: 'application/json',
            'Content-Type': 'application/json'
        };

        const encResponse = (
            await axios.get(cinemaUrl, {
                headers: cinemaHeaders,
                timeout: 30000 // 30 second timeout
            })
        ).data.data;

        console.log(
            'CinemaOS: Encrypted response received:',
            encResponse ? 'YES' : 'NO'
        );

        const encryptedHex = encResponse.encrypted;
        const ivHex = encResponse.cin;
        const authTagHex = encResponse.mao;

        // 4. Prepare AES-256-GCM decrypt
        const keyHex =
            'a1b2c3d4e4f6589012345678901477567890abcdef1234567890abcdef123456';
        const key = Buffer.from(keyHex, 'hex');
        const ciphertext = Buffer.from(encryptedHex, 'hex');
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');

        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        const decrypted =
            decipher.update(ciphertext, undefined, 'utf8') +
            decipher.final('utf8');

        // 5. Extract sources
        const sources = JSON.parse(decrypted).sources;
        const validEntries = Object.values(sources).filter(
            (v) => v && typeof v === 'object' && v.url
        );

        if (!validEntries.length) {
            throw new Error('No valid sources found');
        }

        const videoUrl =
            validEntries[Math.floor(Math.random() * validEntries.length)].url;

        // 6. Return in provider format
        return {
            files: {
                file: videoUrl,
                type: 'hls',
                lang: 'en',
                headers: {
                    Referer: BASE_URL,
                    'User-Agent': USER_AGENT
                }
            },
            subtitles: []
        };
    } catch (error) {
        console.log('CinemaOS: Error occurred');
        console.log('CinemaOS: Error message:', error.message);
        console.log('CinemaOS: Error status:', error.response?.status);
        console.log('CinemaOS: Error data:', error.response?.data);

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
