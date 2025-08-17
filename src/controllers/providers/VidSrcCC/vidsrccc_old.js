import {languageMap} from "../../../utils/languages.js";
import {generateVRF} from "./vrfgen.js";
import {ErrorObject} from "../../../helpers/ErrorObject.js";

const DOMAIN = "https://vidsrc.cc/api/";

export async function getVidSrcCC(media) {
    return new ErrorObject("This provider is mean :(", "VidSrcCC", 500, "3 things: 1. They want a vrf token when requesting for server hashes, 2. you would also need 'v' attribute where something gets hashed and you also need the cf_clearance cookie to get the server hashes. After that, the existing logic would stay the same... (and if that isnt enough, they block IPs (403 = your ip is cooked))", true, false);

    let cfToken = getCloudflareClearance(media);
    let vrfToken = generateVRF(media.tmdb);
    let origin;
    let firstUrl;
    if (media.type !== "tv") {
        firstUrl = `${DOMAIN}${media.tmdb}/servers/?type=movie&vrf=${vrfToken}&imdbId=${media.imdbId}`;
        origin = `${DOMAIN.replace("api/", "")}embed/movie/${media.tmdb}`;
    } else {
        firstUrl = `${DOMAIN}${media.tmdb}/servers/?vrf=${vrfToken}&season=${media.season}&episode=${media.episode}`;
        origin = `${DOMAIN.replace("api/", "")}embed/tv/${media.tmdb}/${media.season}/${media.episode}`;
    }
    const headers = {
        'User-Agent': "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
        'Referer': origin,
        'Origin': origin,
        cookie: cfToken
    };

    let firstResponse = await fetch(firstUrl, {headers});
    if (firstResponse.status !== 200) {
        return new ErrorObject("Failed to fetch first response", "VidSrcCC", firstResponse.status, "Check the VRF token, cf_clearance cookie, or the server response.", true, true);
    }
    let firstData = await firstResponse.json();
    let hashes = [];
    firstData.data.forEach(server => {
        hashes.push(server.hash);
    });

    let vidsrcCCSources = [];

    for (let hash of hashes) {
        let secondUrl = `${DOMAIN}source/${hash}?opensubtitles=true`;
        let secondResponse = await fetch(secondUrl, {headers});
        if (!secondResponse.ok) {
            return new ErrorObject("Failed to fetch second response", "VidSrcCC", secondResponse.status, "Check the hash or the server response.", true, true);
        }
        let secondData = await secondResponse.json();
        if (secondData.success) {
            vidsrcCCSources.push(secondData.data);
        }
    }

    // gather all the subtitles
    let subtitles = [];
    vidsrcCCSources.forEach(source => {
        source.subtitles.forEach(subtitle => {
            subtitles.push({
                lang: languageMap[subtitle.label.split(' ')[0]] || subtitle.lang, url: subtitle.file
            });
        });
    });

    // gather all the files
    let files = [];
    for (let source of vidsrcCCSources) {
        files.push({
            file: source.url, type: "hls", lang: "en"
        });
    }

    return {
        files: files.map(file => ({
            file: file.file, type: file.type, lang: file.lang, headers: headers
        })),

        subtitles: subtitles.map(subtitle => ({
            url: subtitle.url, lang: subtitle.lang, type: subtitle.url.split('.').pop()
        }))
    };
}

function getCloudflareClearance(media) {
    return new ErrorObject("Cloudflare clearance cookie is missing", "VidSrcCC", 500, "You need to obtain the cf_clearance cookie manually or implement a mechanism to bypass Cloudflare's protection.", true, true);
}