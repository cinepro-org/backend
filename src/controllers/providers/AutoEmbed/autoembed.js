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
            headers: {
                'Referer': 'https://autoembed.cc/'
            }
        });
        if (!response.ok) {
            return new Error(response.statusText);
        }
        const data = await response.json();
        if (data.error) {
            return new Error("No stream wish id found");
        }

        const m3u8Url = data.videoSource;

        const m3u8Response = await fetch(m3u8Url);
        const m3u8Content = await m3u8Response.text();
        const sources = parseM3U8(m3u8Content);

        let vietnameseM3u8;
        let vietnameseM3u8Response;
        let vietnameseM3u8Content;

        try {
            vietnameseM3u8 = await getVietnameseUrl(media);
        } catch (error) {
            // ignore...
        }

        return {
            files: [
                {
                    file: m3u8Url,
                    type: "hls",
                    lang: "en",
                    headers: {
                        'Referer': 'https://autoembed.cc/'
                    }
                }
            ],
            subtitles: [
                ...mapSubtitles(data.subtitles)
            ]
        };

    } catch (error) {
        return new Error("An error occurred: " + error);
    }
}

function mapSubtitles(subtitles) {
    return subtitles.map(subtitle => {
        const lang = languageMap[subtitle.label.split(' ')[0]] || subtitle.label || "unknown";
        const fileUrl = subtitle.file;
        const fileExtension = fileUrl.split('.').pop().toLowerCase();
        const type = fileExtension === 'vtt' ? 'vtt' : 'srt';

        return {
            url: subtitle.file,
            lang: lang,
            type: type
        };
    });
}

async function getVietnameseUrl(media) {
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