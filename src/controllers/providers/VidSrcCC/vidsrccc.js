import { languageMap } from '../../../utils/languages.js';
import { generateVRF } from './vrfgen.js';
import { ErrorObject } from '../../../helpers/ErrorObject.js';
import { extractCFTokens } from './cloudflare-bypass.js';

const DOMAIN = 'https://vidsrc.cc/api/';

// Function to log Coz lowkey hate writing console.log everytime
const DEBUG = true;
const dbg = (...args) => DEBUG && console.log('[vidsrccc]', ...args);

export async function getVidSrcCC(media) {
    dbg('starting extraction for', media.type, 'tmdb:', media.tmdb);

    // You may still need to handle the Cloudflare clearance token logic
    // fetch the embed page to extract userId
    const embedUrl =
        media.type !== 'tv'
            ? `https://vidsrc.cc/v2/embed/movie/${media.tmdb}`
            : `https://vidsrc.cc/v2/embed/tv/${media.tmdb}/${media.season}/${media.episode}`;

    dbg('fetching embed page:', embedUrl);

    const embedResponse = await fetch(embedUrl, {
        headers: {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
            Referer: 'https://vidsrc.cc/',
            Origin: 'https://vidsrc.cc'
        }
    });
    const embedHtml = await embedResponse.text();

    // extract cloudflare tokens if present
    const cfTokens = extractCFTokens(embedHtml);
    if (cfTokens.cfKey) {
        dbg('cloudflare protection detected, key:', cfTokens.cfKey);
    } else {
        dbg('no cloudflare tokens found in embed page');
    }

    // Extract userId and v value from the HTML
    const userIdMatch = embedHtml.match(/userId\s*=\s*["']([^"']+)["']/);
    const vMatch = embedHtml.match(/var\s+v\s*=\s*["']?([^"';\s]+)["']?/);

    if (!userIdMatch || !vMatch) {
        return new ErrorObject(
            'Failed to extract required parameters from embed page',
            'VidSrcCC',
            400,
            `Missing: ${!userIdMatch ? 'userId' : ''} ${!vMatch ? 'v' : ''}`,
            true,
            true
        );
    }

    const userId = userIdMatch[1];
    const v = vMatch[1];

    dbg('extracted userId:', userId, 'v:', v);

    let vrfToken = await generateVRF(media.tmdb, userId);

    dbg('vrf token generated:', vrfToken.substring(0, 20) + '...');

    let origin;
    let firstUrl;

    if (media.type !== 'tv') {
        firstUrl = `${DOMAIN}${media.tmdb}/servers?id=${media.tmdb}&type=movie&v=${v}&vrf=${vrfToken}&imdbId=${media.imdbId}`;
        origin = `${DOMAIN.replace('api/', '')}embed/movie/${media.tmdb}`;
    } else {
        // add season and episode parameters for tv shows
        firstUrl = `${DOMAIN}${media.tmdb}/servers?id=${media.tmdb}&type=tv&v=${v}&vrf=${vrfToken}&season=${media.season}&episode=${media.episode}&imdbId=${media.imdbId}`;
        origin = `${DOMAIN.replace('api/', '')}embed/tv/${media.tmdb}/${media.season}/${media.episode}`;
    }

    dbg('first api url:', firstUrl);
    const headers = {
        'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
        Referer: origin,
        Origin: origin
    };

    // add cloudflare token if it was found
    if (cfTokens.cfKey && cfTokens.cfValue) {
        // try adding it as a custom header (might need to be Cookie instead)
        headers['X-CF-Token'] = cfTokens.cfValue;
        dbg('added cf token to headers');
    }

    dbg('request headers:', Object.keys(headers));

    let firstResponse = await fetch(firstUrl, { headers });

    dbg('first response status:', firstResponse.status);
    dbg('first response', firstResponse);

    if (firstResponse.status !== 200) {
        const errorBody = await firstResponse.text();
        dbg('error response body:', errorBody);

        return new ErrorObject(
            'Failed to fetch first response',
            'VidSrcCC',
            firstResponse.status,
            `Server returned: ${errorBody}. Check VRF token or cf_clearance cookie.`,
            true,
            true
        );
    }
    let firstData = await firstResponse.json();

    let hashes = [];
    firstData.data.forEach((server) => {
        hashes.push(server.hash);
    });

    dbg('found', hashes.length, 'server hashes');

    let vidsrcCCSources = [];

    for (let hash of hashes) {
        dbg('processing hash:', hash);

        let secondUrl = `${DOMAIN}source/${hash}?opensubtitles=true`;
        let secondResponse = await fetch(secondUrl, { headers });
        dbg('source response status:', secondResponse.status);

        if (!secondResponse.ok) {
            return new ErrorObject(
                'Failed to fetch second response',
                'VidSrcCC',
                secondResponse.status,
                'Check the hash or the server response.',
                true,
                true
            );
        }

        let secondData = await secondResponse.json();

        if (secondData.success) {
            dbg('source data retrieved successfully');

            vidsrcCCSources.push(secondData.data);
        }
    }

    // gather all the subtitles
    let subtitles = [];
    dbg('processing subtitles from', vidsrcCCSources.length, 'sources');

    // Only proceed if the source has subtitles
    for (let source of vidsrcCCSources) {
        if (source.subtitles) {
            source.subtitles.forEach((subtitle) => {
                subtitles.push({
                    lang:
                        languageMap[subtitle.label.split(' ')[0]] ||
                        subtitle.lang,
                    url: subtitle.file
                });
            });
        }
    }

    // gather all the files
    let files = [];
    for (let source of vidsrcCCSources) {
        if (source.type === 'hls' || source.type === 'iframe') {
            files.push({
                file: source.source,
                type: source.type,
                lang: 'en'
            });
        }
    }

    dbg('returning', files.length, 'files and', subtitles.length, 'subtitles');

    return {
        files: files.map((file) => ({
            file: file.file,
            type: file.type,
            lang: file.lang,
            headers: headers
        })),
        subtitles: subtitles.map((subtitle) => ({
            url: subtitle.url,
            lang: subtitle.lang,
            type: subtitle.url.split('.').pop()
        }))
    };
}
