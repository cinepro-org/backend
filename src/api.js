import {getEmbedsu} from './controllers/providers/EmbedSu/embedsu.js';
import {getNepu} from "./controllers/providers/Nepu/nepu.js";
import {getTwoEmbed} from "./controllers/providers/2Embed/2embed.js";
import {getVidSrc} from "./controllers/providers/VidSrc/vidsrc.js";
import {getAutoembed} from "./controllers/providers/AutoEmbed/autoembed.js";
import {getPrimewire} from "./controllers/providers/PrimeWire/primewire.js";
import {getBstrsrIn} from "./controllers/providers/BstSrsIn/bstsrsin.js";
import {getVidSrcCC} from "./controllers/providers/VidSrcCC/vidsrccc.js";

export async function getMovie(media) {
    const id = media.tmdbId;

    let embedsu;
    let twoEmbed;
    let nepu;
    let vidsrc;
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
            nepu = await getNepu(media);
        } catch (e) {
            console.log(e)
        }
        try {
            vidsrc = await getVidSrc(media);
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

    if (nepu && !(nepu instanceof Error)) {
        sources.push(...nepu.sources);
        subtitles.push(...nepu.subtitles);
    }

    if (vidsrc && !(vidsrc instanceof Error)) {
        sources.push(vidsrc);
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
    let nepu;
    let vidsrc;
    let autoembed;
    let bstsrsin;
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
            nepu = await getNepu(media, season, episode);
        } catch (e) {
            console.log(e)
        }
        try {
            vidsrc = await getVidSrc(media, season, episode);
        } catch (e) {
            console.log(e)
        }
        try {
            autoembed = await getAutoembed(media);
        } catch (e) {
            console.log(e)
        }
        try {
            bstsrsin = await getBstrsrIn(media);
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

    if (nepu && !(nepu instanceof Error)) {
        sources.push(...nepu.sources);
        subtitles.push(...nepu.subtitles);
    }

    if (vidsrc && !(vidsrc instanceof Error)) {
        sources.push(vidsrc);
    }

    if (autoembed && !(autoembed instanceof Error)) {
        sources.push(...autoembed.sources);
        subtitles.push(...autoembed.subtitles);
    }

    if (bstsrsin && !(bstsrsin instanceof Error)) {
        sources.push(...bstsrsin.sources);
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