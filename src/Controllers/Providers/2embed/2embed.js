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
            headers: {Referer: REF_URL},
            sources: [
                {
                    link: streamUrl,
                    description: "Two Embed",
                    type: "embed",
                    lang: "en"
                }
            ],
            subtitles: []
        };
       
        
    } catch (error) {
        return new Error(`[two_embed] Failed to load sources: ${error}`);
    }
}

async function extractStreamWish(url, refUrl, sourceName) {
    try {
        const response = await axios.get(url, { headers: { Referer: refUrl } });
        const $ = cheerio.load(response.data);

        return [{ link: url, description: sourceName, headers: { Referer: refUrl } }];
    } catch (error) {
        return new Error("Failed to extract stream");
    }
}