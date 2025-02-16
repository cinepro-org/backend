import fetch from "node-fetch";
import { languageMap } from "../../../utils/languages.js";

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

    console.log('getting url', url);

    try {
        console.log('fetching url', url);
        const response = await fetch(url, {
            headers: {
                'Referer': 'https://autoembed.cc/'
            }
        });
        const data = await response.json();
        if (data.error) {
            return new Error("No stream wish id found");
        }

        const m3u8Url = data.videoSource;
        console.log('m3u8Url:', m3u8Url);

        const m3u8Response = await fetch(m3u8Url);
        const m3u8Content = await m3u8Response.text();
        const sources = parseM3U8(m3u8Content);

        const formattedSources = [{
            provider: "AutoEmbed",
            files: sources.map(source => ({
                file: source.url,
                type: "hls",
                quality: source.quality,
                lang: "unknown"
            })),
            headers: {
                "Referer": "https://autoembed.cc/",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36", // Example User-Agent
                "Origin": "https://autoembed.cc/"
            }
        }];
        
        const subs = mapSubtitles(data.subtitles);

        return {
            provider: "AutoEmbed",
            sources: formattedSources,
            subtitles: subs
        };

    } catch (error) {
        return new Error("An error occurred: " + error);
    }
}

function parseM3U8(m3u8Content) {
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
                currentSource.quality = quality;
            }
        } else if (line.startsWith('http')) {
            currentSource.url = line;
            sources.push(currentSource);
            currentSource = {};
        }
    }

    return sources;
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
