import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { ErrorObject } from '../../helpers/ErrorObject.js';

// Thanks to
// https://github.com/Gujal00/ResolveURL/blob/master/script.module.resolveurl/lib/resolveurl/plugins/savefiles.py
export async function extract_savefiles(url) {
    try {
        // extract hostname from url
        const hostname = url.match(/https?:\/\/([^\/]+)/)?.[1];
        if (!hostname) {
            return new ErrorObject(
                'invalid url format',
                'SaveFiles',
                400,
                'could not extract hostname from url',
                true,
                true
            );
        }

        // check if url matches savefiles pattern
        const pattern =
            /(?:\/\/|\.)(?:savefiles|streamhls)\.(?:com|to)\/(?:e\/)?([0-9a-zA-Z]+)/;
        const match = url.match(pattern);

        if (!match) {
            return new ErrorObject(
                'URL pattern not supported',
                'SaveFiles',
                400,
                'this url format is not supported by savefiles extractor',
                true,
                true
            );
        }

        const mediaId = match[1];

        // construct the target url
        const targetUrl = `https://${hostname}/${mediaId}`;

        // setup headers
        const headers = {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            Connection: 'keep-alive'
        };

        // fetch the page
        const response = await fetch(targetUrl, { headers });

        if (!response.ok) {
            return new ErrorObject(
                `failed to fetch savefiles url: status ${response.status}`,
                'SaveFiles',
                response.status,
                'check the url or server status',
                true,
                true
            );
        }

        const html = await response.text();

        // scrape sources accordingly to the python plugin
        const sources = scrapeSourcesFromHtml(html, url);

        if (!sources || sources.length === 0) {
            return new ErrorObject(
                'no video sources found',
                'SaveFiles',
                404,
                'the page does not contain any playable video sources',
                true,
                true
            );
        }

        // pick the best quality source (first one usually highest)
        const selectedSource = sources[0];

        return {
            file: selectedSource.url,
            type: getVideoType(selectedSource.url),
            quality: selectedSource.label || 'unknown'
        };
    } catch (error) {
        console.error('error in extract_savefiles:', error);
        return new ErrorObject(
            `unexpected error: ${error.message}`,
            'SaveFiles',
            500,
            'check the implementation or server status',
            true,
            true
        );
    }
}

// helper function to scrape video sources from html
function scrapeSourcesFromHtml(html, baseUrl) {
    const sources = [];

    // pattern from the python plugin: sources:\s*\[{\s*file\s*:\s*['"](?P<url>[^'"]+)
    const sourcesPattern = /sources:\s*\[\{\s*file\s*:\s*['"]([^'"]+)/g;
    let match;

    while ((match = sourcesPattern.exec(html)) !== null) {
        const url = match[1].replace(/\\\//g, '/');
        if (!isBlockedUrl(url)) {
            sources.push({
                url: url,
                label: extractQualityLabel(url)
            });
        }
    }

    // remove duplicates and sort by quality
    const uniqueSources = removeDuplicates(sources);
    return sortSourcesByQuality(uniqueSources);
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
