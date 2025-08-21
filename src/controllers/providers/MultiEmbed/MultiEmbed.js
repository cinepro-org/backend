import axios from "axios";
import * as cheerio from "cheerio";
import { URL } from "url";
import { ErrorObject } from "../../../helpers/ErrorObject.js";

const userAgent =
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36";

const headers = {
    Referer: "https://multiembed.mov",
    "X-Requested-With": "XMLHttpRequest",
    "User-Agent": userAgent,
};

function baseTransform(d, e, f) {
    const charset = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/";
    const g = [...charset];
    const h = g.slice(0, e);
    const i = g.slice(0, f);

    let j = 0;
    const reversedD = d.split('').reverse();
    for (let c = 0; c < reversedD.length; c++) {
        const b = reversedD[c];
        if (h.includes(b)) {
            j += h.indexOf(b) * Math.pow(e, c);
        }
    }

    let k = "";
    while (j > 0) {
        k = i[j % f] + k;
        j = Math.floor(j / f);
    }
    return k || "0";
}

function decodeHunter(h, u, n, t, e, r = "") {
    let i = 0;
    while (i < h.length) {
        let s = "";
        while (h[i] !== n[e]) {
            s += h[i];
            i++;
        }
        i++;

        for (let j = 0; j < n.length; j++) {
            s = s.replace(new RegExp(n[j].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "g"), j.toString());
        }

        const charCode = parseInt(baseTransform(s, e, 10)) - t;
        r += String.fromCharCode(charCode);
    }
    return decodeURIComponent(r);
}

export async function getMultiembed(params) {
    const { imdb } = params;
    let baseUrl = `https://multiembed.mov/?video_id=${imdb}`;

    try {
        if (baseUrl.includes('multiembed')) {
            const resolved = await axios.get(baseUrl, { headers });
            baseUrl = resolved.request.res.responseUrl || baseUrl;
        }

        const defaultDomain = new URL(baseUrl).origin + "/";

        const data = {
            "button-click": "ZEhKMVpTLVF0LVBTLVF0LVAtMGs1TFMtUXpPREF0TC0wLVYzTi0wVS1RTi0wQTFORGN6TmprLTU=",
            "button-referer": "",
        };

        const resp1 = await axios.post(baseUrl, new URLSearchParams(data), { headers });
        const tokenMatch = resp1.data.match(/load_sources\(\"(.*?)\"\)/);
        if (!tokenMatch) throw new Error("Token not found");
        const token = tokenMatch[1];

        const resp2 = await axios.post(
            "https://streamingnow.mov/response.php",
            new URLSearchParams({ token }),
            { headers }
        );
        const $ = cheerio.load(resp2.data);

        const vipSource = $("li").filter((i, el) =>
            $(el).text().toLowerCase().includes("vipstream-s")
        ).first();
        if (!vipSource || !vipSource.attr("data-id"))
            throw new Error("No VIP source found");

        const serverId = vipSource.attr("data-server");
        const videoId = vipSource.attr("data-id");

        const vipUrl = `https://streamingnow.mov/playvideo.php?video_id=${videoId}&server_id=${serverId}&token=${token}&init=1`;
        const resp3 = await axios.get(vipUrl, { headers });
        const $2 = cheerio.load(resp3.data);
        const iframeUrl = $2("iframe.source-frame.show").attr("src");
        if (!iframeUrl) throw new Error("No iframe found");

        const resp4 = await axios.get(iframeUrl, { headers });

        const hunterMatch = resp4.data.match(
            /\(\s*function\s*\([^\)]*\)\s*\{[\s\S]*?\}\s*\(\s*(.*?)\s*\)\s*\)/
        );

        if (!hunterMatch) throw new Error("Cannot find encoded HUNTER Pack");

        const hunterPack = hunterMatch[1];
        console.log("Hunter pack string:", hunterPack);

        let dataArray;
        try {
            dataArray = new Function('return [' + hunterPack + ']')();
        } catch (evalError) {
            try {
                dataArray = eval('[' + hunterPack + ']');
            } catch (fallbackError) {
                throw new Error(`Failed to parse hunter pack: ${fallbackError.message}`);
            }
        }

        if (!Array.isArray(dataArray) || dataArray.length < 6) {
            throw new Error(`Invalid hunter pack structure. Expected array with 6+ elements, got: ${typeof dataArray}`);
        }

        const [h, u, n, t, e, r] = dataArray;

        console.log("Hunter parameters:", {
            h: typeof h,
            u: typeof u,
            n: typeof n,
            t: typeof t,
            e: typeof e,
            r: typeof r
        });

        const decoded = decodeHunter(h, u, n, t, e, r);
        console.log("Decoded content preview:", decoded.substring(0, 200));

        const videoMatch = decoded.match(/file:"(https?:\/\/[^"]+)"/);
        if (!videoMatch) throw new Error("No video URL found in decoded content");
        const videoUrl = videoMatch[1];

        return {
            files: {
                file: videoUrl,
                type: "hls",
                lang: "en",
                headers: {
                    Referer: defaultDomain,
                    "User-Agent": userAgent,
                },
            },
            subtitles: [],
        };
    } catch (err) {
        console.error("Multiembed error:", err.message);
        return new ErrorObject(
            `Unexpected error: ${err.message}`,
            "Multiembed",
            500,
            "Check implementation or site status",
            true,
            true
        );
    }
}