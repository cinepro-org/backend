import { generateVRF } from "./vrfgen.js";
import { languageMap } from "../../../utils/languages.js";

const DOMAIN = "https://vidsrc.cc/api/";

export async function getVidSrcCC(media) {
    // since this is broken: 
    return new Error("[vidsrccc] This provider is broken/down - could maybe someone that understands web assembley check the problem out`? thanks!");
    
    let vrfToken = await generateVRF(media.tmdb);
    if (!vrfToken) {
        return new Error("[vidsrccc] Failed to generate VRF token :(");
    }
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
    };
    let firstResponse = await fetch(firstUrl, { headers });
    if (firstResponse.status !== 200) {
        return new Error("Failed to fetch first response");
    }
    let firstData = await firstResponse.json();
    let hashes = [];
    firstData.data.forEach(server => {
        hashes.push(server.hash);
    });

    let vidsrcCCSources = [];

    for (let hash of hashes) {
        let secondUrl = `${DOMAIN}source/${hash}?opensubtitles=true`;
        let secondResponse = await fetch(secondUrl, { headers });
        if (!secondResponse.ok) {
            return new Error("Failed to fetch second response");
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
                lang: languageMap[subtitle.label.split(' ')[0]] || subtitle.lang,
                url: subtitle.file
            });
        });
    });

    // gather all the files
    let files = [];
    for (let source of vidsrcCCSources) {
        files.push({
            file: source.url,
            type: "hls",
            lang: "en"
        });
    }

    return {
        files: files.map(file => ({
            file: file.file,
            type: file.type,
            lang: file.lang,
            headers: headers
        })),

        subtitles: subtitles.map(subtitle => ({
            url: subtitle.url,
            lang: subtitle.lang,
            type: subtitle.url.split('.').pop()
        }))
    };
}
