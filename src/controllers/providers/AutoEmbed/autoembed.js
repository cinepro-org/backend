import fetch from "node-fetch";
import {languageMap} from "../../../utils/languages.js";

export async function getAutoembed(media) {
    const id = media.tmdb;
    const season = media.season;
    const episode = media.episode;

    let url;
    if (media.type === "tv") {
        url = `https://nono.autoembed.cc/api/getVideoSource?type=tv&id=${id}/${season}/${episode}`;
    } else {
        url = `https://nono.autoembed.cc/api/getVideoSource?type=movie&id=${id}`;
    }

    try {
        const response = await fetch(url, {
            headers: {
                'Referer': 'https://autoembed.cc/'
            }
        });
        if (!response.ok) {
            if (response.status === 404) {
                return null;
            }
        }
        const data = await response.json();
        if (data.error) {
            return new Error("No stream wish id found");
        }
        
        return {
            files: [
                {
                    file: data.videoSource,
                    type: "hls",
                    lang: "en"
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