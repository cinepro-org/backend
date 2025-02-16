import axios from "axios";
import * as cheerio from "cheerio";
import fetch from "node-fetch";
import { resolve_streamwish } from "../../../utils/resolvers/streamwish.js";

const URL = "https://www.2embed.cc";
const PLAYER_URL = "https://uqloads.xyz";
const REF_URL = "https://streamsrcs.2embed.cc/";

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

        streamUrl = await resolve_streamwish(`${PLAYER_URL}/e/${match.groups.id}`);

        if (!streamUrl) {
            return new Error("No stream found");
        }

        const qual = await getquality(streamUrl, `${PLAYER_URL}/e/${match.groups.id}`);

        return {
            provider: "Two Embed",
            sources: [
                {
                    provider: "Two Embed",
                    files: [
                        {
                            file: streamUrl,
                            type: "hls",
                            quality: qual,
                            lang: "en"
                        }
                    ]
                }
            ],
            subtitles: []
        };
    } catch (error) {
        return new Error(error);
    }
}

async function getquality(url, referer) {
    const response = await fetch(url, {
        headers: {
            "Referer": referer
        }
    });

    if (!response.ok) {
        return 'unknown';
    }

    const data = await response.text();
    const regex = /RESOLUTION=\d.*x(.*?),F/;
    const m3udata = data.match(regex);
    if (m3udata) {
        return `${m3udata[1]}p`
    } else {
        return 'unknown';
    }
}