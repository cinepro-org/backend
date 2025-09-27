import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { ErrorObject } from '../../helpers/ErrorObject.js';

// Special Mention to:
// https://github.com/Gujal00/ResolveURL/blob/master/script.module.resolveurl/lib/resolveurl/plugins/filelions.py

export async function extract_filelions(url) {
    try {
        // extract hostname from url
        const hostname = url.match(/https?:\/\/([^\/]+)/)?.[1];
        if (!hostname) {
            return new ErrorObject(
                'invalid url format',
                'FileLions',
                400,
                'could not extract hostname from url',
                true,
                true
            );
        }

        // check if url matches filelions pattern
        // extract media id from url
        const pattern =
            /(?:\/\/|\.)(?:filelions|ajmidyadfihayh|alhayabambi|techradar|moflix-stream|azipcdn|motvy55|[mad]lions|lumiawatch|javplaya|javlion|fviplions|egsyxutd|fdewsdc|vidhide|peytone|anime7u|coolciima|gsfomqu|katomen|dht|6sfkrspw4u|ryderjet|e4xb5c2xnz|smooth|kinoger|movearn|videoland|mivalyo)(?:pro|vip|pre|plus|hub)?\.(?:com?|to|sbs|ink|click|pro|live|store|xyz|top|online|site|fun|be)\/(?:s|v|f|d|embed|file|download)\/([0-9a-zA-Z$:\/.]+)/;

        const match = url.match(pattern);
        if (!match) {
            return new ErrorObject(
                'could not extract media id',
                'FileLions',
                400,
                'failed to parse media id from url',
                true,
                true
            );
        }

        // handle referer if present in media_id ($$)
        let mediaId = match[1];
        let referer = false;

        if (mediaId.includes('$$')) {
            const parts = mediaId.split('$$');
            mediaId = parts[0];
            referer = new URL(parts[1]).origin + '/';
        }

        // construct the embed url
        const embedUrl = `https://${hostname}/v/${mediaId}`;

        // setup headers
        const headers = {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            Connection: 'keep-alive'
        };

        // add referer if available
        if (referer) {
            headers['Referer'] = referer;
        }

        // fetch the embed page
        const response = await fetch(embedUrl, { headers });

        if (!response.ok) {
            return new ErrorObject(
                `failed to fetch filelions url: status ${response.status}`,
                'FileLions',
                response.status,
                'check the url or server status',
                true,
                true
            );
        }

        const html = await response.text();

        // load html with cheerio
        const $ = cheerio.load(html);

        // scrape sources using patterns from the python plugin
        const sources = scrapeSourcesFromHtml(html, url);

        if (!sources || sources.length === 0) {
            return new ErrorObject(
                'no video sources found',
                'FileLions',
                404,
                'the page does not contain any playable video sources',
                true,
                true
            );
        }

        // pick the best quality source (idk but what my eyes have seen so far it seems first one
        // should be the best bet)
        const selectedSource = sources[0];

        return {
            file: selectedSource.url,
            type: getVideoType(selectedSource.url),
            quality: selectedSource.label || 'unknown'
        };
    } catch (error) {
        console.error('error in extract_filelions:', error);
        return new ErrorObject(
            `unexpected error: ${error.message}`,
            'FileLions',
            500,
            'check the implementation or server status',
            true,
            true
        );
    }
}

function getPackedData(html) {
    let packedData = '';
    const packedRegex = /(eval\s*\(function\(p,a,c,k,e,.*?)<\/script>/gs;
    const matches = html.matchAll(packedRegex);

    for (const match of matches) {
        const packedCode = match[1];
        if (packedCode.includes('eval(function(p,a,c,k,e,')) {
            try {
                // packed js detection and unpacking
                const evalMatch = packedCode.match(
                    /eval\(function\(p,a,c,k,e,d\){.*?}\('(.+)',(\d+|\[\]),(\d+),'(.+)'\.split\('\|'\)/
                );
                if (evalMatch) {
                    const payload = evalMatch[1];
                    const radix = parseInt(evalMatch[2]) || 36;
                    const count = parseInt(evalMatch[3]);
                    const symbols = evalMatch[4].split('|');

                    if (symbols.length === count) {
                        let unpacked = payload;
                        const wordRegex = /\b\w+\b/g;
                        unpacked = unpacked.replace(wordRegex, (word) => {
                            const index = parseInt(word, radix);
                            return index < symbols.length && symbols[index]
                                ? symbols[index]
                                : word;
                        });
                        packedData += unpacked;
                    }
                }
            } catch (e) {}
        }
    }
    return packedData;
}

// helper function to scrape video sources from html (based on the python plugin)
function scrapeSourcesFromHtml(html, baseUrl) {
    const sources = [];

    // add packed data extraction
    html += getPackedData(html);

    // first (pattern), sources:[{file: "url"}]
    const sourcesPattern1 = /sources:\s*\[{file:\s*["']([^"']+)["']/g;
    let match;
    while ((match = sourcesPattern1.exec(html)) !== null) {
        sources.push({
            url: match[1].replace(/\\\//g, '/'),
            label: 'unknown'
        });
    }

    // second (pattern) : "hls2": "url" or "hls4": "url"
    const sourcesPattern2 = /["']hls[24]["']:\s*["']([^"']+)["']/g;
    while ((match = sourcesPattern2.exec(html)) !== null) {
        sources.push({
            url: match[1].replace(/\\\//g, '/'),
            label: 'hls'
        });
    }

    // third (pattern) : jwplayer setup sources i think this
    // was the main thing i missed, and yes it was
    const sourcesPattern3 =
        /setup\s*\(\s*\{[^}]*sources\s*:\s*\[\s*\{\s*file\s*:\s*["']([^"']+)["']/g;
    while ((match = sourcesPattern3.exec(html)) !== null) {
        sources.push({
            url: match[1].replace(/\\\//g, '/'),
            label: 'jwplayer'
        });
    }

    // fourth pattern for base64 encoded sources
    const base64Pattern = /atob\s*\(\s*["']([A-Za-z0-9+/=]+)["']\s*\)/g;
    while ((match = base64Pattern.exec(html)) !== null) {
        try {
            const decoded = atob(match[1]);
            const urlMatch = decoded.match(
                /https?:\/\/[^"'\s]+\.(?:mp4|m3u8|webm)/
            );
            if (urlMatch) {
                sources.push({
                    url: urlMatch[0],
                    label: 'base64'
                });
            }
        } catch (e) {
            // invalid base64, skip

            return;
        }
    }

    // additional generic patterns (implemented from the python plugin)
    const genericPatterns = [
        /["']?file["']?\s*[:=]\s*["']([^"']+\.(?:mp4|m3u8|webm|mkv|avi))["']/g,
        /<source[^>]+src\s*=\s*["']([^"']+\.(?:mp4|m3u8|webm|mkv|avi))["']/g,
        /video[^><]+src\s*[=:]\s*['"]([^'"]+\.(?:mp4|m3u8|webm|mkv|avi))/g
    ];

    for (const pattern of genericPatterns) {
        while ((match = pattern.exec(html)) !== null) {
            const url = match[1].replace(/\\\//g, '/');
            // filter out non-video files
            if (!isBlockedUrl(url)) {
                sources.push({
                    url: url,
                    label: extractQualityLabel(url)
                });
            }
        }
    }

    // remove duplicates and sort by quality
    const uniqueSources = removeDuplicates(sources);
    return sortSourcesByQuality(uniqueSources);
}

// helper to check if url should be blocked (implemented from the python plugin)
function isBlockedUrl(url) {
    const blacklist = [
        '.jpg',
        '.jpeg',
        '.gif',
        '.png',
        '.js',
        '.css',
        '.htm',
        '.html',
        '.php',
        '.srt',
        '.sub',
        '.xml',
        '.swf',
        '.vtt',
        '.mpd',
        'googletagmanager',
        'google-analytics',
        'yandex.ru',
        'facebook.com',
        'twitter.com'
    ];
    return blacklist.some((ext) => url.toLowerCase().includes(ext));
}

// helper to extract quality label from url
function extractQualityLabel(url) {
    const qualityMatch = url.match(/(\d+p|\d+x\d+)/);
    return qualityMatch ? qualityMatch[1] : 'unknown';
}

// helper to remove duplicate sources
function removeDuplicates(sources) {
    const seen = new Set();
    return sources.filter((source) => {
        if (seen.has(source.url)) {
            return false;
        }
        seen.add(source.url);
        return true;
    });
}

// helper to sort sources by quality (highest first)
function sortSourcesByQuality(sources) {
    return sources.sort((a, b) => {
        const qualityA = parseInt(a.label.match(/\d+/)?.[0] || '0');
        const qualityB = parseInt(b.label.match(/\d+/)?.[0] || '0');
        return qualityB - qualityA;
    });
}

// helper to determine video type from url
function getVideoType(url) {
    if (url.includes('.m3u8')) return 'hls';
    if (url.includes('.mpd')) return 'dash';
    if (url.includes('.mp4')) return 'mp4';
    if (url.includes('.webm')) return 'webm';
    return 'mp4'; // default
}
