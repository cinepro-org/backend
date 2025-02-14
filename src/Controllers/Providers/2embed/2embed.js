import axios from "axios";
import * as cheerio from "cheerio";

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

        const match = response.data.match(/swish\?id=(?<id>[\w\d]+)/);
        if (!match || !match.groups || !match.groups.id) {
            return new Error("No stream wish id found");
        }

        const streamUrl = `${PLAYER_URL}/e/${match.groups.id}`;

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
                    ],
                    headers: {
                        Referer: REF_URL,
                        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                        Origin: REF_URL
                    }
                }
            ],
            subtitles: []
        };
    } catch (error) {
        return { provider: "Two Embed", sources: [], subtitles: [] };
    }
}