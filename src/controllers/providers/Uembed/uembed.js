import { ErrorObject } from '../../../helpers/ErrorObject.js';
import { languageMap } from '../../../utils/languages.js';

const DOMAIN = 'https://madplay.site';
const API_DOMAIN = 'https://api.madplay.site/api/rogfli'; // Fallback API
const UEMBED_API = 'https://uembed.site/api/video/tmdb'; // Primary API
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
                'Accept': 'application/vnd.apple.mpegurl,application/x-mpegURL,application/octet-stream,*/*',
                'Origin': new URL(url).origin,
                'Referer': new URL(url).origin + '/'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const content = await response.text();
        
        if (content.includes('#EXT-X-STREAM-INF')) {
            const variants = parseM3U8Master(content, url);
            const qualityVariants = variants.map(v => ({
                url: v.url,
                quality: qualityFromResolutionOrBandwidth(v),
                bandwidth: v.bandwidth,
                resolution: v.resolution,
                codecs: v.codecs
            }));
            
            const qualityOrder = {
                '4K': 8, '2160p': 8, '1440p': 7, '1080p': 6,
                '720p': 5, '480p': 4, '360p': 3, '240p': 2, 'Unknown': 1
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
                variants: [{
                    url: url,
                    quality: quality,
                    bandwidth: null,
                    resolution: null,
                    codecs: null
                }]
            };
        }
        
        throw new Error('Invalid M3U8 format');
    } catch (error) {
        console.error(`[MadPlay] Error resolving M3U8:`, error.message);
        const quality = extractQualityFromUrl(url);
        return {
            success: false,
            variants: [{
                url: url,
                quality: quality,
                bandwidth: null,
                resolution: null,
                codecs: null
            }]
        };
    }
}

function getLanguageCode(title) {
    const normalizedTitle = title.toLowerCase().trim();
    return languageMap[normalizedTitle] || 'en';
}

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
            'Accept': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`Error fetching data from UEmbed: HTTP ${response.status}`);
    }

    return await response.json();
}

async function fetchFromFallbackApi(url) {
    const response = await fetch(url, {
        method: 'GET',
        headers: headers
    });

    if (!response.ok) {
        throw new Error(`Error fetching data from MadPlay: HTTP ${response.status}`);
    }

    return await response.json();
}

export async function getUembed(media) {
    let primaryUrl, fallbackUrl;
    
    try {
        primaryUrl = buildUEmbedApiUrl(media);
        fallbackUrl = buildApiUrl(media);
    } catch (error) {
        return new ErrorObject(
            error.message,
            'MadPlay',
            400,
            'Invalid media parameters',
            true,
            false
        );
    }

    console.log(`[MadPlay] Fetching from primary URL: ${primaryUrl}`);
    
    let data;
    let apiSource = 'primary';

    try {
        data = await fetchFromPrimaryApi(primaryUrl);
    } catch (primaryError) {
        console.log(`[MadPlay] Primary API failed: ${primaryError.message}. Trying fallback API: ${fallbackUrl}`);
        
        try {
            data = await fetchFromFallbackApi(fallbackUrl);
            apiSource = 'fallback';
            console.log(`[MadPlay] Successfully fetched from fallback API`);
        } catch (fallbackError) {
            console.error(`[MadPlay] Both APIs failed. Primary: ${primaryError.message}, Fallback: ${fallbackError.message}`);
            return new ErrorObject(
                `Error fetching data from both APIs: Primary - ${primaryError.message}, Fallback - ${fallbackError.message}`,
                'MadPlay',
                500,
                'Both primary and fallback APIs failed',
                true,
                false
            );
        }
    }

    if (!Array.isArray(data) || data.length === 0) {
        return new ErrorObject(
            'No streams found',
            'MadPlay',
            404,
            'The API returned an empty array or no streams',
            true,
            false
        );
    }

    const validStreams = data.filter(stream => 
        stream && 
        typeof stream === 'object' && 
        stream.file && 
        typeof stream.file === 'string' &&
        stream.title && 
        typeof stream.title === 'string'
    );

    if (validStreams.length === 0) {
        return new ErrorObject(
            'No valid streams found in response',
            'MadPlay',
            404,
            'All streams in response are missing required fields',
            true,
            false
        );
    }

    const allFiles = [];
    
    for (const stream of validStreams) {
        const language = getLanguageCode(stream.title);
        
        try {
            const m3u8Result = await resolveM3U8(stream.file);
            
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
                    provider: 'uembed',
                };
                
                if (fileEntry.originalTitle.toLowerCase().includes('hindi')) {
                    continue;
                }
                
                allFiles.push(fileEntry);
            }
        } catch (error) {
            console.error(`[MadPlay] Error processing stream "${stream.title}":`, error.message);
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
                    provider: 'uembed',
                };
                
                if (fileEntry.originalTitle.toLowerCase().includes('hindi')) {
                    continue;
                }
                
                allFiles.push(fileEntry);
            } catch (urlError) {
                console.error(`[MadPlay] Invalid URL in stream "${stream.title}":`, stream.file);
                continue;
            }
        }
    }

    const qualityOrder = {
        '4K': 8, '2160p': 8, '1440p': 7, '1080p': 6,
        '720p': 5, '480p': 4, '360p': 3, '240p': 2, 'Unknown': 1
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

    if (uniqueFiles.length === 0) {
        return new ErrorObject(
            'No valid streams found after processing',
            'MadPlay',
            404,
            'All stream processing failed',
            true,
            false
        );
    }

    console.log(`[MadPlay] Found ${uniqueFiles.length} unique stream variants from ${apiSource} API`);

    return {
        files: uniqueFiles,
        subtitles: []
    };
}
