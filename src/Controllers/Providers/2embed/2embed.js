import axios from "axios";
import * as cheerio from "cheerio";
import fetch from "node-fetch";

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

        streamUrl = `${PLAYER_URL}/e/${match.groups.id}`;
        
        if (!streamUrl) {
            return new Error("No stream found");
        }

        return {
            provider: "Two Embed",
            sources: [
                {
                    provider: "Two Embed",
                    files: [
                        {
                            file: streamUrl,
                            type: "embed",
                            quality: "unknown",
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