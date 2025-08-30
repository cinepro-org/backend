import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { ErrorObject } from '../../helpers/ErrorObject.js';

// Special Mention to
// https://github.com/Gujal00/ResolveURL/blob/master/script.module.resolveurl/lib/resolveurl/plugins/dropload.py
export async function extract_dropload(url) {
    try {
        console.log('starting dropload extraction for:', url);

        // extract hostname and media id from url
        const urlMatch = url.match(
            /(?:\/\/|\.)(dropload\.io|dropload\.tv)\/(?:embed-|e\/|d\/)?([0-9a-zA-Z]+)/
        );
        if (!urlMatch) {
            console.log('url does not match dropload pattern');
            return new ErrorObject(
                'url pattern not supported',
                'DropLoad',
                400,
                'this url format is not supported by dropload extractor',
                true,
                true
            );
        }

        const hostname = urlMatch[1];
        const mediaId = urlMatch[2];

        console.log('extracted hostname:', hostname, 'media id:', mediaId);

        // construct the embed url
        const embedUrl = `https://${hostname}/e/${mediaId}`;
        console.log('constructed embed url:', embedUrl);

        // setup headers
        const headers = {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            Connection: 'keep-alive'
        };

        console.log('fetching embed page...');

        // fetch the embed page
        const response = await fetch(embedUrl, { headers });

        if (!response.ok) {
            console.log('fetch failed with status:', response.status);
            return new ErrorObject(
                `failed to fetch dropload url: status ${response.status}`,
                'DropLoad',
                response.status,
                'check the url or server status',
                true,
                true
            );
        }

        const html = await response.text();
        console.log('got html response, length:', html.length);

        // also check for any script tags that might contain video urls
        console.log('checking for script tags with video data...');
        const scriptMatches = html.match(/<script[^>]*>(.*?)<\/script>/gs);
        if (scriptMatches) {
            console.log('found', scriptMatches.length, 'script tags');
            for (let i = 0; i < scriptMatches.length; i++) {
                if (
                    scriptMatches[i].includes('file') ||
                    scriptMatches[i].includes('source') ||
                    scriptMatches[i].includes('mp4') ||
                    scriptMatches[i].includes('m3u8')
                ) {
                    console.log(
                        'script tag',
                        i,
                        'contains potential video references'
                    );
                }
            }
        }

        // scrape sources using multiple patterns
        const sources = scrapeSourcesFromHtml(html, embedUrl);

        if (!sources || sources.length === 0) {
            console.log('no video sources found');
            return new ErrorObject(
                'no video sources found',
                'DropLoad',
                404,
                'the page does not contain any playable video sources',
                true,
                true
            );
        }

        console.log('found sources:', sources.length);

        // pick the best quality source
        const selectedSource = sources[0];
        console.log(
            'selected source:',
            selectedSource.label,
            selectedSource.url
        );

        return {
            file: selectedSource.url,
            type: getVideoType(selectedSource.url),
            quality: selectedSource.label || 'unknown'
        };
    } catch (error) {
        console.error('error in extract_dropload:', error);
        return new ErrorObject(
            `unexpected error: ${error.message}`,
            'DropLoad',
            500,
            'check the implementation or server status',
            true,
            true
        );
    }
}
// helper to extract packed javascript data
function getPackedData(html) {
    let packedData = '';
    const packedRegex = /(eval\s*\(function\(p,a,c,k,e,.*?)<\/script>/gs;
    let match;

    while ((match = packedRegex.exec(html)) !== null) {
        const packedCode = match[1];
        console.log('found packed code, attempting to unpack...');

        if (detectPacked(packedCode)) {
            try {
                const unpacked = unpackPacked(packedCode);
                if (unpacked) {
                    packedData += unpacked;
                    console.log('successfully unpacked code');
                }
            } catch (e) {
                console.log('failed to unpack code:', e.message);
            }
        }
    }

    return packedData;
}

// helper to detect packed javascript
function detectPacked(source) {
    const pattern =
        /eval\s*\(\s*function\s*\(\s*p\s*,\s*a\s*,\s*c\s*,\s*k\s*,\s*e\s*/;
    return pattern.test(source);
}

// helper to unpack packed javascript
function unpackPacked(source) {
    try {
        const argsRegex =
            /}\s*\('(.*)',\s*(.*?),\s*(\d+),\s*'(.*?)'\.split\('\|'\)/s;
        const args = source.match(argsRegex);

        if (!args || args.length !== 5) {
            return null;
        }

        let payload = args[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
        const radixStr = args[2];
        const countStr = args[3];
        const symtab = args[4].split('|');

        const radix = parseInt(radixStr) || 36;
        const count = parseInt(countStr);

        if (symtab.length !== count) {
            console.log('malformed packed data');
            return null;
        }

        // create lookup function
        function lookup(word) {
            const index =
                radix === 36 ? parseInt(word, 36) : parseInt(word, radix);
            return index < symtab.length && symtab[index]
                ? symtab[index]
                : word;
        }

        // replace words in payload
        const result = payload.replace(/\b\w+\b/g, lookup);
        console.log('unpacked payload length:', result.length);

        return result;
    } catch (e) {
        console.log('error unpacking:', e.message);
        return null;
    }
}

// helper to check if url should be blocked
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
        '.mpd'
    ];
    return blacklist.some((ext) => url.toLowerCase().includes(ext));
}

function scrapeSourcesFromHtml(html, baseUrl) {
    const sources = [];
    console.log('scraping sources from html...');

    // check for packed javascript first
    const packedData = getPackedData(html);
    if (packedData) {
        console.log('found packed data, analyzing...');
        html += packedData;
    }

    // pattern 1: sources:[{file: "url"}]
    const sourcesPattern1 = /sources:\s*\[{\s*file:\s*["']([^"']+)["']/g;
    let match;

    while ((match = sourcesPattern1.exec(html)) !== null) {
        const url = match[1].replace(/\\\//g, '/');
        sources.push({
            url: url,
            label: extractQualityLabel(url)
        });
        console.log('found source with pattern 1:', url);
    }

    // jwplayer setup with file
    const jwplayerPattern = /jwplayer[^}]*file['":\s]*["']([^"']+)["']/g;
    while ((match = jwplayerPattern.exec(html)) !== null) {
        const url = match[1].replace(/\\\//g, '/');
        if (!isBlockedUrl(url)) {
            sources.push({
                url: url,
                label: extractQualityLabel(url)
            });
            console.log('found source with jwplayer pattern:', url);
        }
    }

    // pattern 3: generic file patterns
    const genericPatterns = [
        /["']?file["']?\s*[:=]\s*["']([^"']+)["']/g,
        /["']?src["']?\s*[:=]\s*["']([^"']+)["']/g,
        /<source[^>]+src\s*=\s*["']([^"']+)["']/g,
        /video[^><]+src\s*[=:]\s*['"]([^'"]+)/g
    ];

    for (const pattern of genericPatterns) {
        while ((match = pattern.exec(html)) !== null) {
            const url = match[1].replace(/\\\//g, '/');
            if (!isBlockedUrl(url)) {
                sources.push({
                    url: url,
                    label: extractQualityLabel(url)
                });
                console.log('found source with generic pattern:', url);
            }
        }
    }

    // remove duplicates and sort by quality
    const uniqueSources = removeDuplicates(sources);
    return sortSourcesByQuality(uniqueSources);
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
        return qualityB - qualityA; // descending order
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
