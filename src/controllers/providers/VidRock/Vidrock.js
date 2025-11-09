import { webcrypto } from 'crypto';
import { languageMap } from '../../../utils/languages.js';
import { ErrorObject } from '../../../helpers/ErrorObject.js';

const DOMAIN = 'https://vidrock.net';
const PASSPHRASE = 'x7k9mPqT2rWvY8zA5bC3nF6hJ2lK4mN9';

export async function getVidRock(media) {
    console.log('[getVidRock] Function called');
    console.log('[getVidRock] Media input:', JSON.stringify(media, null, 2));

    // media should contain: { type, tmdb, season?, episode? }
    const link = await getLink(media);
    console.log('[getVidRock] Generated link from getLink():', link);

    try {
        const requestHeaders = {
            Accept: 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            Origin: DOMAIN,
            Referer: `${DOMAIN}/movie/${media.tmdb}`,
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'sec-ch-ua':
                '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
            'sec-ch-ua-mobile': '?0',
            'sec-ch-ua-platform': '"Windows"'
        };

        console.log(
            '[getVidRock] Request headers:',
            JSON.stringify(requestHeaders, null, 2)
        );
        console.log('[getVidRock] Making fetch request to:', link);

        let sources = await fetch(link, {
            headers: requestHeaders
        });

        console.log('[getVidRock] Fetch response status:', sources.status);
        console.log(
            '[getVidRock] Fetch response statusText:',
            sources.statusText
        );
        console.log('[getVidRock] Fetch response ok:', sources.ok);

        // Log response headers
        console.log('[getVidRock] Response headers:');
        sources.headers.forEach((value, key) => {
            console.log(`[getVidRock]   ${key}: ${value}`);
        });

        if (!sources.ok) {
            console.log(
                '[getVidRock] Response not OK, attempting to read response body'
            );

            // Try to get the response body for more info
            let errorBody = '';
            try {
                errorBody = await sources.text();
                console.log('[getVidRock] Error response body:', errorBody);
            } catch (readError) {
                console.log(
                    '[getVidRock] Could not read error response body:',
                    readError.message
                );
            }

            return new ErrorObject(
                'Failed to scrape sources',
                'Vidrock',
                sources.status,
                `Failed to fetch sources from ${link}. Status: ${sources.status}. Body: ${errorBody.substring(0, 200)}`,
                true,
                true
            );
        }

        console.log('[getVidRock] Response OK, parsing JSON');
        sources = await sources.json();
        console.log(
            '[getVidRock] Parsed JSON response:',
            JSON.stringify(sources, null, 2)
        );

        if (Object.keys(sources).length === 0) {
            return new ErrorObject(
                'No sources found',
                'Vidrock',
                404,
                'No sources were returned by the API. Ensure the media exists or the API is functioning correctly.',
                true,
                true
            );
        }

        const formattedSources = Object.values(sources)
            .filter((source) => source && source.url)
            .map((source) => ({
                file: source.url,
                type: source.url.includes('.m3u8')
                    ? 'hls'
                    : source.url.includes('.mp4')
                      ? 'mp4'
                      : 'unknown',
                lang: languageMap[source.language] || source.language,
                headers: {
                    Referer: `${DOMAIN}/movie/${media.tmdb}`,
                    Origin: DOMAIN,
                    'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
                }
            }));

        if (formattedSources.length === 0) {
            return new ErrorObject(
                'No valid sources found',
                'Vidrock',
                404,
                'The API returned sources, but none were valid. Check the source URLs or API response.',
                true,
                true
            );
        }

        return {
            files: formattedSources,
            subtitles: []
        };
    } catch (error) {
        return new ErrorObject(
            `Unexpected error: ${error.message}`,
            'Vidrock',
            500,
            'Check the implementation or server status.',
            true,
            true
        );
    }
}

/**
 * Encrypt item ID using AES-CBC with fixed passphrase
 * Matches Python: cipher = AES.new(key, AES.MODE_CBC, iv)
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

        // Base64 encode and make URL-safe (similar to VidSrcCC approach)
        const encryptedArray = new Uint8Array(encrypted);
        const binaryString = String.fromCharCode(...encryptedArray);
        const base64 = Buffer.from(binaryString, 'binary').toString('base64');

        // Convert to URL-safe base64: + -> -, / -> _, remove padding =
        return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    } catch (error) {
        console.error('[encryptItemId] Encryption error:', error);
        throw error;
    }
}

async function getLink(media) {
    console.log('[getLink] Starting link generation');
    console.log(
        '[getLink] Input media object:',
        JSON.stringify(media, null, 2)
    );

    // Build item ID based on type
    let itemId;
    let itemType;

    if (media.type === 'tv') {
        // For TV: "tmdb_season_episode"
        itemId = `${media.tmdb}_${media.season}_${media.episode}`;
        itemType = 'tv';
        console.log('[getLink] TV item ID:', itemId);
    } else {
        // For movie: just the tmdb ID
        itemId = media.tmdb.toString();
        itemType = 'movie';
        console.log('[getLink] Movie item ID:', itemId);
    }

    // Encrypt the item ID using AES-CBC
    const encrypted = await encryptItemId(itemId);
    console.log('[getLink] Encrypted item ID:', encrypted);

    // Build final URL
    const finalUrl = `${DOMAIN}/api/${itemType}/${encrypted}`;
    console.log('[getLink] Final URL:', finalUrl);

    return finalUrl;
}
