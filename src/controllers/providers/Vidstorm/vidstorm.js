/**
 * Vidstorm Provider
 * Scrapes streams from vidstorm.ru
 * Uses same encryption as VidRock (AES-CBC)
 */

import { webcrypto } from 'crypto';
import { ErrorObject } from '../../../helpers/ErrorObject.js';

const BASE_URL = 'https://vidstorm.ru';
// Same passphrase as VidRock - they appear to be from the same developer
const PASSPHRASE = 'x7k9mPqT2rWvY8zA5bC3nF6hJ2lK4mN9';

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'sec-ch-ua': '"Chromium";v="131", "Not A Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin'
};

/**
 * Encrypt item ID using AES-CBC with fixed passphrase
 * Same logic as VidRock
 */
async function encryptItemId(itemId) {
    try {
        const textEncoder = new TextEncoder();

        // Key is the passphrase
        const keyData = textEncoder.encode(PASSPHRASE);

        // IV is first 16 bytes of the key
        const iv = keyData.slice(0, 16);

        // Import the key for AES-CBC
        const key = await webcrypto.subtle.importKey(
            'raw',
            keyData,
            { name: 'AES-CBC' },
            false,
            ['encrypt']
        );

        // Pad the item ID to AES block size (16 bytes)
        // PKCS7 padding: add (16 - length % 16) bytes, each with value (16 - length % 16)
        const itemIdBytes = textEncoder.encode(itemId);
        const paddingLength = 16 - (itemIdBytes.length % 16);
        const paddedData = new Uint8Array(itemIdBytes.length + paddingLength);
        paddedData.set(itemIdBytes);
        paddedData.fill(paddingLength, itemIdBytes.length);

        // Encrypt using AES-CBC
        const encrypted = await webcrypto.subtle.encrypt(
            { name: 'AES-CBC', iv: iv },
            key,
            paddedData
        );

        // Base64 encode and make URL-safe
        const encryptedArray = new Uint8Array(encrypted);
        const binaryString = String.fromCharCode(...encryptedArray);
        const base64 = Buffer.from(binaryString, 'binary').toString('base64');

        // Convert to URL-safe base64: + -> -, / -> _, remove padding =
        return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    } catch (error) {
        console.error('[Vidstorm] Encryption error:', error);
        throw error;
    }
}

/**
 * Get streams from Vidstorm
 * @param {object} media - Media object with tmdb, season, episode
 * @returns {Promise<object>} - Files and subtitles
 */
export async function getVidstorm(media) {
    try {
        const { tmdb, episode, season } = media;
        const isTV = !!episode;

        // Build item ID based on type (same as VidRock)
        let itemId;
        let itemType;

        if (isTV) {
            // For TV: "tmdb_season_episode"
            itemId = `${tmdb}_${season}_${episode}`;
            itemType = 'tv';
        } else {
            // For movie: just the tmdb ID
            itemId = tmdb.toString();
            itemType = 'movie';
        }

        console.log('[Vidstorm] Item ID:', itemId, 'Type:', itemType);

        // Encrypt the item ID
        const encryptedId = await encryptItemId(itemId);
        console.log('[Vidstorm] Encrypted ID:', encryptedId);

        // Build API URL
        const apiUrl = `${BASE_URL}/api/${itemType}/${encryptedId}`;
        console.log('[Vidstorm] API URL:', apiUrl);

        // Build Referer URL
        const refererUrl = isTV
            ? `${BASE_URL}/tv/${tmdb}/${season}/${episode}`
            : `${BASE_URL}/movie/${tmdb}`;

        const response = await fetch(apiUrl, {
            headers: {
                ...headers,
                Origin: BASE_URL,
                Referer: refererUrl
            }
        });

        console.log('[Vidstorm] Response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            console.log('[Vidstorm] Error response:', errorText.substring(0, 200));
            return new ErrorObject(
                `Vidstorm API returned ${response.status}`,
                'Vidstorm',
                response.status,
                'API request failed',
                true,
                true
            );
        }

        const data = await response.json();
        console.log('[Vidstorm] Response keys:', Object.keys(data));

        // Extract files from the response
        // Response is an object with source names as keys (like VidRock)
        const files = [];
        const subtitles = [];

        for (const [sourceName, source] of Object.entries(data)) {
            if (source && source.url && typeof source.url === 'string' && source.url.startsWith('http')) {
                files.push({
                    file: source.url,
                    type: source.url.includes('.m3u8') ? 'hls' : 'mp4',
                    lang: source.language || 'en',
                    source: `Vidstorm-${sourceName}`,
                    headers: {
                        Referer: `${BASE_URL}/`,
                        Origin: BASE_URL
                    }
                });
            }
        }

        console.log(`[Vidstorm] Found ${files.length} files`);

        if (files.length === 0) {
            return new ErrorObject(
                'No valid streams found in Vidstorm response',
                'Vidstorm',
                404,
                'All sources were null or invalid',
                true,
                true
            );
        }

        return {
            files,
            subtitles
        };
    } catch (error) {
        console.error('[Vidstorm] Error:', error.message);

        return new ErrorObject(
            `Vidstorm error: ${error.message}`,
            'Vidstorm',
            500,
            'Unexpected error',
            true,
            true
        );
    }
}
