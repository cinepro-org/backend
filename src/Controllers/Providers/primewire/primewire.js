import axios from "axios";
import * as cheerio from "cheerio";
import * as crypto from "crypto";
import fetch from "node-fetch";

const URL = "https://www.primewire.tf";
const DS_KEY = "JyjId97F9PVqUPuMO0";

export async function getPrimewire(info) {
    if (!info.imdbId) {
        return null;
    }

    const link = await lookupPage(info);
    const servers = await loadServers(link);
    const embeddableServers = await Promise.all(servers.map(server => getEmbedLink(server)));

    const files = embeddableServers.map(embedLink => ({
        file: embedLink,
        type: "embed",
        quality: "unknown",
        lang: "en"
    }));

    return {
        provider: "primewire",
        sources: [
            {
                provider: "primewire",
                files: files
            }
        ],
        subtitles: []
    };
}

async function lookupPage(info) {
    const imdbId = info.imdbId;
    const ds = sha1Hex(`${imdbId}${DS_KEY}`).slice(0, 10);

    let $;
    try {
        const response = await axios.get(`${URL}/filter`, { params: { s: imdbId, ds } });
        $ = cheerio.load(response.data);
    } catch (error) {
        console.error(`[primewire] Error fetching data for imdbId: ${imdbId}`);
        return null;
    }
    const originalLink = $(".index_container .index_item.index_item_ie a").attr("href");
    if (!originalLink) {
        console.error(`[primewire] No search results found for imdbId: ${imdbId}`);
        return null;
    }

    return info.type === "tv"
        ? `${URL}${originalLink.replace("-", "/", 1)}-season-${info.season}-episode-${info.episode}`
        : `${URL}/${originalLink}`;
}

async function loadServers(link) {
    if (!link) return [];

    let website = await fetch(link);
    website = await website.text();
    let urls = [];
    for (const match of website.matchAll(/data-wp-menu="(.+?)"/g)) {
        urls.push({ url: `https://primewire.tf/links/go/${match[1]}`, idx: match[1] });
    }
    
    let embeds = [];
    for (const item of urls) {
        let response = await axios.get(item.url);
        let location = "https://" + response.request.host + response.request.path;
        embeds.push(location)
    }
    return embeds;
}

function sha1Hex(str) {
    return crypto.createHash('sha1').update(str).digest('hex');
}

async function getEmbedLink(server) {
    let website = await fetch(server);
    website = await website.text();
    let $ = cheerio.load(website);
    let embedLink = $("textarea").text().match(/src="(.+?)"/)[1];
    return await /*getVideoFromEmbed(embedLink)*/ embedLink;

}

async function getVideoFromEmbed(embedLink) {
    let hostname = new URL(embedLink).hostname;
    if (hostname !== "mxdrop.to") {
        return embedLink;
    }
    embedLink = embedLink.replace("mixdrop.ps/e", "mixdrop.ps/f");

    let downloadLink = await fetch(embedLink, {
        "headers": {
            "accept": "*/*",
            "accept-language": "en-GB,en;q=0.6",
            "cache-control": "no-cache",
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            "pragma": "no-cache",
            "priority": "u=1, i",
            "sec-ch-ua": "\"(Not(A:Brand\";v=\"99\", \"Opera\";v=\"115\", \"Chromium\";v=\"133\"",
            "sec-ch-ua-full-version-list": "\"(Not(A:Brand\";v=\"99.0.0.0\", \"Opera\";v=\"115\", \"Chromium\";v=\"133\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": "\"Windows\"",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
            "sec-gpc": "1",
            "x-requested-with": "XMLHttpRequest",
            "cookie": "PHPSESSID=f59aflbfgapr6asufr1drs2ogh",
            "Referer": embedLink,            
            "Referrer-Policy": "strict-origin-when-cross-origin"

        },
        "body": "csrf=aabe81f7bd10a6ab3e9f99911dd8da59&token=03AFcWeA7KHZP9YWA4oSluRsK-dEKlM91hX49vm7DoRpdUakMX8j-4YG0cexvEewH0RETaK1IfbLz84052K78FqCRCZAJdX4tg0S1weTlLpOEyjPXevcip78E8vUfGVJJ48coBVrkUZ-G8DXRrF2E3fCWpshvisTGqUzRa4TOYVuh7QdZ_xn9Y6Dluge1tSfN3_ZnWHrCxCxx7Ujsy4jeaycbijDyrZ75JatZARBsyJ-nNjsL6KNGsZl3KZ0UE5Fo8Jn-KyHXvsLtPHVX4FjjB4y-vwSIX7HlgVx3qA-SWyKGaqytBw0ccw7a7kcO7ICFXReeMLL8d0E9wGsj_CjqTHlvMeQq_e3igX-Bk8XuQnZgU3RmW77uP404zuvXOeYWgrx_naTZIDkBAPR9b39xoOeqY-lc9VbrgnW88HKFNzvZPLFLkQjItRYgvdf_Tk9HPH-JdWqiNKlU6Fsnskl9Ep7nxXFFAT18oYrVhD61JKY5OraDljHiFd-N-IeUmjhN37u3A5uGk6AiU3Wv-XvMUSM1gvONGzwl8HzF5mR_ETpKlurLdZSt_2vCmg8otB7vB_kUhUJFTb4kJdXXQnxLsPjuRW7hyq9wVEf5SLy21-uzocT_RQcDEZMLmmThf-hnTxozYzUvozLR6sNPpldrFj34HgKuhj2RXjGJcdCOm4Tc3kZMNKl9eVYDHTQr8cLTunPG4TB0pKOzfppUlMHHKzmnptWNevdatH-zZDwfCUVUeMfJl2i2jhGaicG-v8eKjYRgb5tX7Lg7Wb4d1tsgHOlOLKNdL6RYcu6UmPvEGmXv35QD2hlTT6uv0jQkID-4-sZ401g3Y3nJfAa3wB43arc00Qr_Yg5fwgLJgb5oizqP5FzkU_thueTitEtiovZBbYYVRvVWRbmVsYUxL9b7_1JRGu4SAnDE-wQ&a=genticket",
        "method": "POST"
    });
}