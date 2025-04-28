import {getEmbedsu} from "./controllers/providers/EmbedSu/embedsu.js";
import {getTwoEmbed} from "./controllers/providers/2Embed/2embed.js";
import {getAutoembed} from "./controllers/providers/AutoEmbed/autoembed.js";
import {getPrimewire} from "./controllers/providers/PrimeWire/primewire.js";
import {getVidSrcCC} from "./controllers/providers/VidSrcCC/vidsrccc.js";
import {getVidSrc} from "./controllers/providers/VidSrc/VidSrc.js";
import {getVidSrcSu} from "./controllers/providers/VidSrcSu/VidSrcSu.js";
import {getVidSrcVip} from "./controllers/providers/VidSrcVip/VidSrcVip.js";
import {getXprime} from "./controllers/providers/xprime/xprime.js";
import dotenv from 'dotenv';

dotenv.config();
const shouldDebug = process.env.DEBUG.toLowerCase() === "true" || process.env.DEBUG === "1";

export async function getMovie(media) {
    const providers = [
        {name: "embedsu", fn: () => getEmbedsu(media.tmdb)},
        {name: "twoEmbed", fn: () => getTwoEmbed(media)},
        {name: "autoembed", fn: () => getAutoembed(media)},
        {name: "primewire", fn: () => getPrimewire(media)},
        {name: "vidsrcCC", fn: () => getVidSrcCC(media)},
        {name: "vidsrc", fn: () => getVidSrc(media)},
        {name: "vidsrcSu", fn: () => getVidSrcSu(media)},
        {name: "vidsrcVip", fn: () => getVidSrcVip(media)},
        {name: "xprime", fn: () => getXprime(media)},
    ];

    const results = await Promise.all(
        providers.map(async (provider) => {
            try {
                return {name: provider.name, data: await provider.fn()};
            } catch (e) {
                console.log(e);
                return {name: provider.name, data: null};
            }
        })
    );

    const files = [];
    const subtitles = [];

    results.forEach(({data}) => {
        if (data && !(data instanceof Error)) {
            files.push(...data.files);
            subtitles.push(...data.subtitles);
        } else if (shouldDebug && data instanceof Error) {
            console.error(data);
        }
    });

    // Remove duplicate subtitles
    const subtitleUrls = new Set();
    const uniqueSubtitles = subtitles.filter((sub) => {
        if (sub.url && !subtitleUrls.has(sub.url)) {
            subtitleUrls.add(sub.url);
            return true;
        }
        return false;
    });

    // Remove duplicate files
    const fileUrls = new Set();
    const uniqueFiles = files.filter((file) => {
        if (typeof file.file === "string" && !fileUrls.has(file.file)) {
            if (file.file.includes("https://")) {
                fileUrls.add(file.file);
                return true;
            }
        }
        return false;
    });

    return {
        files: uniqueFiles,
        subtitles: uniqueSubtitles,
    };
}

export async function getTv(media, s, e) {
    const id = media.tmdb;
    const season = s;
    const episode = e;

    let embedsu;
    let twoEmbed;
    let autoembed;
    let primewire;
    let vidsrcCC;
    let vidsrc;
    let vidsrcSu;

    try {
        embedsu = await getEmbedsu(id, season, episode);
    } catch (e) {
        console.log(e);
    }
    try {
        twoEmbed = await getTwoEmbed(media);
    } catch (e) {
        console.log(e);
    }
    try {
        autoembed = await getAutoembed(media);
    } catch (e) {
        console.log(e);
    }
    try {
        primewire = await getPrimewire(media);
    } catch (e) {
        console.log(e);
    }
    try {
        vidsrcCC = await getVidSrcCC(media);
    } catch (e) {
        console.log(e);
    }
    try {
        vidsrc = await getVidSrc(media);
    } catch (e) {
        console.log(e);
    }
    try {
        vidsrcSu = await getVidSrcSu(media);
    } catch (e) {
        console.log(e);
    }

    const files = [];
    const subtitles = [];

    [embedsu, twoEmbed, autoembed, primewire, vidsrcCC, vidsrc, vidsrcSu].forEach(
        (provider) => {
            if (provider && !(provider instanceof Error)) {
                files.push(...provider.files);
                subtitles.push(...provider.subtitles);
            }
        }
    );

    if (files.length === 0) {
        return new Error("No sources found :(");
    }

    // make sure that there are no duplicate subtitles
    const subtitleUrls = new Set();
    const uniqueSubtitles = [];

    subtitles.forEach((sub) => {
        if (sub.url && !subtitleUrls.has(sub.url)) {
            subtitleUrls.add(sub.url);
            uniqueSubtitles.push(sub);
        }
    });

    return {
        files,
        subtitles: uniqueSubtitles,
    };
}
