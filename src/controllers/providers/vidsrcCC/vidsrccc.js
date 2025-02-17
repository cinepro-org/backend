import { generateVRF } from "./vrfGen.js";
import { languageMap } from "../../../utils/languages.js";

const DOMAIN = "https://vidsrc.cc/api/";

export async function getVidSrcCC(media) {
    let vrfToken = await generateVRF(media.tmdbId);
    let origin;
    let firstUrl;
    if (media.type !== "tv") {
        firstUrl = `${DOMAIN}${media.tmdbId}/servers/?type=movie&vrf=${vrfToken}&imdbId=${media.imdbId}`;
        origin = `${DOMAIN.replace("api/", "")}embed/movie/${media.tmdbId}`;
    } else {
        firstUrl = `${DOMAIN}${media.tmdbId}/servers/?vrf=${vrfToken}&season=${media.season}&episode=${media.episode}`;
        origin = `${DOMAIN.replace("api/", "")}embed/tv/${media.tmdbId}/${media.season}/${media.episode}`;
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
        const sources = await parseM3U8(source.source);

        if (sources.length > 0) {
            sources.forEach(src => {
                files.push({
                    file: src.url,
                    type: "hls",
                    quality: src.quality || "unknown",
                    lang: "en"
                });
            });
        }
    }

    return {
        provider: "VidSrcCC",
        sources: [
            {
                provider: "VidSrcCC",
                files,
                header: headers
            }
        ],
        subtitles
    };
}

async function parseM3U8(m3u8Url) {
    const response = await fetch(m3u8Url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36"
        }
    });

    if (!response.ok) {
        return [];
    }

    const m3u8Content = await response.text();

    const lines = m3u8Content.split('\n');
    const sources = [];
    let currentSource = {};

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line.startsWith('#EXT-X-STREAM-INF:')) {
            const resolutionMatch = line.match(/RESOLUTION=(\d+x\d+)/);
            if (resolutionMatch) {
                const resolution = resolutionMatch[1];
                const quality = resolution.split('x')[1];
                currentSource.quality = quality + "p";
            }
        } else if (line.startsWith('http') || (line.includes('.m3u8') && !line.startsWith('#'))) {
            currentSource.url = line;
            sources.push(currentSource);
            currentSource = {};
        }
    }

    return sources;
}
