import { languageMap } from '../../../utils/languages.js';
import { generateVRF } from './vrfgen.js';
import { ErrorObject } from '../../../helpers/ErrorObject.js';

const DOMAIN = 'https://vidsrc.cc/api/';

// Function to log Coz lowkey hate writing console.log everytime
function logDebugInfo(step, data) {
    console.log(`[VidSrcCC Debug] ${step}:`, data);
}

export async function getVidSrcCC(media) {
    // You may still need to handle the Cloudflare clearance token logic
    // fetch the embed page to extract userId
    const embedUrl =
        media.type !== 'tv'
            ? `https://vidsrc.cc/v2/embed/movie/${media.tmdb}`
            : `https://vidsrc.cc/v2/embed/tv/${media.tmdb}/${media.season}/${media.episode}`;

    const embedResponse = await fetch(embedUrl, {
        headers: {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
            Referer: 'https://vidsrc.cc/',
            Origin: 'https://vidsrc.cc'
        }
    });
    const embedHtml = await embedResponse.text();

    // // Debug: log parts of HTML that contain the variables
    // console.log(' HTML DEBUG ');
    // const userIdSection = embedHtml.match(/.{0,500}userId.{0,500}/);
    // const vSection = embedHtml.match(/.{0,500}var v.{0,500}/);
    // console.log(
    //     'userId section:',
    //     userIdSection ? userIdSection[0] : 'NOT FOUND'
    // );
    // console.log('v section:', vSection ? vSection[0] : 'NOT FOUND');

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

    let vrfToken = await generateVRF(media.tmdb, userId);

    let origin;
    let firstUrl;

    if (media.type !== 'tv') {
        firstUrl = `${DOMAIN}${media.tmdb}/servers?id=${media.tmdb}&type=movie&v=${v}&vrf=${vrfToken}&imdbId=${media.imdbId}`;
        origin = `${DOMAIN.replace('api/', '')}embed/movie/${media.tmdb}`;
    } else {
        firstUrl = `${DOMAIN}${media.tmdb}/servers?id=${media.tmdb}&type=tv&v=${v}&vrf=${vrfToken}&season=${media.season}&episode=${media.episode}&imdbId=${media.imdbId}`;
        origin = `${DOMAIN.replace('api/', '')}embed/tv/${media.tmdb}/${media.season}/${media.episode}`;
    }

    const headers = {
        'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3',
        Referer: origin,
        Origin: origin
    };

    let firstResponse = await fetch(firstUrl, { headers });

    if (firstResponse.status !== 200) {
        return new ErrorObject(
            'Failed to fetch first response',
            'VidSrcCC',
            firstResponse.status,
            'Check the VRF token, cf_clearance cookie, or the server response.',
            true,
            true
        );
    }
    let firstData = await firstResponse.json();

    let hashes = [];
    firstData.data.forEach((server) => {
        hashes.push(server.hash);
    });

    let vidsrcCCSources = [];

    for (let hash of hashes) {
        let secondUrl = `${DOMAIN}source/${hash}?opensubtitles=true`;
        let secondResponse = await fetch(secondUrl, { headers });
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
            vidsrcCCSources.push(secondData.data);
        }
    }

    // gather all the subtitles
    let subtitles = [];
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
