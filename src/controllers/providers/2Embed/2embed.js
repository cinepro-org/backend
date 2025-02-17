import axios from "axios";
import fetch from "node-fetch";
import {resolve} from "../../../utils/checkresolve.js";

const URL = "https://www.2embed.cc";
const PLAYER_URL = "https://uqloads.xyz";

export async function getTwoEmbed(params) {
    const tmdbId = params.tmdbId;
    const url = params.type === "tv"
        ? `${URL}/embedtv/${tmdbId}&s=${params.season}&e=${params.episode}`
        : `${URL}/embed/${tmdbId}`;

    try {
        const response = await axios.post(url, "pls=pls", {
            headers: {
                Referer: url,
                "Content-Type": "application/x-www-form-urlencoded"
            }
        });

        let streamUrl;
        const match = response.data.match(/swish\?id=(?<id>[\w\d]+)/);
        if (!match || !match.groups || !match.groups.id) {
            return new Error("No stream wish id found");
        }

        streamUrl = await resolve(`${PLAYER_URL}/e/${match.groups.id}`);

        if (!streamUrl) {
            return new Error("No stream found");
        }

        const sources = await parseM3U8(streamUrl, `${PLAYER_URL}/e/${match.groups.id}`);

        const files = [
            ...sources.map(source => ({
                file: source.url,
                type: "hls",
                quality: source.quality,
                lang: "en"
            }))
        ];


        return {
            provider: "Two Embed",
            sources: [
                {
                    provider: "Two Embed",
                    files: files
                }
            ],
            subtitles: []
        };
    } catch (error) {
        return new Error(error);
    }
}

async function parseM3U8(m3u8Url, referer) {
    const response = await fetch(m3u8Url, {
        headers: {
            "Referer": referer
        }
    });

    if (!response.ok) {
        return 'unknown';
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
        } else if (line.startsWith('index')) {
            const preuri = m3u8Url.split("master.m3u8")[0];
            currentSource.url = `${preuri}${line}`;
            sources.push(currentSource);
            currentSource = {};
        }
    }

    return sources;
}