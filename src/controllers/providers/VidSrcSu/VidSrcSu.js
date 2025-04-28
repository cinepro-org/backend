import axios from 'axios';
import * as cheerio from "cheerio";
import {ErrorObject} from "../../../helpers/ErrorObject.js";

const DOMAIN = "https://vidsrc.su";

export async function getVidSrcSu(media) {
    let embedUrl;
    if (media.type === "tv") {
        embedUrl = `${DOMAIN}/embed/tv/${media.tmdb}/${media.season}/${media.episode}`;
    } else {
        embedUrl = `${DOMAIN}/embed/movie/${media.tmdb}`;
    }

    try {
        const response = await axios.get(embedUrl);
        const html = response.data;

        let subtitles = [];

        // Extract server URLs
        const servers = [...html.matchAll(/label: 'Server \d+', url: '(https.*)'/g)].map(match => ({
            file: match[2], type: "hls", lang: "en"
        }));

        // Extract subtitles
        subtitles = JSON.parse(html.match(/const subtitles = \[(.*)\];/g)[0].replace('const subtitles = ', '').replaceAll(';', ''));
        subtitles.shift();
        subtitles = subtitles.map(subtitle => ({
            url: subtitle.url, lang: subtitle.language, type: subtitle.format
        }));

        return {files: servers, subtitles};
    } catch (error) {
        return new ErrorObject(`Failed to fetch or parse data from ${embedUrl}: ${error.message}`, "VidSrcSu", 500, "Check the embed URL or the page structure for changes.", true, true);
    }
}