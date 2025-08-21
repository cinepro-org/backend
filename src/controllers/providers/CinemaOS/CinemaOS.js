import axios from "axios";
import crypto from "crypto";
import { ErrorObject } from "../../../helpers/ErrorObject.js";

const BASE_URL = "https://cinemaos.live";
const USER_AGENT =
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36";

const headers = {
    Origin: BASE_URL,
    Referer: BASE_URL,
    "User-Agent": USER_AGENT,
};

export async function getCinemaOS(params) {
    const { tmdb } = params;

    try {
        // 1. Auth token
        const authApi = `${BASE_URL}/api/auth`;
        const authInit = (await axios.get(authApi, { headers })).data;
        const authToken = (
            await axios.post(authApi, authInit, { headers })
        ).data.token;

        headers["Authorization"] = `Bearer ${authToken}`;

        // 2. Get movie metadata
        const downloadData = (
            await axios.get(
                `${BASE_URL}/api/downloadLinks?type=movie&tmdbId=${tmdb}`
            )
        ).data.data[0];

        const releaseYear = downloadData.releaseYear;
        const title = downloadData.movieTitle;
        const imdbId = downloadData.subtitleLink.split("=").pop();

        // 3. Get encrypted response
        const encResponse = (
            await axios.get(
                `${BASE_URL}/api/cinemaos?type=movie&tmdbId=${tmdb}&imdbId=${imdbId}&t=${encodeURIComponent(
                    title
                )}&ry=${releaseYear}`,
                { headers }
            )
        ).data.data;

        const encryptedHex = encResponse.encrypted;
        const ivHex = encResponse.cin;
        const authTagHex = encResponse.mao;

        // 4. Prepare AES-256-GCM decrypt
        const keyHex =
            "a1b2c3d4e4f6589012345678901477567890abcdef1234567890abcdef123456";
        const key = Buffer.from(keyHex, "hex");
        const ciphertext = Buffer.from(encryptedHex, "hex");
        const iv = Buffer.from(ivHex, "hex");
        const authTag = Buffer.from(authTagHex, "hex");

        const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAuthTag(authTag);
        const decrypted =
            decipher.update(ciphertext, undefined, "utf8") + decipher.final("utf8");

        // 5. Extract sources
        const sources = JSON.parse(decrypted).sources;
        const validEntries = Object.values(sources).filter(
            (v) => v && typeof v === "object" && v.url
        );

        if (!validEntries.length) {
            throw new Error("No valid sources found");
        }

        const videoUrl =
            validEntries[Math.floor(Math.random() * validEntries.length)].url;

        // 6. Return in provider format
        return {
            files: {
                file: videoUrl,
                type: "hls",
                lang: "en",
                headers: {
                    Referer: BASE_URL,
                    "User-Agent": USER_AGENT,
                },
            },
            subtitles: [],
        };
    } catch (error) {
        return new ErrorObject(
            `CinemaOS Error: ${error.message}`,
            "CinemaOS",
            500,
            "Check the implementation or server status",
            true,
            true
        );
    }
}