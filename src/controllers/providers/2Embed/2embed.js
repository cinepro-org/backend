import axios from "axios";
import {resolve} from "../../../utils/checkresolve.js";

// TODO: fix this provider... stuff changed i think..

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

        const files = [
            {
                file: streamUrl,
                type: "hls",
                lang: "en"
            }
        ];

        return {
            originalPlaylist: streamUrl,
            files: files.map(file => ({
                file: file.file,
                type: file.type,
                lang: file.lang
            })),
            subtitles: []
        };
    } catch (error) {
        return new Error(error);
    }
}