import axios from 'axios';
import crypto from 'crypto';
import { ErrorObject } from '../../../helpers/ErrorObject.js';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://cinemaos.live';
const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const headers = {
    'User-Agent': USER_AGENT,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
    Connection: 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Cache-Control': 'max-age=0'
};

export async function getCinemaOS(params) {
    const { tmdb } = params;
    console.log('CinemaOS: Starting with tmdb:', tmdb);

    try {
        // 1. Fetch the movie page HTML
        const movieUrl = `${BASE_URL}/movie/${tmdb}`;
        console.log('CinemaOS: Fetching page:', movieUrl);

        const pageResponse = await axios.get(movieUrl, {
            headers,
            timeout: 30000,
            maxRedirects: 5
        });

        console.log('CinemaOS: Page fetched, status:', pageResponse.status);

        const html = pageResponse.data;
        const $ = cheerio.load(html);

        // 2. Extract Next.js data from script tags
        console.log('CinemaOS: Parsing HTML for data...');

        let nextData = null;
        let encryptedData = null;

        // Look for __NEXT_DATA__ script tag
        $('script').each((i, elem) => {
            const scriptContent = $(elem).html();
            if (scriptContent && scriptContent.includes('__NEXT_DATA__')) {
                try {
                    const match = scriptContent.match(
                        /self\.__NEXT_DATA__\s*=\s*({.+?});?\s*$/s
                    );
                    if (match) {
                        nextData = JSON.parse(match[1]);
                        console.log('CinemaOS: Found __NEXT_DATA__');
                    }
                } catch (e) {
                    console.log(
                        'CinemaOS: Error parsing __NEXT_DATA__:',
                        e.message
                    );
                }
            }

            // Look for encrypted video data
            if (
                scriptContent &&
                (scriptContent.includes('encrypted') ||
                    scriptContent.includes('sources'))
            ) {
                try {
                    // Try to find JSON objects with encrypted data
                    const jsonMatches = scriptContent.match(
                        /\{[^{}]*"encrypted"[^{}]*\}/g
                    );
                    if (jsonMatches) {
                        encryptedData = JSON.parse(jsonMatches[0]);
                        console.log('CinemaOS: Found encrypted data in script');
                    }
                } catch (e) {
                    // Continue searching
                }
            }
        });

        // 3. If we found encrypted data, decrypt it
        if (encryptedData && encryptedData.encrypted) {
            console.log('CinemaOS: Decrypting data...');

            const encryptedHex = encryptedData.encrypted;
            const ivHex = encryptedData.cin || encryptedData.iv;
            const authTagHex = encryptedData.mao || encryptedData.tag;

            // Decrypt using AES-256-GCM
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

            const sources = JSON.parse(decrypted).sources;
            const validEntries = Object.values(sources).filter(
                (v) => v && typeof v === 'object' && v.url
            );

            if (!validEntries.length) {
                throw new Error('No valid sources found after decryption');
            }

            const videoUrl =
                validEntries[Math.floor(Math.random() * validEntries.length)]
                    .url;

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
        }

        // 4. If no encrypted data found, try to extract from nextData
        if (nextData && nextData.props && nextData.props.pageProps) {
            console.log('CinemaOS: Searching in Next.js props...');
            console.log(
                'CinemaOS: Available keys:',
                Object.keys(nextData.props.pageProps)
            );

            // Look for video data in various possible locations
            const pageProps = nextData.props.pageProps;
            if (pageProps.videoData) {
                // Direct video data
                return processVideoData(pageProps.videoData);
            } else if (pageProps.movie) {
                // Movie metadata might contain video URLs
                return processVideoData(pageProps.movie);
            }
        }

        throw new Error('Could not find video data in page HTML');
    } catch (error) {
        console.log('CinemaOS: Error occurred');
        console.log('CinemaOS: Error message:', error.message);
        console.log('CinemaOS: Error status:', error.response?.status);

        return new ErrorObject(
            `CinemaOS Error: ${error.message}`,
            'CinemaOS',
            500,
            'Could not extract video data from page. The site structure may have changed.',
            true,
            true
        );
    }
}

function processVideoData(data) {
    // Helper function to extract video URL from various data structures
    if (
        data.sources &&
        Array.isArray(data.sources) &&
        data.sources.length > 0
    ) {
        const videoUrl = data.sources[0].url || data.sources[0].file;
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
    }
    throw new Error('Could not extract video URL from data');
}
