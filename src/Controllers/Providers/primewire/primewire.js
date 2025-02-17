import axios from "axios";
import * as cheerio from "cheerio";
import * as crypto from "crypto";
import fetch from "node-fetch";
import * as worker_threads from "node:worker_threads";

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
    return await getVideoFromEmbed(embedLink);
}

async function getVideoFromEmbed(embedLink) {
    // not working yet. will have to change it later. (makes a post request with "download" as body and csrf token as header :( )
    let hostname = embedLink.match(/https?:\/\/([^\/]+)/)[1];
    if (hostname !== "mxdrop.to") {
        return embedLink;
    }
    embedLink = embedLink.replace("mixdrop.ps/e", "mixdrop.ps/f");
    let $ = cheerio.load(await (await fetch(embedLink)).text());
    // await $("a.btn.btn3.download-btn").click();
    let downloadLink = await $("a.btn.btn3.download-btn").attr("href");
    if (!downloadLink) {
        return embedLink;
    }
    return downloadLink;
}