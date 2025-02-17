import axios from "axios";
import * as cheerio from "cheerio";
import * as crypto from "crypto";
import fetch from "node-fetch";
import * as url from "node:url";
import {THROW} from "hls-parser/utils.js";

const URL = "https://www.primewire.tf";
const DS_KEY = "JyjId97F9PVqUPuMO0";

export async function getPrimewire(info) {
    if (!info.imdbId) {
        return null;
    }

    const link = await lookupPage(info);
    const servers = await loadServers(link);
    const embeddableServers = await Promise.all(servers.map(async server => {
        if (server.includes("mixdrop") || server.includes("mxdrop")) {
            return await getEmbedLinkForMixDrop(server);
        } else if (server.includes("streamtape")) {
            return await getStreamtapeUrl(server);
        } else {
            return {videoLink: server, quality: "unknown", type: "embed"};
        }
    }));

    const files = embeddableServers
        .filter(embedLink => embedLink.videoLink)
        .map(embedLink => ({
            file: embedLink.videoLink,
            type: embedLink.type,
            quality: embedLink.quality || "unknown",
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
    if (!link) return new Error("[primewire] No link found");

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

async function getEmbedLinkForMixDrop(server) {
    let website = await fetch(server);
    website = await website.text();
    let $ = cheerio.load(website);
    if (!$("textarea").length) {
        return null;
    }
    let embedLink = $("textarea").text().match(/src="(.+?)"/)[1];
    let title = $(".title").text();
    let quality = title.match(/.(\d+p)./)[1];
    let videoLink = await getVideoFromEmbed(embedLink, quality);
    return {videoLink, quality};
}

async function getVideoFromEmbed(embedLink) {
    // not working yet. will have to change it later. (makes a post request with "download" as body and csrf token as header :( )
    let hostname = embedLink.match(/https?:\/\/([^\/]+)/)[1];
    if (hostname !== "mxdrop.to") {
        return embedLink;
    }
    embedLink = embedLink.replace("mixdrop.ps/e", "mixdrop.ps/f");
    let $ = cheerio.load(await (await fetch(embedLink)).text());
    
    // make post request with csrf token, token (from google captcha :( ) and a=genticket
    let csrfToken = $("meta[name=csrf]").attr("content");
    
    let downloadLink = await $("a.btn.btn3.download-btn").attr("href");
    if (!downloadLink) {
        return embedLink;
    }
    return downloadLink;
}

async function getStreamtapeUrl(url) {
    try {
        
        let hostname = url.match(/https?:\/\/([^\/]+)/)[1];
        const response = await fetch(url);

        const html = await response.text();

        const urlRegex =
            /document\.getElementById\('norobotlink'\)\.innerHTML = (.*);/;
        const urlMatch = html.match(urlRegex);
        if (!urlMatch) throw new Error("norobotlink url not found");

        const tokenRegex = /token=([^&']+)/;
        const tokenMatch = urlMatch[1].match(tokenRegex);
        if (!tokenMatch) throw new Error("token not found");

        const fullUrlRegex =
            /<div id="ideoooolink" style="display:none;">(.*)<[/]div>/;
        const fullUrlMatch = html.match(fullUrlRegex);
        if (!fullUrlMatch) throw new Error("ideoooolink url not found");

        let finalUrl = fullUrlMatch[1].split(hostname)[1];
        finalUrl = `https://${hostname}${finalUrl}&token=${tokenMatch[1]}`;

        const titleRegex = /<meta name="og:title" content="(.*)">/;
        const titleMatch = html.match(titleRegex);
        let quality = titleMatch[1].match(/.(\d+)p./)[1];

        return {
            videoLink: finalUrl + "&dl=1",
            quality: quality + 'p',
            type: "direct"
        };
    } catch (error) {
        return {
            videoLink: url,
            quality: "unknown",
            type: "embed"
        }
    }
}
