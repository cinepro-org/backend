import fetch from "node-fetch";
import * as crypto from "node:crypto";
import { ErrorObject } from "../../../helpers/ErrorObject.js";

// Constants
const DOMAIN = "https://player.vidsrc.co/";
const headers = {
    Referer: DOMAIN,
    Origin: DOMAIN,
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.6787.65 Safari/537.36 Edg/132.0.2855.99",
    "accept": "*/*"
};
const numberOfServers = 15;

// Main function to get AutoEmbed data
export async function getAutoembed(media) {
    let { tmdb, season, episode, type } = media;
    const url = type === "tv"
        ? `https://player.vidsrc.co/api/server?id=${tmdb}&ss=${season}&ep=${episode}`
        : `https://player.vidsrc.co/api/server?id=${tmdb}`;

    let files = [];
    let subtitles = [];

    try {
        for (let i = 1; i <= numberOfServers; i++) {
            let currentLang;
            if (i <= 3) {
                currentLang = "en";
            } else if (i <= 5) {
                currentLang = "hi";
            } else if (i <= 7) {
                currentLang = "bn";
            } else if (i <= 9) {
                currentLang = "ta";
            } else if (i <= 11) {
                currentLang = "te";
            } else if (i <= 13) {
                currentLang = "ml";
            } else {
                currentLang = "kn";
            }

            const serverUrl = `${url}&sr=${i}`;
            const response = await fetch(serverUrl, {
                method: "GET",
                headers: headers
            });
            if (!response.ok) {
                continue;
            }
            let encObj = await response.json();
            const data = decryptData(encObj.data);  // Decrypt the data
            // let data2 = decrypt(encObj.data);
            return new ErrorObject("Data Decryption is not yet implemented", "AutoEmbed/vidsrc.co", 500, "could someone pls fix this. thanksss", true, false);
            files.push({
                file: data.url,
                type: data.url.includes("mp4") ? "mp4" : "hls",
                lang: currentLang
            });
            
            if (data.tracks) {
                // TODO: implement subtitles
            }
        }
        
        return { files, subtitles };
    } catch (error) {
        console.error("Error:", error);  // Log the error for debugging
        return new ErrorObject(`Unexpected error: ${error.message}`, "AutoEmbed/vidsrc.co", 500, undefined, true, true);
    }
}

// Decrypt function
function decryptData(encryptedObject) {
    // Convert base64 encoded string to JSON object
    encryptedObject = JSON.parse(Buffer.from(encryptedObject, 'base64').toString('utf8'));
    const { algorithm, key, iv, encryptedData } = encryptedObject;

    const keyBuffer = Buffer.from(key, 'hex');
    const ivBuffer = Buffer.from(iv, 'hex');

    const decipher = crypto.createDecipheriv(algorithm, keyBuffer, ivBuffer);

    let decrypted = decipher.update(Buffer.from(encryptedData, 'base64'), 'utf8', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);  // Assuming decrypted data is in JSON format
}

    function getCurrentPeriod() {
        return Math.floor(Date.now() / this.rotationInterval);
    }
function generateKeyForPeriod(e) {
        let t = "".concat("change-this-in-production (@sam)", "_period_").concat(e);
        return ex().PBKDF2(t, e.toString(), { keySize: 8, iterations: 1000, hasher: ex().algo.SHA256 }).toString();
    }
function encrypt(e) {
        let t = this.getCurrentPeriod(), a = this.generateKeyForPeriod(t), n = JSON.stringify(e), l = ex().lib.WordArray.random(16), o = ex().lib.WordArray.random(16), s = ex().PBKDF2(a, l, { keySize: 8, iterations: 1000, hasher: ex().algo.SHA256 }), r = ex().AES.encrypt(n, s, { iv: o, padding: ex().pad.Pkcs7, mode: ex().mode.CBC });
        return Buffer.from(JSON.stringify({ algorithm: "aes-256-cbc", iterations: 1000, salt: l.toString(ex().enc.Hex), iv: o.toString(ex().enc.Hex), encryptedData: r.toString(), key: a })).toString('base64');
    }
function decrypt(e) {
        try {
            let t = Buffer.from(e, 'base64').toString('utf8'), a = JSON.parse(t);
            return decryptWithPassword(a);
        } catch (e) {
            throw console.error("Decryption Error:", e), Error("Decryption failed: ".concat(e.message));
        }
    }
function decryptWithPassword(e) {
        let t = ex().enc.Hex.parse(e.salt), a = ex().enc.Hex.parse(e.iv), n = e.encryptedData, l = ex().PBKDF2(e.key, t, { keySize: 8, iterations: e.iterations, hasher: ex().algo.SHA256 }), o = ex().AES.decrypt(n, l, { iv: a, padding: ex().pad.Pkcs7, mode: ex().mode.CBC }).toString(ex().enc.Utf8);
        if (!o) throw Error("Decryption failed: Invalid key or malformed data.");
        return console.log("Decrypted JSON String:", o), JSON.parse(o);
    }

// Utility function for encryption
function ex(e) {
    return {
        id: Symbol(),
        provide: e
    };
}
