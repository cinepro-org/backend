import CryptoJS from 'crypto-js';
import { ErrorObject } from '../../../helpers/ErrorObject.js';

const DEBUG = true;
const dbg = (...args) => DEBUG && console.log('[moviesapi]', ...args);

const ENCRYPTION_KEY = 'moviesapi-secure-encryption-key-2024-v1';
const PLAYER_API_KEY = 'moviesapi-player-auth-key-2024-secure';
const API_BASE = 'https://w1.moviesapi.to';

// available sources to try
const SOURCES = ['sflix2', 'insertunit', 'vidsrc', 'embedsu', 'autoembed'];

/**
 * encrypts payload with aes using moviesapi encryption key
 * @param {Object} data - data to encrypt
 * @returns {string} encrypted payload
 */
function encryptPayload(data) {
    const encrypted = CryptoJS.AES.encrypt(
        JSON.stringify(data),
        ENCRYPTION_KEY
    ).toString();
    return encrypted;
}

/**
 * scrapes moviesapi.club for movie/tv streams
 * @param {Object} media - media object containing tmdb, type, title, releaseYear, season, episode
 * @returns {Promise<Object>} object with files array and subtitles array
 */
export async function getMoviesAPI(media) {
    try {
        const { tmdb, type, season, episode } = media;

        if (!tmdb) {
            dbg('missing tmdb id');
            return new ErrorObject(
                'missing tmdb id',
                'moviesapi',
                400,
                'tmdb id is required'
            );
        }

        if (type !== 'movie' && type !== 'tv') {
            dbg('invalid type:', type);
            return new ErrorObject(
                'invalid media type',
                'moviesapi',
                400,
                'type must be movie or tv'
            );
        }

        if (type === 'tv' && (!season || !episode)) {
            dbg('missing season or episode for tv show');
            return new ErrorObject(
                'missing season or episode',
                'moviesapi',
                400,
                'season and episode required for tv shows'
            );
        }

        const allFiles = [];
        const allTracks = [];

        // try multiple sources and srv values
        for (const source of SOURCES) {
            for (let srv = 0; srv < 3; srv++) {
                try {
                    const payload = {
                        source: source,
                        type: type,
                        id: tmdb,
                        srv: srv.toString()
                    };

                    // add season/episode for tv shows
                    if (type === 'tv') {
                        payload.season = season;
                        payload.episode = episode;
                    }

                    dbg(`trying source: ${source}, srv: ${srv}`);

                    // encrypt the payload
                    const encryptedPayload = encryptPayload(payload);

                    // make request with timeout
                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 10000);

                    const response = await fetch(
                        `${API_BASE}/api/scrapify/v1/fetch`,
                        {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'x-player-key': PLAYER_API_KEY
                            },
                            body: JSON.stringify({
                                payload: encryptedPayload
                            }),
                            signal: controller.signal
                        }
                    );

                    clearTimeout(timeout);

                    if (!response.ok) {
                        dbg(
                            `request failed for ${source}/${srv}:`,
                            response.status
                        );
                        continue;
                    }

                    const data = await response.json();
                    dbg(`response for ${source}/${srv}:`, data);

                    // extract stream url
                    if (data.url) {
                        const fileObj = {
                            file: data.url,
                            label: `${source}-${srv}`,
                            type: data.url.includes('.mpd')
                                ? 'dash'
                                : data.url.includes('.m3u8')
                                  ? 'hls'
                                  : 'mp4'
                        };

                        // add referer if provided
                        if (data.referer) {
                            fileObj.referer = data.referer;
                        }

                        // add origin if provided
                        if (data.origin) {
                            fileObj.origin = data.origin;
                        }

                        allFiles.push(fileObj);
                        dbg(
                            `found stream: ${fileObj.file.substring(0, 60)}...`
                        );
                    }

                    // extract subtitles/tracks
                    if (data.tracks && Array.isArray(data.tracks)) {
                        for (const track of data.tracks) {
                            if (track.file && track.kind === 'captions') {
                                allTracks.push({
                                    url: track.file,
                                    lang:
                                        track.label ||
                                        track.srclang ||
                                        'unknown'
                                });
                            }
                        }
                    }
                } catch (error) {
                    if (error.name === 'AbortError') {
                        dbg(`timeout for ${source}/${srv}`);
                    } else {
                        dbg(`error for ${source}/${srv}:`, error.message);
                    }
                    continue;
                }
            }
        }

        // remove duplicate files
        const uniqueFiles = allFiles.filter(
            (file, index, self) =>
                index === self.findIndex((f) => f.file === file.file)
        );

        // remove duplicate tracks
        const uniqueTracks = allTracks.filter(
            (track, index, self) =>
                index === self.findIndex((t) => t.url === track.url)
        );

        if (uniqueFiles.length === 0) {
            dbg('no streams found from any source');
            return new ErrorObject(
                'no streams found',
                'moviesapi',
                404,
                'tried all sources and srv values'
            );
        }

        dbg(`total streams found: ${uniqueFiles.length}`);
        dbg(`total tracks found: ${uniqueTracks.length}`);

        return {
            files: uniqueFiles,
            subtitles: uniqueTracks
        };
    } catch (error) {
        dbg('error occurred:', error.message);
        return new ErrorObject(
            error.message || 'unknown error',
            'moviesapi',
            500,
            error.stack || 'no stack trace available'
        );
    }
}
