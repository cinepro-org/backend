import axios from 'axios';
import * as cheerio from "cheerio";

export async function getVidSrcSu(media) {
    let embedUrl;
    if (media.type === "tv") {
        embedUrl = `https://vidsrc.su/embed/tv/${media.tmdbId}/${media.season}/${media.episode}`;
    } else {
        embedUrl = `https://vidsrc.su/embed/movie/${media.tmdbId}`;
    }

    try {
        const response = await axios.get(embedUrl);
        const html = response.data;
        const $ = cheerio.load(html);

        let subtitles = [];

        // Extract server URLs
        const servers = [...html.matchAll(/label: 'Server (3|4|5|7|8|9|10|12|13|15|17|18|19)', url: '(https.*)'/g)].map(match => ({
            file: match[2],
            type: "hls",
            quality: "unknown",
            lang: "en"
        }));        

        // Extract subtitles
        subtitles = JSON.parse(html.match(/const subtitles = \[(.*)\];/g)[0].replace('const subtitles = ', '').replaceAll(';', ''));
        subtitles.shift();
        subtitles = subtitles.map(subtitle => ({
            url: subtitle.url,
            lang: subtitle.language,
            type: subtitle.format
        }));

        return { files: servers, subtitles };
    } catch (error) {
        return error;
    }
}