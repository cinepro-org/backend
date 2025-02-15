import fetch from "node-fetch";
import {languageMap} from "../../../utils/languages.js";

export async function getAutoembed(media) {
    const id = media.tmdbId;
    const season = media.season;
    const episode = media.episode;
    
    let url;
    if (media.type === "tv") {
        url = `https://autoembed.xyz/api/v1/embedtv/${id}/${season}/${episode}`;
    } else {
        url = `https://tom.autoembed.cc/api/getVideoSource?type=movie&id=${id}`;
    }

    try {
        let url = url;
        const response = await fetch(url);
        const data = await response.json();
        if (data.error) {
            return new Error("No stream wish id found");
        }

        const streamUrl = data.videoSource;

        // this stuff works
        // TODO: get the streamUrl and look inside. Is same like embedsu.
        
        return null;
        
    
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
