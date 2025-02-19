import {getEmbedsu} from './controllers/providers/EmbedSu/embedsu.js';
import {getTwoEmbed} from "./controllers/providers/2Embed/2embed.js";
import {getAutoembed} from "./controllers/providers/AutoEmbed/autoembed.js";
import {getPrimewire} from "./controllers/providers/PrimeWire/primewire.js";
import {getVidSrcCC} from "./controllers/providers/VidSrcCC/vidsrccc.js";

export async function getMovie(media) {
    const id = media.tmdbId;

    let embedsu;
    let twoEmbed;
    let autoembed;
    let primewire;
    let vidsrcCC;

    try {
        try {
            embedsu = await getEmbedsu(id);
        } catch (e) {
            console.log(e)
        }
        try {
            twoEmbed = await getTwoEmbed(media);
        } catch (e) {
            console.log(e)
        }
        try {
            autoembed = await getAutoembed(media);
        } catch (e) {
            console.log(e)
        }
        try {
            primewire = await getPrimewire(media);
        } catch (e) {
            console.log(e)
        }
        try {
            vidsrcCC = await getVidSrcCC(media);
        } catch (e) {
            console.log(e)
        }
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

    if (autoembed && !(autoembed instanceof Error)) {
        if (autoembed.sources[0].files.length > 0) {
            sources.push(...autoembed.sources);
        }
        if (autoembed.subtitles.length > 0) {
            subtitles.push(...autoembed.subtitles);
        }
    }

    if (primewire && !(primewire instanceof Error)) {
        sources.push(...primewire.sources);
    }

    if (vidsrcCC && !(vidsrcCC instanceof Error)) {
        sources.push(...vidsrcCC.sources);
        subtitles.push(...vidsrcCC.subtitles);
    }

    if (sources.length === 0) {
        return new Error('No sources found :(');
    }

    // make sure that there are no duplicate subtitles
    const subtitleUrls = new Set();
    const uniqueSubtitles = [];

    subtitles.forEach(sub => {
        if (sub.url && !subtitleUrls.has(sub.url)) {
            subtitleUrls.add(sub.url);
            uniqueSubtitles.push(sub);
        }
    });

    return {
        sources,
        subtitles: uniqueSubtitles
    };
}

export async function getTv(media, s, e) {
    const id = media.tmdbId;
    const season = s;
    const episode = e;

    let embedsu;
    let twoEmbed;
    let autoembed;
    let vidsrcCC;

    try {
        try {
            embedsu = await getEmbedsu(id, season, episode);
        } catch (e) {
            console.log(e)
        }
        try {
            twoEmbed = await getTwoEmbed(media);
        } catch (e) {
            console.log(e)
        }
        try {
            autoembed = await getAutoembed(media);
        } catch (e) {
            console.log(e)
        }
        try {
            vidsrcCC = await getVidSrcCC(media);
        } catch (e) {
            console.log(e)
        }
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

    if (autoembed && !(autoembed instanceof Error)) {
        sources.push(...autoembed.sources);
        subtitles.push(...autoembed.subtitles);
    }

    if (vidsrcCC && !(vidsrcCC instanceof Error)) {
        sources.push(...vidsrcCC.sources);
        subtitles.push(...vidsrcCC.subtitles);
    }

    if (sources.length === 0) {
        return new Error('No sources found :(');
    }

    return {
        sources,
        subtitles
    };
}