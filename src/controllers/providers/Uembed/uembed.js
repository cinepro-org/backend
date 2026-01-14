import { ErrorObject } from '../../../helpers/ErrorObject.js';
import { languageMap } from '../../../utils/languages.js';

const DOMAIN = 'https://madplay.site';
const API_DOMAIN = 'https://api.madplay.site/api/rogflix'; // Fallback API
const UEMBED_API = 'https://uembed.xyz/api/video/tmdb'; // Primary API
const VXR_API = 'https://cdn.madplay.site/vxr'; // VXR API for movies
const HOLLY_API = 'https://api.madplay.site/api/movies/holly'; // Holly API
const DEBUG = true;
const dbg = (...args) => DEBUG && console.log('[MadPlay][debug]', ...args);
const headers = {
    Origin: DOMAIN,
    Referer: DOMAIN,
    'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36'
};

function extractQualityFromUrl(url) {
    const patterns = [
        /(\d{3,4})p/i,
        /(\d{3,4})k/i,
        /quality[_-]?(\d{3,4})/i,
        /res[_-]?(\d{3,4})/i,
        /(\d{3,4})x\d{3,4}/i
    ];

    for (const pattern of patterns) {
        const m = url.match(pattern);
        if (m) {
            const q = parseInt(m[1]);
            if (q >= 240 && q <= 4320) return `${q}p`;
        }
    }
    return 'Unknown';
}

function parseM3U8Master(content, baseUrl) {
    const lines = content.split('\n');
    const streams = [];
    let current = null;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('#EXT-X-STREAM-INF:')) {
            current = { bandwidth: null, resolution: null, url: null };
            const bw = trimmed.match(/BANDWIDTH=(\d+)/);
            if (bw) current.bandwidth = parseInt(bw[1]);
            const res = trimmed.match(/RESOLUTION=(\d+x\d+)/);
            if (res) current.resolution = res[1];
            const codecs = trimmed.match(/CODECS="([^"]+)"/);
            if (codecs) current.codecs = codecs[1];
        } else if (current && !trimmed.startsWith('#')) {
            current.url = resolveUrlRelative(trimmed, baseUrl);
            streams.push(current);
            current = null;
        }
    }
    return streams;
}

function resolveUrlRelative(url, baseUrl) {
    if (url.startsWith('http')) return url;
    try {
        return new URL(url, baseUrl).toString();
    } catch {
        return url;
    }
}

function qualityFromResolutionOrBandwidth(stream) {
    if (stream?.resolution) {
        const h = parseInt(stream.resolution.split('x')[1]);
        if (h >= 2160) return '4K';
        if (h >= 1440) return '1440p';
        if (h >= 1080) return '1080p';
        if (h >= 720) return '720p';
        if (h >= 480) return '480p';
        if (h >= 360) return '360p';
        if (h >= 240) return '240p';
    }

    if (stream?.bandwidth) {
        const mbps = stream.bandwidth / 1000000;
        if (mbps >= 15) return '4K';
        if (mbps >= 8) return '1440p';
        if (mbps >= 5) return '1080p';
        if (mbps >= 3) return '720p';
        if (mbps >= 1.5) return '480p';
        if (mbps >= 0.8) return '360p';
        if (mbps >= 0.5) return '240p';
    }
    return 'Unknown';
}

async function resolveM3U8(url) {
    try {
        const response = await fetch(url, {
            headers: {
                ...headers,
                Accept: 'application/vnd.apple.mpegurl,application/x-mpegURL,application/octet-stream,*/*',
                Origin: new URL(url).origin,
                Referer: new URL(url).origin + '/'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const content = await response.text();

        if (content.includes('#EXT-X-STREAM-INF')) {
            const variants = parseM3U8Master(content, url);
            const qualityVariants = variants.map((v) => ({
                url: v.url,
                quality: qualityFromResolutionOrBandwidth(v),
                bandwidth: v.bandwidth,
                resolution: v.resolution,
                codecs: v.codecs
            }));

            const qualityOrder = {
                '4K': 8,
                '2160p': 8,
                '1440p': 7,
                '1080p': 6,
                '720p': 5,
                '480p': 4,
                '360p': 3,
                '240p': 2,
                Unknown: 1
            };

            qualityVariants.sort((a, b) => {
                const orderA = qualityOrder[a.quality] || 0;
                const orderB = qualityOrder[b.quality] || 0;
                if (orderB !== orderA) return orderB - orderA;
                return (b.bandwidth || 0) - (a.bandwidth || 0);
            });

            return { success: true, variants: qualityVariants };
        } else if (content.includes('#EXTINF:')) {
            const quality = extractQualityFromUrl(url);
            return {
                success: true,
                variants: [
                    {
                        url: url,
                        quality: quality,
                        bandwidth: null,
                        resolution: null,
                        codecs: null
                    }
                ]
            };
        }

        throw new Error('Invalid M3U8 format');
    } catch (error) {
        console.error(`[MadPlay] Error resolving M3U8:`, error.message);
        const quality = extractQualityFromUrl(url);
        return {
            success: false,
            variants: [
                {
                    url: url,
                    quality: quality,
                    bandwidth: null,
                    resolution: null,
                    codecs: null
                }
            ]
        };
    }
}

function getLanguageCode(title) {
    const normalizedTitle = title.toLowerCase().trim();
    return languageMap[normalizedTitle] || 'en';
}

// builds the fallback api url for rogflix endpoint
function buildApiUrl(media) {
    const params = new URLSearchParams();
    params.append('id', media.tmdb);

    if (media.type === 'movie') {
        params.append('type', 'movie');
        return `${API_DOMAIN}?${params.toString()}`;
    } else if (media.type === 'tv') {
        params.append('type', 'series');
        params.append('season', media.season || 1);
        params.append('episode', media.episode || 1);
        return `${API_DOMAIN}?${params.toString()}`;
    }

    throw new Error(`Unsupported media type: ${media.type}`);
}

// builds the vxr api url for movies only
function buildVxrApiUrl(media) {
    if (media.type !== 'movie') {
        return null;
    }
    const params = new URLSearchParams();
    params.append('id', media.tmdb);
    params.append('type', 'movie');
    return `${VXR_API}?${params.toString()}`;
}

// builds the holly api url for both movies and tv shows
function buildHollyApiUrl(media) {
    const params = new URLSearchParams();
    params.append('id', media.tmdb);

    if (media.type === 'movie') {
        params.append('type', 'movie');
        return `${HOLLY_API}?${params.toString()}`;
    } else if (media.type === 'tv') {
        params.append('type', 'series');
        params.append('season', media.season || 1);
        params.append('episode', media.episode || 1);
        return `${HOLLY_API}?${params.toString()}`;
    }

    return null;
}

function buildUEmbedApiUrl(media) {
    const params = new URLSearchParams();
    params.append('id', media.tmdb);
    return `${UEMBED_API}?${params.toString()}`;
}

async function fetchFromPrimaryApi(url) {
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            ...headers,
            Accept: 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(
            `Error fetching data from UEmbed: HTTP ${response.status}`
        );
    }

    return await response.json();
}

async function fetchFromFallbackApi(url) {
    const response = await fetch(url, {
        method: 'GET',
        headers: headers
    });

    if (!response.ok) {
        throw new Error(
            `Error fetching data from MadPlay: HTTP ${response.status}`
        );
    }

    return await response.json();
}

// fetches data from vxr api endpoint
async function fetchFromVxrApi(url) {
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            ...headers,
            Accept: 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(
            `Error fetching data from VXR: HTTP ${response.status}`
        );
    }

    return await response.json();
}

// fetches data from holly api endpoint
async function fetchFromHollyApi(url) {
    const response = await fetch(url, {
        method: 'GET',
        headers: {
            ...headers,
            Accept: 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(
            `Error fetching data from Holly: HTTP ${response.status}`
        );
    }

    return await response.json();
}

export async function getUembed(media) {
    dbg('Starting getUembed with media:', media);

    let primaryUrl, vxrUrl, hollyUrl, rogflixUrl;

    try {
        primaryUrl = buildUEmbedApiUrl(media);
        vxrUrl = buildVxrApiUrl(media);
        hollyUrl = buildHollyApiUrl(media);
        rogflixUrl = buildApiUrl(media);
    } catch (error) {
        dbg('Error building URLs:', error.message);
        return new ErrorObject(
            error.message,
            'MadPlay',
            400,
            'Invalid media parameters',
            true,
            false
        );
    }

    dbg('Primary URL (UEmbed):', primaryUrl);
    dbg('VXR URL:', vxrUrl);
    dbg('Holly URL:', hollyUrl);
    dbg('Rogflix URL:', rogflixUrl);

    let data;
    let apiSource = 'unknown';
    const errors = [];

    // try primary api (uembed)
    try {
        dbg('Attempting Primary API (UEmbed)...');
        data = await fetchFromPrimaryApi(primaryUrl);
        apiSource = 'uembed';
        dbg('Primary API (UEmbed) succeeded');
    } catch (primaryError) {
        dbg('Primary API (UEmbed) failed:', primaryError.message);
        errors.push(`UEmbed: ${primaryError.message}`);

        // try vxr api (movies only)
        if (vxrUrl) {
            try {
                dbg('Attempting VXR API...');
                data = await fetchFromVxrApi(vxrUrl);
                apiSource = 'vxr';
                dbg('VXR API succeeded');
            } catch (vxrError) {
                dbg('VXR API failed:', vxrError.message);
                errors.push(`VXR: ${vxrError.message}`);
            }
        }

        // try holly api if vxr failed or not available
        if (!data && hollyUrl) {
            try {
                dbg('Attempting Holly API...');
                data = await fetchFromHollyApi(hollyUrl);
                apiSource = 'holly';
                dbg('Holly API succeeded');
            } catch (hollyError) {
                dbg('Holly API failed:', hollyError.message);
                errors.push(`Holly: ${hollyError.message}`);
            }
        }

        // try rogflix api as last resort
        if (!data) {
            try {
                dbg('Attempting Rogflix API (last resort)...');
                data = await fetchFromFallbackApi(rogflixUrl);
                apiSource = 'rogflix';
                dbg('Rogflix API succeeded');
            } catch (rogflixError) {
                dbg('Rogflix API failed:', rogflixError.message);
                errors.push(`Rogflix: ${rogflixError.message}`);
            }
        }
    }

    // if all apis failed
    if (!data) {
        dbg('All APIs failed. Errors:', errors);
        return new ErrorObject(
            `All APIs failed: ${errors.join(', ')}`,
            'MadPlay',
            500,
            'All available APIs failed',
            true,
            false
        );
    }

    dbg('Using API source:', apiSource);
    dbg('Raw data received:', data);

    if (!Array.isArray(data) || data.length === 0) {
        dbg('No streams found in response');
        return new ErrorObject(
            'No streams found',
            'MadPlay',
            404,
            'The API returned an empty array or no streams',
            true,
            false
        );
    }

    // process streams based on api source
    const allFiles = [];

    if (apiSource === 'vxr') {
        dbg('Processing VXR streams...');
        // vxr format: [{ "id": "565", "file": "https://...", "label": "HD" }]
        for (const stream of data) {
            if (!stream || !stream.file) {
                dbg('Skipping invalid VXR stream:', stream);
                continue;
            }

            try {
                const m3u8Result = await resolveM3U8(stream.file);
                dbg(
                    `Resolved VXR M3U8 for label "${stream.label}":`,
                    m3u8Result
                );

                for (const variant of m3u8Result.variants) {
                    const urlOrigin = new URL(variant.url).origin;

                    const fileEntry = {
                        file: variant.url,
                        type: 'hls',
                        lang: 'en',
                        quality:
                            variant.quality === 'Unknown'
                                ? stream.label || 'HD'
                                : variant.quality,
                        headers: {
                            Referer: urlOrigin + '/',
                            Origin: urlOrigin,
                            'User-Agent': headers['User-Agent']
                        },
                        originalTitle: stream.label || 'VXR',
                        source: apiSource,
                        provider: 'vxr'
                    };

                    allFiles.push(fileEntry);
                    dbg('Added VXR file entry:', fileEntry);
                }
            } catch (error) {
                dbg(`Error processing VXR stream:`, error.message);
                // fallback: add without resolution
                try {
                    const urlOrigin = new URL(stream.file).origin;
                    const fileEntry = {
                        file: stream.file,
                        type: 'hls',
                        lang: 'en',
                        quality: stream.label || 'HD',
                        headers: {
                            Referer: urlOrigin + '/',
                            Origin: urlOrigin,
                            'User-Agent': headers['User-Agent']
                        },
                        originalTitle: stream.label || 'VXR',
                        source: apiSource,
                        provider: 'vxr'
                    };
                    allFiles.push(fileEntry);
                    dbg('Added VXR file entry (fallback):', fileEntry);
                } catch (urlError) {
                    dbg('Invalid VXR URL:', stream.file);
                }
            }
        }
    } else if (apiSource === 'holly') {
        dbg('Processing Holly streams...');
        // holly format: [{ "title": "Hindi", "file": "https://...", ... }]
        for (const stream of data) {
            if (!stream || !stream.file || !stream.title) {
                dbg('Skipping invalid Holly stream:', stream);
                continue;
            }

            // skip hindi streams
            if (stream.title.toLowerCase().includes('hindi')) {
                dbg('Skipping Hindi stream:', stream.title);
                continue;
            }

            const language = getLanguageCode(stream.title);
            dbg(
                `Processing Holly stream "${stream.title}" with language:`,
                language
            );

            try {
                const m3u8Result = await resolveM3U8(stream.file);
                dbg(`Resolved Holly M3U8 for "${stream.title}":`, m3u8Result);

                for (const variant of m3u8Result.variants) {
                    const urlOrigin = new URL(variant.url).origin;

                    const fileEntry = {
                        file: variant.url,
                        type: 'hls',
                        lang: language,
                        quality: variant.quality,
                        headers: {
                            Referer: urlOrigin + '/',
                            Origin: urlOrigin,
                            'User-Agent': headers['User-Agent']
                        },
                        originalTitle: stream.title,
                        source: apiSource,
                        provider: 'holly'
                    };

                    allFiles.push(fileEntry);
                    dbg('Added Holly file entry:', fileEntry);
                }
            } catch (error) {
                dbg(
                    `Error processing Holly stream "${stream.title}":`,
                    error.message
                );
                // fallback: add without resolution
                try {
                    const urlOrigin = new URL(stream.file).origin;
                    const fileEntry = {
                        file: stream.file,
                        type: 'hls',
                        lang: language,
                        quality: 'Unknown',
                        headers: {
                            Referer: urlOrigin + '/',
                            Origin: urlOrigin,
                            'User-Agent': headers['User-Agent']
                        },
                        originalTitle: stream.title,
                        source: apiSource,
                        provider: 'holly'
                    };
                    allFiles.push(fileEntry);
                    dbg('Added Holly file entry (fallback):', fileEntry);
                } catch (urlError) {
                    dbg('Invalid Holly URL:', stream.file);
                }
            }
        }
    } else {
        dbg('Processing UEmbed/Rogflix streams...');
        // uembed/rogflix format: [{ "title": "...", "file": "https://..." }]
        const validStreams = data.filter(
            (stream) =>
                stream &&
                typeof stream === 'object' &&
                stream.file &&
                typeof stream.file === 'string' &&
                stream.title &&
                typeof stream.title === 'string'
        );

        dbg(`Found ${validStreams.length} valid streams`);

        if (validStreams.length === 0) {
            dbg('No valid streams found in response');
            return new ErrorObject(
                'No valid streams found in response',
                'MadPlay',
                404,
                'All streams in response are missing required fields',
                true,
                false
            );
        }

        for (const stream of validStreams) {
            // skip hindi streams
            if (stream.title.toLowerCase().includes('hindi')) {
                dbg('Skipping Hindi stream:', stream.title);
                continue;
            }

            const language = getLanguageCode(stream.title);
            dbg(`Processing stream "${stream.title}" with language:`, language);

            try {
                const m3u8Result = await resolveM3U8(stream.file);
                dbg(`Resolved M3U8 for "${stream.title}":`, m3u8Result);

                for (const variant of m3u8Result.variants) {
                    const urlOrigin = new URL(variant.url).origin;

                    const fileEntry = {
                        file: variant.url,
                        type: 'hls',
                        lang: language,
                        quality: variant.quality,
                        headers: {
                            Referer: urlOrigin + '/',
                            Origin: urlOrigin,
                            'User-Agent': headers['User-Agent']
                        },
                        originalTitle: stream.title,
                        source: apiSource,
                        provider: apiSource === 'uembed' ? 'uembed' : 'rogflix'
                    };

                    allFiles.push(fileEntry);
                    dbg('Added file entry:', fileEntry);
                }
            } catch (error) {
                dbg(
                    `Error processing stream "${stream.title}":`,
                    error.message
                );
                // fallback: add without resolution
                try {
                    const urlOrigin = new URL(stream.file).origin;

                    const fileEntry = {
                        file: stream.file,
                        type: 'hls',
                        lang: language,
                        quality: 'Unknown',
                        headers: {
                            Referer: urlOrigin + '/',
                            Origin: urlOrigin,
                            'User-Agent': headers['User-Agent']
                        },
                        originalTitle: stream.title,
                        source: apiSource,
                        provider: apiSource === 'uembed' ? 'uembed' : 'rogflix'
                    };

                    allFiles.push(fileEntry);
                    dbg('Added file entry (fallback):', fileEntry);
                } catch (urlError) {
                    dbg(
                        `Invalid URL in stream "${stream.title}":`,
                        stream.file
                    );
                }
            }
        }
    }

    dbg(`Total files collected: ${allFiles.length}`);

    const qualityOrder = {
        '4K': 8,
        '2160p': 8,
        '1440p': 7,
        '1080p': 6,
        '720p': 5,
        '480p': 4,
        '360p': 3,
        '240p': 2,
        HD: 2,
        Unknown: 1
    };

    allFiles.sort((a, b) => {
        if (a.lang !== b.lang) {
            return a.lang.localeCompare(b.lang);
        }
        const orderA = qualityOrder[a.quality] || 0;
        const orderB = qualityOrder[b.quality] || 0;
        if (orderB !== orderA) return orderB - orderA;
        return (b.bandwidth || 0) - (a.bandwidth || 0);
    });

    const uniqueFiles = [];
    const seenKeys = new Set();

    for (const file of allFiles) {
        const key = `${file.lang}-${file.quality}-${file.file}`;
        if (!seenKeys.has(key)) {
            seenKeys.add(key);
            uniqueFiles.push(file);
        }
    }

    dbg(`Unique files after deduplication: ${uniqueFiles.length}`);

    if (uniqueFiles.length === 0) {
        dbg('No valid streams found after processing');
        return new ErrorObject(
            'No valid streams found after processing',
            'MadPlay',
            404,
            'All stream processing failed',
            true,
            false
        );
    }

    dbg(
        `Final result: ${uniqueFiles.length} unique stream variants from ${apiSource} API`
    );

    return {
        files: uniqueFiles,
        subtitles: []
    };
}
