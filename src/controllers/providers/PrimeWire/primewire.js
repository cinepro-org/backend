import axios from "axios";
import * as cheerio from "cheerio";
import * as crypto from "crypto";
import fetch from "node-fetch";

const URL = "https://www.primewire.tf";
const DS_KEY = "JyjId97F9PVqUPuMO0";

export async function getPrimewire(info) {
    if (!info.imdb) {
        return null;
    }

    const link = await lookupPage(info);
    const servers = await loadServers(link);
    const embeddableServers = await Promise.all(servers.map(async server => {
        if (server.includes("mixdrop") || server.includes("mxdrop")) {
            return await doStuffWithMixdrop(server);
        } else if (server.includes("streamtape")) {
            return await getStreamtapeUrl(server);
        } else {
            return {videoLink: server, type: "embed"};
        }
    }));

    const files = embeddableServers
        .filter(embedLink => embedLink.videoLink)
        .map(embedLink => ({
            file: embedLink.videoLink,
            type: embedLink.type,
            lang: "en",
            ...(embedLink.headers && {headers: embedLink.headers})
        }));
    

    return {
        files: files.map(file => {
            const result = {
                file: file.file,
                type: file.type,
                lang: file.lang
            };
            if (file.headers) {
                result.headers = file.headers;
            }
            return result;
        }),
        subtitles: []
    };
}

async function lookupPage(info) {
    const imdbId = info.imdb;
    const ds = sha1Hex(`${imdbId}${DS_KEY}`).slice(0, 10);

    let $;
    try {
        const response = await axios.get(`${URL}/filter`, {params: {s: imdbId, ds}});
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
    if (!link) return new Error("[PrimeWire] No link found");

    let website = await fetch(link);
    website = await website.text();
    let urls = [];
    for (const match of website.matchAll(/data-wp-menu="(.+?)"/g)) {
        urls.push({url: `https://primewire.tf/links/go/${match[1]}`, idx: match[1]});
    }

    try {
            let embeds = [];
            for (const item of urls) {
                let response = await axios.get(item.url);
                let location = "https://" + response.request.host + response.request.path;
                embeds.push(location)
            }
            return embeds;
    } catch (error) {
            return new Error(error);
    }
}

function sha1Hex(str) {
    return crypto.createHash('sha1').update(str).digest('hex');
}

async function doStuffWithMixdrop(server) {
    // get the internal id https://mixdrop.ps/e/internalId
    let data = await getMixdropVideoViaInternalId(server.split("/").pop());
    if (data instanceof Error) {
        return {videoLink: server, type: "embed"};
    }

    return {
        videoLink: data.url,
        type: "mp4",
        headers: data.headers
    }
}

const getMixdropVideoViaInternalId = async (id) => {
    const resp = await fetch("https://mixdrop.ps/e/" + id);
    var cookie = resp.headers.get('set-cookie').split(',')[0];
    const [csrf, evalFun] = await resp
        .text()
        .then((r) => [
            r.match(/['"]csrf['"]\s*content=['"](.*?)['"]/)[1],
            new Function('return ' + /(eval)(\(function[\s\S]*?)(<\/script>)/s.exec(r)[2].replace("eval", ""))()
        ]);

    let url = evalFun.match(/MDCore.wurl=['"](.*?)['"]/)[1];
    let referer = evalFun.match(/MDCore.referrer=['"](.*?)['"]/)[1].trim();

    const r2 = await fetch("https://mixdrop.ps/e/" + id, {
        method: "POST",
        body: `referrer=&adblock=0&csrf=${csrf}&a=count`,
        headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
            cookie: cookie,
            Referer: "https://mixdrop.ps/e/" + id,
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        },
    });
    try {
        if (!r2.ok) {
            throw new Error("Failed to get video link");
        }
    } catch (error) {
        throw error;
    }
    const json = await r2.json();

    return {
        url: url.startsWith("http") ? url : "http:" + url,
        headers: {
            cookie: cookie,
            Referer: referer.length > 0 ? referer : "https://mixdrop.ps/",
        },
    };
};

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
        
        let fetchUrl = await fetch(finalUrl, {
            referrer: url,
        });
        // fetchUrl should return a 302 redirect to the actual video
        finalUrl = fetchUrl.url;
        
        if (!finalUrl) throw new Error("Failed to get video link");
        
        return {
            videoLink: finalUrl,
            type: "mp4"
        };
    } catch (error) {
        return {
            videoLink: url,
            type: "embed"
        }
    }
}
