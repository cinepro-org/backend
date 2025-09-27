import fetch from 'node-fetch';
import * as crypto from 'node:crypto';
import { ErrorObject } from '../../../helpers/ErrorObject.js';

// Constants
const DOMAIN = 'https://player.vidsrc.co/';
const headers = {
    Referer: DOMAIN,
    Origin: DOMAIN,
    'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6787.65 Safari/537.36 Edg/132.0.2855.99',
    accept: '*/*'
};
const numberOfServers = 15;

// Main function to get AutoEmbed data
export async function getAutoembed(media) {
    let { tmdb, season, episode, type } = media;
    const url =
        type === 'tv'
            ? `https://test.autoembed.cc/api/server?id=${tmdb}&ss=${season}&ep=${episode}`
            : `https://test.autoembed.cc/api/server?id=${tmdb}`;

    let files = [];
    let subtitles = [];

    try {
        for (let i = 1; i <= numberOfServers; i++) {
            let currentLang;
            if (i <= 3) {
                currentLang = 'en';
            } else if (i <= 5) {
                currentLang = 'hi';
            } else if (i <= 7) {
                currentLang = 'bn';
            } else if (i <= 9) {
                currentLang = 'ta';
            } else if (i <= 11) {
                currentLang = 'te';
            } else if (i <= 13) {
                currentLang = 'ml';
            } else {
                currentLang = 'kn';
            }

            const serverUrl = `${url}&sr=${i}`;
            const response = await fetch(serverUrl, {
                method: 'GET',
                headers: headers
            });
            if (!response.ok) {
                continue;
            }
            let encObj = await response.json();

            const data = decryptData(encObj.data); // Decrypt the data

            // Extract the actual direct URL from the decrypted data
            let directUrl = data.url;

            // If the URL contains embed-proxy or other proxy patterns, extract the real URL
            if (directUrl.includes('embed-proxy')) {
                try {
                    // Extract from patterns like /api/embed-proxy?url=ENCODED_URL
                    const urlMatch = directUrl.match(/[?&]url=([^&]+)/);
                    if (urlMatch) {
                        directUrl = decodeURIComponent(urlMatch[1]);
                    }
                } catch (e) {
                    throw new Error(
                        'Failed to extract direct URL from proxy link: ' +
                            e.message
                    );
                }
            }

            files.push({
                file: directUrl,
                type: directUrl.includes('mp4') ? 'mp4' : 'hls',
                lang: currentLang
            });

            if (data.tracks) {
                data.tracks.forEach((track) => {
                    subtitles.push({
                        lang: track.lang || 'unknown',
                        url: track.file
                    });
                });
            }
        }

        return { files, subtitles };
    } catch (error) {
        // console.error('Error:', error); // Log the error for debugging
        return new ErrorObject(
            `Unexpected error: ${error.message}`,
            'AutoEmbed/vidsrc.co',
            500,
            undefined,
            true,
            true
        );
    }
}

// Decrypt function
function decryptData(encryptedObjectB64) {
    const encryptedObject = JSON.parse(
        Buffer.from(encryptedObjectB64, 'base64').toString('utf8')
    );

    const { algorithm, key, iv, salt, iterations, encryptedData } =
        encryptedObject;

    // Derive the actual AES key using PBKDF2
    const derivedKey = crypto.pbkdf2Sync(
        key, // password
        Buffer.from(salt, 'hex'), // salt
        iterations, // iterations
        32, // key length = 32 bytes (AES-256)
        'sha256' // hash
    );

    const ivBuffer = Buffer.from(iv, 'hex');
    const decipher = crypto.createDecipheriv(algorithm, derivedKey, ivBuffer);

    let decrypted =
        decipher.update(encryptedData, 'base64', 'utf8') +
        decipher.final('utf8');

    return JSON.parse(decrypted);
}

function getCurrentPeriod() {
    return Math.floor(Date.now() / this.rotationInterval);
}

function generateKeyForPeriod(e) {
    let t = ''.concat('change-this-in-production (@sam)', '_period_').concat(e);
    return ex()
        .PBKDF2(t, e.toString(), {
            keySize: 8,
            iterations: 1000,
            hasher: ex().algo.SHA256
        })
        .toString();
}

function encrypt(e) {
    let t = this.getCurrentPeriod(),
        a = this.generateKeyForPeriod(t),
        n = JSON.stringify(e),
        l = ex().lib.WordArray.random(16),
        o = ex().lib.WordArray.random(16),
        s = ex().PBKDF2(a, l, {
            keySize: 8,
            iterations: 1000,
            hasher: ex().algo.SHA256
        }),
        r = ex().AES.encrypt(n, s, {
            iv: o,
            padding: ex().pad.Pkcs7,
            mode: ex().mode.CBC
        });
    return Buffer.from(
        JSON.stringify({
            algorithm: 'aes-256-cbc',
            iterations: 1000,
            salt: l.toString(ex().enc.Hex),
            iv: o.toString(ex().enc.Hex),
            encryptedData: r.toString(),
            key: a
        })
    ).toString('base64');
}

function decrypt(e) {
    try {
        let t = Buffer.from(e, 'base64').toString('utf8'),
            a = JSON.parse(t);
        return decryptWithPassword(a);
    } catch (e) {
        throw (
            console.error('Decryption Error:', e),
            Error('Decryption failed: '.concat(e.message))
        );
    }
}

function decryptWithPassword(e) {
    let t = ex().enc.Hex.parse(e.salt),
        a = ex().enc.Hex.parse(e.iv),
        n = e.encryptedData,
        l = ex().PBKDF2(e.key, t, {
            keySize: 8,
            iterations: e.iterations,
            hasher: ex().algo.SHA256
        }),
        o = ex()
            .AES.decrypt(n, l, {
                iv: a,
                padding: ex().pad.Pkcs7,
                mode: ex().mode.CBC
            })
            .toString(ex().enc.Utf8);
    if (!o) throw Error('Decryption failed: Invalid key or malformed data.');
    return JSON.parse(o);
}

// Utility function for encryption
function ex(e) {
    return {
        id: Symbol(),
        provide: e
    };
}
