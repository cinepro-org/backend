import fetch from "node-fetch";
import {ErrorObject} from "../../../helpers/ErrorObject.js";

const DOMAIN = "https://player.vidsrc.co/"
const headers = {
    Referer: DOMAIN,
    Origin: DOMAIN,
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6787.65 Safari/537.36 Edg/132.0.2855.99",
    "accept": "*/*"
};
const numberOfServers = 15;

export async function getAutoembed(media) {
    let {tmdb, season, episode, type} = media;
    const url = type === "tv"
        ? `https://player.vidsrc.co/api/server?id=${tmdb}&ss=${season}&ep=${episode}`
        : `https://player.vidsrc.co/api/server?id=${tmdb}`;

    let files = [];
    let subtitles = [];

    try {
        for (let i = 1; i <= numberOfServers; i++) {
            let currentLang;
            if (i <= 3) {
                currentLang = "en";
            } else if (i <= 5) {
                currentLang = "hi";
            } else if (i <= 7) {
                currentLang = "bn";
            } else if (i <= 9) {
                currentLang = "ta";
            } else if (i <= 11) {
                currentLang = "te";
            } else if (i <= 13) {
                currentLang = "ml";
            } else {
                currentLang = "kn";
            }

            const serverUrl = `${url}&sr=${i}`;
            const response = await fetch(serverUrl, {
                method: "GET",
                headers: headers
            });
            if (!response.ok) {
                continue;
            }
            const data = await response.json();
            files.push({
                file: data.url,
                type: data.url.includes("mp4") ? "mp4" : "hls",
                lang: currentLang,
                headers: data.headers && Object.keys(data.headers).length > 0 ? data.headers : undefined
            });

            if (data.tracks) {
                // TODO: implement subtitles
            }
        }
        return {files, subtitles};
    } catch (error) {
        return new ErrorObject(`Unexpected error: ${error.message}`, "AutoEmbed/vidsrc.co", 500, undefined, true, true);
    }
}