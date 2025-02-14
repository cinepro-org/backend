import {
    makeProviders,
    makeStandardFetcher,
    targets
} from './Controllers/Providers/all_(vidsrcicu)/movie-web-providers.js';
import { getEmbedsu } from './Controllers/Providers/embedsu/embedsu.js';
import { getNepu } from "./Controllers/Providers/nepu/nepu.js";
import { getTwoEmbed } from "./Controllers/Providers/2embed/2embed.js";

const providers = makeProviders({
    fetcher: makeStandardFetcher(fetch),
    target: targets.ANY // check out https://movie-web.github.io/providers/essentials/targets
})

/*
* 
* Response should follow this format:
* 
let response = {
    sources: [{
        "provider": "providerName",
        "files": [
            {
                "file": "fileUrl",
                "type": "fileType",
                "quality": "fileQuality",
                "lang": "fileLanguage"
            }
        ],
        "headers": {
            "Referer": "refererUrl",
            "User-Agent": "userAgent",
            "Accept": "accept"
        }
    }],
    subtitles: [{
        "url": "subtitleUrl",
        "lang": "subtitleLanguage",
        "friendlyName": "subtitleFriendlyName"
    }]
} 
*/

export async function getMovie(media) {
    const id = media.tmdbId;

    let embedsu;
    let twoEmbed;
    let nepu;

    try {
        try {embedsu = await getEmbedsu(id);} catch (e) {console.log(e)}
        try {twoEmbed = await getTwoEmbed(media);} catch (e) {console.log(e)}
        try {nepu = await getNepu(media);} catch (e) {console.log(e)}
    } catch (e) {
        console.error(e);
    }

    const sources = [];
    const subtitles = [];

    if (embedsu && !(embedsu instanceof Error)) {
        sources.push(...embedsu.sources);
        subtitles.push(...embedsu.subtitles);
    }

    if (twoEmbed && !(twoEmbed instanceof Error)) {
        sources.push(...twoEmbed.sources);
        subtitles.push(...twoEmbed.subtitles);
    }
    
    if (nepu && !(nepu instanceof Error)) {
        sources.push(...nepu.sources);
        subtitles.push(...nepu.subtitles);
    }

    if (sources.length === 0) {
        return new Error('No sources found :(');
    }

    return {
        sources,
        subtitles
    };
}

export async function getTv(media, s, e) {
    const id = media.tmdbId;
    const season = s;
    const episode = e;

    let embedsu;
    let twoEmbed;
    let nepu;

    try {
        try {embedsu = await getEmbedsu(id, season, episode);} catch (e) {console.log(e)}
        try {twoEmbed = await getTwoEmbed({ tmdbId: id, type: "tv", season, episode });} catch (e) {console.log(e)}
        try {nepu = await getNepu(media, season, episode);} catch (e) {console.log(e)}
    } catch (e) {
        console.log(e);
    }

    const sources = [];
    const subtitles = [];

    if (embedsu && !(embedsu instanceof Error)) {
        sources.push(...embedsu.sources);
        subtitles.push(...embedsu.subtitles);
    }

    if (twoEmbed && !(twoEmbed instanceof Error)) {
        sources.push(...twoEmbed.sources);
        subtitles.push(...twoEmbed.subtitles);
    }

    if (nepu && !(nepu instanceof Error)) {
        sources.push(...nepu.sources);
        subtitles.push(...nepu.subtitles);
    }

    if (sources.length === 0) {
        return new Error('No sources found :(');
    }

    return {
        sources,
        subtitles
    };
}