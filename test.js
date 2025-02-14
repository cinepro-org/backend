import axios from "axios";
import * as cheerio from "cheerio";

const URL = "https://www.primewire.tf";
const DS_KEY = "JyjId97F9PVqUPuMO0";

export async function extract(info) {
    if (!info.imdbId) {
        return [];
    }

    const link = await lookupPage(info);
    const servers = await loadServers(link);

    const sources = await Promise.all(servers.map((server, idx) => loadServerSources(server, idx)));
    return sources.flat().filter(Boolean);
}

async function lookupPage(info) {
    const imdbId = info.imdbId;
    const ds = sha1Hex(`${imdbId}${DS_KEY}`).slice(0, 10);

    const response = await axios.get(`${URL}/filter`, { params: { s: imdbId, ds } });
    const $ = cheerio.load(response.data);

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

    const response = await axios.get(link);
    const $ = cheerio.load(response.data);

    const data = $("#user-data").attr("v");
    if (!data) {
        console.error("[primewire] No link encryption data found");
        return [];
    }

    const links = decryptLinks(data);
    return $(".movie_version").map((_, el) => {
        const element = $(el);
        const linkVersion = parseInt(element.find(".go-link").attr("link_version"), 10);
        const name = element.find(".version-host").text().trim();
        const linkSuffix = links[linkVersion];
        return { name, link: `${URL}/links/go/${linkSuffix}` };
    }).get();
}

async function loadServerSources(server, idx) {
    const { name, link } = server;
    const displayName = `${idx}. ${name}`;

    try {
        const response = await axios.get(link, { maxRedirects: 0 });
        const location = response.headers.location;

        if (!location) {
            console.warn(`[primewire] No location header for link: ${link}`);
            return null;
        }

        if (name === "streamwish.to" || name === "filelions.to") {
            return await extractStreamWish(location, link, displayName);
        }
    } catch (error) {
        console.error(`[primewire] ${name} failed to load source link (server: ${link}):`, error);
    }
    return null;
}

async function extractStreamWish(url, refUrl, sourceName) {
    try {
        const response = await axios.get(url, { headers: { Referer: refUrl } });
        return [{ link: url, description: sourceName, headers: { Referer: refUrl } }];
    } catch (error) {
        console.error("Stream extraction failed:", error);
        return [];
    }
}

function sha1Hex(str) {
    // Placeholder for SHA-1 hash function implementation
    return "dummyhashvalue"; // Replace with actual SHA-1 hashing
}

function decryptLinks(data) {
    // Placeholder for decryption logic
    return data.match(/.{1,5}/g) || [];
}

(async () => {
    try {
        const result = await extract({ imdbId: "tt0944947", type: "tv", season: 1, episode: 1 });
        console.log(result);
    } catch (error) {
        console.error("Error:", error);
    }
})();