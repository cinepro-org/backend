import fetch from "node-fetch";
import {languageMap} from "../../../utils/languages.js";

export async function getAutoembed(media) {
    const id = media.tmdbId;
    const season = media.season;
    const episode = media.episode;
    
    let url;
    if (media.type === "tv") {
        url = `https://tom.autoembed.cc/api/getVideoSource?type=tv&id=${id}/${season}/${episode}`;
    } else {
        url = `https://tom.autoembed.cc/api/getVideoSource?type=movie&id=${id}`;
    }
    
    try {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                referer: "https://tom.autoembed.cc",
                origin: "https://watch.autoembed.cc/",
            }
        });
        const data = await response.json();
        if (data.error) {
            return new Error("No stream wish id found");
        }

        const streamUrl = data.videoSource;
        let subs = formatSubs(data.subtitles);
        const vietnameUrl = await getVietnameUrl(media);
        
        let files = [];
        if (vietnameUrl) {
            files.push({ file: vietnameUrl, type: "hls", quality: "1080p", lang: "vi" });
        }
        files.push({ file: streamUrl, type: "hls", quality: "1080p", lang: "en" });

        // this stuff works
        // TODO: get the streamUrl and look inside. Is same like embedsu.
        
        return {
            provider: "autoembed",
            sources: [
                {
                    provider: "autoembed",
                    files: files
                }
            ],
            subtitles: subs
        };
    
    } catch (error) {
        return new Error("An error occurred" + error);
    }
                        
}

function getSizeQuality(url) {
    const parts = url.split('/');
    const base64Part = parts[parts.length - 2];
    const decodedPart = atob(base64Part);
    const sizeQuality = Number(decodedPart) || 1080;
    return sizeQuality;
}

function formatSubs(subs) {
    return subs.map(sub => {
        return {
            url: sub.file,
            lang: languageMap[sub.label.split(' ')[0]] || sub.label
        };
    });
}

async function getVietnameUrl(media) {
    let url;
    if (media.type === "tv") {
        url = `https://tom.autoembed.cc/api/getVideoSource?type=tv&id=${media.tmdbId}/${media.season}/${media.episode}`;
    } else {
        url = `https://viet.autoembed.cc/movie/${media.imdbId}`;
    }
    let data = await fetch(url, {
        method: "GET",
        headers: {
            referer: "https://tom.autoembed.cc",
            origin: "https://watch.autoembed.cc/",
        }
    });
    let websiteHtml = await data.text();
    let match = websiteHtml.match(/file: "([^"]+)"/);
    return match ? match[1] : null;
}