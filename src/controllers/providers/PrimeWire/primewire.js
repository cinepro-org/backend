import axios from 'axios';
import * as cheerio from 'cheerio';
import * as crypto from 'crypto';
import fetch from 'node-fetch';
import { extract } from '../../../utils/Extractor.js';
import { ErrorObject } from '../../../helpers/ErrorObject.js';

const URL = 'https://www.primewire.tf';
const DS_KEY = 'JyjId97F9PVqUPuMO0';

export async function getPrimewire(media) {
    if (!media.imdb) {
        return new ErrorObject(
            'Primewire requires an IMDB ID',
            'Primewire',
            500,
            'Please provide an IMDB ID from the tmdb.js file',
            true,
            true
        );
    }

    const link = await lookupPage(media);
    if (link instanceof ErrorObject) {
        console.log('[Primewire] Lookup returned error:', link);
        return link;
    }
    console.log(`[Primewire] Found page: ${link}`);

    const servers = await loadServers(link);
    if (servers instanceof ErrorObject) {
        console.log('[Primewire] loadServers returned error:', servers);
        return servers;
    }
    console.log(`[Primewire] Found ${servers.length} servers`);

    const embeddableServers = await Promise.all(
        servers.map(async (server, i) => {
            console.log(`[Primewire] Extracting server ${i + 1}:`, server);
            const result = await extract(server);
            if (result instanceof ErrorObject) {
                console.log(
                    `[Primewire] Extract failed for server ${i + 1}:`,
                    result
                );
                return result;
            }
            return result;
        })
    );

    const files = embeddableServers
        .filter((embedLink) => embedLink && embedLink.file)
        .map((embedLink) => ({
            file: embedLink.file,
            type: embedLink.type,
            lang: 'en',
            ...(embedLink.headers && { headers: embedLink.headers })
        }));

    console.log(`[Primewire] Extracted ${files.length} files`);

    return {
        files,
        subtitles: []
    };
}

async function lookupPage(info) {
    const imdbId = info.imdb;
    const ds = sha1Hex(`${imdbId}${DS_KEY}`).slice(0, 10);
    console.log(`[Primewire] Lookup: imdb=${imdbId}, ds=${ds}`);

    try {
        const response = await axios.get(`${URL}/filter`, {
            params: { s: imdbId, ds }
        });
        const $ = cheerio.load(response.data);
        const originalLink = $(
            '.index_container .index_item.index_item_ie a'
        ).attr('href');
        console.log(`[Primewire] Original link: ${originalLink}`);

        if (!originalLink) {
            return new ErrorObject(
                `No search results found for IMDB ID: ${imdbId}`,
                'Primewire',
                404,
                'Ensure the IMDB ID is correct or the content exists on Primewire.',
                true,
                true
            );
        }

        return info.type === 'tv'
            ? `${URL}${originalLink.replace('-', '/', 1)}-season-${info.season}-episode-${info.episode}`
            : `${URL}${originalLink}`;
    } catch (error) {
        console.error(`[Primewire] lookupPage error: ${error.message}`);
        return new ErrorObject(
            `Error fetching data for IMDB ID: ${imdbId}`,
            'Primewire',
            500,
            "Check the network connection or Primewire's availability.",
            true,
            true
        );
    }
}

async function loadServers(link) {
    try {
        console.log(`[Primewire] Loading servers from ${link}`);
        let website = await fetch(link);
        website = await website.text();

        const urls = Array.from(
            website.matchAll(/class="go-link[^"]*"[^>]*key="([^"]+)"/g)
        ).map((match, i) => {
            const idx = match[1];
            const url = `https://primewire.tf/links/gos/${idx}`;
            console.log(`[Primewire] Match ${i + 1}: idx=${idx}, url=${url}`);
            return { url, idx };
        });

        console.log(`[Primewire] Found ${urls.length} server candidates`);

        const embeds = [];
        for (const item of urls) {
            try {
                embeds.push(await fromPrimewireToProvider(item));
            } catch (err) {
                console.log(
                    `[Primewire] Failed extracting from ${item.url}: ${err.message}`
                );
            }
        }
        console.log(`[Primewire] Found ${embeds.length} servers`);
        return embeds;
    } catch (error) {
        return new ErrorObject(
            `Error loading servers for link: ${link}`,
            'Primewire',
            500,
            "Check the link or Primewire's server response.",
            true,
            true
        );
    }
}

function sha1Hex(str) {
    return crypto.createHash('sha1').update(str).digest('hex');
}

async function fromPrimewireToProvider(primwireObject) {
    console.log(`[Primewire] Fetching provider for idx=${primwireObject.idx}`);
    const response = await axios.get(primwireObject.url);

    let javascriptfile = response.data.match(
        /<script async type="text\/javascript" src="\/js\/app-(.+?)\">/
    );
    if (javascriptfile) {
        javascriptfile = javascriptfile[1];
        console.log(`[Primewire] Found JS file: app-${javascriptfile}`);

        const jsfiledata = await axios.get(
            `https://primewire.tf/js/app-${javascriptfile}`
        );
        let token = jsfiledata.data.match(
            /return Object\(r\.useEffect\)\(\(function\(\)\{var t,n;t="(.+?)"/
        );
        if (token) {
            token = token[1];
            console.log(`[Primewire] Extracted token: ${token}`);
        }

        let mediaobject = await axios.get(
            `https://primewire.tf/links/go/${primwireObject.idx}?token=${token}&embed=true`
        );
        console.log(
            `[Primewire] Media link for idx=${primwireObject.idx}: ${mediaobject.data.link}`
        );
        return mediaobject.data.link;
    }

    console.error(
        `[Primewire] Failed extracting provider for idx=${primwireObject.idx}`
    );
    throw new ErrorObject(
        'Failed to extract media link from Primewire',
        'Primewire',
        500,
        "Check the response format or Primewire's availability.",
        true,
        true
    );
}
