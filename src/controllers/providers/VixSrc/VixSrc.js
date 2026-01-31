const BASE_URL = 'https://vixsrc.to/';
import { ErrorObject } from '../../../helpers/ErrorObject.js';

// Info From John
// but the m3u8 has several issues/cool features:
// a) when you test it out on vixsrc.to it checks for a enc.key from the server to decrypt the segments
// b) it has subtitles inside the m3u8. those should actually be taken out by the proxy
// and while scraping returned as sub urls
// c) i think it even has different audio... m3u8 parsing probably also required

const DEBUG = true;
const dbg = (...args) => DEBUG && console.log('[VixSrc][debug]', ...args);

const HEADERS = {
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150 Safari/537.36',
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: BASE_URL,
    Origin: BASE_URL.slice(0, -1)
};

/**
 * parses m3u8 master playlist to extract video quality variants
 * @param {string} content - the m3u8 master playlist content
 * @returns {Array} array of video quality objects with file and quality properties
 */
function parseVideoQualities(content) {
    dbg('parsing video qualities from master playlist');
    const qualities = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // look for stream info lines that define video qualities
        if (line.startsWith('#EXT-X-STREAM-INF:')) {
            dbg('found stream info line:', line);

            // extract resolution and bandwidth
            const resolutionMatch = line.match(/RESOLUTION=(\d+)x(\d+)/);
            const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);

            // the next line should contain the actual playlist url
            const nextLine = lines[i + 1]?.trim();

            if (nextLine && nextLine.startsWith('https://')) {
                const quality = resolutionMatch
                    ? parseInt(resolutionMatch[2])
                    : 0;
                const bandwidth = bandwidthMatch
                    ? parseInt(bandwidthMatch[1])
                    : 0;

                qualities.push({
                    file: nextLine,
                    quality: quality,
                    bandwidth: bandwidth
                });

                dbg(
                    `extracted quality: ${quality}p, bandwidth: ${bandwidth}, url: ${nextLine}`
                );
            }
        }
    }

    // sort by quality descending (highest first)
    qualities.sort((a, b) => b.quality - a.quality);
    dbg(`total video qualities found: ${qualities.length}`);

    return qualities;
}

/**
 * parses m3u8 master playlist to extract audio tracks
 * @param {string} content - the m3u8 master playlist content
 * @returns {Array} array of audio track objects with file, lang, and name properties
 */
function parseAudioTracks(content) {
    dbg('parsing audio tracks from master playlist');
    const tracks = [];
    const lines = content.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();

        // look for audio media lines
        if (trimmed.startsWith('#EXT-X-MEDIA:TYPE=AUDIO')) {
            dbg('found audio media line:', trimmed);

            // extract language, name, and uri
            const langMatch = trimmed.match(/LANGUAGE="([^"]+)"/);
            const nameMatch = trimmed.match(/NAME="([^"]+)"/);
            const uriMatch = trimmed.match(/URI="([^"]+)"/);

            if (uriMatch) {
                const track = {
                    file: uriMatch[1],
                    lang: langMatch ? langMatch[1] : 'unknown',
                    name: nameMatch ? nameMatch[1] : 'Audio'
                };

                tracks.push(track);
                dbg(
                    `extracted audio: ${track.name} (${track.lang}), url: ${track.file}`
                );
            }
        }
    }

    dbg(`total audio tracks found: ${tracks.length}`);
    return tracks;
}

/**
 * parses m3u8 master playlist to extract subtitle tracks
 * @param {string} content - the m3u8 master playlist content
 * @returns {Array} array of subtitle objects with file, lang, and name properties
 */
function parseSubtitles(content) {
    dbg('parsing subtitles from master playlist');
    const subtitles = [];
    const lines = content.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();

        // look for subtitle media lines
        if (trimmed.startsWith('#EXT-X-MEDIA:TYPE=SUBTITLES')) {
            dbg('found subtitle media line:', trimmed);

            // extract language, name, and uri
            const langMatch = trimmed.match(/LANGUAGE="([^"]+)"/);
            const nameMatch = trimmed.match(/NAME="([^"]+)"/);
            const uriMatch = trimmed.match(/URI="([^"]+)"/);

            if (uriMatch) {
                const subtitle = {
                    file: uriMatch[1],
                    lang: langMatch ? langMatch[1] : 'unknown',
                    label: nameMatch ? nameMatch[1] : 'Subtitle'
                };

                subtitles.push(subtitle);
                dbg(
                    `extracted subtitle: ${subtitle.label} (${subtitle.lang}), url: ${subtitle.file}`
                );
            }
        }
    }

    dbg(`total subtitles found: ${subtitles.length}`);
    return subtitles;
}

/**
 * checks if token has expired based on the expires timestamp
 * @param {string} expiresTimestamp - unix timestamp string
 * @returns {boolean} true if token is expired
 */
function isTokenExpired(expiresTimestamp) {
    if (!expiresTimestamp) {
        dbg('no expires timestamp provided, assuming not expired');
        return false;
    }

    const expiresMs = parseInt(expiresTimestamp) * 1000;
    const nowMs = Date.now();
    const bufferMs = 60000; // 1 minute buffer

    const expired = expiresMs - bufferMs < nowMs;

    if (expired) {
        const remainingSeconds = Math.floor((expiresMs - nowMs) / 1000);
        dbg(`token expired or expiring soon (${remainingSeconds}s remaining)`);
    } else {
        const remainingSeconds = Math.floor((expiresMs - nowMs) / 1000);
        dbg(`token valid for ${remainingSeconds}s`);
    }

    return expired;
}

export async function getVixSrc(params) {
    const { type, tmdb, season, episode } = params;

    try {
        // build the appropriate url based on content type
        let url;
        if (type === 'movie') {
            url = `${BASE_URL}movie/${tmdb}`;
            dbg(`fetching movie page: ${url}`);
        } else if (type === 'tv') {
            if (!season || !episode) {
                dbg('error: season and episode required for tv shows');
                return { files: [] };
            }
            url = `${BASE_URL}tv/${tmdb}/${season}/${episode}`;
            dbg(`fetching tv show page: ${url}`);
        } else {
            dbg(`error: unsupported type: ${type}`);
            return { files: [] };
        }

        // fetch the main page to extract token, expires, and playlist url
        dbg('fetching main page');
        const response = await fetch(url, { headers: HEADERS });

        if (response.status !== 200) {
            dbg(`error: received status ${response.status}`);
            return { files: [] };
        }

        const html = await response.text();
        dbg('page html fetched successfully');

        // extract token, expires, and playlist url
        const token = html.match(/['"]token['"]\s*:\s*['"]([^'"]+)['"]/)?.[1];
        const expires = html.match(
            /['"]expires['"]\s*:\s*['"]([^'"]+)['"]/
        )?.[1];
        const playlist = html.match(/url\s*:\s*['"]([^'"]+)['"]/)?.[1];

        dbg('extracted values:', { token, expires, playlist });

        if (!token || !expires || !playlist) {
            dbg('error: failed to extract required values from page');
            return { files: [] };
        }

        // check token expiry
        if (isTokenExpired(expires)) {
            dbg('error: token is expired, need to refetch');
            return { files: [] };
        }

        // build master playlist url and fetch it
        let masterPlaylistUrl = `${playlist}?token=${token}&expires=${expires}&h=1&lang=en`;
        if (playlist.includes('?')) {
            masterPlaylistUrl = `${playlist}&token=${token}&expires=${expires}&h=1&lang=en`;
        }

        dbg(`fetching master playlist: ${masterPlaylistUrl}`);

        const playlistResponse = await fetch(masterPlaylistUrl, {
            headers: {
                ...HEADERS,
                Referer: url
            }
        });

        if (playlistResponse.status !== 200) {
            dbg(
                `error: master playlist request failed with status ${playlistResponse.status}`
            );
            return { files: [] };
        }

        const masterPlaylistContent = await playlistResponse.text();
        dbg('master playlist content length:', masterPlaylistContent.length);
        dbg(
            'master playlist preview:',
            masterPlaylistContent.substring(0, 500)
        );

        // parse the master playlist
        dbg('parsing master playlist');
        const videoQualities = parseVideoQualities(masterPlaylistContent);
        const audioTracks = parseAudioTracks(masterPlaylistContent);
        const subtitles = parseSubtitles(masterPlaylistContent);

        if (videoQualities.length === 0) {
            dbg('error: no video qualities found in master playlist');
            return { files: [] };
        }

        // build the response structure
        dbg(' building response structure');

        const refererUrl =
            type === 'movie'
                ? `${BASE_URL}movie/${tmdb}`
                : `${BASE_URL}tv/${tmdb}/${season}/${episode}`;

        const responseHeaders = {
            Referer: refererUrl,
            ...HEADERS
        };

        // build files array with video qualities
        const files = videoQualities.map((quality) => ({
            file: quality.file,
            quality: quality.quality,
            type: 'hls',
            headers: responseHeaders
        }));

        // format audio tracks if available
        const formattedAudio = audioTracks.map((track) => ({
            file: track.file,
            lang: track.lang,
            name: track.name,
            type: 'hls',
            headers: responseHeaders
        }));

        // format subtitles
        const formattedSubtitles = subtitles.map((sub) => ({
            file: sub.file,
            lang: sub.lang,
            label: sub.label,
            headers: responseHeaders
        }));

        dbg('response built successfully:', {
            videoQualities: files.length,
            audioTracks: formattedAudio.length,
            subtitles: formattedSubtitles.length
        });

        return {
            files: files,
            audio: formattedAudio,
            subtitles: formattedSubtitles
        };
    } catch (error) {
        dbg('error occurred:', error.message);
        dbg('error stack:', error.stack);
        return { files: [] };
    }
}
