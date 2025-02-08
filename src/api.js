import {
    makeProviders,
    makeStandardFetcher,
    nepuScraper,
    targets
} from './providers/all_(vidsrcicu)/movie-web-providers.js';
import { getEmbedsu } from './providers/embedsu/embedsu.js';
import {getNepu} from "./providers/nepu/nepu.js";

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
    let vidSrcIcu;
    let nepu;
    
    try {
        embedsu = await getEmbedsu(id);
        vidSrcIcu = await providers.runAll({media});
        nepu = await getNepu(media);
    } catch (e) {
        console.log(e);
    }
    
    const sources = [];

    if (!embedsu instanceof Error) sources.push(embedsu);
    if ((!vidSrcIcu instanceof Error) || vidSrcIcu !== null) sources.push({VidSrcIcu: vidSrcIcu});
    if ((!nepu instanceof Error) || nepu !== null) sources.push({nepu});
    
    let data = formatResponse({sources});

    if (data.length === 0) {
        return new Error('No sources found :(');
    }
    
    return {
        data
    };
}

export async function getTv(media, s, e) {
    const id = media.tmdbId;
    const season = s;
    const episode = e;
    
    let embedsu;
    let vidSrcIcu;
    let nepu;
    
    try {
        embedsu = await getEmbedsu(id, season, episode);
        vidSrcIcu = await providers.runAll({media});
        nepu = await getNepu(media, season, episode);
    } catch (e) {
        console.log(e);
    }
    
    const sources = [];
    
    if (!embedsu instanceof Error) sources.push(embedsu);
    if ((!vidSrcIcu instanceof Error) || !vidSrcIcu === null) sources.push({VidSrcIcu: vidSrcIcu});
    if (!nepu instanceof Error) sources.push({nepu});
    
    if (sources.length === 0) {
        return new Error('No sources found :(');
    }
    
    let data = formatResponse({sources});
    
    return {
        data
    };
    
}

function formatResponse(data) {
    const sources = [];
    const subtitles = [];

    // Mapping for language codes to friendly names
    const languageMap = {
        en: "English",
        es: "Spanish",
        fr: "French",
        de: "German",
        it: "Italian",
        pt: "Portuguese",
        ru: "Russian",
        zh: "Chinese",
        ja: "Japanese",
        ko: "Korean",
        ar: "Arabic",
        hi: "Hindi",
        bn: "Bengali",
        ur: "Urdu",
        vi: "Vietnamese",
        th: "Thai",
        tr: "Turkish",
        pl: "Polish",
        nl: "Dutch",
        sv: "Swedish",
        da: "Danish",
        fi: "Finnish",
        no: "Norwegian",
        el: "Greek",
        he: "Hebrew",
        hu: "Hungarian",
        cs: "Czech",
        sk: "Slovak",
        uk: "Ukrainian",
        ro: "Romanian",
        bg: "Bulgarian",
        sr: "Serbian",
        hr: "Croatian",
        sl: "Slovenian",
        id: "Indonesian",
        ms: "Malay",
        tl: "Tagalog",
        fa: "Persian",
        sw: "Swahili",
        am: "Amharic",
        ta: "Tamil",
        te: "Telugu",
        kn: "Kannada",
        ml: "Malayalam",
        mr: "Marathi",
        pa: "Punjabi",
        gu: "Gujarati",
        or: "Odia",
        my: "Burmese",
        km: "Khmer",
        lo: "Lao",
        si: "Sinhala",
        uz: "Uzbek",
        kk: "Kazakh",
        ky: "Kyrgyz",
        mn: "Mongolian",
        az: "Azerbaijani",
        tg: "Tajik",
        ka: "Georgian",
        hy: "Armenian",
        is: "Icelandic",
        ga: "Irish",
        af: "Afrikaans",
        zu: "Zulu",
        xh: "Xhosa",
        st: "Sesotho",
        ts: "Tsonga",
        ve: "Venda",
        tn: "Tswana",
        ny: "Chichewa",
        so: "Somali",
        yo: "Yoruba",
        ig: "Igbo",
        ha: "Hausa",
        swc: "Congo Swahili",
        eu: "Basque",
        ca: "Catalan",
        gl: "Galician",
        gd: "Scottish Gaelic",
        cy: "Welsh",
        br: "Breton",
        co: "Corsican",
        la: "Latin",
        sq: "Albanian",
        mk: "Macedonian",
        bs: "Bosnian",
        mt: "Maltese",
        et: "Estonian",
        lv: "Latvian",
        lt: "Lithuanian",
        tlh: "Klingon",
        yue: "Cantonese",
        jv: "Javanese",
        su: "Sundanese",
        haw: "Hawaiian",
        to: "Tongan",
        mi: "Maori",
        hmn: "Hmong",
        Unknown: "Unknown Language"
    };

    data.sources.forEach(source => {
        if (source.embedsu) {
            const embedSources = source.embedsu.sources.map(file => ({
                file: file.url,
                type: file.url.split('.').pop() === 'm3u8' ? 'hls' : file.url.split('.').pop(),
                quality: atob(file.url.split('/').slice(-2, -1)[0]) + "px",
                lang: "en"
            }));

            sources.push({
                provider: "EmbedSu",
                files: embedSources,
                headers: source.embedsu.headers
            });

            source.embedsu.subtitles.forEach(sub => {
                const friendlyName = sub.lang;
                const langCode = Object.keys(languageMap).find(key => languageMap[key] === friendlyName) || "unknown";

                subtitles.push({
                    url: sub.url,
                    lang: langCode,
                    friendlyName
                });
            });
        }

        if (source.vidSrcIcu && source.vidSrcIcu.stream) {
            const streamFiles = [{
                file: source.vidSrcIcu.stream.playlist,
                type: source.vidSrcIcu.stream.type,
                quality: "unknown",
                lang: "unknown (probably english)"
            }];

            sources.push({
                provider: "VidSrcIcu",
                files: streamFiles,
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
                    "Referer": "https://vidsrc.icu",
                    "Origin": "https://vidsrc.icu"
                }
            });

            source.vidSrcIcu.stream.captions.forEach(caption => {
                const langCode = caption.language;
                const friendlyName = languageMap[langCode] || "Unknown Language";

                subtitles.push({
                    url: caption.url,
                    lang: langCode,
                    friendlyName
                });
            });
        }

        if (source.nepu && source.nepu.stream) {
            const streamFiles = [{
                file: source.nepu.stream.playlist,
                type: source.nepu.stream.type,
                quality: "unknown",
                lang: "unknown (probably english)"
            }];

            sources.push({
                provider: "Nepu",
                files: streamFiles,
                headers: source.nepu.stream.headers
            });

            if (source.nepu.stream.captions && source.nepu.stream.captions.length > 0) {
                source.nepu.stream.captions.forEach(caption => {
                    const langCode = caption.language;
                    const friendlyName = languageMap[langCode] || "Unknown Language";

                    subtitles.push({
                        url: caption.url,
                        lang: langCode,
                        friendlyName
                    });
                });
            }
        }
    });

    return {
        sources,
        subtitles
    };
}