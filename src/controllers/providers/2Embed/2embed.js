import fetch from "node-fetch";
import {ErrorObject} from "../../../helpers/ErrorObject.js";
import {extract} from "../../../utils/Extractor.js";

const DOMAIN = "https://www.2embed.cc";
const PLAYER_URL = "https://uqloads.xyz";

const headers = {
    'User-Agent': "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    'Referer': DOMAIN,
    'Origin': DOMAIN,
};

export async function getTwoEmbed(params) {
    const {tmdb, season, episode} = params;
    const url = season && episode
        ? `${DOMAIN}/embedtv/${tmdb}&s=${season}&e=${episode}`
        : `${DOMAIN}/embed/${tmdb}`;

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                Referer: url,
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": headers['User-Agent'],
            },
            body: "pls=pls"
        });

        if (!response.ok) {
            return new ErrorObject(`HTTP error fetching initial URL! Status: ${response.status}`, "2Embed", 500, "Check the URL or server status", true, true);
        }

        const data = await response.text();
        const match = data.match(/swish\?id=(?<id>[\w\d]+)/) || data.match(/'(.*?player4u.*?)'/);

        if (!match || !match[1]) {
            return new ErrorObject("No relevant swish ID or player4u URL found in initial data.", "2Embed", 500, "The backend logic might have changed.", true, true);
        }

        const extractedValue = match[1];
        const isSwishId = match[0].includes("swish");

        if (isSwishId) {
            const streamUrl = await extract(`${PLAYER_URL}/e/${extractedValue}`, DOMAIN);
            if (!streamUrl) {
                return new ErrorObject(`Could not resolve stream URL for swish ID: ${extractedValue}`, "2Embed", 500, "Check the swish ID or backend logic.", true, true);
            }

            return {
                files: {
                    file: streamUrl,
                    type: "hls",
                    lang: "en"
                },
                subtitles: []
            };
        } else {
            return new ErrorObject("Player4u logic is not yet implemented.", "2Embed", 500, "The player4u logic needs to be added.", true, true);
        }
    } catch (error) {
        return new ErrorObject(`Unexpected error: ${error.message}`, "2Embed", 500, "Check the implementation or server status.", true, true);
    }
}