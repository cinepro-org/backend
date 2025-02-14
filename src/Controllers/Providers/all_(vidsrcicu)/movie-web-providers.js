import ISO6391 from "iso-639-1";
import { customAlphabet } from "nanoid";
import * as unpacker from "unpacker";
import { unpack } from "unpacker";
import CryptoJS from "crypto-js";
import { load } from "cheerio";
import FormData from "form-data";
import cookie from "cookie";
import setCookieParser from "set-cookie-parser";
import { parse, stringify } from "hls-parser";
class NotFoundError extends Error {
    constructor(reason) {
        super(`Couldn't find a stream: ${reason ?? "not found"}`);
        this.name = "NotFoundError";
    }
}
function formatSourceMeta(v) {
    const types = [];
    if (v.scrapeMovie) types.push("movie");
    if (v.scrapeShow) types.push("show");
    return {
        type: "source",
        id: v.id,
        rank: v.rank,
        name: v.name,
        mediaTypes: types
    };
}
function formatEmbedMeta(v) {
    return {
        type: "embed",
        id: v.id,
        rank: v.rank,
        name: v.name
    };
}
function getAllSourceMetaSorted(list) {
    return list.sources.sort((a, b) => b.rank - a.rank).map(formatSourceMeta);
}
function getAllEmbedMetaSorted(list) {
    return list.embeds.sort((a, b) => b.rank - a.rank).map(formatEmbedMeta);
}
function getSpecificId(list, id) {
    const foundSource = list.sources.find((v) => v.id === id);
    if (foundSource) {
        return formatSourceMeta(foundSource);
    }
    const foundEmbed = list.embeds.find((v) => v.id === id);
    if (foundEmbed) {
        return formatEmbedMeta(foundEmbed);
    }
    return null;
}
function makeFullUrl(url, ops) {
    let leftSide = (ops == null ? void 0 : ops.baseUrl) ?? "";
    let rightSide = url;
    if (leftSide.length > 0 && !leftSide.endsWith("/")) leftSide += "/";
    if (rightSide.startsWith("/")) rightSide = rightSide.slice(1);
    const fullUrl = leftSide + rightSide;
    if (!fullUrl.startsWith("http://") && !fullUrl.startsWith("https://") && !fullUrl.startsWith("data:"))
        throw new Error(`Invald URL -- URL doesn't start with a http scheme: '${fullUrl}'`);
    const parsedUrl = new URL(fullUrl);
    Object.entries((ops == null ? void 0 : ops.query) ?? {}).forEach(([k, v]) => {
        parsedUrl.searchParams.set(k, v);
    });
    return parsedUrl.toString();
}
function makeFetcher(fetcher) {
    const newFetcher = (url, ops) => {
        return fetcher(url, {
            headers: (ops == null ? void 0 : ops.headers) ?? {},
            method: (ops == null ? void 0 : ops.method) ?? "GET",
            query: (ops == null ? void 0 : ops.query) ?? {},
            baseUrl: (ops == null ? void 0 : ops.baseUrl) ?? "",
            readHeaders: (ops == null ? void 0 : ops.readHeaders) ?? [],
            body: ops == null ? void 0 : ops.body,
            credentials: ops == null ? void 0 : ops.credentials
        });
    };
    const output = async (url, ops) => (await newFetcher(url, ops)).body;
    output.full = newFetcher;
    return output;
}
const flags = {
    // CORS are set to allow any origin
    CORS_ALLOWED: "cors-allowed",
    // the stream is locked on IP, so only works if
    // request maker is same as player (not compatible with proxies)
    IP_LOCKED: "ip-locked",
    // The source/embed is blocking cloudflare ip's
    // This flag is not compatible with a proxy hosted on cloudflare
    CF_BLOCKED: "cf-blocked",
    // Streams and sources with this flag wont be proxied
    // And will be exclusive to the extension
    PROXY_BLOCKED: "proxy-blocked"
};
const targets = {
    // browser with CORS restrictions
    BROWSER: "browser",
    // browser, but no CORS restrictions through a browser extension
    BROWSER_EXTENSION: "browser-extension",
    // native app, so no restrictions in what can be played
    NATIVE: "native",
    // any target, no target restrictions
    ANY: "any"
};
const targetToFeatures = {
    browser: {
        requires: [flags.CORS_ALLOWED],
        disallowed: []
    },
    "browser-extension": {
        requires: [],
        disallowed: []
    },
    native: {
        requires: [],
        disallowed: []
    },
    any: {
        requires: [],
        disallowed: []
    }
};
function getTargetFeatures(target, consistentIpForRequests, proxyStreams) {
    const features = targetToFeatures[target];
    if (!consistentIpForRequests) features.disallowed.push(flags.IP_LOCKED);
    if (proxyStreams) features.disallowed.push(flags.PROXY_BLOCKED);
    return features;
}
function flagsAllowedInFeatures(features, inputFlags) {
    const hasAllFlags = features.requires.every((v) => inputFlags.includes(v));
    if (!hasAllFlags) return false;
    const hasDisallowedFlag = features.disallowed.some((v) => inputFlags.includes(v));
    if (hasDisallowedFlag) return false;
    return true;
}
const captionTypes = {
    srt: "srt",
    vtt: "vtt"
};
function getCaptionTypeFromUrl(url) {
    const extensions = Object.keys(captionTypes);
    const type = extensions.find((v) => url.endsWith(`.${v}`));
    if (!type) return null;
    return type;
}
function labelToLanguageCode(label) {
    const code = ISO6391.getCode(label);
    if (code.length === 0) return null;
    return code;
}
function isValidLanguageCode(code) {
    if (!code) return false;
    return ISO6391.validate(code);
}
function removeDuplicatedLanguages(list) {
    const beenSeen = {};
    return list.filter((sub) => {
        if (beenSeen[sub.language]) return false;
        beenSeen[sub.language] = true;
        return true;
    });
}
async function addOpenSubtitlesCaptions(captions, ops, media) {
    try {
        const [imdbId, season, episode] = atob(media).split(".").map((x, i) => i === 0 ? x : Number(x) || null);
        if (!imdbId) return captions;
        const Res = await ops.proxiedFetcher(
            `https://rest.opensubtitles.org/search/${season && episode ? `episode-${episode}/` : ""}imdbid-${imdbId.slice(2)}${season && episode ? `/season-${season}` : ""}`,
            {
                headers: {
                    "X-User-Agent": "VLSub 0.10.2"
                }
            }
        );
        const openSubtilesCaptions = [];
        for (const caption of Res) {
            const url = caption.SubDownloadLink.replace(".gz", "").replace("download/", "download/subencoding-utf8/");
            const language = labelToLanguageCode(caption.LanguageName);
            if (!url || !language) continue;
            else
                openSubtilesCaptions.push({
                    id: url,
                    opensubtitles: true,
                    url,
                    type: caption.SubFormat || "srt",
                    hasCorsRestrictions: false,
                    language
                });
        }
        return [...captions, ...removeDuplicatedLanguages(openSubtilesCaptions)];
    } catch {
        return captions;
    }
}
function requiresProxy(stream) {
    if (!stream.flags.includes(flags.CORS_ALLOWED) || !!(stream.headers && Object.keys(stream.headers).length > 0))
        return true;
    return false;
}
function setupProxy(stream) {
    const headers2 = stream.headers && Object.keys(stream.headers).length > 0 ? stream.headers : void 0;
    const options = {
        ...stream.type === "hls" && { depth: stream.proxyDepth ?? 0 }
    };
    const payload = {
        headers: headers2,
        options
    };
    if (stream.type === "hls") {
        payload.type = "hls";
        payload.url = stream.playlist;
        stream.playlist = `https://proxy.nsbx.ru/proxy?${new URLSearchParams({ payload: Buffer.from(JSON.stringify(payload)).toString("base64url") })}`;
    }
    if (stream.type === "file") {
        payload.type = "mp4";
        Object.entries(stream.qualities).forEach((entry) => {
            payload.url = entry[1].url;
            entry[1].url = `https://proxy.nsbx.ru/proxy?${new URLSearchParams({ payload: Buffer.from(JSON.stringify(payload)).toString("base64url") })}`;
        });
    }
    stream.headers = {};
    stream.flags = [flags.CORS_ALLOWED];
    return stream;
}
export function makeSourcerer(state) {
    const mediaTypes = [];
    if (state.scrapeMovie) mediaTypes.push("movie");
    if (state.scrapeShow) mediaTypes.push("show");
    return {
        ...state,
        type: "source",
        disabled: state.disabled ?? false,
        externalSource: state.externalSource ?? false,
        mediaTypes
    };
}
function makeEmbed(state) {
    return {
        ...state,
        type: "embed",
        disabled: state.disabled ?? false,
        mediaTypes: void 0
    };
}
const providers$3 = [
    {
        id: "delta",
        rank: 699
    },
    {
        id: "alpha",
        rank: 695
    }
];
function embed$3(provider) {
    return makeEmbed({
        id: provider.id,
        name: provider.id.charAt(0).toUpperCase() + provider.id.slice(1),
        rank: provider.rank,
        disabled: false,
        async scrape(ctx) {
            const [query, baseUrl3] = ctx.url.split("|");
            const search2 = await ctx.fetcher.full("/search", {
                query: {
                    query,
                    provider: provider.id
                },
                credentials: "include",
                baseUrl: baseUrl3
            });
            if (search2.statusCode === 429) throw new Error("Rate limited");
            if (search2.statusCode !== 200) throw new NotFoundError("Failed to search");
            ctx.progress(50);
            const result = await ctx.fetcher("/provider", {
                query: {
                    resourceId: search2.body.url,
                    provider: provider.id
                },
                credentials: "include",
                baseUrl: baseUrl3
            });
            ctx.progress(100);
            return result;
        }
    });
}
const [deltaScraper, alphaScraper] = providers$3.map(embed$3);
const warezcdnBase = "https://embed.warezcdn.link";
const warezcdnPlayerBase = "https://warezcdn.link/player";
const warezcdnWorkerProxy = "https://workerproxy.warezcdn.workers.dev";
function decrypt$1(input) {
    let output = atob(input);
    output = output.trim();
    output = output.split("").reverse().join("");
    let last = output.slice(-5);
    last = last.split("").reverse().join("");
    output = output.slice(0, -5);
    return `${output}${last}`;
}
async function getDecryptedId(ctx) {
    var _a;
    const page = await ctx.proxiedFetcher(`/player.php`, {
        baseUrl: warezcdnPlayerBase,
        headers: {
            Referer: `${warezcdnPlayerBase}/getEmbed.php?${new URLSearchParams({
                id: ctx.url,
                sv: "warezcdn"
            })}`
        },
        query: {
            id: ctx.url
        }
    });
    const allowanceKey = (_a = page.match(/let allowanceKey = "(.*?)";/)) == null ? void 0 : _a[1];
    if (!allowanceKey) throw new NotFoundError("Failed to get allowanceKey");
    const streamData = await ctx.proxiedFetcher("/functions.php", {
        baseUrl: warezcdnPlayerBase,
        method: "POST",
        body: new URLSearchParams({
            getVideo: ctx.url,
            key: allowanceKey
        })
    });
    const stream = JSON.parse(streamData);
    if (!stream.id) throw new NotFoundError("can't get stream id");
    const decryptedId = decrypt$1(stream.id);
    if (!decryptedId) throw new NotFoundError("can't get file id");
    return decryptedId;
}
const cdnListing = [50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64];
async function checkUrls(ctx, fileId) {
    for (const id of cdnListing) {
        const url = `https://cloclo${id}.cloud.mail.ru/weblink/view/${fileId}`;
        const response = await ctx.proxiedFetcher.full(url, {
            method: "GET",
            headers: {
                Range: "bytes=0-1"
            }
        });
        if (response.statusCode === 206) return url;
    }
    return null;
}
const warezcdnembedMp4Scraper = makeEmbed({
    id: "warezcdnembedmp4",
    // WarezCDN is both a source and an embed host
    name: "WarezCDN MP4",
    // method no longer works
    rank: 82,
    disabled: true,
    async scrape(ctx) {
        const decryptedId = await getDecryptedId(ctx);
        if (!decryptedId) throw new NotFoundError("can't get file id");
        const streamUrl = await checkUrls(ctx, decryptedId);
        if (!streamUrl) throw new NotFoundError("can't get stream id");
        return {
            stream: [
                {
                    id: "primary",
                    captions: [],
                    qualities: {
                        unknown: {
                            type: "mp4",
                            url: `${warezcdnWorkerProxy}/?${new URLSearchParams({
                                url: streamUrl
                            })}`
                        }
                    },
                    type: "file",
                    flags: [flags.CORS_ALLOWED]
                }
            ]
        };
    }
});
const baseUrl$d = "https://api.whvx.net";
async function comboScraper$b(ctx) {
    var _a;
    const query = {
        title: ctx.media.title,
        releaseYear: ctx.media.releaseYear,
        tmdbId: ctx.media.tmdbId,
        imdbId: ctx.media.imdbId,
        type: ctx.media.type,
        ...ctx.media.type === "show" && {
            season: ctx.media.season.number.toString(),
            episode: ctx.media.episode.number.toString()
        }
    };
    const res = await ctx.fetcher("/status", { baseUrl: baseUrl$d });
    if (((_a = res.providers) == null ? void 0 : _a.length) === 0) throw new NotFoundError("No ContentProviders available");
    const embeds = res.providers.map((provider) => {
        return {
            embedId: provider,
            url: JSON.stringify(query)
        };
    });
    return {
        embeds
    };
}
const whvxScraper = makeSourcerer({
    id: "whvx",
    name: "VidBinge",
    rank: 270,
    disabled: true,
    externalSource: true,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: comboScraper$b,
    scrapeShow: comboScraper$b
});
const providers$2 = [
    {
        id: "nova",
        rank: 720
    },
    {
        id: "astra",
        rank: 710
    },
    {
        id: "orion",
        rank: 700
    }
];
const headers = {
    Origin: "https://www.vidbinge.com",
    Referer: "https://www.vidbinge.com"
};
function embed$2(provider) {
    return makeEmbed({
        id: provider.id,
        name: provider.id.charAt(0).toUpperCase() + provider.id.slice(1),
        rank: provider.rank,
        disabled: provider.disabled,
        async scrape(ctx) {
            let progress = 50;
            const interval = setInterval(() => {
                if (progress < 100) {
                    progress += 1;
                    ctx.progress(progress);
                }
            }, 100);
            try {
                const search2 = await ctx.fetcher.full(
                    `${baseUrl$d}/search?query=${encodeURIComponent(ctx.url)}&provider=${provider.id}`,
                    { headers }
                );
                if (search2.statusCode === 429) {
                    throw new Error("Rate limited");
                } else if (search2.statusCode !== 200) {
                    throw new NotFoundError("Failed to search");
                }
                const result = await ctx.fetcher(
                    `${baseUrl$d}/source?resourceId=${encodeURIComponent(search2.body.url)}&provider=${provider.id}`,
                    { headers }
                );
                clearInterval(interval);
                ctx.progress(100);
                return result;
            } catch (error) {
                clearInterval(interval);
                ctx.progress(100);
                throw new NotFoundError("Failed to search");
            }
        }
    });
}
const [novaScraper, astraScraper, orionScraper] = providers$2.map(embed$2);
const SKIP_VALIDATION_CHECK_IDS = [
    warezcdnembedMp4Scraper.id,
    deltaScraper.id,
    alphaScraper.id,
    novaScraper.id,
    astraScraper.id,
    orionScraper.id
];
function isValidStream$1(stream) {
    if (!stream) return false;
    if (stream.type === "hls") {
        if (!stream.playlist) return false;
        return true;
    }
    if (stream.type === "file") {
        const validQualities = Object.values(stream.qualities).filter((v) => v.url.length > 0);
        if (validQualities.length === 0) return false;
        return true;
    }
    return false;
}
async function validatePlayableStream(stream, ops, sourcererId) {
    if (SKIP_VALIDATION_CHECK_IDS.includes(sourcererId)) return stream;
    if (stream.type === "hls") {
        if (stream.playlist.startsWith("data:")) return stream;
        const result = await ops.proxiedFetcher.full(stream.playlist, {
            method: "GET",
            headers: {
                ...stream.preferredHeaders,
                ...stream.headers
            }
        });
        if (result.statusCode < 200 || result.statusCode >= 400) return null;
        return stream;
    }
    if (stream.type === "file") {
        const validQualitiesResults = await Promise.all(
            Object.values(stream.qualities).map(
                (quality) => ops.proxiedFetcher.full(quality.url, {
                    method: "GET",
                    headers: {
                        ...stream.preferredHeaders,
                        ...stream.headers,
                        Range: "bytes=0-1"
                    }
                })
            )
        );
        const validQualities = stream.qualities;
        Object.keys(stream.qualities).forEach((quality, index) => {
            if (validQualitiesResults[index].statusCode < 200 || validQualitiesResults[index].statusCode >= 400) {
                delete validQualities[quality];
            }
        });
        if (Object.keys(validQualities).length === 0) return null;
        return { ...stream, qualities: validQualities };
    }
    return null;
}
async function validatePlayableStreams(streams, ops, sourcererId) {
    if (SKIP_VALIDATION_CHECK_IDS.includes(sourcererId)) return streams;
    return (await Promise.all(streams.map((stream) => validatePlayableStream(stream, ops, sourcererId)))).filter(
        (v) => v !== null
    );
}
async function scrapeInvidualSource(list, ops) {
    const sourceScraper = list.sources.find((v) => ops.id === v.id);
    if (!sourceScraper) throw new Error("Source with ID not found");
    if (ops.media.type === "movie" && !sourceScraper.scrapeMovie) throw new Error("Source is not compatible with movies");
    if (ops.media.type === "show" && !sourceScraper.scrapeShow) throw new Error("Source is not compatible with shows");
    const contextBase = {
        fetcher: ops.fetcher,
        proxiedFetcher: ops.proxiedFetcher,
        progress(val) {
            var _a, _b;
            (_b = (_a = ops.events) == null ? void 0 : _a.update) == null ? void 0 : _b.call(_a, {
                id: sourceScraper.id,
                percentage: val,
                status: "pending"
            });
        }
    };
    let output = null;
    if (ops.media.type === "movie" && sourceScraper.scrapeMovie)
        output = await sourceScraper.scrapeMovie({
            ...contextBase,
            media: ops.media
        });
    else if (ops.media.type === "show" && sourceScraper.scrapeShow)
        output = await sourceScraper.scrapeShow({
            ...contextBase,
            media: ops.media
        });
    if (output == null ? void 0 : output.stream) {
        output.stream = output.stream.filter((stream) => isValidStream$1(stream)).filter((stream) => flagsAllowedInFeatures(ops.features, stream.flags));
        output.stream = output.stream.map(
            (stream) => requiresProxy(stream) && ops.proxyStreams ? setupProxy(stream) : stream
        );
    }
    if (!output) throw new Error("output is null");
    output.embeds = output.embeds.filter((embed2) => {
        const e = list.embeds.find((v) => v.id === embed2.embedId);
        if (!e || e.disabled) return false;
        return true;
    });
    if (!ops.disableOpensubtitles)
        for (const embed2 of output.embeds)
            embed2.url = `${embed2.url}${btoa("MEDIA=")}${btoa(
                `${ops.media.imdbId}${ops.media.type === "show" ? `.${ops.media.season.number}.${ops.media.episode.number}` : ""}`
            )}`;
    if ((!output.stream || output.stream.length === 0) && output.embeds.length === 0)
        throw new NotFoundError("No streams found");
    if (output.stream && output.stream.length > 0 && output.embeds.length === 0) {
        const playableStreams = await validatePlayableStreams(output.stream, ops, sourceScraper.id);
        if (playableStreams.length === 0) throw new NotFoundError("No playable streams found");
        if (!ops.disableOpensubtitles)
            for (const playableStream of playableStreams) {
                playableStream.captions = await addOpenSubtitlesCaptions(
                    playableStream.captions,
                    ops,
                    btoa(
                        `${ops.media.imdbId}${ops.media.type === "show" ? `.${ops.media.season.number}.${ops.media.episode.number}` : ""}`
                    )
                );
            }
        output.stream = playableStreams;
    }
    return output;
}
async function scrapeIndividualEmbed(list, ops) {
    const embedScraper = list.embeds.find((v) => ops.id === v.id);
    if (!embedScraper) throw new Error("Embed with ID not found");
    let url = ops.url;
    let media;
    if (ops.url.includes(btoa("MEDIA="))) [url, media] = url.split(btoa("MEDIA="));
    const output = await embedScraper.scrape({
        fetcher: ops.fetcher,
        proxiedFetcher: ops.proxiedFetcher,
        url,
        progress(val) {
            var _a, _b;
            (_b = (_a = ops.events) == null ? void 0 : _a.update) == null ? void 0 : _b.call(_a, {
                id: embedScraper.id,
                percentage: val,
                status: "pending"
            });
        }
    });
    output.stream = output.stream.filter((stream) => isValidStream$1(stream)).filter((stream) => flagsAllowedInFeatures(ops.features, stream.flags));
    if (output.stream.length === 0) throw new NotFoundError("No streams found");
    output.stream = output.stream.map(
        (stream) => requiresProxy(stream) && ops.proxyStreams ? setupProxy(stream) : stream
    );
    const playableStreams = await validatePlayableStreams(output.stream, ops, embedScraper.id);
    if (playableStreams.length === 0) throw new NotFoundError("No playable streams found");
    if (media && !ops.disableOpensubtitles)
        for (const playableStream of playableStreams)
            playableStream.captions = await addOpenSubtitlesCaptions(playableStream.captions, ops, media);
    output.stream = playableStreams;
    return output;
}
function reorderOnIdList(order, list) {
    const copy = [...list];
    copy.sort((a, b) => {
        const aIndex = order.indexOf(a.id);
        const bIndex = order.indexOf(b.id);
        if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;
        if (bIndex >= 0) return 1;
        if (aIndex >= 0) return -1;
        return b.rank - a.rank;
    });
    return copy;
}
async function runAllProviders(list, ops) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n;
    const sources = reorderOnIdList(ops.sourceOrder ?? [], list.sources).filter((source) => {
        if (ops.media.type === "movie") return !!source.scrapeMovie;
        if (ops.media.type === "show") return !!source.scrapeShow;
        return false;
    });
    const embeds = reorderOnIdList(ops.embedOrder ?? [], list.embeds);
    const embedIds = embeds.map((embed2) => embed2.id);
    let lastId = "";
    const contextBase = {
        fetcher: ops.fetcher,
        proxiedFetcher: ops.proxiedFetcher,
        progress(val) {
            var _a2, _b2;
            (_b2 = (_a2 = ops.events) == null ? void 0 : _a2.update) == null ? void 0 : _b2.call(_a2, {
                id: lastId,
                percentage: val,
                status: "pending"
            });
        }
    };
    (_b = (_a = ops.events) == null ? void 0 : _a.init) == null ? void 0 : _b.call(_a, {
        sourceIds: sources.map((v) => v.id)
    });
    for (const source of sources) {
        (_d = (_c = ops.events) == null ? void 0 : _c.start) == null ? void 0 : _d.call(_c, source.id);
        lastId = source.id;
        let output = null;
        try {
            if (ops.media.type === "movie" && source.scrapeMovie)
                output = await source.scrapeMovie({
                    ...contextBase,
                    media: ops.media
                });
            else if (ops.media.type === "show" && source.scrapeShow)
                output = await source.scrapeShow({
                    ...contextBase,
                    media: ops.media
                });
            if (output) {
                output.stream = (output.stream ?? []).filter(isValidStream$1).filter((stream) => flagsAllowedInFeatures(ops.features, stream.flags));
                output.stream = output.stream.map(
                    (stream) => requiresProxy(stream) && ops.proxyStreams ? setupProxy(stream) : stream
                );
            }
            if (!output || !((_e = output.stream) == null ? void 0 : _e.length) && !output.embeds.length) {
                throw new NotFoundError("No streams found");
            }
        } catch (error) {
            const updateParams = {
                id: source.id,
                percentage: 100,
                status: error instanceof NotFoundError ? "notfound" : "failure",
                reason: error instanceof NotFoundError ? error.message : void 0,
                error: error instanceof NotFoundError ? void 0 : error
            };
            (_g = (_f = ops.events) == null ? void 0 : _f.update) == null ? void 0 : _g.call(_f, updateParams);
            continue;
        }
        if (!output) throw new Error("Invalid media type");
        if ((_h = output.stream) == null ? void 0 : _h[0]) {
            const playableStream = await validatePlayableStream(output.stream[0], ops, source.id);
            if (!playableStream) throw new NotFoundError("No streams found");
            if (!ops.disableOpensubtitles)
                playableStream.captions = await addOpenSubtitlesCaptions(
                    playableStream.captions,
                    ops,
                    btoa(
                        `${ops.media.imdbId}${ops.media.type === "show" ? `.${ops.media.season.number}.${ops.media.episode.number}` : ""}`
                    )
                );
            return {
                sourceId: source.id,
                stream: playableStream
            };
        }
        const sortedEmbeds = output.embeds.filter((embed2) => {
            const e = list.embeds.find((v) => v.id === embed2.embedId);
            return e && !e.disabled;
        }).sort((a, b) => embedIds.indexOf(a.embedId) - embedIds.indexOf(b.embedId));
        if (sortedEmbeds.length > 0) {
            (_j = (_i = ops.events) == null ? void 0 : _i.discoverEmbeds) == null ? void 0 : _j.call(_i, {
                embeds: sortedEmbeds.map((embed2, i) => ({
                    id: [source.id, i].join("-"),
                    embedScraperId: embed2.embedId
                })),
                sourceId: source.id
            });
        }
        for (const [ind, embed2] of sortedEmbeds.entries()) {
            const scraper = embeds.find((v) => v.id === embed2.embedId);
            if (!scraper) throw new Error("Invalid embed returned");
            const id = [source.id, ind].join("-");
            (_l = (_k = ops.events) == null ? void 0 : _k.start) == null ? void 0 : _l.call(_k, id);
            lastId = id;
            let embedOutput;
            try {
                embedOutput = await scraper.scrape({
                    ...contextBase,
                    url: embed2.url
                });
                embedOutput.stream = embedOutput.stream.filter(isValidStream$1).filter((stream) => flagsAllowedInFeatures(ops.features, stream.flags));
                embedOutput.stream = embedOutput.stream.map(
                    (stream) => requiresProxy(stream) && ops.proxyStreams ? setupProxy(stream) : stream
                );
                if (embedOutput.stream.length === 0) {
                    throw new NotFoundError("No streams found");
                }
                const playableStream = await validatePlayableStream(embedOutput.stream[0], ops, embed2.embedId);
                if (!playableStream) throw new NotFoundError("No streams found");
                if (!ops.disableOpensubtitles)
                    playableStream.captions = await addOpenSubtitlesCaptions(
                        playableStream.captions,
                        ops,
                        btoa(
                            `${ops.media.imdbId}${ops.media.type === "show" ? `.${ops.media.season.number}.${ops.media.episode.number}` : ""}`
                        )
                    );
                embedOutput.stream = [playableStream];
            } catch (error) {
                const updateParams = {
                    id,
                    percentage: 100,
                    status: error instanceof NotFoundError ? "notfound" : "failure",
                    reason: error instanceof NotFoundError ? error.message : void 0,
                    error: error instanceof NotFoundError ? void 0 : error
                };
                (_n = (_m = ops.events) == null ? void 0 : _m.update) == null ? void 0 : _n.call(_m, updateParams);
                continue;
            }
            return {
                sourceId: source.id,
                embedId: scraper.id,
                stream: embedOutput.stream[0]
            };
        }
    }
    return null;
}
function makeControls(ops) {
    const list = {
        embeds: ops.embeds,
        sources: ops.sources
    };
    const providerRunnerOps = {
        features: ops.features,
        fetcher: makeFetcher(ops.fetcher),
        proxiedFetcher: makeFetcher(ops.proxiedFetcher ?? ops.fetcher),
        proxyStreams: ops.proxyStreams
    };
    return {
        runAll(runnerOps) {
            return runAllProviders(list, {
                ...providerRunnerOps,
                ...runnerOps
            });
        },
        runSourceScraper(runnerOps) {
            return scrapeInvidualSource(list, {
                ...providerRunnerOps,
                ...runnerOps
            });
        },
        runEmbedScraper(runnerOps) {
            return scrapeIndividualEmbed(list, {
                ...providerRunnerOps,
                ...runnerOps
            });
        },
        getMetadata(id) {
            return getSpecificId(list, id);
        },
        listSources() {
            return getAllSourceMetaSorted(list);
        },
        listEmbeds() {
            return getAllEmbedMetaSorted(list);
        }
    };
}
const nanoid = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", 10);
const baseUrl$c = "https://d000d.com";
const doodScraper = makeEmbed({
    id: "dood",
    name: "dood",
    rank: 173,
    async scrape(ctx) {
        var _a, _b;
        let url = ctx.url;
        if (ctx.url.includes("primewire")) {
            const request = await ctx.proxiedFetcher.full(ctx.url);
            url = request.finalUrl;
        }
        const id = url.split("/d/")[1] || url.split("/e/")[1];
        const doodData = await ctx.proxiedFetcher(`/e/${id}`, {
            method: "GET",
            baseUrl: baseUrl$c
        });
        const dataForLater = (_a = doodData.match(/\?token=([^&]+)&expiry=/)) == null ? void 0 : _a[1];
        const path = (_b = doodData.match(/\$\.get\('\/pass_md5([^']+)/)) == null ? void 0 : _b[1];
        const thumbnailTrack = doodData.match(/thumbnails:\s\{\s*vtt:\s'([^']*)'/);
        const doodPage = await ctx.proxiedFetcher(`/pass_md5${path}`, {
            headers: {
                Referer: `${baseUrl$c}/e/${id}`
            },
            method: "GET",
            baseUrl: baseUrl$c
        });
        const downloadURL = `${doodPage}${nanoid()}?token=${dataForLater}&expiry=${Date.now()}`;
        if (!downloadURL.startsWith("http")) throw new Error("Invalid URL");
        return {
            stream: [
                {
                    id: "primary",
                    type: "file",
                    flags: [],
                    captions: [],
                    qualities: {
                        unknown: {
                            type: "mp4",
                            url: downloadURL
                        }
                    },
                    headers: {
                        Referer: baseUrl$c
                    },
                    ...thumbnailTrack ? {
                        thumbnailTrack: {
                            type: "vtt",
                            url: `https:${thumbnailTrack[1]}`
                        }
                    } : {}
                }
            ]
        };
    }
});
const evalCodeRegex$3 = /eval\((.*)\)/g;
const fileRegex$2 = /file:"(.*?)"/g;
const tracksRegex$3 = /\{file:"([^"]+)",kind:"thumbnails"\}/g;
const droploadScraper = makeEmbed({
    id: "dropload",
    name: "Dropload",
    rank: 120,
    scrape: async (ctx) => {
        const mainPageRes = await ctx.proxiedFetcher.full(ctx.url, {
            headers: {
                referer: ctx.url
            }
        });
        const mainPageUrl = new URL(mainPageRes.finalUrl);
        const mainPage = mainPageRes.body;
        const evalCode = mainPage.match(evalCodeRegex$3);
        if (!evalCode) throw new Error("Failed to find eval code");
        const unpacked = unpack(evalCode[1]);
        const file = fileRegex$2.exec(unpacked);
        const thumbnailTrack = tracksRegex$3.exec(unpacked);
        if (!(file == null ? void 0 : file[1])) throw new Error("Failed to find file");
        return {
            stream: [
                {
                    id: "primary",
                    type: "hls",
                    playlist: file[1],
                    flags: [flags.IP_LOCKED, flags.CORS_ALLOWED],
                    captions: [],
                    ...thumbnailTrack ? {
                        thumbnailTrack: {
                            type: "vtt",
                            url: mainPageUrl.origin + thumbnailTrack[1]
                        }
                    } : {}
                }
            ]
        };
    }
});
const febBoxBase = `https://www.febbox.com`;
function parseInputUrl(url) {
    const [type, id, seasonId, episodeId] = url.slice(1).split("/");
    const season = seasonId ? parseInt(seasonId, 10) : void 0;
    const episode = episodeId ? parseInt(episodeId, 10) : void 0;
    return {
        type,
        id,
        season,
        episode
    };
}
async function getFileList(ctx, shareKey, parentId) {
    var _a;
    const query = {
        share_key: shareKey,
        pwd: ""
    };
    if (parentId) {
        query.parent_id = parentId.toString();
        query.page = "1";
    }
    const streams = await ctx.proxiedFetcher("/file/file_share_list", {
        headers: {
            "accept-language": "en"
            // without this header, the request is marked as a webscraper
        },
        baseUrl: febBoxBase,
        query
    });
    return ((_a = streams.data) == null ? void 0 : _a.file_list) ?? [];
}
function isValidStream(file) {
    return file.ext === "mp4" || file.ext === "mkv";
}
async function getStreams$1(ctx, shareKey, type, season, episode) {
    const streams = await getFileList(ctx, shareKey);
    if (type === "show") {
        const seasonFolder = streams.find((v) => {
            if (!v.is_dir) return false;
            return v.file_name.toLowerCase() === `season ${season}`;
        });
        if (!seasonFolder) return [];
        const episodes = await getFileList(ctx, shareKey, seasonFolder.fid);
        const s = (season == null ? void 0 : season.toString()) ?? "0";
        const e = (episode == null ? void 0 : episode.toString()) ?? "0";
        const episodeRegex = new RegExp(`[Ss]0*${s}[Ee]0*${e}`);
        return episodes.filter((file) => {
            if (file.is_dir) return false;
            const match = file.file_name.match(episodeRegex);
            if (!match) return false;
            return true;
        }).filter(isValidStream);
    }
    return streams.filter((v) => !v.is_dir).filter(isValidStream);
}
const iv = atob("d0VpcGhUbiE=");
const key = atob("MTIzZDZjZWRmNjI2ZHk1NDIzM2FhMXc2");
const apiUrls = [
    atob("aHR0cHM6Ly9zaG93Ym94LnNoZWd1Lm5ldC9hcGkvYXBpX2NsaWVudC9pbmRleC8="),
    atob("aHR0cHM6Ly9tYnBhcGkuc2hlZ3UubmV0L2FwaS9hcGlfY2xpZW50L2luZGV4Lw==")
];
const appKey = atob("bW92aWVib3g=");
const appId = atob("Y29tLnRkby5zaG93Ym94");
const captionsDomains = [atob("bWJwaW1hZ2VzLmNodWF4aW4uY29t"), atob("aW1hZ2VzLnNoZWd1Lm5ldA==")];
const showboxBase = "https://www.showbox.media";
function encrypt(str) {
    return CryptoJS.TripleDES.encrypt(str, CryptoJS.enc.Utf8.parse(key), {
        iv: CryptoJS.enc.Utf8.parse(iv)
    }).toString();
}
function getVerify(str, str2, str3) {
    if (str) {
        return CryptoJS.MD5(CryptoJS.MD5(str2).toString() + str3 + str).toString();
    }
    return null;
}
const randomId = customAlphabet("1234567890abcdef");
const expiry = () => Math.floor(Date.now() / 1e3 + 60 * 60 * 12);
const sendRequest = async (ctx, data2, altApi = false) => {
    const defaultData = {
        childmode: "0",
        app_version: "11.5",
        appid: appId,
        lang: "en",
        expired_date: `${expiry()}`,
        platform: "android",
        channel: "Website"
    };
    const encryptedData = encrypt(
        JSON.stringify({
            ...defaultData,
            ...data2
        })
    );
    const appKeyHash = CryptoJS.MD5(appKey).toString();
    const verify = getVerify(encryptedData, appKey, key);
    const body = JSON.stringify({
        app_key: appKeyHash,
        verify,
        encrypt_data: encryptedData
    });
    const base64body = btoa(body);
    const formatted = new URLSearchParams();
    formatted.append("data", base64body);
    formatted.append("appid", "27");
    formatted.append("platform", "android");
    formatted.append("version", "129");
    formatted.append("medium", "Website");
    formatted.append("token", randomId(32));
    const requestUrl = altApi ? apiUrls[1] : apiUrls[0];
    const response = await ctx.proxiedFetcher(requestUrl, {
        method: "POST",
        headers: {
            Platform: "android",
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "okhttp/3.2.0"
        },
        body: formatted
    });
    return JSON.parse(response);
};
async function getSubtitles(ctx, id, fid, type, episodeId, seasonId) {
    const module = type === "movie" ? "Movie_srt_list_v2" : "TV_srt_list_v2";
    const subtitleApiQuery = {
        fid,
        uid: "",
        module,
        mid: type === "movie" ? id : void 0,
        tid: type !== "movie" ? id : void 0,
        episode: episodeId == null ? void 0 : episodeId.toString(),
        season: seasonId == null ? void 0 : seasonId.toString()
    };
    const subResult = await sendRequest(ctx, subtitleApiQuery);
    const subtitleList = subResult.data.list;
    let output = [];
    subtitleList.forEach((sub) => {
        const subtitle = sub.subtitles.sort((a, b) => b.order - a.order)[0];
        if (!subtitle) return;
        const subtitleFilePath = subtitle.file_path.replace(captionsDomains[0], captionsDomains[1]).replace(/\s/g, "+").replace(/[()]/g, (c) => {
            return `%${c.charCodeAt(0).toString(16)}`;
        });
        const subtitleType = getCaptionTypeFromUrl(subtitleFilePath);
        if (!subtitleType) return;
        const validCode = isValidLanguageCode(subtitle.lang);
        if (!validCode) return;
        output.push({
            id: subtitleFilePath,
            language: subtitle.lang,
            hasCorsRestrictions: true,
            type: subtitleType,
            url: subtitleFilePath
        });
    });
    output = removeDuplicatedLanguages(output);
    return output;
}
function extractShareKey(url) {
    const parsedUrl = new URL(url);
    const shareKey = parsedUrl.pathname.split("/")[2];
    return shareKey;
}
const febboxHlsScraper = makeEmbed({
    id: "febbox-hls",
    name: "Febbox (HLS)",
    rank: 160,
    disabled: true,
    async scrape(ctx) {
        var _a;
        const { type, id, season, episode } = parseInputUrl(ctx.url);
        const sharelinkResult = await ctx.proxiedFetcher("/index/share_link", {
            baseUrl: showboxBase,
            query: {
                id,
                type: type === "movie" ? "1" : "2"
            }
        });
        if (!((_a = sharelinkResult == null ? void 0 : sharelinkResult.data) == null ? void 0 : _a.link)) throw new Error("No embed url found");
        ctx.progress(30);
        const shareKey = extractShareKey(sharelinkResult.data.link);
        const fileList = await getStreams$1(ctx, shareKey, type, season, episode);
        const firstStream = fileList[0];
        if (!firstStream) throw new Error("No playable mp4 stream found");
        ctx.progress(70);
        return {
            stream: [
                {
                    id: "primary",
                    type: "hls",
                    flags: [],
                    captions: await getSubtitles(ctx, id, firstStream.fid, type, season, episode),
                    playlist: `https://www.febbox.com/hls/main/${firstStream.oss_fid}.m3u8`
                }
            ]
        };
    }
});
const allowedQualities = ["360", "480", "720", "1080", "4k"];
function mapToQuality(quality) {
    const q = quality.real_quality.replace("p", "").toLowerCase();
    if (!allowedQualities.includes(q)) return null;
    return {
        real_quality: q,
        path: quality.path,
        fid: quality.fid
    };
}
async function getStreamQualities(ctx, apiQuery) {
    var _a;
    const mediaRes = (await sendRequest(ctx, apiQuery)).data;
    const qualityMap = mediaRes.list.map((v) => mapToQuality(v)).filter((v) => !!v);
    const qualities = {};
    allowedQualities.forEach((quality) => {
        const foundQuality = qualityMap.find((q) => q.real_quality === quality && q.path);
        if (foundQuality) {
            qualities[quality] = {
                type: "mp4",
                url: foundQuality.path
            };
        }
    });
    return {
        qualities,
        fid: (_a = mediaRes.list[0]) == null ? void 0 : _a.fid
    };
}
const febboxMp4Scraper = makeEmbed({
    id: "febbox-mp4",
    name: "Febbox (MP4)",
    rank: 190,
    async scrape(ctx) {
        const { type, id, season, episode } = parseInputUrl(ctx.url);
        let apiQuery = null;
        if (type === "movie") {
            apiQuery = {
                uid: "",
                module: "Movie_downloadurl_v3",
                mid: id,
                oss: "1",
                group: ""
            };
        } else if (type === "show") {
            apiQuery = {
                uid: "",
                module: "TV_downloadurl_v3",
                tid: id,
                season,
                episode,
                oss: "1",
                group: ""
            };
        }
        if (!apiQuery) throw Error("Incorrect type");
        const { qualities, fid } = await getStreamQualities(ctx, apiQuery);
        if (fid === void 0) throw new Error("No streamable file found");
        ctx.progress(70);
        return {
            stream: [
                {
                    id: "primary",
                    captions: await getSubtitles(ctx, id, fid, type, episode, season),
                    qualities,
                    type: "file",
                    flags: [flags.CORS_ALLOWED]
                }
            ]
        };
    }
});
const linkRegex$6 = /file: ?"(http.*?)"/;
const tracksRegex$2 = /\{file:\s"([^"]+)",\skind:\s"thumbnails"\}/g;
const filelionsScraper = makeEmbed({
    id: "filelions",
    name: "filelions",
    rank: 115,
    async scrape(ctx) {
        const mainPageRes = await ctx.proxiedFetcher.full(ctx.url, {
            headers: {
                referer: ctx.url
            }
        });
        const mainPage = mainPageRes.body;
        const mainPageUrl = new URL(mainPageRes.finalUrl);
        const streamUrl = mainPage.match(linkRegex$6) ?? [];
        const thumbnailTrack = tracksRegex$2.exec(mainPage);
        const playlist = streamUrl[1];
        if (!playlist) throw new Error("Stream url not found");
        return {
            stream: [
                {
                    id: "primary",
                    type: "hls",
                    playlist,
                    flags: [flags.IP_LOCKED, flags.CORS_ALLOWED],
                    captions: [],
                    ...thumbnailTrack ? {
                        thumbnailTrack: {
                            type: "vtt",
                            url: mainPageUrl.origin + thumbnailTrack[1]
                        }
                    } : {}
                }
            ]
        };
    }
});
const mixdropBase = "https://mixdrop.ag";
const packedRegex$3 = /(eval\(function\(p,a,c,k,e,d\){.*{}\)\))/;
const linkRegex$5 = /MDCore\.wurl="(.*?)";/;
const mixdropScraper = makeEmbed({
    id: "mixdrop",
    name: "MixDrop",
    rank: 198,
    async scrape(ctx) {
        let embedUrl = ctx.url;
        if (ctx.url.includes("primewire")) embedUrl = (await ctx.fetcher.full(ctx.url)).finalUrl;
        const embedId = new URL(embedUrl).pathname.split("/")[2];
        const streamRes = await ctx.proxiedFetcher(`/e/${embedId}`, {
            baseUrl: mixdropBase
        });
        const packed = streamRes.match(packedRegex$3);
        if (!packed) {
            throw new Error("failed to find packed mixdrop JavaScript");
        }
        const unpacked = unpacker.unpack(packed[1]);
        const link = unpacked.match(linkRegex$5);
        if (!link) {
            throw new Error("failed to find packed mixdrop source link");
        }
        const url = link[1];
        return {
            stream: [
                {
                    id: "primary",
                    type: "file",
                    flags: [flags.IP_LOCKED],
                    captions: [],
                    qualities: {
                        unknown: {
                            type: "mp4",
                            url: url.startsWith("http") ? url : `https:${url}`,
                            // URLs don't always start with the protocol
                            headers: {
                                // MixDrop requires this header on all streams
                                Referer: mixdropBase
                            }
                        }
                    }
                }
            ]
        };
    }
});
const mp4uploadScraper = makeEmbed({
    id: "mp4upload",
    name: "mp4upload",
    rank: 170,
    async scrape(ctx) {
        const embed2 = await ctx.proxiedFetcher(ctx.url);
        const playerSrcRegex = new RegExp('(?<=player\\.used2b\\()\\s*{\\s*type:\\s*"[^"]+",\\s*used2b:\\s*"([^"]+)"\\s*}\\s*(?=\\);)', "s");
        const playerSrc = embed2.match(playerSrcRegex) ?? [];
        const streamUrl = playerSrc[1];
        if (!streamUrl) throw new Error("Stream url not found in embed code");
        return {
            stream: [
                {
                    id: "primary",
                    type: "file",
                    flags: [flags.CORS_ALLOWED],
                    captions: [],
                    qualities: {
                        "1080": {
                            type: "mp4",
                            url: streamUrl
                        }
                    }
                }
            ]
        };
    }
});
const hunterRegex = /eval\(function\(h,u,n,t,e,r\).*?\("(.*?)",\d*?,"(.*?)",(\d*?),(\d*?),\d*?\)\)/;
const linkRegex$4 = /file:"(.*?)"/;
function decodeHunter(encoded, mask, charCodeOffset, delimiterOffset) {
    const delimiter = mask[delimiterOffset];
    const chunks = encoded.split(delimiter).filter((chunk) => chunk);
    const decoded = chunks.map((chunk) => {
        const charCode = chunk.split("").reduceRight((c, value, index) => {
            return c + mask.indexOf(value) * delimiterOffset ** (chunk.length - 1 - index);
        }, 0);
        return String.fromCharCode(charCode - charCodeOffset);
    }).join("");
    return decoded;
}
const streambucketScraper = makeEmbed({
    id: "streambucket",
    name: "StreamBucket",
    rank: 196,
    // TODO - Disabled until ctx.fetcher and ctx.proxiedFetcher don't trigger bot detection
    disabled: true,
    async scrape(ctx) {
        const response = await fetch(ctx.url);
        const html = await response.text();
        if (html.includes("captcha-checkbox")) {
            throw new Error("StreamBucket got captchaed");
        }
        let regexResult = html.match(hunterRegex);
        if (!regexResult) {
            throw new Error("Failed to find StreamBucket hunter JavaScript");
        }
        const encoded = regexResult[1];
        const mask = regexResult[2];
        const charCodeOffset = Number(regexResult[3]);
        const delimiterOffset = Number(regexResult[4]);
        if (Number.isNaN(charCodeOffset)) {
            throw new Error("StreamBucket hunter JavaScript charCodeOffset is not a valid number");
        }
        if (Number.isNaN(delimiterOffset)) {
            throw new Error("StreamBucket hunter JavaScript delimiterOffset is not a valid number");
        }
        const decoded = decodeHunter(encoded, mask, charCodeOffset, delimiterOffset);
        regexResult = decoded.match(linkRegex$4);
        if (!regexResult) {
            throw new Error("Failed to find StreamBucket HLS link");
        }
        return {
            stream: [
                {
                    id: "primary",
                    type: "hls",
                    playlist: regexResult[1],
                    flags: [flags.CORS_ALLOWED],
                    captions: []
                }
            ]
        };
    }
});
var commonjsGlobal = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : {};
function getDefaultExportFromCjs(x) {
    return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
function getAugmentedNamespace(n) {
    if (n.__esModule) return n;
    var f = n.default;
    if (typeof f == "function") {
        var a = function a2() {
            if (this instanceof a2) {
                return Reflect.construct(f, arguments, this.constructor);
            }
            return f.apply(this, arguments);
        };
        a.prototype = f.prototype;
    } else a = {};
    Object.defineProperty(a, "__esModule", { value: true });
    Object.keys(n).forEach(function(k) {
        var d = Object.getOwnPropertyDescriptor(n, k);
        Object.defineProperty(a, k, d.get ? d : {
            enumerable: true,
            get: function() {
                return n[k];
            }
        });
    });
    return a;
}
var encBase64 = { exports: {} };
function commonjsRequire(path) {
    throw new Error('Could not dynamically require "' + path + '". Please configure the dynamicRequireTargets or/and ignoreDynamicRequires option of @rollup/plugin-commonjs appropriately for this require call to work.');
}
var core = { exports: {} };
const __viteBrowserExternal = {};
const __viteBrowserExternal$1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
    __proto__: null,
    default: __viteBrowserExternal
}, Symbol.toStringTag, { value: "Module" }));
const require$$0 = /* @__PURE__ */ getAugmentedNamespace(__viteBrowserExternal$1);
var hasRequiredCore;
function requireCore() {
    if (hasRequiredCore) return core.exports;
    hasRequiredCore = 1;
    (function(module, exports) {
        (function(root, factory) {
            {
                module.exports = factory();
            }
        })(commonjsGlobal, function() {
            var CryptoJS2 = CryptoJS2 || function(Math2, undefined$1) {
                var crypto;
                if (typeof window !== "undefined" && window.crypto) {
                    crypto = window.crypto;
                }
                if (typeof self !== "undefined" && self.crypto) {
                    crypto = self.crypto;
                }
                if (typeof globalThis !== "undefined" && globalThis.crypto) {
                    crypto = globalThis.crypto;
                }
                if (!crypto && typeof window !== "undefined" && window.msCrypto) {
                    crypto = window.msCrypto;
                }
                if (!crypto && typeof commonjsGlobal !== "undefined" && commonjsGlobal.crypto) {
                    crypto = commonjsGlobal.crypto;
                }
                if (!crypto && typeof commonjsRequire === "function") {
                    try {
                        crypto = require$$0;
                    } catch (err) {
                    }
                }
                var cryptoSecureRandomInt = function() {
                    if (crypto) {
                        if (typeof crypto.getRandomValues === "function") {
                            try {
                                return crypto.getRandomValues(new Uint32Array(1))[0];
                            } catch (err) {
                            }
                        }
                        if (typeof crypto.randomBytes === "function") {
                            try {
                                return crypto.randomBytes(4).readInt32LE();
                            } catch (err) {
                            }
                        }
                    }
                    throw new Error("Native crypto module could not be used to get secure random number.");
                };
                var create = Object.create || /* @__PURE__ */ function() {
                    function F() {
                    }
                    return function(obj) {
                        var subtype;
                        F.prototype = obj;
                        subtype = new F();
                        F.prototype = null;
                        return subtype;
                    };
                }();
                var C = {};
                var C_lib = C.lib = {};
                var Base = C_lib.Base = /* @__PURE__ */ function() {
                    return {
                        /**
                         * Creates a new object that inherits from this object.
                         *
                         * @param {Object} overrides Properties to copy into the new object.
                         *
                         * @return {Object} The new object.
                         *
                         * @static
                         *
                         * @example
                         *
                         *     var MyType = CryptoJS.lib.Base.extend({
                         *         field: 'value',
                         *
                         *         method: function () {
                         *         }
                         *     });
                         */
                        extend: function(overrides) {
                            var subtype = create(this);
                            if (overrides) {
                                subtype.mixIn(overrides);
                            }
                            if (!subtype.hasOwnProperty("init") || this.init === subtype.init) {
                                subtype.init = function() {
                                    subtype.$super.init.apply(this, arguments);
                                };
                            }
                            subtype.init.prototype = subtype;
                            subtype.$super = this;
                            return subtype;
                        },
                        /**
                         * Extends this object and runs the init method.
                         * Arguments to create() will be passed to init().
                         *
                         * @return {Object} The new object.
                         *
                         * @static
                         *
                         * @example
                         *
                         *     var instance = MyType.create();
                         */
                        create: function() {
                            var instance = this.extend();
                            instance.init.apply(instance, arguments);
                            return instance;
                        },
                        /**
                         * Initializes a newly created object.
                         * Override this method to add some logic when your objects are created.
                         *
                         * @example
                         *
                         *     var MyType = CryptoJS.lib.Base.extend({
                         *         init: function () {
                         *             // ...
                         *         }
                         *     });
                         */
                        init: function() {
                        },
                        /**
                         * Copies properties into this object.
                         *
                         * @param {Object} properties The properties to mix in.
                         *
                         * @example
                         *
                         *     MyType.mixIn({
                         *         field: 'value'
                         *     });
                         */
                        mixIn: function(properties) {
                            for (var propertyName in properties) {
                                if (properties.hasOwnProperty(propertyName)) {
                                    this[propertyName] = properties[propertyName];
                                }
                            }
                            if (properties.hasOwnProperty("toString")) {
                                this.toString = properties.toString;
                            }
                        },
                        /**
                         * Creates a copy of this object.
                         *
                         * @return {Object} The clone.
                         *
                         * @example
                         *
                         *     var clone = instance.clone();
                         */
                        clone: function() {
                            return this.init.prototype.extend(this);
                        }
                    };
                }();
                var WordArray = C_lib.WordArray = Base.extend({
                    /**
                     * Initializes a newly created word array.
                     *
                     * @param {Array} words (Optional) An array of 32-bit words.
                     * @param {number} sigBytes (Optional) The number of significant bytes in the words.
                     *
                     * @example
                     *
                     *     var wordArray = CryptoJS.lib.WordArray.create();
                     *     var wordArray = CryptoJS.lib.WordArray.create([0x00010203, 0x04050607]);
                     *     var wordArray = CryptoJS.lib.WordArray.create([0x00010203, 0x04050607], 6);
                     */
                    init: function(words, sigBytes) {
                        words = this.words = words || [];
                        if (sigBytes != undefined$1) {
                            this.sigBytes = sigBytes;
                        } else {
                            this.sigBytes = words.length * 4;
                        }
                    },
                    /**
                     * Converts this word array to a string.
                     *
                     * @param {Encoder} encoder (Optional) The encoding strategy to use. Default: CryptoJS.enc.Hex
                     *
                     * @return {string} The stringified word array.
                     *
                     * @example
                     *
                     *     var string = wordArray + '';
                     *     var string = wordArray.toString();
                     *     var string = wordArray.toString(CryptoJS.enc.Utf8);
                     */
                    toString: function(encoder) {
                        return (encoder || Hex).stringify(this);
                    },
                    /**
                     * Concatenates a word array to this word array.
                     *
                     * @param {WordArray} wordArray The word array to append.
                     *
                     * @return {WordArray} This word array.
                     *
                     * @example
                     *
                     *     wordArray1.concat(wordArray2);
                     */
                    concat: function(wordArray) {
                        var thisWords = this.words;
                        var thatWords = wordArray.words;
                        var thisSigBytes = this.sigBytes;
                        var thatSigBytes = wordArray.sigBytes;
                        this.clamp();
                        if (thisSigBytes % 4) {
                            for (var i = 0; i < thatSigBytes; i++) {
                                var thatByte = thatWords[i >>> 2] >>> 24 - i % 4 * 8 & 255;
                                thisWords[thisSigBytes + i >>> 2] |= thatByte << 24 - (thisSigBytes + i) % 4 * 8;
                            }
                        } else {
                            for (var j = 0; j < thatSigBytes; j += 4) {
                                thisWords[thisSigBytes + j >>> 2] = thatWords[j >>> 2];
                            }
                        }
                        this.sigBytes += thatSigBytes;
                        return this;
                    },
                    /**
                     * Removes insignificant bits.
                     *
                     * @example
                     *
                     *     wordArray.clamp();
                     */
                    clamp: function() {
                        var words = this.words;
                        var sigBytes = this.sigBytes;
                        words[sigBytes >>> 2] &= 4294967295 << 32 - sigBytes % 4 * 8;
                        words.length = Math2.ceil(sigBytes / 4);
                    },
                    /**
                     * Creates a copy of this word array.
                     *
                     * @return {WordArray} The clone.
                     *
                     * @example
                     *
                     *     var clone = wordArray.clone();
                     */
                    clone: function() {
                        var clone = Base.clone.call(this);
                        clone.words = this.words.slice(0);
                        return clone;
                    },
                    /**
                     * Creates a word array filled with random bytes.
                     *
                     * @param {number} nBytes The number of random bytes to generate.
                     *
                     * @return {WordArray} The random word array.
                     *
                     * @static
                     *
                     * @example
                     *
                     *     var wordArray = CryptoJS.lib.WordArray.random(16);
                     */
                    random: function(nBytes) {
                        var words = [];
                        for (var i = 0; i < nBytes; i += 4) {
                            words.push(cryptoSecureRandomInt());
                        }
                        return new WordArray.init(words, nBytes);
                    }
                });
                var C_enc = C.enc = {};
                var Hex = C_enc.Hex = {
                    /**
                     * Converts a word array to a hex string.
                     *
                     * @param {WordArray} wordArray The word array.
                     *
                     * @return {string} The hex string.
                     *
                     * @static
                     *
                     * @example
                     *
                     *     var hexString = CryptoJS.enc.Hex.stringify(wordArray);
                     */
                    stringify: function(wordArray) {
                        var words = wordArray.words;
                        var sigBytes = wordArray.sigBytes;
                        var hexChars = [];
                        for (var i = 0; i < sigBytes; i++) {
                            var bite = words[i >>> 2] >>> 24 - i % 4 * 8 & 255;
                            hexChars.push((bite >>> 4).toString(16));
                            hexChars.push((bite & 15).toString(16));
                        }
                        return hexChars.join("");
                    },
                    /**
                     * Converts a hex string to a word array.
                     *
                     * @param {string} hexStr The hex string.
                     *
                     * @return {WordArray} The word array.
                     *
                     * @static
                     *
                     * @example
                     *
                     *     var wordArray = CryptoJS.enc.Hex.parse(hexString);
                     */
                    parse: function(hexStr) {
                        var hexStrLength = hexStr.length;
                        var words = [];
                        for (var i = 0; i < hexStrLength; i += 2) {
                            words[i >>> 3] |= parseInt(hexStr.substr(i, 2), 16) << 24 - i % 8 * 4;
                        }
                        return new WordArray.init(words, hexStrLength / 2);
                    }
                };
                var Latin1 = C_enc.Latin1 = {
                    /**
                     * Converts a word array to a Latin1 string.
                     *
                     * @param {WordArray} wordArray The word array.
                     *
                     * @return {string} The Latin1 string.
                     *
                     * @static
                     *
                     * @example
                     *
                     *     var latin1String = CryptoJS.enc.Latin1.stringify(wordArray);
                     */
                    stringify: function(wordArray) {
                        var words = wordArray.words;
                        var sigBytes = wordArray.sigBytes;
                        var latin1Chars = [];
                        for (var i = 0; i < sigBytes; i++) {
                            var bite = words[i >>> 2] >>> 24 - i % 4 * 8 & 255;
                            latin1Chars.push(String.fromCharCode(bite));
                        }
                        return latin1Chars.join("");
                    },
                    /**
                     * Converts a Latin1 string to a word array.
                     *
                     * @param {string} latin1Str The Latin1 string.
                     *
                     * @return {WordArray} The word array.
                     *
                     * @static
                     *
                     * @example
                     *
                     *     var wordArray = CryptoJS.enc.Latin1.parse(latin1String);
                     */
                    parse: function(latin1Str) {
                        var latin1StrLength = latin1Str.length;
                        var words = [];
                        for (var i = 0; i < latin1StrLength; i++) {
                            words[i >>> 2] |= (latin1Str.charCodeAt(i) & 255) << 24 - i % 4 * 8;
                        }
                        return new WordArray.init(words, latin1StrLength);
                    }
                };
                var Utf82 = C_enc.Utf8 = {
                    /**
                     * Converts a word array to a UTF-8 string.
                     *
                     * @param {WordArray} wordArray The word array.
                     *
                     * @return {string} The UTF-8 string.
                     *
                     * @static
                     *
                     * @example
                     *
                     *     var utf8String = CryptoJS.enc.Utf8.stringify(wordArray);
                     */
                    stringify: function(wordArray) {
                        try {
                            return decodeURIComponent(escape(Latin1.stringify(wordArray)));
                        } catch (e) {
                            throw new Error("Malformed UTF-8 data");
                        }
                    },
                    /**
                     * Converts a UTF-8 string to a word array.
                     *
                     * @param {string} utf8Str The UTF-8 string.
                     *
                     * @return {WordArray} The word array.
                     *
                     * @static
                     *
                     * @example
                     *
                     *     var wordArray = CryptoJS.enc.Utf8.parse(utf8String);
                     */
                    parse: function(utf8Str) {
                        return Latin1.parse(unescape(encodeURIComponent(utf8Str)));
                    }
                };
                var BufferedBlockAlgorithm = C_lib.BufferedBlockAlgorithm = Base.extend({
                    /**
                     * Resets this block algorithm's data buffer to its initial state.
                     *
                     * @example
                     *
                     *     bufferedBlockAlgorithm.reset();
                     */
                    reset: function() {
                        this._data = new WordArray.init();
                        this._nDataBytes = 0;
                    },
                    /**
                     * Adds new data to this block algorithm's buffer.
                     *
                     * @param {WordArray|string} data The data to append. Strings are converted to a WordArray using UTF-8.
                     *
                     * @example
                     *
                     *     bufferedBlockAlgorithm._append('data');
                     *     bufferedBlockAlgorithm._append(wordArray);
                     */
                    _append: function(data2) {
                        if (typeof data2 == "string") {
                            data2 = Utf82.parse(data2);
                        }
                        this._data.concat(data2);
                        this._nDataBytes += data2.sigBytes;
                    },
                    /**
                     * Processes available data blocks.
                     *
                     * This method invokes _doProcessBlock(offset), which must be implemented by a concrete subtype.
                     *
                     * @param {boolean} doFlush Whether all blocks and partial blocks should be processed.
                     *
                     * @return {WordArray} The processed data.
                     *
                     * @example
                     *
                     *     var processedData = bufferedBlockAlgorithm._process();
                     *     var processedData = bufferedBlockAlgorithm._process(!!'flush');
                     */
                    _process: function(doFlush) {
                        var processedWords;
                        var data2 = this._data;
                        var dataWords = data2.words;
                        var dataSigBytes = data2.sigBytes;
                        var blockSize = this.blockSize;
                        var blockSizeBytes = blockSize * 4;
                        var nBlocksReady = dataSigBytes / blockSizeBytes;
                        if (doFlush) {
                            nBlocksReady = Math2.ceil(nBlocksReady);
                        } else {
                            nBlocksReady = Math2.max((nBlocksReady | 0) - this._minBufferSize, 0);
                        }
                        var nWordsReady = nBlocksReady * blockSize;
                        var nBytesReady = Math2.min(nWordsReady * 4, dataSigBytes);
                        if (nWordsReady) {
                            for (var offset = 0; offset < nWordsReady; offset += blockSize) {
                                this._doProcessBlock(dataWords, offset);
                            }
                            processedWords = dataWords.splice(0, nWordsReady);
                            data2.sigBytes -= nBytesReady;
                        }
                        return new WordArray.init(processedWords, nBytesReady);
                    },
                    /**
                     * Creates a copy of this object.
                     *
                     * @return {Object} The clone.
                     *
                     * @example
                     *
                     *     var clone = bufferedBlockAlgorithm.clone();
                     */
                    clone: function() {
                        var clone = Base.clone.call(this);
                        clone._data = this._data.clone();
                        return clone;
                    },
                    _minBufferSize: 0
                });
                C_lib.Hasher = BufferedBlockAlgorithm.extend({
                    /**
                     * Configuration options.
                     */
                    cfg: Base.extend(),
                    /**
                     * Initializes a newly created hasher.
                     *
                     * @param {Object} cfg (Optional) The configuration options to use for this hash computation.
                     *
                     * @example
                     *
                     *     var hasher = CryptoJS.algo.SHA256.create();
                     */
                    init: function(cfg) {
                        this.cfg = this.cfg.extend(cfg);
                        this.reset();
                    },
                    /**
                     * Resets this hasher to its initial state.
                     *
                     * @example
                     *
                     *     hasher.reset();
                     */
                    reset: function() {
                        BufferedBlockAlgorithm.reset.call(this);
                        this._doReset();
                    },
                    /**
                     * Updates this hasher with a message.
                     *
                     * @param {WordArray|string} messageUpdate The message to append.
                     *
                     * @return {Hasher} This hasher.
                     *
                     * @example
                     *
                     *     hasher.update('message');
                     *     hasher.update(wordArray);
                     */
                    update: function(messageUpdate) {
                        this._append(messageUpdate);
                        this._process();
                        return this;
                    },
                    /**
                     * Finalizes the hash computation.
                     * Note that the finalize operation is effectively a destructive, read-once operation.
                     *
                     * @param {WordArray|string} messageUpdate (Optional) A final message update.
                     *
                     * @return {WordArray} The hash.
                     *
                     * @example
                     *
                     *     var hash = hasher.finalize();
                     *     var hash = hasher.finalize('message');
                     *     var hash = hasher.finalize(wordArray);
                     */
                    finalize: function(messageUpdate) {
                        if (messageUpdate) {
                            this._append(messageUpdate);
                        }
                        var hash = this._doFinalize();
                        return hash;
                    },
                    blockSize: 512 / 32,
                    /**
                     * Creates a shortcut function to a hasher's object interface.
                     *
                     * @param {Hasher} hasher The hasher to create a helper for.
                     *
                     * @return {Function} The shortcut function.
                     *
                     * @static
                     *
                     * @example
                     *
                     *     var SHA256 = CryptoJS.lib.Hasher._createHelper(CryptoJS.algo.SHA256);
                     */
                    _createHelper: function(hasher) {
                        return function(message, cfg) {
                            return new hasher.init(cfg).finalize(message);
                        };
                    },
                    /**
                     * Creates a shortcut function to the HMAC's object interface.
                     *
                     * @param {Hasher} hasher The hasher to use in this HMAC helper.
                     *
                     * @return {Function} The shortcut function.
                     *
                     * @static
                     *
                     * @example
                     *
                     *     var HmacSHA256 = CryptoJS.lib.Hasher._createHmacHelper(CryptoJS.algo.SHA256);
                     */
                    _createHmacHelper: function(hasher) {
                        return function(message, key2) {
                            return new C_algo.HMAC.init(hasher, key2).finalize(message);
                        };
                    }
                });
                var C_algo = C.algo = {};
                return C;
            }(Math);
            return CryptoJS2;
        });
    })(core);
    return core.exports;
}
(function(module, exports) {
    (function(root, factory) {
        {
            module.exports = factory(requireCore());
        }
    })(commonjsGlobal, function(CryptoJS2) {
        (function() {
            var C = CryptoJS2;
            var C_lib = C.lib;
            var WordArray = C_lib.WordArray;
            var C_enc = C.enc;
            C_enc.Base64 = {
                /**
                 * Converts a word array to a Base64 string.
                 *
                 * @param {WordArray} wordArray The word array.
                 *
                 * @return {string} The Base64 string.
                 *
                 * @static
                 *
                 * @example
                 *
                 *     var base64String = CryptoJS.enc.Base64.stringify(wordArray);
                 */
                stringify: function(wordArray) {
                    var words = wordArray.words;
                    var sigBytes = wordArray.sigBytes;
                    var map = this._map;
                    wordArray.clamp();
                    var base64Chars = [];
                    for (var i = 0; i < sigBytes; i += 3) {
                        var byte1 = words[i >>> 2] >>> 24 - i % 4 * 8 & 255;
                        var byte2 = words[i + 1 >>> 2] >>> 24 - (i + 1) % 4 * 8 & 255;
                        var byte3 = words[i + 2 >>> 2] >>> 24 - (i + 2) % 4 * 8 & 255;
                        var triplet = byte1 << 16 | byte2 << 8 | byte3;
                        for (var j = 0; j < 4 && i + j * 0.75 < sigBytes; j++) {
                            base64Chars.push(map.charAt(triplet >>> 6 * (3 - j) & 63));
                        }
                    }
                    var paddingChar = map.charAt(64);
                    if (paddingChar) {
                        while (base64Chars.length % 4) {
                            base64Chars.push(paddingChar);
                        }
                    }
                    return base64Chars.join("");
                },
                /**
                 * Converts a Base64 string to a word array.
                 *
                 * @param {string} base64Str The Base64 string.
                 *
                 * @return {WordArray} The word array.
                 *
                 * @static
                 *
                 * @example
                 *
                 *     var wordArray = CryptoJS.enc.Base64.parse(base64String);
                 */
                parse: function(base64Str) {
                    var base64StrLength = base64Str.length;
                    var map = this._map;
                    var reverseMap = this._reverseMap;
                    if (!reverseMap) {
                        reverseMap = this._reverseMap = [];
                        for (var j = 0; j < map.length; j++) {
                            reverseMap[map.charCodeAt(j)] = j;
                        }
                    }
                    var paddingChar = map.charAt(64);
                    if (paddingChar) {
                        var paddingIndex = base64Str.indexOf(paddingChar);
                        if (paddingIndex !== -1) {
                            base64StrLength = paddingIndex;
                        }
                    }
                    return parseLoop(base64Str, base64StrLength, reverseMap);
                },
                _map: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="
            };
            function parseLoop(base64Str, base64StrLength, reverseMap) {
                var words = [];
                var nBytes = 0;
                for (var i = 0; i < base64StrLength; i++) {
                    if (i % 4) {
                        var bits1 = reverseMap[base64Str.charCodeAt(i - 1)] << i % 4 * 2;
                        var bits2 = reverseMap[base64Str.charCodeAt(i)] >>> 6 - i % 4 * 2;
                        var bitsCombined = bits1 | bits2;
                        words[nBytes >>> 2] |= bitsCombined << 24 - nBytes % 4 * 8;
                        nBytes++;
                    }
                }
                return WordArray.create(words, nBytes);
            }
        })();
        return CryptoJS2.enc.Base64;
    });
})(encBase64);
var encBase64Exports = encBase64.exports;
const Base64 = /* @__PURE__ */ getDefaultExportFromCjs(encBase64Exports);
var encUtf8 = { exports: {} };
(function(module, exports) {
    (function(root, factory) {
        {
            module.exports = factory(requireCore());
        }
    })(commonjsGlobal, function(CryptoJS2) {
        return CryptoJS2.enc.Utf8;
    });
})(encUtf8);
var encUtf8Exports = encUtf8.exports;
const Utf8 = /* @__PURE__ */ getDefaultExportFromCjs(encUtf8Exports);
async function fetchCaptchaToken(ctx, domain, recaptchaKey) {
    const domainHash = Base64.stringify(Utf8.parse(domain)).replace(/=/g, ".");
    const recaptchaRender = await ctx.proxiedFetcher(`https://www.google.com/recaptcha/api.js`, {
        query: {
            render: recaptchaKey
        }
    });
    const vToken = recaptchaRender.substring(
        recaptchaRender.indexOf("/releases/") + 10,
        recaptchaRender.indexOf("/recaptcha__en.js")
    );
    const recaptchaAnchor = await ctx.proxiedFetcher(
        `https://www.google.com/recaptcha/api2/anchor?cb=1&hl=en&size=invisible&cb=flicklax`,
        {
            query: {
                k: recaptchaKey,
                co: domainHash,
                v: vToken
            }
        }
    );
    const cToken = load(recaptchaAnchor)("#recaptcha-token").attr("value");
    if (!cToken) throw new Error("Unable to find cToken");
    const tokenData = await ctx.proxiedFetcher(`https://www.google.com/recaptcha/api2/reload`, {
        query: {
            v: vToken,
            reason: "q",
            k: recaptchaKey,
            c: cToken,
            sa: "",
            co: domain
        },
        headers: { referer: "https://www.google.com/recaptcha/api2/" },
        method: "POST"
    });
    const token = tokenData.match('rresp","(.+?)"');
    return token ? token[1] : null;
}
const streamsbScraper = makeEmbed({
    id: "streamsb",
    name: "StreamSB",
    rank: 150,
    async scrape(ctx) {
        const streamsbUrl = ctx.url.replace(".html", "").replace("embed-", "").replace("e/", "").replace("d/", "");
        const parsedUrl = new URL(streamsbUrl);
        const base = await ctx.proxiedFetcher(`${parsedUrl.origin}/d${parsedUrl.pathname}`);
        ctx.progress(20);
        const pageDoc = load(base);
        const dlDetails = [];
        pageDoc("[onclick^=download_video]").each((i, el) => {
            const $el = pageDoc(el);
            const funcContents = $el.attr("onclick");
            const regExpFunc = /download_video\('(.+?)','(.+?)','(.+?)'\)/;
            const matchesFunc = regExpFunc.exec(funcContents ?? "");
            if (!matchesFunc) return;
            const quality = $el.find("span").text();
            const regExpQuality = /(.+?) \((.+?)\)/;
            const matchesQuality = regExpQuality.exec(quality ?? "");
            if (!matchesQuality) return;
            dlDetails.push({
                parameters: [matchesFunc[1], matchesFunc[2], matchesFunc[3]],
                quality: {
                    label: matchesQuality[1].trim(),
                    size: matchesQuality[2]
                }
            });
        });
        ctx.progress(40);
        let dls = await Promise.all(
            dlDetails.map(async (dl) => {
                const query = {
                    op: "download_orig",
                    id: dl.parameters[0],
                    mode: dl.parameters[1],
                    hash: dl.parameters[2]
                };
                const getDownload = await ctx.proxiedFetcher(`/dl`, {
                    query,
                    baseUrl: parsedUrl.origin
                });
                const downloadDoc = load(getDownload);
                const recaptchaKey = downloadDoc(".g-recaptcha").attr("data-sitekey");
                if (!recaptchaKey) throw new Error("Unable to get captcha key");
                const captchaToken = await fetchCaptchaToken(ctx, parsedUrl.origin, recaptchaKey);
                if (!captchaToken) throw new Error("Unable to get captcha token");
                const dlForm = new FormData();
                dlForm.append("op", "download_orig");
                dlForm.append("id", dl.parameters[0]);
                dlForm.append("mode", dl.parameters[1]);
                dlForm.append("hash", dl.parameters[2]);
                dlForm.append("g-recaptcha-response", captchaToken);
                const download = await ctx.proxiedFetcher(`/dl`, {
                    method: "POST",
                    baseUrl: parsedUrl.origin,
                    body: dlForm,
                    query
                });
                const dlLink = load(download)(".btn.btn-light.btn-lg").attr("href");
                return {
                    quality: dl.quality.label,
                    url: dlLink
                };
            })
        );
        dls = dls.filter((d) => !!d.url);
        ctx.progress(80);
        const qualities = dls.reduce(
            (a, v) => {
                a[v.quality] = {
                    type: "mp4",
                    url: v.url
                };
                return a;
            },
            {}
        );
        return {
            stream: [
                {
                    id: "primary",
                    type: "file",
                    flags: [flags.CORS_ALLOWED],
                    qualities,
                    captions: []
                }
            ]
        };
    }
});
const packedRegex$2 = /(eval\(function\(p,a,c,k,e,d\).*\)\)\))/;
const linkRegex$3 = /file:"(https:\/\/[^"]+)"/;
const streamwishScraper = makeEmbed({
    id: "streamwish",
    name: "Streamwish",
    rank: 216,
    async scrape(ctx) {
        const streamRes = await ctx.proxiedFetcher(ctx.url);
        const packed = streamRes.match(packedRegex$2);
        if (!packed) throw new Error("Packed not found");
        const unpacked = unpacker.unpack(packed[1]);
        const link = unpacked.match(linkRegex$3);
        if (!link) throw new Error("Stream not found");
        return {
            stream: [
                {
                    type: "hls",
                    id: "primary",
                    playlist: link[1],
                    flags: [flags.CORS_ALLOWED],
                    captions: []
                }
            ]
        };
    }
});
function hexToChar(hex) {
    return String.fromCharCode(parseInt(hex, 16));
}
function decrypt(data2, key2) {
    var _a;
    const formatedData = ((_a = data2.match(/../g)) == null ? void 0 : _a.map(hexToChar).join("")) || "";
    return formatedData.split("").map((char, i) => String.fromCharCode(char.charCodeAt(0) ^ key2.charCodeAt(i % key2.length))).join("");
}
const turbovidScraper = makeEmbed({
    id: "turbovid",
    name: "Turbovid",
    rank: 122,
    async scrape(ctx) {
        var _a, _b;
        const baseUrl3 = new URL(ctx.url).origin;
        const embedPage = await ctx.proxiedFetcher(ctx.url);
        ctx.progress(30);
        const apkey = (_a = embedPage.match(/const\s+apkey\s*=\s*"(.*?)";/)) == null ? void 0 : _a[1];
        const xxid = (_b = embedPage.match(/const\s+xxid\s*=\s*"(.*?)";/)) == null ? void 0 : _b[1];
        if (!apkey || !xxid) throw new Error("Failed to get required values");
        const juiceKey = JSON.parse(
            await ctx.proxiedFetcher("/api/cucked/juice_key", {
                baseUrl: baseUrl3,
                headers: {
                    referer: ctx.url
                }
            })
        ).juice;
        if (!juiceKey) throw new Error("Failed to fetch the key");
        ctx.progress(60);
        const data2 = JSON.parse(
            await ctx.proxiedFetcher("/api/cucked/the_juice/", {
                baseUrl: baseUrl3,
                query: {
                    [apkey]: xxid
                },
                headers: {
                    referer: ctx.url
                }
            })
        ).data;
        if (!data2) throw new Error("Failed to fetch required data");
        ctx.progress(90);
        const playlist = decrypt(data2, juiceKey);
        return {
            stream: [
                {
                    type: "hls",
                    id: "primary",
                    playlist,
                    headers: {
                        referer: `${baseUrl3}/`,
                        origin: baseUrl3
                    },
                    flags: [],
                    captions: []
                }
            ]
        };
    }
});
const origin$1 = "https://rabbitstream.net";
const referer$4 = "https://rabbitstream.net/";
const { AES: AES$1, enc } = CryptoJS;
function isJSON(json) {
    try {
        JSON.parse(json);
        return true;
    } catch {
        return false;
    }
}
function extractKey(script) {
    const startOfSwitch = script.lastIndexOf("switch");
    const endOfCases = script.indexOf("partKeyStartPosition");
    const switchBody = script.slice(startOfSwitch, endOfCases);
    const nums = [];
    const matches = switchBody.matchAll(/:[a-zA-Z0-9]+=([a-zA-Z0-9]+),[a-zA-Z0-9]+=([a-zA-Z0-9]+);/g);
    for (const match of matches) {
        const innerNumbers = [];
        for (const varMatch of [match[1], match[2]]) {
            const regex = new RegExp(`${varMatch}=0x([a-zA-Z0-9]+)`, "g");
            const varMatches = [...script.matchAll(regex)];
            const lastMatch = varMatches[varMatches.length - 1];
            if (!lastMatch) return null;
            const number = parseInt(lastMatch[1], 16);
            innerNumbers.push(number);
        }
        nums.push([innerNumbers[0], innerNumbers[1]]);
    }
    return nums;
}
const upcloudScraper = makeEmbed({
    id: "upcloud",
    name: "UpCloud",
    rank: 200,
    disabled: true,
    async scrape(ctx) {
        const parsedUrl = new URL(ctx.url.replace("embed-5", "embed-4"));
        const dataPath = parsedUrl.pathname.split("/");
        const dataId = dataPath[dataPath.length - 1];
        const streamRes = await ctx.proxiedFetcher(`${parsedUrl.origin}/ajax/embed-4/getSources?id=${dataId}`, {
            headers: {
                Referer: parsedUrl.origin,
                "X-Requested-With": "XMLHttpRequest"
            }
        });
        let sources = null;
        if (!isJSON(streamRes.sources)) {
            const scriptJs = await ctx.proxiedFetcher(`https://rabbitstream.net/js/player/prod/e4-player.min.js`, {
                query: {
                    // browser side caching on this endpoint is quite extreme. Add version query paramter to circumvent any caching
                    v: Date.now().toString()
                }
            });
            const decryptionKey = extractKey(scriptJs);
            if (!decryptionKey) throw new Error("Key extraction failed");
            let extractedKey = "";
            let strippedSources = streamRes.sources;
            let totalledOffset = 0;
            decryptionKey.forEach(([a, b]) => {
                const start = a + totalledOffset;
                const end = start + b;
                extractedKey += streamRes.sources.slice(start, end);
                strippedSources = strippedSources.replace(streamRes.sources.substring(start, end), "");
                totalledOffset += b;
            });
            const decryptedStream = AES$1.decrypt(strippedSources, extractedKey).toString(enc.Utf8);
            const parsedStream = JSON.parse(decryptedStream)[0];
            if (!parsedStream) throw new Error("No stream found");
            sources = parsedStream;
        }
        if (!sources) throw new Error("upcloud source not found");
        const captions = [];
        streamRes.tracks.forEach((track) => {
            if (track.kind !== "captions") return;
            const type = getCaptionTypeFromUrl(track.file);
            if (!type) return;
            const language = labelToLanguageCode(track.label.split(" ")[0]);
            if (!language) return;
            captions.push({
                id: track.file,
                language,
                hasCorsRestrictions: false,
                type,
                url: track.file
            });
        });
        return {
            stream: [
                {
                    id: "primary",
                    type: "hls",
                    playlist: sources.file,
                    flags: [flags.CORS_ALLOWED],
                    captions,
                    preferredHeaders: {
                        Referer: referer$4,
                        Origin: origin$1
                    }
                }
            ]
        };
    }
});
const packedRegex$1 = /(eval\(function\(p,a,c,k,e,d\).*\)\)\))/;
const linkRegex$2 = /sources:\[{file:"(.*?)"/;
const upstreamScraper = makeEmbed({
    id: "upstream",
    name: "UpStream",
    rank: 199,
    async scrape(ctx) {
        const streamRes = await ctx.proxiedFetcher(ctx.url);
        const packed = streamRes.match(packedRegex$1);
        if (packed) {
            const unpacked = unpacker.unpack(packed[1]);
            const link = unpacked.match(linkRegex$2);
            if (link) {
                return {
                    stream: [
                        {
                            id: "primary",
                            type: "hls",
                            playlist: link[1],
                            flags: [flags.CORS_ALLOWED],
                            captions: []
                        }
                    ]
                };
            }
        }
        throw new Error("upstream source not found");
    }
});
const vidsrcBase = "https://vidsrc.me";
const vidsrcRCPBase = "https://vidsrc.stream";
const hlsURLRegex = /file:"(.*?)"/;
const setPassRegex = /var pass_path = "(.*set_pass\.php.*)";/;
function formatHlsB64(data2) {
    const encodedB64 = data2.replace(/\/@#@\/[^=/]+==/g, "");
    if (encodedB64.match(/\/@#@\/[^=/]+==/)) {
        return formatHlsB64(encodedB64);
    }
    return encodedB64;
}
const vidsrcembedScraper = makeEmbed({
    id: "vidsrcembed",
    // VidSrc is both a source and an embed host
    name: "VidSrc",
    rank: 197,
    async scrape(ctx) {
        var _a, _b, _c;
        const html = await ctx.proxiedFetcher(ctx.url, {
            headers: {
                referer: ctx.url
            }
        });
        let hlsMatch = (_b = (_a = html.match(hlsURLRegex)) == null ? void 0 : _a[1]) == null ? void 0 : _b.slice(2);
        if (!hlsMatch) throw new Error("Unable to find HLS playlist");
        hlsMatch = formatHlsB64(hlsMatch);
        const finalUrl = atob(hlsMatch);
        if (!finalUrl.includes(".m3u8")) throw new Error("Unable to find HLS playlist");
        let setPassLink = (_c = html.match(setPassRegex)) == null ? void 0 : _c[1];
        if (setPassLink) {
            if (setPassLink.startsWith("//")) {
                setPassLink = `https:${setPassLink}`;
            }
            await ctx.proxiedFetcher(setPassLink, {
                headers: {
                    referer: ctx.url
                }
            });
        }
        return {
            stream: [
                {
                    id: "primary",
                    type: "hls",
                    playlist: finalUrl,
                    headers: {
                        Referer: vidsrcRCPBase,
                        Origin: vidsrcRCPBase
                    },
                    flags: [],
                    captions: []
                }
            ]
        };
    }
});
const evalCodeRegex$2 = /eval\((.*)\)/g;
const fileRegex$1 = /file:"(.*?)"/g;
const tracksRegex$1 = /\{file:"([^"]+)",kind:"thumbnails"\}/g;
const vTubeScraper = makeEmbed({
    id: "vtube",
    name: "vTube",
    rank: 145,
    scrape: async (ctx) => {
        const mainPageRes = await ctx.proxiedFetcher.full(ctx.url, {
            headers: {
                referer: ctx.url
            }
        });
        const mainPage = mainPageRes.body;
        const html = load(mainPage);
        const evalCode = html("script").text().match(evalCodeRegex$2);
        if (!evalCode) throw new Error("Failed to find eval code");
        const unpacked = unpack(evalCode == null ? void 0 : evalCode.toString());
        const file = fileRegex$1.exec(unpacked);
        const thumbnailTrack = tracksRegex$1.exec(unpacked);
        if (!(file == null ? void 0 : file[1])) throw new Error("Failed to find file");
        return {
            stream: [
                {
                    id: "primary",
                    type: "hls",
                    playlist: file[1],
                    flags: [flags.CORS_ALLOWED],
                    captions: [],
                    ...thumbnailTrack ? {
                        thumbnailTrack: {
                            type: "vtt",
                            url: new URL(mainPageRes.finalUrl).origin + thumbnailTrack[1]
                        }
                    } : {}
                }
            ]
        };
    }
});
const baseUrl$b = "https://autoembed.cc/";
async function comboScraper$a(ctx) {
    const playerPage = await ctx.proxiedFetcher(`/embed/player.php`, {
        baseUrl: baseUrl$b,
        query: {
            id: ctx.media.tmdbId,
            ...ctx.media.type === "show" && {
                s: ctx.media.season.number.toString(),
                e: ctx.media.episode.number.toString()
            }
        }
    });
    const fileDataMatch = playerPage.match(/"file": (\[.*?\])/s);
    if (!fileDataMatch[1]) throw new NotFoundError("No data found");
    const fileData = JSON.parse(fileDataMatch[1].replace(/,\s*\]$/, "]"));
    const embeds = [];
    for (const stream of fileData) {
        const url = stream.file;
        if (!url) continue;
        embeds.push({ embedId: `autoembed-${stream.title.toLowerCase().trim()}`, url });
    }
    return {
        embeds
    };
}
const autoembedScraper = makeSourcerer({
    id: "autoembed",
    name: "Autoembed",
    rank: 90,
    disabled: false,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: comboScraper$a,
    scrapeShow: comboScraper$a
});
async function comboScraper$9(ctx) {
    const embedPage = await ctx.proxiedFetcher(
        `https://bombthe.irish/embed/${ctx.media.type === "movie" ? `movie/${ctx.media.tmdbId}` : `tv/${ctx.media.tmdbId}/${ctx.media.season.number}/${ctx.media.episode.number}`}`
    );
    const $ = load(embedPage);
    const embeds = [];
    $("#dropdownMenu a").each((_, element) => {
        const url = new URL($(element).data("url")).searchParams.get("url");
        if (!url) return;
        embeds.push({ embedId: $(element).text().toLowerCase(), url: atob(url) });
    });
    return { embeds };
}
const bombtheirishScraper = makeSourcerer({
    id: "bombtheirish",
    name: "bombthe.irish",
    rank: 100,
    disabled: true,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: comboScraper$9,
    scrapeShow: comboScraper$9
});
function normalizeTitle(title) {
    let titleTrimmed = title.trim().toLowerCase();
    if (titleTrimmed !== "the movie" && titleTrimmed.endsWith("the movie")) {
        titleTrimmed = titleTrimmed.replace("the movie", "");
    }
    if (titleTrimmed !== "the series" && titleTrimmed.endsWith("the series")) {
        titleTrimmed = titleTrimmed.replace("the series", "");
    }
    return titleTrimmed.replace(/['":]/g, "").replace(/[^a-zA-Z0-9]+/g, "_");
}
function compareTitle(a, b) {
    return normalizeTitle(a) === normalizeTitle(b);
}
function compareMedia(media, title, releaseYear) {
    const isSameYear = releaseYear === void 0 ? true : media.releaseYear === releaseYear;
    return compareTitle(media.title, title) && isSameYear;
}
const baseUrl$a = "https://catflix.su";
async function comboScraper$8(ctx) {
    var _a;
    const searchPage = await ctx.proxiedFetcher("/", {
        baseUrl: baseUrl$a,
        query: {
            s: ctx.media.title
        }
    });
    ctx.progress(40);
    const $search = load(searchPage);
    const searchResults = [];
    $search("li").each((_, element) => {
        const title = $search(element).find("h2").first().text().trim();
        const year = Number($search(element).find(".text-xs > span").eq(1).text().trim()) || void 0;
        const url2 = $search(element).find("a").attr("href");
        if (!title || !url2) return;
        searchResults.push({ title, year, url: url2 });
    });
    let watchPageUrl = (_a = searchResults.find((x) => x && compareMedia(ctx.media, x.title, x.year))) == null ? void 0 : _a.url;
    if (!watchPageUrl) throw new NotFoundError("No watchable item found");
    ctx.progress(60);
    if (ctx.media.type === "show") {
        const match = watchPageUrl.match(/\/series\/([^/]+)\/?/);
        if (!match) throw new Error("Failed to parse watch page url");
        watchPageUrl = watchPageUrl.replace(
            `/series/${match[1]}`,
            `/episode/${match[1]}-${ctx.media.season.number}x${ctx.media.episode.number}`
        );
    }
    const watchPage = load(await ctx.proxiedFetcher(watchPageUrl));
    ctx.progress(80);
    const url = watchPage("iframe").first().attr("src");
    if (!url) throw new Error("Failed to find embed url");
    ctx.progress(90);
    return {
        embeds: [
            {
                embedId: "turbovid",
                url
            }
        ]
    };
}
const catflixScraper = makeSourcerer({
    id: "catflix",
    name: "Catflix",
    rank: 170,
    flags: [],
    scrapeMovie: comboScraper$8,
    scrapeShow: comboScraper$8
});
function makeCookieHeader(cookies) {
    return Object.entries(cookies).map(([name, value]) => cookie.serialize(name, value)).join("; ");
}
function parseSetCookie(headerValue) {
    const splitHeaderValue = setCookieParser.splitCookiesString(headerValue);
    const parsedCookies = setCookieParser.parse(splitHeaderValue, {
        map: true
    });
    return parsedCookies;
}
const baseUrl$9 = "https://ee3.me";
const username = "_sf_";
const password = "defonotscraping";
async function login(user, pass, ctx) {
    const req = await ctx.proxiedFetcher.full("/login", {
        baseUrl: baseUrl$9,
        method: "POST",
        body: new URLSearchParams({ user, pass, action: "login" }),
        readHeaders: ["Set-Cookie"]
    });
    const res = JSON.parse(req.body);
    const cookie2 = parseSetCookie(
        // It retruns a cookie even when the login failed
        // I have the backup cookie here just in case
        res.status === 1 ? req.headers.get("Set-Cookie") ?? "" : "PHPSESSID=mk2p73c77qc28o5i5120843ruu;"
    );
    return cookie2.PHPSESSID.value;
}
function parseSearch$1(body) {
    const result = [];
    const $ = load(body);
    $("div").each((_, element) => {
        const title = $(element).find(".title").text().trim();
        const year = parseInt($(element).find(".details span").first().text().trim(), 10);
        const id = $(element).find(".control-buttons").attr("data-id");
        if (title && year && id) {
            result.push({ title, year, id });
        }
    });
    return result;
}
async function comboScraper$7(ctx) {
    var _a, _b;
    const pass = await login(username, password, ctx);
    if (!pass) throw new Error("Login failed");
    const search2 = parseSearch$1(
        await ctx.proxiedFetcher("/get", {
            baseUrl: baseUrl$9,
            method: "POST",
            body: new URLSearchParams({ query: ctx.media.title, action: "search" }),
            headers: {
                cookie: makeCookieHeader({ PHPSESSID: pass })
            }
        })
    );
    const id = (_a = search2.find((v) => v && compareMedia(ctx.media, v.title, v.year))) == null ? void 0 : _a.id;
    if (!id) throw new NotFoundError("No watchable item found");
    const details = JSON.parse(
        await ctx.proxiedFetcher("/get", {
            baseUrl: baseUrl$9,
            method: "POST",
            body: new URLSearchParams({ id, action: "get_movie_info" }),
            headers: {
                cookie: makeCookieHeader({ PHPSESSID: pass })
            }
        })
    );
    if (!details.message.video) throw new Error("Failed to get the stream");
    const keyParams = JSON.parse(
        await ctx.proxiedFetcher("/renew", {
            baseUrl: baseUrl$9,
            method: "POST",
            headers: {
                cookie: makeCookieHeader({ PHPSESSID: pass })
            }
        })
    );
    if (!keyParams.k) throw new Error("Failed to get the key");
    const server = details.message.server === "1" ? "https://vid.ee3.me/vid/" : "https://vault.rips.cc/video/";
    const k = keyParams.k;
    const url = `${server}${details.message.video}?${new URLSearchParams({ k })}`;
    const captions = [];
    if (((_b = details.message.subs) == null ? void 0 : _b.toLowerCase()) === "yes" && details.message.imdbID) {
        captions.push({
            id: `https://rips.cc/subs/${details.message.imdbID}.vtt`,
            url: `https://rips.cc/subs/${details.message.imdbID}.vtt`,
            type: "vtt",
            hasCorsRestrictions: false,
            language: "en"
        });
    }
    return {
        embeds: [],
        stream: [
            {
                id: "primary",
                type: "file",
                flags: [flags.CORS_ALLOWED],
                captions,
                qualities: {
                    // should be unknown, but all the videos are 720p
                    720: {
                        type: "mp4",
                        url
                    }
                }
            }
        ]
    };
}
const ee3Scraper = makeSourcerer({
    id: "ee3",
    name: "EE3",
    rank: 150,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: comboScraper$7
});
const vidCloudScraper = makeEmbed({
    id: "vidcloud",
    name: "VidCloud",
    rank: 201,
    disabled: true,
    async scrape(ctx) {
        const result = await upcloudScraper.scrape(ctx);
        return {
            stream: result.stream.map((s) => ({
                ...s,
                flags: []
            }))
        };
    }
});
const flixHqBase = "https://flixhq.to";
async function getFlixhqSourceDetails(ctx, sourceId) {
    const jsonData = await ctx.proxiedFetcher(`/ajax/sources/${sourceId}`, {
        baseUrl: flixHqBase
    });
    return jsonData.link;
}
async function getFlixhqMovieSources(ctx, media, id) {
    const episodeParts = id.split("-");
    const episodeId = episodeParts[episodeParts.length - 1];
    const data2 = await ctx.proxiedFetcher(`/ajax/movie/episodes/${episodeId}`, {
        baseUrl: flixHqBase
    });
    const doc = load(data2);
    const sourceLinks = doc(".nav-item > a").toArray().map((el) => {
        const query = doc(el);
        const embedTitle = query.attr("title");
        const linkId = query.attr("data-linkid");
        if (!embedTitle || !linkId) throw new Error("invalid sources");
        return {
            embed: embedTitle,
            episodeId: linkId
        };
    });
    return sourceLinks;
}
async function getFlixhqShowSources(ctx, media, id) {
    var _a, _b;
    const episodeParts = id.split("-");
    const episodeId = episodeParts[episodeParts.length - 1];
    const seasonsListData = await ctx.proxiedFetcher(`/ajax/season/list/${episodeId}`, {
        baseUrl: flixHqBase
    });
    const seasonsDoc = load(seasonsListData);
    const season = (_a = seasonsDoc(".dropdown-item").toArray().find((el) => seasonsDoc(el).text() === `Season ${media.season.number}`)) == null ? void 0 : _a.attribs["data-id"];
    if (!season) throw new NotFoundError("season not found");
    const seasonData = await ctx.proxiedFetcher(`/ajax/season/episodes/${season}`, {
        baseUrl: flixHqBase
    });
    const seasonDoc = load(seasonData);
    const episode = (_b = seasonDoc(".nav-item > a").toArray().map((el) => {
        return {
            id: seasonDoc(el).attr("data-id"),
            title: seasonDoc(el).attr("title")
        };
    }).find((e) => {
        var _a2;
        return (_a2 = e.title) == null ? void 0 : _a2.startsWith(`Eps ${media.episode.number}`);
    })) == null ? void 0 : _b.id;
    if (!episode) throw new NotFoundError("episode not found");
    const data2 = await ctx.proxiedFetcher(`/ajax/episode/servers/${episode}`, {
        baseUrl: flixHqBase
    });
    const doc = load(data2);
    const sourceLinks = doc(".nav-item > a").toArray().map((el) => {
        const query = doc(el);
        const embedTitle = query.attr("title");
        const linkId = query.attr("data-id");
        if (!embedTitle || !linkId) throw new Error("invalid sources");
        return {
            embed: embedTitle,
            episodeId: linkId
        };
    });
    return sourceLinks;
}
async function getFlixhqId(ctx, media) {
    const searchResults = await ctx.proxiedFetcher(`/search/${media.title.replaceAll(/[^a-z0-9A-Z]/g, "-")}`, {
        baseUrl: flixHqBase
    });
    const doc = load(searchResults);
    const items = doc(".film_list-wrap > div.flw-item").toArray().map((el) => {
        var _a;
        const query = doc(el);
        const id = (_a = query.find("div.film-poster > a").attr("href")) == null ? void 0 : _a.slice(1);
        const title = query.find("div.film-detail > h2 > a").attr("title");
        const year = query.find("div.film-detail > div.fd-infor > span:nth-child(1)").text();
        const seasons = year.includes("SS") ? year.split("SS")[1] : "0";
        if (!id || !title || !year) return null;
        return {
            id,
            title,
            year: parseInt(year, 10),
            seasons: parseInt(seasons, 10)
        };
    });
    const matchingItem = items.find((v) => {
        if (!v) return false;
        if (media.type === "movie") {
            return compareMedia(media, v.title, v.year);
        }
        return compareTitle(media.title, v.title) && media.season.number < v.seasons + 1;
    });
    if (!matchingItem) return null;
    return matchingItem.id;
}
const flixhqScraper = makeSourcerer({
    id: "flixhq",
    name: "FlixHQ",
    rank: 230,
    flags: [flags.CORS_ALLOWED],
    disabled: true,
    async scrapeMovie(ctx) {
        const id = await getFlixhqId(ctx, ctx.media);
        if (!id) throw new NotFoundError("no search results match");
        const sources = await getFlixhqMovieSources(ctx, ctx.media, id);
        const embeds = [];
        for (const source of sources) {
            if (source.embed.toLowerCase() === "upcloud") {
                embeds.push({
                    embedId: upcloudScraper.id,
                    url: await getFlixhqSourceDetails(ctx, source.episodeId)
                });
            } else if (source.embed.toLowerCase() === "vidcloud") {
                embeds.push({
                    embedId: vidCloudScraper.id,
                    url: await getFlixhqSourceDetails(ctx, source.episodeId)
                });
            }
        }
        return {
            embeds
        };
    },
    async scrapeShow(ctx) {
        const id = await getFlixhqId(ctx, ctx.media);
        if (!id) throw new NotFoundError("no search results match");
        const sources = await getFlixhqShowSources(ctx, ctx.media, id);
        const embeds = [];
        for (const source of sources) {
            if (source.embed.toLowerCase() === "server upcloud") {
                embeds.push({
                    embedId: upcloudScraper.id,
                    url: await getFlixhqSourceDetails(ctx, source.episodeId)
                });
            } else if (source.embed.toLowerCase() === "server vidcloud") {
                embeds.push({
                    embedId: vidCloudScraper.id,
                    url: await getFlixhqSourceDetails(ctx, source.episodeId)
                });
            }
        }
        return {
            embeds
        };
    }
});
function getValidQualityFromString(quality) {
    switch (quality.toLowerCase().replace("p", "")) {
        case "360":
            return "360";
        case "480":
            return "480";
        case "720":
            return "720";
        case "1080":
            return "1080";
        case "2160":
            return "4k";
        case "4k":
            return "4k";
        default:
            return "unknown";
    }
}
const baseUrl$8 = "https://fsharetv.co";
async function comboScraper$6(ctx) {
    var _a, _b;
    const searchPage = await ctx.proxiedFetcher("/search", {
        baseUrl: baseUrl$8,
        query: {
            q: ctx.media.title
        }
    });
    const search$ = load(searchPage);
    const searchResults = [];
    search$(".movie-item").each((_, element) => {
        var _a2;
        const [, title, year] = ((_a2 = search$(element).find("b").text()) == null ? void 0 : _a2.match(/^(.*?)\s*(?:\(?\s*(\d{4})(?:\s*-\s*\d{0,4})?\s*\)?)?\s*$/)) || [];
        const url = search$(element).find("a").attr("href");
        if (!title || !url) return;
        searchResults.push({ title, year: Number(year) ?? void 0, url });
    });
    const watchPageUrl = (_a = searchResults.find((x) => x && compareMedia(ctx.media, x.title, x.year))) == null ? void 0 : _a.url;
    if (!watchPageUrl) throw new NotFoundError("No watchable item found");
    const watchPage = await ctx.proxiedFetcher(watchPageUrl.replace("/movie", "/w"), { baseUrl: baseUrl$8 });
    const fileId = (_b = watchPage.match(/Movie\.setSource\('([^']*)'/)) == null ? void 0 : _b[1];
    if (!fileId) throw new Error("File ID not found");
    const apiRes = await ctx.proxiedFetcher(
        `/api/file/${fileId}/source`,
        {
            baseUrl: baseUrl$8,
            query: {
                type: "watch"
            }
        }
    );
    if (!apiRes.data.file.sources.length) throw new Error("No sources found");
    const mediaBase = new URL((await ctx.proxiedFetcher.full(apiRes.data.file.sources[0].src, { baseUrl: baseUrl$8 })).finalUrl).origin;
    const qualities = apiRes.data.file.sources.reduce(
        (acc, source) => {
            const quality = typeof source.quality === "number" ? source.quality.toString() : source.quality;
            const validQuality = getValidQualityFromString(quality);
            acc[validQuality] = {
                type: "mp4",
                url: `${mediaBase}${source.src.replace("/api", "")}`
            };
            return acc;
        },
        {}
    );
    return {
        embeds: [],
        stream: [
            {
                id: "primary",
                type: "file",
                flags: [],
                headers: {
                    referer: "https://fsharetv.co"
                },
                qualities,
                captions: []
            }
        ]
    };
}
const fsharetvScraper = makeSourcerer({
    id: "fsharetv",
    name: "FshareTV",
    rank: 220,
    flags: [],
    scrapeMovie: comboScraper$6
});
const linkRegex$1 = /'hls': ?'(http.*?)',/;
const tracksRegex = /previewThumbnails:\s{.*src:\["([^"]+)"]/;
const voeScraper = makeEmbed({
    id: "voe",
    name: "voe.sx",
    rank: 180,
    async scrape(ctx) {
        const embedRes = await ctx.proxiedFetcher.full(ctx.url);
        const embed2 = embedRes.body;
        const playerSrc = embed2.match(linkRegex$1) ?? [];
        const thumbnailTrack = embed2.match(tracksRegex);
        const streamUrl = playerSrc[1];
        if (!streamUrl) throw new Error("Stream url not found in embed code");
        return {
            stream: [
                {
                    type: "hls",
                    id: "primary",
                    playlist: streamUrl,
                    flags: [flags.CORS_ALLOWED, flags.IP_LOCKED],
                    captions: [],
                    headers: {
                        Referer: "https://voe.sx"
                    },
                    ...thumbnailTrack ? {
                        thumbnailTrack: {
                            type: "vtt",
                            url: new URL(embedRes.finalUrl).origin + thumbnailTrack[1]
                        }
                    } : {}
                }
            ]
        };
    }
});
async function getSource(ctx, sources, title) {
    const source = load(sources)(`a[title*=${title} i]`);
    const sourceDataId = (source == null ? void 0 : source.attr("data-id")) ?? (source == null ? void 0 : source.attr("data-linkid"));
    if (!sourceDataId) return void 0;
    const sourceData = await ctx.proxiedFetcher(`/ajax/sources/${sourceDataId}`, {
        headers: {
            "X-Requested-With": "XMLHttpRequest"
        },
        baseUrl: gomoviesBase
    });
    if (!sourceData.link || sourceData.type !== "iframe") return void 0;
    return sourceData;
}
const gomoviesBase = `https://gomovies.sx`;
const goMoviesScraper = makeSourcerer({
    id: "gomovies",
    name: "GOmovies",
    rank: 50,
    disabled: true,
    flags: [flags.CORS_ALLOWED],
    async scrapeShow(ctx) {
        var _a;
        const search2 = await ctx.proxiedFetcher(`/search/${ctx.media.title.replaceAll(/[^a-z0-9A-Z]/g, "-")}`, {
            method: "GET",
            headers: {
                "X-Requested-With": "XMLHttpRequest"
            },
            baseUrl: gomoviesBase
        });
        const searchPage = load(search2);
        const mediaElements = searchPage("div.film-detail");
        const mediaData = mediaElements.toArray().map((movieEl) => {
            var _a2, _b;
            const name = (_a2 = searchPage(movieEl).find("h2.film-name a")) == null ? void 0 : _a2.text();
            const year = (_b = searchPage(movieEl).find("span.fdi-item:first")) == null ? void 0 : _b.text();
            const path = searchPage(movieEl).find("h2.film-name a").attr("href");
            return { name, year, path };
        });
        const targetMedia = mediaData.find((m) => m.name === ctx.media.title);
        if (!(targetMedia == null ? void 0 : targetMedia.path)) throw new NotFoundError("Media not found");
        let mediaId = (_a = targetMedia.path.split("-").pop()) == null ? void 0 : _a.replace("/", "");
        const seasons = await ctx.proxiedFetcher(`/ajax/v2/tv/seasons/${mediaId}`, {
            headers: {
                "X-Requested-With": "XMLHttpRequest"
            },
            baseUrl: gomoviesBase
        });
        const seasonsEl = load(seasons)(".ss-item");
        const seasonsData = seasonsEl.toArray().map((season) => ({
            number: load(season).text().replace("Season ", ""),
            dataId: season.attribs["data-id"]
        }));
        const seasonNumber = ctx.media.season.number;
        const targetSeason = seasonsData.find((season) => +season.number === seasonNumber);
        if (!targetSeason) throw new NotFoundError("Season not found");
        const episodes = await ctx.proxiedFetcher(`/ajax/v2/season/episodes/${targetSeason.dataId}`, {
            headers: {
                "X-Requested-With": "XMLHttpRequest"
            },
            baseUrl: gomoviesBase
        });
        const episodesPage = load(episodes);
        const episodesEl = episodesPage(".eps-item");
        const episodesData = episodesEl.toArray().map((ep) => ({
            dataId: ep.attribs["data-id"],
            number: episodesPage(ep).find("strong").text().replace("Eps", "").replace(":", "").trim()
        }));
        const episodeNumber = ctx.media.episode.number;
        const targetEpisode = episodesData.find((ep) => ep.number ? +ep.number === episodeNumber : false);
        if (!(targetEpisode == null ? void 0 : targetEpisode.dataId)) throw new NotFoundError("Episode not found");
        mediaId = targetEpisode.dataId;
        const sources = await ctx.proxiedFetcher(`ajax/v2/episode/servers/${mediaId}`, {
            baseUrl: gomoviesBase,
            headers: {
                "X-Requested-With": "XMLHttpRequest"
            }
        });
        const upcloudSource = await getSource(ctx, sources, "upcloud");
        const vidcloudSource = await getSource(ctx, sources, "vidcloud");
        const voeSource = await getSource(ctx, sources, "voe");
        const doodSource = await getSource(ctx, sources, "doodstream");
        const upstreamSource = await getSource(ctx, sources, "upstream");
        const mixdropSource = await getSource(ctx, sources, "mixdrop");
        const embeds = [
            {
                embedId: upcloudScraper.id,
                url: upcloudSource == null ? void 0 : upcloudSource.link
            },
            {
                embedId: vidCloudScraper.id,
                url: vidcloudSource == null ? void 0 : vidcloudSource.link
            },
            {
                embedId: voeScraper.id,
                url: voeSource == null ? void 0 : voeSource.link
            },
            {
                embedId: doodScraper.id,
                url: doodSource == null ? void 0 : doodSource.link
            },
            {
                embedId: upstreamScraper.id,
                url: upstreamSource == null ? void 0 : upstreamSource.link
            },
            {
                embedId: mixdropScraper.id,
                url: mixdropSource == null ? void 0 : mixdropSource.link
            }
        ];
        const filteredEmbeds = embeds.filter((embed2) => embed2.url).map((embed2) => ({
            embedId: embed2.embedId,
            url: embed2.url
        }));
        if (filteredEmbeds.length === 0) throw new Error("No valid embeds found.");
        return {
            embeds: filteredEmbeds
        };
    },
    async scrapeMovie(ctx) {
        var _a;
        const search2 = await ctx.proxiedFetcher(`/search/${ctx.media.title.replaceAll(/[^a-z0-9A-Z]/g, "-")}`, {
            method: "GET",
            headers: {
                "X-Requested-With": "XMLHttpRequest"
            },
            baseUrl: gomoviesBase
        });
        const searchPage = load(search2);
        const mediaElements = searchPage("div.film-detail");
        const mediaData = mediaElements.toArray().map((movieEl) => {
            var _a2, _b;
            const name = (_a2 = searchPage(movieEl).find("h2.film-name a")) == null ? void 0 : _a2.text();
            const year = (_b = searchPage(movieEl).find("span.fdi-item:first")) == null ? void 0 : _b.text();
            const path = searchPage(movieEl).find("h2.film-name a").attr("href");
            return { name, year, path };
        });
        const targetMedia = mediaData.find(
            (m) => m.name === ctx.media.title && m.year === ctx.media.releaseYear.toString()
        );
        if (!(targetMedia == null ? void 0 : targetMedia.path)) throw new NotFoundError("Media not found");
        const mediaId = (_a = targetMedia.path.split("-").pop()) == null ? void 0 : _a.replace("/", "");
        const sources = await ctx.proxiedFetcher(`ajax/movie/episodes/${mediaId}`, {
            headers: {
                "X-Requested-With": "XMLHttpRequest"
            },
            baseUrl: gomoviesBase
        });
        const upcloudSource = await getSource(ctx, sources, "upcloud");
        const vidcloudSource = await getSource(ctx, sources, "vidcloud");
        const voeSource = await getSource(ctx, sources, "voe");
        const doodSource = await getSource(ctx, sources, "doodstream");
        const upstreamSource = await getSource(ctx, sources, "upstream");
        const mixdropSource = await getSource(ctx, sources, "mixdrop");
        const embeds = [
            {
                embedId: upcloudScraper.id,
                url: upcloudSource == null ? void 0 : upcloudSource.link
            },
            {
                embedId: vidCloudScraper.id,
                url: vidcloudSource == null ? void 0 : vidcloudSource.link
            },
            {
                embedId: voeScraper.id,
                url: voeSource == null ? void 0 : voeSource.link
            },
            {
                embedId: doodScraper.id,
                url: doodSource == null ? void 0 : doodSource.link
            },
            {
                embedId: upstreamScraper.id,
                url: upstreamSource == null ? void 0 : upstreamSource.link
            },
            {
                embedId: mixdropScraper.id,
                url: mixdropSource == null ? void 0 : mixdropSource.link
            }
        ];
        const filteredEmbeds = embeds.filter((embed2) => embed2.url).map((embed2) => ({
            embedId: embed2.embedId,
            url: embed2.url
        }));
        if (filteredEmbeds.length === 0) throw new Error("No valid embeds found.");
        return {
            embeds: filteredEmbeds
        };
    }
});
async function getCaptions(data2) {
    let captions = [];
    for (const subtitle of data2) {
        let language = "";
        if (subtitle.name.includes("Рус")) {
            language = "ru";
        } else if (subtitle.name.includes("Укр")) {
            language = "uk";
        } else if (subtitle.name.includes("Eng")) {
            language = "en";
        } else {
            continue;
        }
        captions.push({
            id: subtitle.url,
            url: subtitle.url,
            language,
            type: "vtt",
            hasCorsRestrictions: false
        });
    }
    captions = removeDuplicatedLanguages(captions);
    return captions;
}
const insertUnitBase = "https://api.insertunit.ws/";
const insertunitScraper = makeSourcerer({
    id: "insertunit",
    name: "Insertunit",
    rank: 110,
    disabled: true,
    flags: [flags.CORS_ALLOWED],
    async scrapeShow(ctx) {
        const playerData = await ctx.fetcher(`/embed/imdb/${ctx.media.imdbId}`, {
            baseUrl: insertUnitBase
        });
        ctx.progress(30);
        const seasonDataJSONregex = /seasons:(.*)/;
        const seasonData = seasonDataJSONregex.exec(playerData);
        if (seasonData === null || seasonData[1] === null) {
            throw new NotFoundError("No result found");
        }
        ctx.progress(60);
        const seasonTable = JSON.parse(seasonData[1]);
        const currentSeason = seasonTable.find(
            (seasonElement) => seasonElement.season === ctx.media.season.number && !seasonElement.blocked
        );
        const currentEpisode = currentSeason == null ? void 0 : currentSeason.episodes.find(
            (episodeElement) => episodeElement.episode.includes(ctx.media.episode.number.toString())
        );
        if (!(currentEpisode == null ? void 0 : currentEpisode.hls)) throw new NotFoundError("No result found");
        let captions = [];
        if (currentEpisode.cc != null) {
            captions = await getCaptions(currentEpisode.cc);
        }
        ctx.progress(95);
        return {
            embeds: [],
            stream: [
                {
                    id: "primary",
                    playlist: currentEpisode.hls,
                    type: "hls",
                    flags: [flags.CORS_ALLOWED],
                    captions
                }
            ]
        };
    },
    async scrapeMovie(ctx) {
        const playerData = await ctx.fetcher(`/embed/imdb/${ctx.media.imdbId}`, {
            baseUrl: insertUnitBase
        });
        ctx.progress(35);
        const streamRegex = /hls: "([^"]*)/;
        const streamData = streamRegex.exec(playerData);
        if (streamData === null || streamData[1] === null) {
            throw new NotFoundError("No result found");
        }
        ctx.progress(75);
        const subtitleRegex = /cc: (.*)/;
        const subtitleJSONData = subtitleRegex.exec(playerData);
        let captions = [];
        if (subtitleJSONData != null && subtitleJSONData[1] != null) {
            const subtitleData = JSON.parse(subtitleJSONData[1]);
            captions = await getCaptions(subtitleData);
        }
        ctx.progress(90);
        return {
            embeds: [],
            stream: [
                {
                    id: "primary",
                    type: "hls",
                    playlist: streamData[1],
                    flags: [flags.CORS_ALLOWED],
                    captions
                }
            ]
        };
    }
});
const kissasianBase = "https://kissasian.sh";
const embedProviders = [
    {
        type: mp4uploadScraper.id,
        id: "mp"
    },
    {
        type: streamsbScraper.id,
        id: "sb"
    }
];
async function getEmbeds$2(ctx, targetEpisode) {
    let embeds = await Promise.all(
        embedProviders.map(async (provider) => {
            if (!targetEpisode.url) throw new NotFoundError("Episode not found");
            const watch = await ctx.proxiedFetcher(`${targetEpisode.url}&s=${provider.id}`, {
                baseUrl: kissasianBase,
                headers: {
                    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
                    "accept-language": "en-US,en;q=0.9",
                    "cache-control": "no-cache",
                    pragma: "no-cache",
                    "sec-ch-ua": '"Not)A;Brand";v="24", "Chromium";v="116"',
                    "sec-ch-ua-mobile": "?0",
                    "sec-ch-ua-platform": '"macOS"',
                    "sec-fetch-dest": "document",
                    "sec-fetch-mode": "navigate",
                    "sec-fetch-site": "cross-site",
                    "sec-fetch-user": "?1",
                    "upgrade-insecure-requests": "1",
                    cookie: "__rd=; ASP.NET_SessionId=jwnl2kmlw5h4mfdaxvpk30q0; k_token=OKbJDFNx3rUtaw7iAA6UxMKSJb79lgZ2X2rVC9aupJhycYQKVSLaW1y2B4K%2f%2fo3i6BuzhXgfkJGmKlKH6LpNlKPPpZUk31n9DapfMdJgjlLExgrPS3jpSKwGnNUI%2bOpNpZu9%2fFnkLZRxvVKCa8APMxrck1tYkKXWqfyJJh8%2b7hQTI1wfAOU%2fLEouHhtQGL%2fReTzElw2LQ0XSL1pjs%2fkWW3rM3of2je7Oo13I%2f7olLFuiJUVWyNbn%2fYKSgNrm%2bQ3p"
                }
            });
            const watchPage = load(watch);
            const embedUrl = watchPage("#my_video_1").attr("src");
            if (!embedUrl) throw new Error("Embed not found");
            return {
                embedId: provider.id,
                url: embedUrl
            };
        })
    );
    embeds = embeds.filter((e) => !!e.url);
    return embeds;
}
function getEpisodes(dramaPage) {
    const episodesEl = dramaPage(".episodeSub");
    return episodesEl.toArray().map((ep) => {
        var _a;
        const number = (_a = dramaPage(ep).find(".episodeSub a").text().split("Episode")[1]) == null ? void 0 : _a.trim();
        const url = dramaPage(ep).find(".episodeSub a").attr("href");
        return { number, url };
    }).filter((e) => !!e.url);
}
async function search$1(ctx, title, seasonNumber) {
    const searchForm = new FormData();
    searchForm.append("keyword", `${title} ${seasonNumber ?? ""}`.trim());
    searchForm.append("type", "Drama");
    const searchResults = await ctx.proxiedFetcher("/Search/SearchSuggest", {
        baseUrl: kissasianBase,
        method: "POST",
        body: searchForm
    });
    const searchPage = load(searchResults);
    return Array.from(searchPage("a")).map((drama) => {
        return {
            name: searchPage(drama).text(),
            url: drama.attribs.href
        };
    });
}
const kissAsianScraper = makeSourcerer({
    id: "kissasian",
    name: "KissAsian",
    rank: 40,
    flags: [flags.CORS_ALLOWED],
    disabled: true,
    async scrapeShow(ctx) {
        const seasonNumber = ctx.media.season.number;
        const episodeNumber = ctx.media.episode.number;
        const dramas = await search$1(ctx, ctx.media.title, seasonNumber);
        const targetDrama = dramas.find((d) => {
            var _a;
            return ((_a = d.name) == null ? void 0 : _a.toLowerCase()) === ctx.media.title.toLowerCase();
        }) ?? dramas[0];
        if (!targetDrama) throw new NotFoundError("Drama not found");
        ctx.progress(30);
        const drama = await ctx.proxiedFetcher(targetDrama.url, {
            baseUrl: kissasianBase
        });
        const dramaPage = load(drama);
        const episodes = await getEpisodes(dramaPage);
        const targetEpisode = episodes.find((e) => e.number === `${episodeNumber}`);
        if (!(targetEpisode == null ? void 0 : targetEpisode.url)) throw new NotFoundError("Episode not found");
        ctx.progress(70);
        const embeds = await getEmbeds$2(ctx, targetEpisode);
        return {
            embeds
        };
    },
    async scrapeMovie(ctx) {
        const dramas = await search$1(ctx, ctx.media.title, void 0);
        const targetDrama = dramas.find((d) => {
            var _a;
            return ((_a = d.name) == null ? void 0 : _a.toLowerCase()) === ctx.media.title.toLowerCase();
        }) ?? dramas[0];
        if (!targetDrama) throw new NotFoundError("Drama not found");
        ctx.progress(30);
        const drama = await ctx.proxiedFetcher(targetDrama.url, {
            baseUrl: kissasianBase
        });
        const dramaPage = load(drama);
        const episodes = getEpisodes(dramaPage);
        const targetEpisode = episodes[0];
        if (!(targetEpisode == null ? void 0 : targetEpisode.url)) throw new NotFoundError("Episode not found");
        ctx.progress(70);
        const embeds = await getEmbeds$2(ctx, targetEpisode);
        return {
            embeds
        };
    }
});
async function getVideoSources(ctx, id, media) {
    let path = "";
    if (media.type === "show") {
        path = `/v1/episodes/view`;
    } else if (media.type === "movie") {
        path = `/v1/movies/view`;
    }
    const data2 = await ctx.fetcher(path, {
        baseUrl: baseUrl$7,
        query: { expand: "streams,subtitles", id }
    });
    return data2;
}
async function getVideo(ctx, id, media) {
    const data2 = await getVideoSources(ctx, id, media);
    const videoSources = data2.streams;
    const opts = ["auto", "1080p", "1080", "720p", "720", "480p", "480", "240p", "240", "360p", "360", "144", "144p"];
    let videoUrl = null;
    for (const res of opts) {
        if (videoSources[res] && !videoUrl) {
            videoUrl = videoSources[res];
        }
    }
    let captions = [];
    for (const sub of data2.subtitles) {
        const language = labelToLanguageCode(sub.language);
        if (!language) continue;
        captions.push({
            id: sub.url,
            type: "vtt",
            url: `${baseUrl$7}${sub.url}`,
            hasCorsRestrictions: false,
            language
        });
    }
    captions = removeDuplicatedLanguages(captions);
    return {
        playlist: videoUrl,
        captions
    };
}
const baseUrl$7 = "https://lmscript.xyz";
async function searchAndFindMedia$1(ctx, media) {
    if (media.type === "show") {
        const searchRes = await ctx.fetcher(`/v1/shows`, {
            baseUrl: baseUrl$7,
            query: { "filters[q]": media.title }
        });
        const results = searchRes.items;
        const result = results.find((res) => compareMedia(media, res.title, Number(res.year)));
        return result;
    }
    if (media.type === "movie") {
        const searchRes = await ctx.fetcher(`/v1/movies`, {
            baseUrl: baseUrl$7,
            query: { "filters[q]": media.title }
        });
        const results = searchRes.items;
        const result = results.find((res) => compareMedia(media, res.title, Number(res.year)));
        return result;
    }
}
async function scrape(ctx, media, result) {
    var _a;
    let id = null;
    if (media.type === "movie") {
        id = result.id_movie;
    } else if (media.type === "show") {
        const data2 = await ctx.fetcher(`/v1/shows`, {
            baseUrl: baseUrl$7,
            query: { expand: "episodes", id: result.id_show }
        });
        const episode = (_a = data2.episodes) == null ? void 0 : _a.find((v) => {
            return Number(v.season) === Number(media.season.number) && Number(v.episode) === Number(media.episode.number);
        });
        if (episode) id = episode.id;
    }
    if (id === null) throw new NotFoundError("Not found");
    const video = await getVideo(ctx, id, media);
    return video;
}
async function universalScraper$9(ctx) {
    const lookmovieData = await searchAndFindMedia$1(ctx, ctx.media);
    if (!lookmovieData) throw new NotFoundError("Media not found");
    ctx.progress(30);
    const video = await scrape(ctx, ctx.media, lookmovieData);
    if (!video.playlist) throw new NotFoundError("No video found");
    ctx.progress(60);
    return {
        embeds: [],
        stream: [
            {
                id: "primary",
                playlist: video.playlist,
                type: "hls",
                flags: [flags.IP_LOCKED],
                captions: video.captions
            }
        ]
    };
}
const lookmovieScraper = makeSourcerer({
    id: "lookmovie",
    name: "LookMovie",
    disabled: true,
    rank: 60,
    flags: [flags.IP_LOCKED],
    scrapeShow: universalScraper$9,
    scrapeMovie: universalScraper$9
});
const baseUrl$6 = "https://mp4hydra.org/";
async function comboScraper$5(ctx) {
    var _a;
    const searchPage = await ctx.proxiedFetcher("/search", {
        baseUrl: baseUrl$6,
        query: {
            q: ctx.media.title
        }
    });
    ctx.progress(40);
    const $search = load(searchPage);
    const searchResults = [];
    $search(".search-details").each((_, element) => {
        var _a2;
        const [, title, year] = $search(element).find("a").first().text().trim().match(/^(.*?)\s*(?:\(?\s*(\d{4})(?:\s*-\s*\d{0,4})?\s*\)?)?\s*$/) || [];
        const url = (_a2 = $search(element).find("a").attr("href")) == null ? void 0 : _a2.split("/")[4];
        if (!title || !url) return;
        searchResults.push({ title, year: year ? parseInt(year, 10) : void 0, url });
    });
    const s = (_a = searchResults.find((x) => x && compareMedia(ctx.media, x.title, x.year))) == null ? void 0 : _a.url;
    if (!s) throw new NotFoundError("No watchable item found");
    ctx.progress(60);
    const data2 = await ctx.proxiedFetcher("/info2?v=8", {
        method: "POST",
        body: new URLSearchParams({ z: JSON.stringify([{ s, t: "movie" }]) }),
        baseUrl: baseUrl$6
    });
    if (!data2.playlist[0].src || !data2.servers) throw new NotFoundError("No watchable item found");
    ctx.progress(80);
    const embeds = [];
    [
        data2.servers[data2.servers.auto],
        ...Object.values(data2.servers).filter((x) => x !== data2.servers[data2.servers.auto] && x !== data2.servers.auto)
    ].forEach(
        (server, _) => embeds.push({ embedId: `mp4hydra-${_ + 1}`, url: `${server}${data2.playlist[0].src}|${data2.playlist[0].label}` })
    );
    ctx.progress(90);
    return {
        embeds
    };
}
const mp4hydraScraper = makeSourcerer({
    id: "mp4hydra",
    name: "Mp4Hydra",
    rank: 35,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: comboScraper$5,
    scrapeShow: comboScraper$5
});
async function comboScraper$4(ctx) {
    var _a;
    const query = {
        title: ctx.media.title,
        releaseYear: ctx.media.releaseYear,
        tmdbId: ctx.media.tmdbId,
        imdbId: ctx.media.imdbId,
        type: ctx.media.type,
        ...ctx.media.type === "show" && {
            season: ctx.media.season.number.toString(),
            episode: ctx.media.episode.number.toString()
        }
    };
    const res = await ctx.fetcher("https://api.nsbx.ru/status");
    if (((_a = res.providers) == null ? void 0 : _a.length) === 0) throw new NotFoundError("No ContentProviders available");
    if (!res.endpoint) throw new Error("No endpoint returned");
    const embeds = res.providers.map((provider) => {
        return {
            embedId: provider,
            url: `${JSON.stringify(query)}|${res.endpoint}`
        };
    });
    return {
        embeds
    };
}
const nsbxScraper = makeSourcerer({
    id: "nsbx",
    name: "NSBX",
    rank: 290,
    flags: [flags.CORS_ALLOWED],
    disabled: true,
    externalSource: true,
    scrapeMovie: comboScraper$4,
    scrapeShow: comboScraper$4
});
const universalScraper$8 = async (ctx) => {
    var _a;
    try {
        const res = await ctx.fetcher.full(`https://red-star.ningai.workers.dev/scrape/showbox`, {
            query: {
                type: ctx.media.type,
                title: ctx.media.title,
                releaseYear: ctx.media.releaseYear.toString(),
                tmdbId: ctx.media.tmdbId,
                imdbId: ctx.media.imdbId ?? "",
                ...ctx.media.type === "show" && {
                    episodeNumber: ctx.media.episode.number.toString(),
                    episodeTmdbId: ctx.media.episode.tmdbId,
                    seasonNumber: ctx.media.season.number.toString(),
                    seasonTmdbId: ctx.media.season.tmdbId
                }
            }
        });
        if (res.statusCode === 200 && ((_a = res.body.stream) == null ? void 0 : _a.length))
            return { stream: res.body.stream, embeds: [] };
        if (res.statusCode === 404) throw new NotFoundError("No watchable item found");
        throw new Error(res.body.message ?? "An error has occurred!");
    } catch (e) {
        if (e instanceof NotFoundError) throw new NotFoundError(e.message);
        throw new Error(e.message ?? "An error has occurred!");
    }
};
const redStarScraper = makeSourcerer({
    id: "redstar",
    name: "redStar",
    disabled: true,
    externalSource: true,
    rank: 280,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: universalScraper$8,
    scrapeShow: universalScraper$8
});
const remotestreamBase = atob("aHR0cHM6Ly9mc2IuOG1ldDNkdGpmcmNxY2hjb25xcGtsd3hzeGIyb2N1bWMuc3RyZWFt");
const origin = "https://remotestre.am";
const referer$3 = "https://remotestre.am/";
const remotestreamScraper = makeSourcerer({
    id: "remotestream",
    name: "Remote Stream",
    disabled: true,
    rank: 30,
    flags: [flags.CORS_ALLOWED],
    async scrapeShow(ctx) {
        var _a;
        const seasonNumber = ctx.media.season.number;
        const episodeNumber = ctx.media.episode.number;
        const playlistLink = `${remotestreamBase}/Shows/${ctx.media.tmdbId}/${seasonNumber}/${episodeNumber}/${episodeNumber}.m3u8`;
        ctx.progress(30);
        const streamRes = await ctx.proxiedFetcher.full(playlistLink, {
            method: "GET",
            readHeaders: ["content-type"],
            headers: {
                Referer: referer$3
            }
        });
        if (!((_a = streamRes.headers.get("content-type")) == null ? void 0 : _a.toLowerCase().includes("application/x-mpegurl")))
            throw new NotFoundError("No watchable item found");
        ctx.progress(90);
        return {
            embeds: [],
            stream: [
                {
                    id: "primary",
                    captions: [],
                    playlist: playlistLink,
                    type: "hls",
                    flags: [flags.CORS_ALLOWED],
                    preferredHeaders: {
                        Referer: referer$3,
                        Origin: origin
                    }
                }
            ]
        };
    },
    async scrapeMovie(ctx) {
        var _a;
        const playlistLink = `${remotestreamBase}/Movies/${ctx.media.tmdbId}/${ctx.media.tmdbId}.m3u8`;
        ctx.progress(30);
        const streamRes = await ctx.proxiedFetcher.full(playlistLink, {
            method: "GET",
            readHeaders: ["content-type"],
            headers: {
                Referer: referer$3
            }
        });
        if (!((_a = streamRes.headers.get("content-type")) == null ? void 0 : _a.toLowerCase().includes("application/x-mpegurl")))
            throw new NotFoundError("No watchable item found");
        ctx.progress(90);
        return {
            embeds: [],
            stream: [
                {
                    id: "primary",
                    captions: [],
                    playlist: playlistLink,
                    type: "hls",
                    flags: [flags.CORS_ALLOWED],
                    preferredHeaders: {
                        Referer: referer$3,
                        Origin: origin
                    }
                }
            ]
        };
    }
});
async function comboScraper$3(ctx) {
    const searchQuery = {
        module: "Search4",
        page: "1",
        type: "all",
        keyword: ctx.media.title,
        pagelimit: "20"
    };
    const searchRes = (await sendRequest(ctx, searchQuery, true)).data.list;
    ctx.progress(50);
    const showboxEntry = searchRes.find(
        (res) => compareTitle(res.title, ctx.media.title) && res.year === Number(ctx.media.releaseYear)
    );
    if (!showboxEntry) throw new NotFoundError("No entry found");
    const id = showboxEntry.id;
    const season = ctx.media.type === "show" ? ctx.media.season.number : "";
    const episode = ctx.media.type === "show" ? ctx.media.episode.number : "";
    return {
        embeds: [
            {
                embedId: febboxMp4Scraper.id,
                url: `/${ctx.media.type}/${id}/${season}/${episode}`
            }
        ]
    };
}
const showboxScraper = makeSourcerer({
    id: "showbox",
    name: "Showbox",
    rank: 250,
    disabled: true,
    flags: [flags.CORS_ALLOWED, flags.CF_BLOCKED],
    scrapeShow: comboScraper$3,
    scrapeMovie: comboScraper$3
});
const baseUrl$5 = "https://theyallsayflix.su/";
async function comboScraper$2(ctx) {
    const apiRes = await ctx.proxiedFetcher.full("/api/v1/search", {
        query: {
            type: ctx.media.type,
            tmdb_id: ctx.media.tmdbId,
            ...ctx.media.type === "show" && {
                season: ctx.media.season.number.toString(),
                episode: ctx.media.episode.number.toString()
            }
        },
        baseUrl: baseUrl$5
    });
    const data2 = apiRes.body;
    if (apiRes.statusCode !== 200 || !data2.streams[0].play_url) throw new NotFoundError("No watchable item found");
    const captions = [];
    if (data2.subtitles) {
        for (const caption of data2.subtitles) {
            const language = labelToLanguageCode(caption.label);
            if (!language) continue;
            captions.push({
                id: caption.url,
                url: caption.url,
                type: "vtt",
                hasCorsRestrictions: false,
                language
            });
        }
    }
    return {
        embeds: [],
        stream: [
            {
                id: "primary",
                playlist: data2.streams[0].play_url,
                type: "hls",
                flags: [flags.CORS_ALLOWED],
                captions
            }
        ]
    };
}
const TASFScraper = makeSourcerer({
    id: "tasf",
    name: "theyallsayflix.su",
    rank: 225,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: comboScraper$2,
    scrapeShow: comboScraper$2
});
const baseUrl$4 = "https://tugaflix.best/";
function parseSearch(page) {
    const results = [];
    const $ = load(page);
    $(".items .poster").each((_, element) => {
        var _a;
        const $link = $(element).find("a");
        const url = $link.attr("href");
        const [, title, year] = ((_a = $link.attr("title")) == null ? void 0 : _a.match(/^(.*?)\s*(?:\((\d{4})\))?\s*$/)) || [];
        if (!title || !url) return;
        results.push({ title, year: year ? parseInt(year, 10) : void 0, url });
    });
    return results;
}
const tugaflixScraper = makeSourcerer({
    id: "tugaflix",
    name: "Tugaflix",
    rank: 70,
    flags: [flags.IP_LOCKED],
    scrapeMovie: async (ctx) => {
        var _a;
        const searchResults = parseSearch(
            await ctx.proxiedFetcher("/filmes/", {
                baseUrl: baseUrl$4,
                query: {
                    s: ctx.media.title
                }
            })
        );
        if (searchResults.length === 0) throw new NotFoundError("No watchable item found");
        const url = (_a = searchResults.find((x) => x && compareMedia(ctx.media, x.title, x.year))) == null ? void 0 : _a.url;
        if (!url) throw new NotFoundError("No watchable item found");
        const videoPage = await ctx.proxiedFetcher(url, {
            method: "POST",
            body: new URLSearchParams({ play: "" })
        });
        const $ = load(videoPage);
        const embeds = [];
        for (const element of $(".play a")) {
            const embedUrl = $(element).attr("href");
            if (!embedUrl) continue;
            const embedPage = await ctx.proxiedFetcher.full(
                embedUrl.startsWith("https://") ? embedUrl : `https://${embedUrl}`
            );
            const finalUrl = load(embedPage.body)('a:contains("Download Filme")').attr("href");
            if (!finalUrl) continue;
            if (finalUrl.includes("streamtape")) {
                embeds.push({
                    embedId: "streamtape",
                    url: finalUrl
                });
            } else if (finalUrl.includes("dood")) {
                embeds.push({
                    embedId: "dood",
                    url: finalUrl
                });
            }
        }
        return {
            embeds
        };
    },
    scrapeShow: async (ctx) => {
        var _a;
        const searchResults = parseSearch(
            await ctx.proxiedFetcher("/series/", {
                baseUrl: baseUrl$4,
                query: {
                    s: ctx.media.title
                }
            })
        );
        if (searchResults.length === 0) throw new NotFoundError("No watchable item found");
        const url = (_a = searchResults.find((x) => x && compareMedia(ctx.media, x.title, x.year))) == null ? void 0 : _a.url;
        if (!url) throw new NotFoundError("No watchable item found");
        const s = ctx.media.season.number < 10 ? `0${ctx.media.season.number}` : ctx.media.season.number.toString();
        const e = ctx.media.episode.number < 10 ? `0${ctx.media.episode.number}` : ctx.media.episode.number.toString();
        const videoPage = await ctx.proxiedFetcher(url, {
            method: "POST",
            body: new URLSearchParams({ [`S${s}E${e}`]: "" })
        });
        const embedUrl = load(videoPage)('iframe[name="player"]').attr("src");
        if (!embedUrl) throw new Error("Failed to find iframe");
        const playerPage = await ctx.proxiedFetcher(embedUrl.startsWith("https:") ? embedUrl : `https:${embedUrl}`, {
            method: "POST",
            body: new URLSearchParams({ submit: "" })
        });
        const embeds = [];
        const finalUrl = load(playerPage)('a:contains("Download Episodio")').attr("href");
        if (finalUrl == null ? void 0 : finalUrl.includes("streamtape")) {
            embeds.push({
                embedId: "streamtape",
                url: finalUrl
            });
        } else if (finalUrl == null ? void 0 : finalUrl.includes("dood")) {
            embeds.push({
                embedId: "dood",
                url: finalUrl
            });
        }
        return {
            embeds
        };
    }
});
function decodeSrc(encoded, seed) {
    let decoded = "";
    const seedLength = seed.length;
    for (let i = 0; i < encoded.length; i += 2) {
        const byte = parseInt(encoded.substr(i, 2), 16);
        const seedChar = seed.charCodeAt(i / 2 % seedLength);
        decoded += String.fromCharCode(byte ^ seedChar);
    }
    return decoded;
}
async function getVidSrcEmbeds(ctx, startingURL) {
    const embeds = [];
    let html = await ctx.proxiedFetcher(startingURL, {
        baseUrl: vidsrcBase
    });
    let $ = load(html);
    const sourceHashes = $(".server[data-hash]").toArray().map((el) => $(el).attr("data-hash")).filter((hash) => hash !== void 0);
    for (const hash of sourceHashes) {
        html = await ctx.proxiedFetcher(`/rcp/${hash}`, {
            baseUrl: vidsrcRCPBase,
            headers: {
                referer: vidsrcBase
            }
        });
        $ = load(html);
        const encoded = $("#hidden").attr("data-h");
        const seed = $("body").attr("data-i");
        if (!encoded || !seed) {
            throw new Error("Failed to find encoded iframe used2b");
        }
        let redirectURL = decodeSrc(encoded, seed);
        if (redirectURL.startsWith("//")) {
            redirectURL = `https:${redirectURL}`;
        }
        const { finalUrl } = await ctx.proxiedFetcher.full(redirectURL, {
            method: "HEAD",
            headers: {
                referer: vidsrcBase
            }
        });
        const embed2 = {
            embedId: "",
            url: finalUrl
        };
        const parsedUrl = new URL(finalUrl);
        switch (parsedUrl.host) {
            case "vidsrc.stream":
                embed2.embedId = vidsrcembedScraper.id;
                break;
            case "streambucket.net":
                embed2.embedId = streambucketScraper.id;
                break;
            case "2embed.cc":
            case "www.2embed.cc":
                break;
            case "player-cdn.com":
                break;
            default:
                throw new Error(`Failed to find VidSrc embed source for ${finalUrl}`);
        }
        if (embed2.embedId !== "") {
            embeds.push(embed2);
        }
    }
    return embeds;
}
async function getVidSrcMovieSources(ctx) {
    return getVidSrcEmbeds(ctx, `/embed/${ctx.media.tmdbId}`);
}
async function getVidSrcShowSources(ctx) {
    const html = await ctx.proxiedFetcher(`/embed/${ctx.media.tmdbId}`, {
        baseUrl: vidsrcBase
    });
    const $ = load(html);
    const episodeElement = $(`.ep[data-s="${ctx.media.season.number}"][data-e="${ctx.media.episode.number}"]`).first();
    if (episodeElement.length === 0) {
        throw new Error("failed to find episode element");
    }
    const startingURL = episodeElement.attr("data-iframe");
    if (!startingURL) {
        throw new Error("failed to find episode starting URL");
    }
    return getVidSrcEmbeds(ctx, startingURL);
}
async function scrapeMovie$1(ctx) {
    return {
        embeds: await getVidSrcMovieSources(ctx)
    };
}
async function scrapeShow$1(ctx) {
    return {
        embeds: await getVidSrcShowSources(ctx)
    };
}
const vidsrcScraper = makeSourcerer({
    id: "vidsrc",
    name: "VidSrc",
    rank: 130,
    disabled: true,
    flags: [],
    scrapeMovie: scrapeMovie$1,
    scrapeShow: scrapeShow$1
});
async function comboScraper$1(ctx) {
    const embedPage = await ctx.proxiedFetcher(
        `https://vidsrc.su/embed/${ctx.media.type === "movie" ? `movie/${ctx.media.tmdbId}` : `tv/${ctx.media.tmdbId}/${ctx.media.season.number}/${ctx.media.episode.number}`}`
    );
    const servers = [...embedPage.matchAll(/label: 'Server (1|2|3)', url: '(https.*)'/g)].sort((a, b) => {
        const ranks = { "1": 10, "2": 30, "3": 20 };
        return ranks[b[1]] - ranks[a[1]];
    }).map((x) => x[2]);
    if (!servers[0]) throw new NotFoundError("No flixhq playlist found");
    return {
        embeds: [],
        stream: [
            {
                id: "primary",
                playlist: servers[0],
                type: "hls",
                flags: [flags.CORS_ALLOWED],
                captions: []
            }
        ]
    };
}
const vidsrcsuScraper = makeSourcerer({
    id: "vidsrcsu",
    name: "vidsrc.su (FlixHQ)",
    rank: 229,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: comboScraper$1,
    scrapeShow: comboScraper$1
});
async function getZoeChipSources(ctx, id) {
    const endpoint = ctx.media.type === "movie" ? "list" : "servers";
    const html = await ctx.proxiedFetcher(`/ajax/episode/${endpoint}/${id}`, {
        baseUrl: zoeBase
    });
    const $ = load(html);
    return $(".nav-item a").toArray().map((el) => {
        const idAttribute = ctx.media.type === "movie" ? "data-linkid" : "data-id";
        const element = $(el);
        const embedTitle = element.attr("title");
        const linkId = element.attr(idAttribute);
        if (!embedTitle || !linkId) {
            throw new Error("invalid sources");
        }
        return {
            embed: embedTitle,
            episodeId: linkId
        };
    });
}
async function getZoeChipSourceURL(ctx, sourceID) {
    const details = await ctx.proxiedFetcher(`/ajax/sources/${sourceID}`, {
        baseUrl: zoeBase
    });
    if (details.type !== "iframe") {
        return null;
    }
    return details.link;
}
async function getZoeChipSeasonID(ctx, media, showID) {
    const html = await ctx.proxiedFetcher(`/ajax/season/list/${showID}`, {
        baseUrl: zoeBase
    });
    const $ = load(html);
    const seasons = $(".dropdown-menu a").toArray().map((el) => {
        var _a;
        const element = $(el);
        const seasonID = element.attr("data-id");
        const seasonNumber = (_a = element.html()) == null ? void 0 : _a.split(" ")[1];
        if (!seasonID || !seasonNumber || Number.isNaN(Number(seasonNumber))) {
            throw new Error("invalid season");
        }
        return {
            id: seasonID,
            season: Number(seasonNumber)
        };
    });
    const foundSeason = seasons.find((season) => season.season === media.season.number);
    if (!foundSeason) {
        return null;
    }
    return foundSeason.id;
}
async function getZoeChipEpisodeID(ctx, media, seasonID) {
    const episodeNumberRegex = /Eps (\d*):/;
    const html = await ctx.proxiedFetcher(`/ajax/season/episodes/${seasonID}`, {
        baseUrl: zoeBase
    });
    const $ = load(html);
    const episodes = $(".eps-item").toArray().map((el) => {
        const element = $(el);
        const episodeID = element.attr("data-id");
        const title = element.attr("title");
        if (!episodeID || !title) {
            throw new Error("invalid episode");
        }
        const regexResult = title.match(episodeNumberRegex);
        if (!regexResult || Number.isNaN(Number(regexResult[1]))) {
            throw new Error("invalid episode");
        }
        return {
            id: episodeID,
            episode: Number(regexResult[1])
        };
    });
    const foundEpisode = episodes.find((episode) => episode.episode === media.episode.number);
    if (!foundEpisode) {
        return null;
    }
    return foundEpisode.id;
}
const zoeBase = "https://zoechip.cc";
async function formatSource(ctx, source) {
    const link = await getZoeChipSourceURL(ctx, source.episodeId);
    if (link) {
        const embed2 = {
            embedId: "",
            url: link
        };
        const parsedUrl = new URL(link);
        switch (parsedUrl.host) {
            case "rabbitstream.net":
                embed2.embedId = upcloudScraper.id;
                break;
            case "upstream.to":
                embed2.embedId = upstreamScraper.id;
                break;
            case "mixdrop.co":
                embed2.embedId = mixdropScraper.id;
                break;
            default:
                return null;
        }
        return embed2;
    }
}
async function createZoeChipStreamData(ctx, id) {
    const sources = await getZoeChipSources(ctx, id);
    const embeds = [];
    for (const source of sources) {
        const formatted = await formatSource(ctx, source);
        if (formatted) {
            const upCloudAlreadyExists = embeds.find((e) => e.embedId === upcloudScraper.id);
            if (formatted.embedId === upcloudScraper.id && upCloudAlreadyExists) {
                formatted.embedId = vidCloudScraper.id;
            }
            embeds.push(formatted);
        }
    }
    return {
        embeds
    };
}
async function getZoeChipSearchResults(ctx, media) {
    const titleCleaned = media.title.toLocaleLowerCase().replace(/ /g, "-");
    const html = await ctx.proxiedFetcher(`/search/${titleCleaned}`, {
        baseUrl: zoeBase
    });
    const $ = load(html);
    return $(".film_list-wrap .flw-item .film-detail").toArray().map((element) => {
        const movie = $(element);
        const anchor = movie.find(".film-name a");
        const info = movie.find(".fd-infor");
        const title = anchor.attr("title");
        const href = anchor.attr("href");
        const type = info.find(".fdi-type").html();
        let year = info.find(".fdi-item").html();
        const id = href == null ? void 0 : href.split("-").pop();
        if (!title) {
            return null;
        }
        if (!href) {
            return null;
        }
        if (!type) {
            return null;
        }
        if (!year || Number.isNaN(Number(year))) {
            if (type === "TV") {
                year = "0";
            } else {
                return null;
            }
        }
        if (!id) {
            return null;
        }
        return {
            title,
            year: Number(year),
            id,
            type,
            href
        };
    });
}
async function getZoeChipMovieID(ctx, media) {
    const searchResults = await getZoeChipSearchResults(ctx, media);
    const matchingItem = searchResults.find((v) => v && v.type === "Movie" && compareMedia(media, v.title, v.year));
    if (!matchingItem) {
        return null;
    }
    return matchingItem.id;
}
async function getZoeChipShowID(ctx, media) {
    const releasedRegex = /<\/strong><\/span> (\d.*)-\d.*-\d.*/;
    const searchResults = await getZoeChipSearchResults(ctx, media);
    const filtered = searchResults.filter((v) => v && v.type === "TV" && compareMedia(media, v.title));
    for (const result of filtered) {
        if (!result) {
            continue;
        }
        const html = await ctx.proxiedFetcher(result.href, {
            baseUrl: zoeBase
        });
        const regexResult = html.match(releasedRegex);
        if (regexResult) {
            const year = Number(regexResult[1]);
            if (!Number.isNaN(year) && compareMedia(media, result.title, year)) {
                return result.id;
            }
        }
    }
    return null;
}
async function scrapeMovie(ctx) {
    const movieID = await getZoeChipMovieID(ctx, ctx.media);
    if (!movieID) {
        throw new NotFoundError("no search results match");
    }
    return createZoeChipStreamData(ctx, movieID);
}
async function scrapeShow(ctx) {
    const showID = await getZoeChipShowID(ctx, ctx.media);
    if (!showID) {
        throw new NotFoundError("no search results match");
    }
    const seasonID = await getZoeChipSeasonID(ctx, ctx.media, showID);
    if (!seasonID) {
        throw new NotFoundError("no season found");
    }
    const episodeID = await getZoeChipEpisodeID(ctx, ctx.media, seasonID);
    if (!episodeID) {
        throw new NotFoundError("no episode found");
    }
    return createZoeChipStreamData(ctx, episodeID);
}
const zoechipScraper = makeSourcerer({
    id: "zoechip",
    name: "ZoeChip",
    rank: 240,
    flags: [flags.CORS_ALLOWED],
    disabled: true,
    scrapeMovie,
    scrapeShow
});
const providers$1 = [
    {
        id: "autoembed-english",
        rank: 10
    },
    {
        id: "autoembed-hindi",
        rank: 9,
        disabled: true
    },
    {
        id: "autoembed-tamil",
        rank: 8,
        disabled: true
    },
    {
        id: "autoembed-telugu",
        rank: 7,
        disabled: true
    },
    {
        id: "autoembed-bengali",
        rank: 6,
        disabled: true
    }
];
function embed$1(provider) {
    return makeEmbed({
        id: provider.id,
        name: provider.id.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" "),
        disabled: provider.disabled,
        rank: provider.rank,
        async scrape(ctx) {
            return {
                stream: [
                    {
                        id: "primary",
                        type: "hls",
                        playlist: ctx.url,
                        flags: [flags.CORS_ALLOWED],
                        captions: []
                    }
                ]
            };
        }
    });
}
const [
    autoembedEnglishScraper,
    autoembedHindiScraper,
    autoembedBengaliScraper,
    autoembedTamilScraper,
    autoembedTeluguScraper
] = providers$1.map(embed$1);
const evalCodeRegex$1 = /eval\((.*)\)/g;
const mp4Regex = /https?:\/\/.*\.mp4/;
const bflixScraper = makeEmbed({
    id: "bflix",
    name: "bFlix",
    disabled: true,
    rank: 113,
    scrape: async (ctx) => {
        const mainPage = await ctx.proxiedFetcher(ctx.url);
        const evalCode = mainPage.match(evalCodeRegex$1);
        if (!evalCode) throw new Error("Failed to find eval code");
        const unpacked = unpack(evalCode[0]);
        const file = unpacked.match(mp4Regex);
        if (!(file == null ? void 0 : file[0])) throw new Error("Failed to find file");
        return {
            stream: [
                {
                    id: "primary",
                    type: "file",
                    flags: [],
                    captions: [],
                    qualities: {
                        unknown: {
                            type: "mp4",
                            url: file[0]
                        }
                    },
                    headers: {
                        Referer: "https://bflix.gs/"
                    }
                }
            ]
        };
    }
});
const referer$2 = "https://ridomovies.tv/";
const closeLoadScraper = makeEmbed({
    id: "closeload",
    name: "CloseLoad",
    rank: 106,
    async scrape(ctx) {
        var _a;
        const baseUrl3 = new URL(ctx.url).origin;
        const iframeRes = await ctx.proxiedFetcher(ctx.url, {
            headers: { referer: referer$2 }
        });
        const iframeRes$ = load(iframeRes);
        const captions = iframeRes$("track").map((_, el) => {
            const track = iframeRes$(el);
            const url2 = `${baseUrl3}${track.attr("src")}`;
            const label = track.attr("label") ?? "";
            const language = labelToLanguageCode(label);
            const captionType = getCaptionTypeFromUrl(url2);
            if (!language || !captionType) return null;
            return {
                id: url2,
                language,
                hasCorsRestrictions: true,
                type: captionType,
                url: url2
            };
        }).get().filter((x) => x !== null);
        const evalCode = iframeRes$("script").filter((_, el) => {
            var _a2;
            const script = iframeRes$(el);
            return (script.attr("type") === "text/javascript" && ((_a2 = script.html()) == null ? void 0 : _a2.includes("p,a,c,k,e,d"))) ?? false;
        }).html();
        if (!evalCode) throw new Error("Couldn't find eval code");
        const decoded = unpack(evalCode);
        const regexPattern = /var\s+(\w+)\s*=\s*"([^"]+)";/g;
        const base64EncodedUrl = (_a = regexPattern.exec(decoded)) == null ? void 0 : _a[2];
        if (!base64EncodedUrl) throw new NotFoundError("Unable to find source url");
        const url = atob(base64EncodedUrl);
        return {
            stream: [
                {
                    id: "primary",
                    type: "hls",
                    playlist: url,
                    captions,
                    flags: [flags.IP_LOCKED],
                    headers: {
                        Referer: "https://closeload.top/",
                        Origin: "https://closeload.top"
                    }
                }
            ]
        };
    }
});
const evalCodeRegex = /eval\((.*)\)/g;
const fileRegex = /file:"(.*?)"/g;
const fileMoonScraper = makeEmbed({
    id: "filemoon",
    name: "Filemoon",
    rank: 300,
    scrape: async (ctx) => {
        const embedRes = await ctx.proxiedFetcher(ctx.url, {
            headers: {
                referer: ctx.url
            }
        });
        const embedHtml = load(embedRes);
        const evalCode = embedHtml("script").text().match(evalCodeRegex);
        if (!evalCode) throw new Error("Failed to find eval code");
        const unpacked = unpack(evalCode[0]);
        const file = fileRegex.exec(unpacked);
        if (!(file == null ? void 0 : file[1])) throw new Error("Failed to find file");
        const url = new URL(ctx.url);
        const subtitlesLink = url.searchParams.get("sub.info");
        const captions = [];
        if (subtitlesLink) {
            const captionsResult = await ctx.proxiedFetcher(subtitlesLink);
            for (const caption of captionsResult) {
                const language = labelToLanguageCode(caption.label);
                const captionType = getCaptionTypeFromUrl(caption.file);
                if (!language || !captionType) continue;
                captions.push({
                    id: caption.file,
                    url: caption.file,
                    type: captionType,
                    language,
                    hasCorsRestrictions: false
                });
            }
        }
        return {
            stream: [
                {
                    id: "primary",
                    type: "hls",
                    playlist: file[1],
                    flags: [flags.IP_LOCKED],
                    captions
                }
            ]
        };
    }
});
const fileMoonMp4Scraper = makeEmbed({
    id: "filemoon-mp4",
    name: "Filemoon MP4",
    rank: 400,
    scrape: async (ctx) => {
        const result = await fileMoonScraper.scrape(ctx);
        if (!result.stream) throw new NotFoundError("Failed to find result");
        if (result.stream[0].type !== "hls") throw new NotFoundError("Failed to find hls stream");
        const url = result.stream[0].playlist.replace(/\/hls2\//, "/download/").replace(/\.m3u8/, ".mp4");
        return {
            stream: [
                {
                    id: "primary",
                    type: "file",
                    qualities: {
                        unknown: {
                            type: "mp4",
                            url
                        }
                    },
                    flags: [flags.IP_LOCKED],
                    captions: result.stream[0].captions
                }
            ]
        };
    }
});
const hydraxScraper = makeEmbed({
    id: "hydrax",
    name: "Hydrax",
    rank: 250,
    disabled: true,
    async scrape(ctx) {
        const embed2 = await ctx.proxiedFetcher(ctx.url);
        const match = embed2.match(/PLAYER\(atob\("(.*?)"/);
        if (!(match == null ? void 0 : match[1])) throw new Error("No Data Found");
        ctx.progress(50);
        const qualityMatch = embed2.match(/({"pieceLength.+?})/);
        let qualityData = {};
        if (qualityMatch == null ? void 0 : qualityMatch[1]) qualityData = JSON.parse(qualityMatch[1]);
        const data2 = JSON.parse(atob(match[1]));
        if (!data2.id || !data2.domain) throw new Error("Required values missing");
        const domain = new URL((await ctx.proxiedFetcher.full(`https://${data2.domain}`)).finalUrl).hostname;
        ctx.progress(100);
        return {
            stream: [
                {
                    id: "primary",
                    type: "file",
                    qualities: {
                        ...(qualityData == null ? void 0 : qualityData.fullHd) && {
                            1080: {
                                type: "mp4",
                                url: `https://${domain}/whw${data2.id}`
                            }
                        },
                        ...(qualityData == null ? void 0 : qualityData.hd) && {
                            720: {
                                type: "mp4",
                                url: `https://${domain}/www${data2.id}`
                            }
                        },
                        ...(qualityData == null ? void 0 : qualityData.mHd) && {
                            480: {
                                type: "mp4",
                                url: `https://${domain}/${data2.id}`
                            }
                        },
                        360: {
                            type: "mp4",
                            url: `https://${domain}/${data2.id}`
                        }
                    },
                    headers: {
                        Referer: ctx.url.replace(new URL(ctx.url).hostname, "abysscdn.com")
                    },
                    captions: [],
                    flags: []
                }
            ]
        };
    }
});
const providers = [
    {
        id: "mp4hydra-1",
        name: "Server 1",
        rank: 36
    },
    {
        id: "mp4hydra-2",
        name: "Server 2",
        rank: 35
    }
];
function embed(provider) {
    return makeEmbed({
        id: provider.id,
        name: provider.name,
        disabled: provider.disabled,
        rank: provider.rank,
        async scrape(ctx) {
            const [url, quality] = ctx.url.split("|");
            return {
                stream: [
                    {
                        id: "primary",
                        type: "file",
                        qualities: {
                            [getValidQualityFromString(quality || "")]: { url, type: "mp4" }
                        },
                        flags: [flags.CORS_ALLOWED],
                        captions: []
                    }
                ]
            };
        }
    });
}
const [mp4hydraServer1Scraper, mp4hydraServer2Scraper] = providers.map(embed);
const { AES, MD5 } = CryptoJS;
function mahoaData(input, key2) {
    const a = AES.encrypt(input, key2).toString();
    const b = a.replace("U2FsdGVkX1", "").replace(/\//g, "|a").replace(/\+/g, "|b").replace(/\\=/g, "|c").replace(/\|/g, "-z");
    return b;
}
function caesarShift(str, amount) {
    let output = "";
    for (let i = 0; i < str.length; i++) {
        let c = str[i];
        if (c.match(/[a-z]/i)) {
            const code = str.charCodeAt(i);
            if (code >= 65 && code <= 90) {
                c = String.fromCharCode((code - 65 + amount) % 26 + 65);
            } else if (code >= 97 && code <= 122) {
                c = String.fromCharCode((code - 97 + amount) % 26 + 97);
            }
        }
        output += c;
    }
    return output;
}
function stringToHex(tmp) {
    let str = "";
    for (let i = 0; i < tmp.length; i++) {
        str += tmp[i].charCodeAt(0).toString(16);
    }
    return str;
}
function generateResourceToken(idUser, idFile, domainRef) {
    const dataToken = stringToHex(
        caesarShift(mahoaData(`Win32|${idUser}|${idFile}|${domainRef}`, MD5("plhq@@@2022").toString()), 22)
    );
    const resourceToken = `${dataToken}|${MD5(`${dataToken}plhq@@@22`).toString()}`;
    return resourceToken;
}
const apiUrl = "https://api-post-iframe-rd.playm4u.xyz/api/playiframe";
const playm4uNMScraper = makeEmbed({
    id: "playm4u-nm",
    name: "PlayM4U",
    rank: 240,
    scrape: async (ctx) => {
        var _a, _b;
        const mainPage$ = load(await ctx.proxiedFetcher(ctx.url));
        const script = mainPage$(`script:contains("${apiUrl}")`).text();
        if (!script) throw new Error("Failed to get script");
        ctx.progress(50);
        const domainRef = "https://ww2.m4ufree.tv";
        const idFile = (_a = script.match(/var\s?idfile\s?=\s?"(.*)";/im)) == null ? void 0 : _a[1];
        const idUser = (_b = script.match(/var\s?iduser\s?=\s?"(.*)";/im)) == null ? void 0 : _b[1];
        if (!idFile || !idUser) throw new Error("Failed to get ids");
        const charecters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789=+";
        const apiRes = await ctx.proxiedFetcher(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                namekey: "playm4u03",
                token: Array.from({ length: 100 }, () => charecters.charAt(Math.floor(Math.random() * charecters.length))).join(
                    ""
                ),
                referrer: domainRef,
                data: generateResourceToken(idUser, idFile, domainRef)
            })
        });
        if (!apiRes.data || apiRes.type !== "url-m3u8") throw new Error("Failed to get the stream");
        ctx.progress(100);
        return {
            stream: [
                {
                    id: "primary",
                    type: "hls",
                    playlist: apiRes.data,
                    captions: [],
                    flags: []
                }
            ]
        };
    }
});
const referer$1 = "https://ridomovies.tv/";
const ridooScraper = makeEmbed({
    id: "ridoo",
    name: "Ridoo",
    rank: 105,
    async scrape(ctx) {
        var _a;
        const res = await ctx.proxiedFetcher(ctx.url, {
            headers: {
                referer: referer$1
            }
        });
        const regexPattern = /file:"([^"]+)"/g;
        const url = (_a = regexPattern.exec(res)) == null ? void 0 : _a[1];
        if (!url) throw new NotFoundError("Unable to find source url");
        return {
            stream: [
                {
                    id: "primary",
                    type: "hls",
                    playlist: url,
                    captions: [],
                    flags: [flags.CORS_ALLOWED]
                }
            ]
        };
    }
});
function decode(str) {
    const b = ["U0ZML2RVN0IvRGx4", "MGNhL0JWb0kvTlM5", "Ym94LzJTSS9aU0Zj", "SGJ0L1dGakIvN0dX", "eE52L1QwOC96N0Yz"];
    let formatedB64 = str.slice(2);
    for (let i = 4; i > -1; i--) {
        formatedB64 = formatedB64.replace(`//${b[i]}`, "");
    }
    return atob(formatedB64);
}
const smashyStreamFScraper = makeEmbed({
    id: "smashystream-f",
    name: "SmashyStream (F)",
    rank: 71,
    async scrape(ctx) {
        var _a, _b;
        const res = await ctx.proxiedFetcher(ctx.url, {
            headers: {
                Referer: ctx.url
            }
        });
        if (!res.sourceUrls[0]) throw new NotFoundError("No watchable item found");
        const playlist = decode(res.sourceUrls[0]);
        if (!playlist.includes(".m3u8")) throw new Error("Failed to decode");
        const captions = ((_b = (_a = res.subtitles) == null ? void 0 : _a.match(/\[([^\]]+)\](https?:\/\/\S+?)(?=,\[|$)/g)) == null ? void 0 : _b.map((entry) => {
            const match = entry.match(/\[([^\]]+)\](https?:\/\/\S+?)(?=,\[|$)/);
            if (match) {
                const [, language, url] = match;
                if (language && url) {
                    const languageCode = labelToLanguageCode(language.replace(/ - .*/, ""));
                    const captionType = getCaptionTypeFromUrl(url);
                    if (!languageCode || !captionType) return null;
                    return {
                        id: url,
                        url: url.replace(",", ""),
                        language: languageCode,
                        type: captionType,
                        hasCorsRestrictions: false
                    };
                }
            }
            return null;
        }).filter((x) => x !== null)) ?? [];
        return {
            stream: [
                {
                    id: "primary",
                    playlist,
                    type: "hls",
                    flags: [flags.CORS_ALLOWED],
                    captions
                }
            ]
        };
    }
});
const smashyStreamOScraper = makeEmbed({
    // the scraping logic for all smashystream embeds is the same
    // all the embeds can be added in the same way
    id: "smashystream-o",
    name: "SmashyStream (O)",
    rank: 70,
    async scrape(ctx) {
        const result = await smashyStreamFScraper.scrape(ctx);
        return {
            stream: result.stream
        };
    }
});
const streamtapeScraper = makeEmbed({
    id: "streamtape",
    name: "Streamtape",
    rank: 160,
    async scrape(ctx) {
        var _a;
        const embed2 = await ctx.proxiedFetcher(ctx.url);
        const match = embed2.match(/robotlink'\).innerHTML = (.*)'/);
        if (!match) throw new Error("No match found");
        const [fh, sh] = ((_a = match == null ? void 0 : match[1]) == null ? void 0 : _a.split("+ ('")) ?? [];
        if (!fh || !sh) throw new Error("No match found");
        const url = `https:${fh == null ? void 0 : fh.replace(/'/g, "").trim()}${sh == null ? void 0 : sh.substring(3).trim()}`;
        return {
            stream: [
                {
                    id: "primary",
                    type: "file",
                    flags: [flags.CORS_ALLOWED, flags.IP_LOCKED],
                    captions: [],
                    qualities: {
                        unknown: {
                            type: "mp4",
                            url
                        }
                    },
                    headers: {
                        Referer: "https://streamtape.com"
                    }
                }
            ]
        };
    }
});
const packedRegex = /(eval\(function\(p,a,c,k,e,d\).*\)\)\))/;
const linkRegex = /src:"(https:\/\/[^"]+)"/;
const streamvidScraper = makeEmbed({
    id: "streamvid",
    name: "Streamvid",
    rank: 215,
    async scrape(ctx) {
        const streamRes = await ctx.proxiedFetcher(ctx.url);
        const packed = streamRes.match(packedRegex);
        if (!packed) throw new Error("streamvid packed not found");
        const unpacked = unpacker.unpack(packed[1]);
        const link = unpacked.match(linkRegex);
        if (!link) throw new Error("streamvid link not found");
        return {
            stream: [
                {
                    type: "hls",
                    id: "primary",
                    playlist: link[1],
                    flags: [flags.CORS_ALLOWED],
                    captions: []
                }
            ]
        };
    }
});
const DECRYPTION_KEY = "WXrUARXb1aDLaZjI";
const decodeBase64UrlSafe = (str) => {
    const standardizedInput = str.replace(/_/g, "/").replace(/-/g, "+");
    const decodedData = atob(standardizedInput);
    const bytes = new Uint8Array(decodedData.length);
    for (let i = 0; i < bytes.length; i += 1) {
        bytes[i] = decodedData.charCodeAt(i);
    }
    return bytes;
};
const decodeData = (key2, data2) => {
    const state = Array.from(Array(256).keys());
    let index1 = 0;
    for (let i = 0; i < 256; i += 1) {
        index1 = (index1 + state[i] + key2.charCodeAt(i % key2.length)) % 256;
        const temp = state[i];
        state[i] = state[index1];
        state[index1] = temp;
    }
    index1 = 0;
    let index2 = 0;
    let finalKey = "";
    for (let char = 0; char < data2.length; char += 1) {
        index1 = (index1 + 1) % 256;
        index2 = (index2 + state[index1]) % 256;
        const temp = state[index1];
        state[index1] = state[index2];
        state[index2] = temp;
        if (typeof data2[char] === "string") {
            finalKey += String.fromCharCode(data2[char].charCodeAt(0) ^ state[(state[index1] + state[index2]) % 256]);
        } else if (typeof data2[char] === "number") {
            finalKey += String.fromCharCode(data2[char] ^ state[(state[index1] + state[index2]) % 256]);
        }
    }
    return finalKey;
};
const decryptSourceUrl = (sourceUrl) => {
    const encoded = decodeBase64UrlSafe(sourceUrl);
    const decoded = decodeData(DECRYPTION_KEY, encoded);
    return decodeURIComponent(decodeURIComponent(decoded));
};
const vidplayBase = "https://vidplay.online";
const getDecryptionKeys = async (ctx) => {
    var _a;
    const res = await ctx.proxiedFetcher("https://github.com/Ciarands/vidsrc-keys/blob/main/keys.json");
    const regex = /"rawLines":\s*\[([\s\S]*?)\]/;
    const rawLines = (_a = res.match(regex)) == null ? void 0 : _a[1];
    if (!rawLines) throw new Error("No keys found");
    const keys = JSON.parse(`${rawLines.substring(1).replace(/\\"/g, '"')}]`);
    return keys;
};
const getEncodedId = async (ctx) => {
    const url = new URL(ctx.url);
    const id = url.pathname.replace("/e/", "");
    const keyList = await getDecryptionKeys(ctx);
    const decodedId = decodeData(keyList[0], id);
    const encodedResult = decodeData(keyList[1], decodedId);
    const b64encoded = btoa(encodedResult);
    return b64encoded.replace("/", "_");
};
const getFuTokenKey = async (ctx) => {
    var _a;
    const id = await getEncodedId(ctx);
    const fuTokenRes = await ctx.proxiedFetcher("/futoken", {
        baseUrl: vidplayBase,
        headers: {
            referer: ctx.url
        }
    });
    const fuKey = (_a = fuTokenRes.match(/var\s+k\s*=\s*'([^']+)'/)) == null ? void 0 : _a[1];
    if (!fuKey) throw new Error("No fuKey found");
    const tokens = [];
    for (let i = 0; i < id.length; i += 1) {
        tokens.push(fuKey.charCodeAt(i % fuKey.length) + id.charCodeAt(i));
    }
    return `${fuKey},${tokens.join(",")}`;
};
const getFileUrl = async (ctx) => {
    const fuToken = await getFuTokenKey(ctx);
    return makeFullUrl(`/mediainfo/${fuToken}`, {
        baseUrl: vidplayBase,
        query: {
            ...Object.fromEntries(new URL(ctx.url).searchParams.entries()),
            autostart: "true"
        }
    });
};
const vidplayScraper = makeEmbed({
    id: "vidplay",
    name: "VidPlay",
    rank: 401,
    scrape: async (ctx) => {
        const fileUrl = await getFileUrl(ctx);
        const fileUrlRes = await ctx.proxiedFetcher(fileUrl, {
            headers: {
                referer: ctx.url
            }
        });
        if (typeof fileUrlRes.result === "number") throw new Error("File not found");
        const source = fileUrlRes.result.sources[0].file;
        const thumbnailSource = fileUrlRes.result.tracks.find((track) => track.kind === "thumbnails");
        let thumbnailTrack;
        if (thumbnailSource) {
            thumbnailTrack = {
                type: "vtt",
                url: thumbnailSource.file
            };
        }
        const url = new URL(ctx.url);
        const subtitlesLink = url.searchParams.get("sub.info");
        const captions = [];
        if (subtitlesLink) {
            const captionsResult = await ctx.proxiedFetcher(subtitlesLink);
            for (const caption of captionsResult) {
                const language = labelToLanguageCode(caption.label);
                const captionType = getCaptionTypeFromUrl(caption.file);
                if (!language || !captionType) continue;
                captions.push({
                    id: caption.file,
                    url: caption.file,
                    type: captionType,
                    language,
                    hasCorsRestrictions: false
                });
            }
        }
        return {
            stream: [
                {
                    id: "primary",
                    type: "hls",
                    playlist: source,
                    flags: [flags.PROXY_BLOCKED],
                    headers: {
                        Referer: url.origin,
                        Origin: url.origin
                    },
                    captions,
                    thumbnailTrack
                }
            ]
        };
    }
});
async function getVideowlUrlStream(ctx, decryptedId) {
    var _a;
    const sharePage = await ctx.proxiedFetcher("https://cloud.mail.ru/public/uaRH/2PYWcJRpH");
    const regex = /"videowl_view":\{"count":"(\d+)","url":"([^"]+)"\}/g;
    const videowlUrl = (_a = regex.exec(sharePage)) == null ? void 0 : _a[2];
    if (!videowlUrl) throw new NotFoundError("Failed to get videoOwlUrl");
    return `${videowlUrl}/0p/${btoa(decryptedId)}.m3u8?${new URLSearchParams({
        double_encode: "1"
    })}`;
}
const warezcdnembedHlsScraper = makeEmbed({
    id: "warezcdnembedhls",
    // WarezCDN is both a source and an embed host
    name: "WarezCDN HLS",
    // method no longer works
    disabled: true,
    rank: 83,
    async scrape(ctx) {
        const decryptedId = await getDecryptedId(ctx);
        if (!decryptedId) throw new NotFoundError("can't get file id");
        const streamUrl = await getVideowlUrlStream(ctx, decryptedId);
        return {
            stream: [
                {
                    id: "primary",
                    type: "hls",
                    flags: [flags.IP_LOCKED],
                    captions: [],
                    playlist: streamUrl
                }
            ]
        };
    }
});
const warezPlayerScraper = makeEmbed({
    id: "warezplayer",
    name: "warezPLAYER",
    rank: 85,
    async scrape(ctx) {
        const playerPageUrl = new URL(ctx.url);
        const hash = playerPageUrl.pathname.split("/")[2];
        const playerApiRes = await ctx.proxiedFetcher("/player/index.php", {
            baseUrl: playerPageUrl.origin,
            query: {
                data: hash,
                do: "getVideo"
            },
            method: "POST",
            body: new URLSearchParams({
                hash
            }),
            headers: {
                "X-Requested-With": "XMLHttpRequest"
            }
        });
        const sources = JSON.parse(playerApiRes);
        if (!sources.videoSource) throw new Error("Playlist not found");
        return {
            stream: [
                {
                    id: "primary",
                    type: "hls",
                    flags: [],
                    captions: [],
                    playlist: sources.videoSource,
                    headers: {
                        // without this it returns "security error"
                        Accept: "*/*"
                    }
                }
            ]
        };
    }
});
const wootlyScraper = makeEmbed({
    id: "wootly",
    name: "wootly",
    rank: 172,
    async scrape(ctx) {
        var _a, _b;
        const baseUrl3 = "https://www.wootly.ch";
        const wootlyData = await ctx.proxiedFetcher.full(ctx.url, {
            method: "GET",
            readHeaders: ["Set-Cookie"]
        });
        const cookies = parseSetCookie(wootlyData.headers.get("Set-Cookie") || "");
        const wootssesCookie = cookies.wootsses.value;
        let $ = load(wootlyData.body);
        const iframeSrc = $("iframe").attr("src") ?? "";
        const woozCookieRequest = await ctx.proxiedFetcher.full(iframeSrc, {
            method: "GET",
            readHeaders: ["Set-Cookie"],
            headers: {
                cookie: makeCookieHeader({ wootsses: wootssesCookie })
            }
        });
        const woozCookies = parseSetCookie(woozCookieRequest.headers.get("Set-Cookie") || "");
        const woozCookie = woozCookies.wooz.value;
        const iframeData = await ctx.proxiedFetcher(iframeSrc, {
            method: "POST",
            body: new URLSearchParams({ qdf: "1" }),
            headers: {
                cookie: makeCookieHeader({ wooz: woozCookie }),
                Referer: iframeSrc
            }
        });
        $ = load(iframeData);
        const scriptText = $("script").html() ?? "";
        const tk = (_a = scriptText.match(/tk=([^;]+)/)) == null ? void 0 : _a[0].replace(/tk=|["\s]/g, "");
        const vd = (_b = scriptText.match(/vd=([^,]+)/)) == null ? void 0 : _b[0].replace(/vd=|["\s]/g, "");
        if (!tk || !vd) throw new Error("wootly source not found");
        const url = await ctx.proxiedFetcher(`/grabd`, {
            baseUrl: baseUrl3,
            query: { t: tk, id: vd },
            method: "GET",
            headers: {
                cookie: makeCookieHeader({ wooz: woozCookie, wootsses: wootssesCookie })
            }
        });
        if (!url) throw new Error("wootly source not found");
        return {
            stream: [
                {
                    id: "primary",
                    type: "file",
                    flags: [flags.IP_LOCKED],
                    captions: [],
                    qualities: {
                        unknown: {
                            type: "mp4",
                            url
                        }
                    }
                }
            ]
        };
    }
});
const baseUrl$3 = "https://www.goojara.to";
const baseUrl2 = "https://ww1.goojara.to";
async function getEmbeds$1(ctx, id) {
    const data2 = await ctx.fetcher.full(`/${id}`, {
        baseUrl: baseUrl2,
        headers: {
            Referer: baseUrl$3,
            cookie: ""
        },
        readHeaders: ["Set-Cookie"],
        method: "GET"
    });
    const cookies = parseSetCookie(data2.headers.get("Set-Cookie") || "");
    const RandomCookieName = data2.body.split(`_3chk('`)[1].split(`'`)[0];
    const RandomCookieValue = data2.body.split(`_3chk('`)[1].split(`'`)[2];
    let aGoozCookie = "";
    let cookie2 = "";
    if (cookies && cookies.aGooz && RandomCookieName && RandomCookieValue) {
        aGoozCookie = cookies.aGooz.value;
        cookie2 = makeCookieHeader({
            aGooz: aGoozCookie,
            [RandomCookieName]: RandomCookieValue
        });
    }
    const $ = load(data2.body);
    const embedRedirectURLs = $("a").map((index, element) => $(element).attr("href")).get().filter((href) => href && href.includes(`${baseUrl2}/go.php`));
    const embedPages = await Promise.all(
        embedRedirectURLs.map(
            (url) => ctx.fetcher.full(url, {
                headers: {
                    cookie: cookie2,
                    Referer: baseUrl2
                },
                method: "GET"
            }).catch(() => null)
            // Handle errors gracefully
        )
    );
    const results = [];
    for (const result of embedPages) {
        if (result) {
            const embedId = ["wootly", "upstream", "mixdrop", "dood"].find((a) => result.finalUrl.includes(a));
            if (embedId) {
                results.push({ embedId, url: result.finalUrl });
            }
        }
    }
    return results;
}
let data;
const headersData = {
    cookie: `aGooz=t9pmkdtef1b3lg3pmo1u2re816; bd9aa48e=0d7b89e8c79844e9df07a2; _b414=2151C6B12E2A88379AFF2C0DD65AC8298DEC2BF4; 9d287aaa=8f32ad589e1c4288fe152f`,
    Referer: "https://www.goojara.to/"
};
async function searchAndFindMedia(ctx, media) {
    data = await ctx.fetcher(`/xhrr.php`, {
        baseUrl: baseUrl$3,
        headers: headersData,
        method: "POST",
        body: new URLSearchParams({ q: media.title })
    });
    const $ = load(data);
    const results = [];
    $(".mfeed > li").each((index, element) => {
        var _a;
        const title = $(element).find("strong").text();
        const yearMatch = $(element).text().match(/\((\d{4})\)/);
        const typeDiv = $(element).find("div").attr("class");
        const type = typeDiv === "it" ? "show" : typeDiv === "im" ? "movie" : "";
        const year = yearMatch ? yearMatch[1] : "";
        const slug = (_a = $(element).find("a").attr("href")) == null ? void 0 : _a.split("/")[3];
        if (!slug) throw new NotFoundError("Not found");
        if (media.type === type) {
            results.push({ title, year, slug, type });
        }
    });
    const result = results.find((res) => compareMedia(media, res.title, Number(res.year)));
    return result;
}
async function scrapeIds(ctx, media, result) {
    let id = null;
    if (media.type === "movie") {
        id = result.slug;
    } else if (media.type === "show") {
        data = await ctx.fetcher(`/${result.slug}`, {
            baseUrl: baseUrl$3,
            headers: headersData,
            method: "GET",
            query: { s: media.season.number.toString() }
        });
        let episodeId = "";
        const $2 = load(data);
        $2(".seho").each((index, element) => {
            const episodeNumber = $2(element).find(".seep .sea").text().trim();
            if (parseInt(episodeNumber, 10) === media.episode.number) {
                const href = $2(element).find(".snfo h1 a").attr("href");
                const idMatch = href == null ? void 0 : href.match(/\/([a-zA-Z0-9]+)$/);
                if (idMatch && idMatch[1]) {
                    episodeId = idMatch[1];
                    return false;
                }
            }
        });
        id = episodeId;
    }
    if (id === null) throw new NotFoundError("Not found");
    const embeds = await getEmbeds$1(ctx, id);
    return embeds;
}
async function universalScraper$7(ctx) {
    const goojaraData = await searchAndFindMedia(ctx, ctx.media);
    if (!goojaraData) throw new NotFoundError("Media not found");
    ctx.progress(30);
    const embeds = await scrapeIds(ctx, ctx.media, goojaraData);
    if ((embeds == null ? void 0 : embeds.length) === 0) throw new NotFoundError("No embeds found");
    ctx.progress(60);
    return {
        embeds
    };
}
const goojaraScraper = makeSourcerer({
    id: "goojara",
    name: "Goojara",
    rank: 180,
    flags: [],
    disabled: true,
    scrapeShow: universalScraper$7,
    scrapeMovie: universalScraper$7
});
function generateRandomFavs() {
    const randomHex = () => Math.floor(Math.random() * 16).toString(16);
    const generateSegment = (length) => Array.from({ length }, randomHex).join("");
    return `${generateSegment(8)}-${generateSegment(4)}-${generateSegment(4)}-${generateSegment(4)}-${generateSegment(
        12
    )}`;
}
function parseSubtitleLinks(inputString) {
    if (!inputString || typeof inputString === "boolean") return [];
    const linksArray = inputString.split(",");
    const captions = [];
    linksArray.forEach((link) => {
        const match = link.match(/\[([^\]]+)\](https?:\/\/\S+?)(?=,\[|$)/);
        if (match) {
            const type = getCaptionTypeFromUrl(match[2]);
            const language = labelToLanguageCode(match[1]);
            if (!type || !language) return;
            captions.push({
                id: match[2],
                language,
                hasCorsRestrictions: false,
                type,
                url: match[2]
            });
        }
    });
    return captions;
}
function parseVideoLinks(inputString) {
    if (!inputString) throw new NotFoundError("No video links found");
    const linksArray = inputString.split(",");
    const result = {};
    linksArray.forEach((link) => {
        const match = link.match(/\[([^]+)](https?:\/\/[^\s,]+\.mp4)/);
        if (match) {
            const qualityText = match[1];
            const mp4Url = match[2];
            const numericQualityMatch = qualityText.match(/(\d+p)/);
            const quality = numericQualityMatch ? numericQualityMatch[1] : "Unknown";
            const validQuality = getValidQualityFromString(quality);
            result[validQuality] = { type: "mp4", url: mp4Url };
        }
    });
    return result;
}
function extractTitleAndYear(input) {
    const regex = /^(.*?),.*?(\d{4})/;
    const match = input.match(regex);
    if (match) {
        const title = match[1];
        const year = match[2];
        return { title: title.trim(), year: year ? parseInt(year, 10) : null };
    }
    return null;
}
const rezkaBase = "https://hdrezka.ag/";
const baseHeaders = {
    "X-Hdrezka-Android-App": "1",
    "X-Hdrezka-Android-App-Version": "2.2.0"
};
async function searchAndFindMediaId(ctx) {
    var _a;
    const itemRegexPattern = /<a href="([^"]+)"><span class="enty">([^<]+)<\/span> \(([^)]+)\)/g;
    const idRegexPattern = /\/(\d+)-[^/]+\.html$/;
    const searchData = await ctx.proxiedFetcher(`/engine/ajax/search.php`, {
        baseUrl: rezkaBase,
        headers: baseHeaders,
        query: { q: ctx.media.title }
    });
    const movieData = [];
    for (const match of searchData.matchAll(itemRegexPattern)) {
        const url = match[1];
        const titleAndYear = match[3];
        const result = extractTitleAndYear(titleAndYear);
        if (result !== null) {
            const id = ((_a = url.match(idRegexPattern)) == null ? void 0 : _a[1]) || null;
            movieData.push({ id: id ?? "", year: result.year ?? 0, type: ctx.media.type, url });
        }
    }
    const filteredItems = movieData.filter((item) => item.type === ctx.media.type && item.year === ctx.media.releaseYear);
    return filteredItems[0] || null;
}
async function getStream(id, translatorId, ctx) {
    const searchParams = new URLSearchParams();
    searchParams.append("id", id);
    searchParams.append("translator_id", translatorId);
    if (ctx.media.type === "show") {
        searchParams.append("season", ctx.media.season.number.toString());
        searchParams.append("episode", ctx.media.episode.number.toString());
    }
    if (ctx.media.type === "movie") {
        searchParams.append("is_camprip", "0");
        searchParams.append("is_ads", "0");
        searchParams.append("is_director", "0");
    }
    searchParams.append("favs", generateRandomFavs());
    searchParams.append("action", ctx.media.type === "show" ? "get_stream" : "get_movie");
    const response = await ctx.proxiedFetcher("/ajax/get_cdn_series/", {
        baseUrl: rezkaBase,
        method: "POST",
        body: searchParams,
        headers: baseHeaders
    });
    return JSON.parse(response);
}
async function getTranslatorId(url, id, ctx) {
    const response = await ctx.proxiedFetcher(url, {
        headers: baseHeaders
    });
    if (response.includes(`data-translator_id="238"`)) return "238";
    const functionName = ctx.media.type === "movie" ? "initCDNMoviesEvents" : "initCDNSeriesEvents";
    const regexPattern = new RegExp(`sof\\.tv\\.${functionName}\\(${id}, ([^,]+)`, "i");
    const match = response.match(regexPattern);
    const translatorId = match ? match[1] : null;
    return translatorId;
}
const universalScraper$6 = async (ctx) => {
    const result = await searchAndFindMediaId(ctx);
    if (!result || !result.id) throw new NotFoundError("No result found");
    const translatorId = await getTranslatorId(result.url, result.id, ctx);
    if (!translatorId) throw new NotFoundError("No translator id found");
    const { url: streamUrl, subtitle: streamSubtitle } = await getStream(result.id, translatorId, ctx);
    const parsedVideos = parseVideoLinks(streamUrl);
    const parsedSubtitles = parseSubtitleLinks(streamSubtitle);
    return {
        embeds: [],
        stream: [
            {
                id: "primary",
                type: "file",
                flags: [flags.CORS_ALLOWED, flags.IP_LOCKED],
                captions: parsedSubtitles,
                qualities: parsedVideos
            }
        ]
    };
};
const hdRezkaScraper = makeSourcerer({
    id: "hdrezka",
    name: "HDRezka",
    rank: 190,
    flags: [flags.CORS_ALLOWED, flags.IP_LOCKED],
    scrapeShow: universalScraper$6,
    scrapeMovie: universalScraper$6
});
let baseUrl$2 = "https://m4ufree.se";
const universalScraper$5 = async (ctx) => {
    var _a, _b, _c, _d;
    const homePage = await ctx.proxiedFetcher.full(baseUrl$2);
    baseUrl$2 = new URL(homePage.finalUrl).origin;
    const searchSlug = ctx.media.title.replace(/'/g, "").replace(/!|@|%|\^|\*|\(|\)|\+|=|<|>|\?|\/|,|\.|:|;|'| |"|&|#|\[|\]|~|$|_/g, "-").replace(/-+-/g, "-").replace(/^-+|-+$/g, "").replace(/Ă¢â‚¬â€œ/g, "");
    const searchPage$ = load(
        await ctx.proxiedFetcher(`/search/${searchSlug}.html`, {
            baseUrl: baseUrl$2,
            query: {
                type: ctx.media.type === "movie" ? "movie" : "tvs"
            }
        })
    );
    const searchResults = [];
    searchPage$(".item").each((_, element) => {
        var _a2;
        const [, title, year] = ((_a2 = searchPage$(element).find(".imagecover a").attr("title")) == null ? void 0 : _a2.match(/^(.*?)\s*(?:\(?\s*(\d{4})(?:\s*-\s*\d{0,4})?\s*\)?)?\s*$/)) || [];
        const url = searchPage$(element).find("a").attr("href");
        if (!title || !url) return;
        searchResults.push({ title, year: year ? parseInt(year, 10) : void 0, url });
    });
    const watchPageUrl = (_a = searchResults.find((x) => x && compareMedia(ctx.media, x.title, x.year))) == null ? void 0 : _a.url;
    if (!watchPageUrl) throw new NotFoundError("No watchable item found");
    ctx.progress(25);
    const watchPage = await ctx.proxiedFetcher.full(watchPageUrl, {
        baseUrl: baseUrl$2,
        readHeaders: ["Set-Cookie"]
    });
    ctx.progress(50);
    let watchPage$ = load(watchPage.body);
    const csrfToken = (_c = (_b = watchPage$('script:contains("_token:")').html()) == null ? void 0 : _b.match(/_token:\s?'(.*)'/m)) == null ? void 0 : _c[1];
    if (!csrfToken) throw new Error("Failed to find csrfToken");
    const laravelSession = parseSetCookie(watchPage.headers.get("Set-Cookie") ?? "").laravel_session;
    if (!(laravelSession == null ? void 0 : laravelSession.value)) throw new Error("Failed to find cookie");
    const cookie2 = makeCookieHeader({ [laravelSession.name]: laravelSession.value });
    if (ctx.media.type === "show") {
        const s = ctx.media.season.number < 10 ? `0${ctx.media.season.number}` : ctx.media.season.number.toString();
        const e = ctx.media.episode.number < 10 ? `0${ctx.media.episode.number}` : ctx.media.episode.number.toString();
        const episodeToken = watchPage$(`button:contains("S${s}-E${e}")`).attr("idepisode");
        if (!episodeToken) throw new Error("Failed to find episodeToken");
        watchPage$ = load(
            await ctx.proxiedFetcher("/ajaxtv", {
                baseUrl: baseUrl$2,
                method: "POST",
                body: new URLSearchParams({
                    idepisode: episodeToken,
                    _token: csrfToken
                }),
                headers: {
                    cookie: cookie2
                }
            })
        );
    }
    ctx.progress(75);
    const embeds = [];
    const sources = watchPage$("div.row.justify-content-md-center div.le-server").map((_, element) => {
        const name = watchPage$(element).find("span").text().toLowerCase().replace("#", "");
        const data2 = watchPage$(element).find("span").attr("data");
        if (!data2 || !name) return null;
        return { name, data: data2 };
    }).get();
    for (const source of sources) {
        let embedId;
        if (source.name === "m")
            embedId = "playm4u-m";
        else if (source.name === "nm") embedId = "playm4u-nm";
        else if (source.name === "h") embedId = "hydrax";
        else continue;
        const iframePage$ = load(
            await ctx.proxiedFetcher("/ajax", {
                baseUrl: baseUrl$2,
                method: "POST",
                body: new URLSearchParams({
                    m4u: source.data,
                    _token: csrfToken
                }),
                headers: {
                    cookie: cookie2
                }
            })
        );
        const url = (_d = iframePage$("iframe").attr("src")) == null ? void 0 : _d.trim();
        if (!url) continue;
        ctx.progress(100);
        embeds.push({ embedId, url });
    }
    return {
        embeds
    };
};
const m4uScraper = makeSourcerer({
    id: "m4ufree",
    name: "M4UFree",
    rank: 200,
    disabled: true,
    flags: [],
    scrapeMovie: universalScraper$5,
    scrapeShow: universalScraper$5
});
const nepuBase = "https://rar.to";
const nepuReferer = "https://rar.to/";
const universalScraper$4 = async (ctx) => {
    const searchResultRequest = await ctx.proxiedFetcher("/ajax/posts", {
        baseUrl: nepuBase,
        query: {
            q: ctx.media.title
        }
    });
    const searchResult = JSON.parse(searchResultRequest);
    const show = searchResult.data.find((item) => {
        if (!item) return false;
        if (ctx.media.type === "movie" && item.type !== "Movie") return false;
        if (ctx.media.type === "show" && item.type !== "Show") return false;
        const [, title, year] = item.name.match(/^(.*?)\s*(?:\(?\s*(\d{4})(?:\s*-\s*\d{0,4})?\s*\)?)?\s*$/) || [];
        return compareMedia(ctx.media, title, Number(year));
    });
    if (!show) throw new NotFoundError("No watchable item found");
    let videoUrl = show.url;
    if (ctx.media.type === "show") {
        videoUrl = `${show.url}/season/${ctx.media.season.number}/episode/${ctx.media.episode.number}`;
    }
    const videoPage = await ctx.proxiedFetcher(videoUrl, {
        baseUrl: nepuBase
    });
    const videoPage$ = load(videoPage);
    const embedId = videoPage$("a[data-embed]").attr("data-embed");
    if (!embedId) throw new NotFoundError("No embed found.");
    const playerPage = await ctx.proxiedFetcher("/ajax/embed", {
        method: "POST",
        baseUrl: nepuBase,
        body: new URLSearchParams({ id: embedId })
    });
    const streamUrl = playerPage.match(/"file":"([^"]+)"/);
    if (!(streamUrl == null ? void 0 : streamUrl[1])) throw new NotFoundError("No stream found.");
    return {
        embeds: [],
        stream: [
            {
                id: "primary",
                captions: [],
                playlist: nepuBase + streamUrl[1],
                type: "hls",
                headers: {
                    Origin: nepuBase,
                    Referer: nepuReferer
                },
                flags: []
            }
        ]
    };
};
export const nepuScraper = makeSourcerer({
    id: "nepu",
    name: "Nepu",
    rank: 210,
    flags: [],
    scrapeMovie: universalScraper$4,
    scrapeShow: universalScraper$4
});
const baseUrl$1 = "https://w1.nites.is";
async function comboScraper(ctx) {
    var _a;
    const searchPage = await ctx.proxiedFetcher("/wp-admin/admin-ajax.php", {
        baseUrl: baseUrl$1,
        method: "POST",
        body: new URLSearchParams({
            action: "ajax_pagination",
            query_vars: "mixed",
            search: ctx.media.title
        })
    });
    const $search = load(searchPage);
    const searchResults = [];
    $search("li").each((_, element) => {
        const title = $search(element).find(".entry-title").first().text().trim();
        const year = parseInt($search(element).find(".year").first().text().trim(), 10);
        const url2 = $search(element).find(".lnk-blk").attr("href");
        if (!title || !year || !url2) return;
        searchResults.push({ title, year, url: url2 });
    });
    let watchPageUrl = (_a = searchResults.find((x) => x && compareMedia(ctx.media, x.title, x.year))) == null ? void 0 : _a.url;
    if (!watchPageUrl) throw new NotFoundError("No watchable item found");
    if (ctx.media.type === "show") {
        const match = watchPageUrl.match(/\/series\/([^/]+)\/?/);
        if (!match) throw new Error("Failed to parse watch page url");
        watchPageUrl = watchPageUrl.replace(
            `/series/${match[1]}`,
            `/episode/${match[1]}-${ctx.media.season.number}x${ctx.media.episode.number}`
        );
    }
    const watchPage = load(await ctx.proxiedFetcher(watchPageUrl));
    const embedUrl = watchPage('ul.bx-lst li a:contains("- Bflix")').closest("aside").next("div.video-options").find("iframe").attr("data-lazy-used2b");
    if (!embedUrl) throw new Error("Failed to find embed url");
    const embedPage = load(await ctx.proxiedFetcher(embedUrl));
    const url = embedPage("iframe").attr("src");
    if (!url) throw new Error("Failed to find embed url");
    return {
        embeds: [
            {
                embedId: "bflix",
                url
            }
        ]
    };
}
const nitesScraper = makeSourcerer({
    id: "nites",
    name: "Nites",
    disabled: true,
    rank: 80,
    flags: [],
    scrapeMovie: comboScraper,
    scrapeShow: comboScraper
});
const primewireBase = "https://www.primewire.tf";
const primewireApiKey = atob("bHpRUHNYU0tjRw==");
const pArray = [
    608135816,
    2242054355,
    320440878,
    57701188,
    2752067618,
    698298832,
    137296536,
    3964562569,
    1160258022,
    953160567,
    3193202383,
    887688300,
    3232508343,
    3380367581,
    1065670069,
    3041331479,
    2450970073,
    2306472731
];
const sBox0 = [
    3509652390,
    2564797868,
    805139163,
    3491422135,
    3101798381,
    1780907670,
    3128725573,
    4046225305,
    614570311,
    3012652279,
    134345442,
    2240740374,
    1667834072,
    1901547113,
    2757295779,
    4103290238,
    227898511,
    1921955416,
    1904987480,
    2182433518,
    2069144605,
    3260701109,
    2620446009,
    720527379,
    3318853667,
    677414384,
    3393288472,
    3101374703,
    2390351024,
    1614419982,
    1822297739,
    2954791486,
    3608508353,
    3174124327,
    2024746970,
    1432378464,
    3864339955,
    2857741204,
    1464375394,
    1676153920,
    1439316330,
    715854006,
    3033291828,
    289532110,
    2706671279,
    2087905683,
    3018724369,
    1668267050,
    732546397,
    1947742710,
    3462151702,
    2609353502,
    2950085171,
    1814351708,
    2050118529,
    680887927,
    999245976,
    1800124847,
    3300911131,
    1713906067,
    1641548236,
    4213287313,
    1216130144,
    1575780402,
    4018429277,
    3917837745,
    3693486850,
    3949271944,
    596196993,
    3549867205,
    258830323,
    2213823033,
    772490370,
    2760122372,
    1774776394,
    2652871518,
    566650946,
    4142492826,
    1728879713,
    2882767088,
    1783734482,
    3629395816,
    2517608232,
    2874225571,
    1861159788,
    326777828,
    3124490320,
    2130389656,
    2716951837,
    967770486,
    1724537150,
    2185432712,
    2364442137,
    1164943284,
    2105845187,
    998989502,
    3765401048,
    2244026483,
    1075463327,
    1455516326,
    1322494562,
    910128902,
    469688178,
    1117454909,
    936433444,
    3490320968,
    3675253459,
    1240580251,
    122909385,
    2157517691,
    634681816,
    4142456567,
    3825094682,
    3061402683,
    2540495037,
    79693498,
    3249098678,
    1084186820,
    1583128258,
    426386531,
    1761308591,
    1047286709,
    322548459,
    995290223,
    1845252383,
    2603652396,
    3431023940,
    2942221577,
    3202600964,
    3727903485,
    1712269319,
    422464435,
    3234572375,
    1170764815,
    3523960633,
    3117677531,
    1434042557,
    442511882,
    3600875718,
    1076654713,
    1738483198,
    4213154764,
    2393238008,
    3677496056,
    1014306527,
    4251020053,
    793779912,
    2902807211,
    842905082,
    4246964064,
    1395751752,
    1040244610,
    2656851899,
    3396308128,
    445077038,
    3742853595,
    3577915638,
    679411651,
    2892444358,
    2354009459,
    1767581616,
    3150600392,
    3791627101,
    3102740896,
    284835224,
    4246832056,
    1258075500,
    768725851,
    2589189241,
    3069724005,
    3532540348,
    1274779536,
    3789419226,
    2764799539,
    1660621633,
    3471099624,
    4011903706,
    913787905,
    3497959166,
    737222580,
    2514213453,
    2928710040,
    3937242737,
    1804850592,
    3499020752,
    2949064160,
    2386320175,
    2390070455,
    2415321851,
    4061277028,
    2290661394,
    2416832540,
    1336762016,
    1754252060,
    3520065937,
    3014181293,
    791618072,
    3188594551,
    3933548030,
    2332172193,
    3852520463,
    3043980520,
    413987798,
    3465142937,
    3030929376,
    4245938359,
    2093235073,
    3534596313,
    375366246,
    2157278981,
    2479649556,
    555357303,
    3870105701,
    2008414854,
    3344188149,
    4221384143,
    3956125452,
    2067696032,
    3594591187,
    2921233993,
    2428461,
    544322398,
    577241275,
    1471733935,
    610547355,
    4027169054,
    1432588573,
    1507829418,
    2025931657,
    3646575487,
    545086370,
    48609733,
    2200306550,
    1653985193,
    298326376,
    1316178497,
    3007786442,
    2064951626,
    458293330,
    2589141269,
    3591329599,
    3164325604,
    727753846,
    2179363840,
    146436021,
    1461446943,
    4069977195,
    705550613,
    3059967265,
    3887724982,
    4281599278,
    3313849956,
    1404054877,
    2845806497,
    146425753,
    1854211946
];
const sBox1 = [
    1266315497,
    3048417604,
    3681880366,
    3289982499,
    290971e4,
    1235738493,
    2632868024,
    2414719590,
    3970600049,
    1771706367,
    1449415276,
    3266420449,
    422970021,
    1963543593,
    2690192192,
    3826793022,
    1062508698,
    1531092325,
    1804592342,
    2583117782,
    2714934279,
    4024971509,
    1294809318,
    4028980673,
    1289560198,
    2221992742,
    1669523910,
    35572830,
    157838143,
    1052438473,
    1016535060,
    1802137761,
    1753167236,
    1386275462,
    3080475397,
    2857371447,
    1040679964,
    2145300060,
    2390574316,
    1461121720,
    2956646967,
    4031777805,
    4028374788,
    33600511,
    2920084762,
    1018524850,
    629373528,
    3691585981,
    3515945977,
    2091462646,
    2486323059,
    586499841,
    988145025,
    935516892,
    3367335476,
    2599673255,
    2839830854,
    265290510,
    3972581182,
    2759138881,
    3795373465,
    1005194799,
    847297441,
    406762289,
    1314163512,
    1332590856,
    1866599683,
    4127851711,
    750260880,
    613907577,
    1450815602,
    3165620655,
    3734664991,
    3650291728,
    3012275730,
    3704569646,
    1427272223,
    778793252,
    1343938022,
    2676280711,
    2052605720,
    1946737175,
    3164576444,
    3914038668,
    3967478842,
    3682934266,
    1661551462,
    3294938066,
    4011595847,
    840292616,
    3712170807,
    616741398,
    312560963,
    711312465,
    1351876610,
    322626781,
    1910503582,
    271666773,
    2175563734,
    1594956187,
    70604529,
    3617834859,
    1007753275,
    1495573769,
    4069517037,
    2549218298,
    2663038764,
    504708206,
    2263041392,
    3941167025,
    2249088522,
    1514023603,
    1998579484,
    1312622330,
    694541497,
    2582060303,
    2151582166,
    1382467621,
    776784248,
    2618340202,
    3323268794,
    2497899128,
    2784771155,
    503983604,
    4076293799,
    907881277,
    423175695,
    432175456,
    1378068232,
    4145222326,
    3954048622,
    3938656102,
    3820766613,
    2793130115,
    2977904593,
    26017576,
    3274890735,
    3194772133,
    1700274565,
    1756076034,
    4006520079,
    3677328699,
    720338349,
    1533947780,
    354530856,
    688349552,
    3973924725,
    1637815568,
    332179504,
    3949051286,
    53804574,
    2852348879,
    3044236432,
    1282449977,
    3583942155,
    3416972820,
    4006381244,
    1617046695,
    2628476075,
    3002303598,
    1686838959,
    431878346,
    2686675385,
    1700445008,
    1080580658,
    1009431731,
    832498133,
    3223435511,
    2605976345,
    2271191193,
    2516031870,
    1648197032,
    4164389018,
    2548247927,
    300782431,
    375919233,
    238389289,
    3353747414,
    2531188641,
    2019080857,
    1475708069,
    455242339,
    2609103871,
    448939670,
    3451063019,
    1395535956,
    2413381860,
    1841049896,
    1491858159,
    885456874,
    4264095073,
    4001119347,
    1565136089,
    3898914787,
    1108368660,
    540939232,
    1173283510,
    2745871338,
    3681308437,
    4207628240,
    3343053890,
    4016749493,
    1699691293,
    1103962373,
    3625875870,
    2256883143,
    3830138730,
    1031889488,
    3479347698,
    1535977030,
    4236805024,
    3251091107,
    2132092099,
    1774941330,
    1199868427,
    1452454533,
    157007616,
    2904115357,
    342012276,
    595725824,
    1480756522,
    206960106,
    497939518,
    591360097,
    863170706,
    2375253569,
    3596610801,
    1814182875,
    2094937945,
    3421402208,
    1082520231,
    3463918190,
    2785509508,
    435703966,
    3908032597,
    1641649973,
    2842273706,
    3305899714,
    1510255612,
    2148256476,
    2655287854,
    3276092548,
    4258621189,
    236887753,
    3681803219,
    274041037,
    1734335097,
    3815195456,
    3317970021,
    1899903192,
    1026095262,
    4050517792,
    356393447,
    2410691914,
    3873677099,
    3682840055
];
const sBox2 = [
    3913112168,
    2491498743,
    4132185628,
    2489919796,
    1091903735,
    1979897079,
    3170134830,
    3567386728,
    3557303409,
    857797738,
    1136121015,
    1342202287,
    507115054,
    2535736646,
    337727348,
    3213592640,
    1301675037,
    2528481711,
    1895095763,
    1721773893,
    3216771564,
    62756741,
    2142006736,
    835421444,
    2531993523,
    1442658625,
    3659876326,
    2882144922,
    676362277,
    1392781812,
    170690266,
    3921047035,
    1759253602,
    3611846912,
    1745797284,
    664899054,
    1329594018,
    3901205900,
    3045908486,
    2062866102,
    2865634940,
    3543621612,
    3464012697,
    1080764994,
    553557557,
    3656615353,
    3996768171,
    991055499,
    499776247,
    1265440854,
    648242737,
    3940784050,
    980351604,
    3713745714,
    1749149687,
    3396870395,
    4211799374,
    3640570775,
    1161844396,
    3125318951,
    1431517754,
    545492359,
    4268468663,
    3499529547,
    1437099964,
    2702547544,
    3433638243,
    2581715763,
    2787789398,
    1060185593,
    1593081372,
    2418618748,
    4260947970,
    69676912,
    2159744348,
    86519011,
    2512459080,
    3838209314,
    1220612927,
    3339683548,
    133810670,
    1090789135,
    1078426020,
    1569222167,
    845107691,
    3583754449,
    4072456591,
    1091646820,
    628848692,
    1613405280,
    3757631651,
    526609435,
    236106946,
    48312990,
    2942717905,
    3402727701,
    1797494240,
    859738849,
    992217954,
    4005476642,
    2243076622,
    3870952857,
    3732016268,
    765654824,
    3490871365,
    2511836413,
    1685915746,
    3888969200,
    1414112111,
    2273134842,
    3281911079,
    4080962846,
    172450625,
    2569994100,
    980381355,
    4109958455,
    2819808352,
    2716589560,
    2568741196,
    3681446669,
    3329971472,
    1835478071,
    660984891,
    3704678404,
    4045999559,
    3422617507,
    3040415634,
    1762651403,
    1719377915,
    3470491036,
    2693910283,
    3642056355,
    3138596744,
    1364962596,
    2073328063,
    1983633131,
    926494387,
    3423689081,
    2150032023,
    4096667949,
    1749200295,
    3328846651,
    309677260,
    2016342300,
    1779581495,
    3079819751,
    111262694,
    1274766160,
    443224088,
    298511866,
    1025883608,
    3806446537,
    1145181785,
    168956806,
    3641502830,
    3584813610,
    1689216846,
    3666258015,
    3200248200,
    1692713982,
    2646376535,
    4042768518,
    1618508792,
    1610833997,
    3523052358,
    4130873264,
    2001055236,
    3610705100,
    2202168115,
    4028541809,
    2961195399,
    1006657119,
    2006996926,
    3186142756,
    1430667929,
    3210227297,
    1314452623,
    4074634658,
    4101304120,
    2273951170,
    1399257539,
    3367210612,
    3027628629,
    1190975929,
    2062231137,
    2333990788,
    2221543033,
    2438960610,
    1181637006,
    548689776,
    2362791313,
    3372408396,
    3104550113,
    3145860560,
    296247880,
    1970579870,
    3078560182,
    3769228297,
    1714227617,
    3291629107,
    3898220290,
    166772364,
    1251581989,
    493813264,
    448347421,
    195405023,
    2709975567,
    677966185,
    3703036547,
    1463355134,
    2715995803,
    1338867538,
    1343315457,
    2802222074,
    2684532164,
    233230375,
    2599980071,
    2000651841,
    3277868038,
    1638401717,
    4028070440,
    3237316320,
    6314154,
    819756386,
    300326615,
    590932579,
    1405279636,
    3267499572,
    3150704214,
    2428286686,
    3959192993,
    3461946742,
    1862657033,
    1266418056,
    963775037,
    2089974820,
    2263052895,
    1917689273,
    448879540,
    3550394620,
    3981727096,
    150775221,
    3627908307,
    1303187396,
    508620638,
    2975983352,
    2726630617,
    1817252668,
    1876281319,
    1457606340,
    908771278,
    3720792119,
    3617206836,
    2455994898,
    1729034894,
    1080033504
];
const sBox3 = [
    976866871,
    3556439503,
    2881648439,
    1522871579,
    1555064734,
    1336096578,
    3548522304,
    2579274686,
    3574697629,
    3205460757,
    3593280638,
    3338716283,
    3079412587,
    564236357,
    2993598910,
    1781952180,
    1464380207,
    3163844217,
    3332601554,
    1699332808,
    1393555694,
    1183702653,
    3581086237,
    1288719814,
    691649499,
    2847557200,
    2895455976,
    3193889540,
    2717570544,
    1781354906,
    1676643554,
    2592534050,
    3230253752,
    1126444790,
    2770207658,
    2633158820,
    2210423226,
    2615765581,
    2414155088,
    3127139286,
    673620729,
    2805611233,
    1269405062,
    4015350505,
    3341807571,
    4149409754,
    1057255273,
    2012875353,
    2162469141,
    2276492801,
    2601117357,
    993977747,
    3918593370,
    2654263191,
    753973209,
    36408145,
    2530585658,
    25011837,
    3520020182,
    2088578344,
    530523599,
    2918365339,
    1524020338,
    1518925132,
    3760827505,
    3759777254,
    1202760957,
    3985898139,
    3906192525,
    674977740,
    4174734889,
    2031300136,
    2019492241,
    3983892565,
    4153806404,
    3822280332,
    352677332,
    2297720250,
    60907813,
    90501309,
    3286998549,
    1016092578,
    2535922412,
    2839152426,
    457141659,
    509813237,
    4120667899,
    652014361,
    1966332200,
    2975202805,
    55981186,
    2327461051,
    676427537,
    3255491064,
    2882294119,
    3433927263,
    1307055953,
    942726286,
    933058658,
    2468411793,
    3933900994,
    4215176142,
    1361170020,
    2001714738,
    2830558078,
    3274259782,
    1222529897,
    1679025792,
    2729314320,
    3714953764,
    1770335741,
    151462246,
    3013232138,
    1682292957,
    1483529935,
    471910574,
    1539241949,
    458788160,
    3436315007,
    1807016891,
    3718408830,
    978976581,
    1043663428,
    3165965781,
    1927990952,
    4200891579,
    2372276910,
    3208408903,
    3533431907,
    1412390302,
    2931980059,
    4132332400,
    1947078029,
    3881505623,
    4168226417,
    2941484381,
    1077988104,
    1320477388,
    886195818,
    18198404,
    3786409e3,
    2509781533,
    112762804,
    3463356488,
    1866414978,
    891333506,
    18488651,
    661792760,
    1628790961,
    3885187036,
    3141171499,
    876946877,
    2693282273,
    1372485963,
    791857591,
    2686433993,
    3759982718,
    3167212022,
    3472953795,
    2716379847,
    445679433,
    3561995674,
    3504004811,
    3574258232,
    54117162,
    3331405415,
    2381918588,
    3769707343,
    4154350007,
    1140177722,
    4074052095,
    668550556,
    3214352940,
    367459370,
    261225585,
    2610173221,
    4209349473,
    3468074219,
    3265815641,
    314222801,
    3066103646,
    3808782860,
    282218597,
    3406013506,
    3773591054,
    379116347,
    1285071038,
    846784868,
    2669647154,
    3771962079,
    3550491691,
    2305946142,
    453669953,
    1268987020,
    3317592352,
    3279303384,
    3744833421,
    2610507566,
    3859509063,
    266596637,
    3847019092,
    517658769,
    3462560207,
    3443424879,
    370717030,
    4247526661,
    2224018117,
    4143653529,
    4112773975,
    2788324899,
    2477274417,
    1456262402,
    2901442914,
    1517677493,
    1846949527,
    2295493580,
    3734397586,
    2176403920,
    1280348187,
    1908823572,
    3871786941,
    846861322,
    1172426758,
    3287448474,
    3383383037,
    1655181056,
    3139813346,
    901632758,
    1897031941,
    2986607138,
    3066810236,
    3447102507,
    1393639104,
    373351379,
    950779232,
    625454576,
    3124240540,
    4148612726,
    2007998917,
    544563296,
    2244738638,
    2330496472,
    2058025392,
    1291430526,
    424198748,
    50039436,
    29584100,
    3605783033,
    2429876329,
    2791104160,
    1057563949,
    3255363231,
    3075367218,
    3463963227,
    1469046755,
    985887462
];
class Blowfish {
    constructor(t) {
        this.sBox0 = sBox0.slice();
        this.sBox1 = sBox1.slice();
        this.sBox2 = sBox2.slice();
        this.sBox3 = sBox3.slice();
        this.pArray = pArray.slice();
        this.keyStr = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
        this.iv = "abc12345";
        this.generateSubkeys(t);
    }
    encrypt(e) {
        const root = this.utf8Decode(e);
        let encrypted = "";
        const blockSize = 8;
        const paddingChar = "\0";
        const numBlocks = Math.ceil(e.length / blockSize);
        for (let i = 0; i < numBlocks; i++) {
            let block = root.substr(blockSize * i, blockSize);
            if (block.length < blockSize) {
                block += paddingChar.repeat(blockSize - block.length);
            }
            let [left, right] = this.split64by32(block);
            [left, right] = this.encipher(left, right);
            encrypted += this.num2block32(left) + this.num2block32(right);
        }
        return encrypted;
    }
    decrypt(input) {
        const numBlocks = Math.ceil(input.length / 8);
        let decrypted = "";
        for (let i = 0; i < numBlocks; i++) {
            const block = input.substr(8 * i, 8);
            if (block.length < 8) {
                throw new Error("Invalid block size");
            }
            const [left, right] = this.split64by32(block);
            const [decipheredLeft, decipheredRight] = this.decipher(left, right);
            decrypted += this.num2block32(decipheredLeft) + this.num2block32(decipheredRight);
        }
        return this.utf8Encode(decrypted);
    }
    substitute(value) {
        const t = value >>> 24;
        const n = value << 8 >>> 24;
        const r = value << 16 >>> 24;
        const i = value << 24 >>> 24;
        let result = this.addMod32(this.sBox0[t], this.sBox1[n]);
        result = this.xor(result, this.sBox2[r]);
        result = this.addMod32(result, this.sBox3[i]);
        return result;
    }
    /* eslint-disable */
    encipher(plaintext, key2) {
        for (var temp, round = 0; round < 16; round++) {
            temp = plaintext = this.xor(plaintext, this.pArray[round]);
            plaintext = key2 = this.xor(this.substitute(plaintext), key2);
            key2 = temp;
        }
        temp = plaintext;
        plaintext = key2;
        key2 = temp;
        key2 = this.xor(key2, this.pArray[16]);
        return [plaintext = this.xor(plaintext, this.pArray[17]), key2];
    }
    /* eslint-enable */
    decipher(left, right) {
        let n;
        let e = left;
        let t = right;
        n = this.xor(e, this.pArray[17]);
        e = this.xor(t, this.pArray[16]);
        t = n;
        for (let r = 15; r >= 0; r--) {
            n = e;
            e = t;
            t = n;
            t = this.xor(this.substitute(e), t);
            e = this.xor(e, this.pArray[r]);
        }
        return [e, t];
    }
    generateSubkeys(key2) {
        let temp;
        let keyIndex = 0;
        let pIndex = 0;
        for (let i = 0; i < 18; i++) {
            temp = 0;
            for (let j = 0; j < 4; j++) {
                temp = this.fixNegative(temp << 8 | key2.charCodeAt(keyIndex));
                keyIndex = (keyIndex + 1) % key2.length;
            }
            this.pArray[pIndex] = this.xor(this.pArray[pIndex], temp);
            pIndex++;
        }
        let tempSubkey = [0, 0];
        for (let i = 0; i < 18; i += 2) {
            tempSubkey = this.encipher(tempSubkey[0], tempSubkey[1]);
            this.pArray[i] = tempSubkey[0];
            this.pArray[i + 1] = tempSubkey[1];
        }
        for (let i = 0; i < 256; i += 2) {
            tempSubkey = this.encipher(tempSubkey[0], tempSubkey[1]);
            this.sBox0[i] = tempSubkey[0];
            this.sBox0[i + 1] = tempSubkey[1];
        }
        for (let i = 0; i < 256; i += 2) {
            tempSubkey = this.encipher(tempSubkey[0], tempSubkey[1]);
            this.sBox1[i] = tempSubkey[0];
            this.sBox1[i + 1] = tempSubkey[1];
        }
        for (let i = 0; i < 256; i += 2) {
            tempSubkey = this.encipher(tempSubkey[0], tempSubkey[1]);
            this.sBox2[i] = tempSubkey[0];
            this.sBox2[i + 1] = tempSubkey[1];
        }
        for (let i = 0; i < 256; i += 2) {
            tempSubkey = this.encipher(tempSubkey[0], tempSubkey[1]);
            this.sBox3[i] = tempSubkey[0];
            this.sBox3[i + 1] = tempSubkey[1];
        }
    }
    block32toNum(e) {
        return this.fixNegative(
            e.charCodeAt(0) << 24 | e.charCodeAt(1) << 16 | e.charCodeAt(2) << 8 | e.charCodeAt(3)
        );
    }
    num2block32(e) {
        return String.fromCharCode(e >>> 24) + String.fromCharCode(e << 8 >>> 24) + String.fromCharCode(e << 16 >>> 24) + String.fromCharCode(e << 24 >>> 24);
    }
    xor(e, t) {
        return this.fixNegative(e ^ t);
    }
    addMod32(e, t) {
        return this.fixNegative(e + t | 0);
    }
    fixNegative(e) {
        return e >>> 0;
    }
    split64by32(e) {
        const t = e.substring(0, 4);
        const n = e.substring(4, 8);
        return [this.block32toNum(t), this.block32toNum(n)];
    }
    utf8Decode(input) {
        let decoded = "";
        for (let i = 0; i < input.length; i++) {
            const charCode = input.charCodeAt(i);
            if (charCode < 128) {
                decoded += String.fromCharCode(charCode);
            } else if (charCode > 127 && charCode < 2048) {
                const firstCharCode = charCode >> 6 | 192;
                const secondCharCode = 63 & charCode | 128;
                decoded += String.fromCharCode(firstCharCode, secondCharCode);
            } else {
                const firstCharCode = charCode >> 12 | 224;
                const secondCharCode = charCode >> 6 & 63 | 128;
                const thirdCharCode = 63 & charCode | 128;
                decoded += String.fromCharCode(firstCharCode, secondCharCode, thirdCharCode);
            }
        }
        return decoded;
    }
    utf8Encode(input) {
        let encoded = "";
        let charCode;
        for (let i = 0; i < input.length; i++) {
            charCode = input.charCodeAt(i);
            if (charCode < 128) {
                encoded += String.fromCharCode(charCode);
            } else if (charCode > 191 && charCode < 224) {
                const secondCharCode = input.charCodeAt(i + 1);
                encoded += String.fromCharCode((31 & charCode) << 6 | 63 & secondCharCode);
                i += 1;
            } else {
                const secondCharCode = input.charCodeAt(i + 1);
                const thirdCharCode = input.charCodeAt(i + 2);
                encoded += String.fromCharCode((15 & charCode) << 12 | (63 & secondCharCode) << 6 | 63 & thirdCharCode);
                i += 2;
            }
        }
        return encoded;
    }
    base64(e) {
        let t;
        let n;
        let r;
        let i;
        let o;
        let a;
        let s = "";
        let l = 0;
        const root = e.replace(/[^A-Za-z0-9\\+\\/=]/g, "");
        while (l < root.length) {
            t = this.keyStr.indexOf(root.charAt(l++)) << 2 | (i = this.keyStr.indexOf(root.charAt(l++))) >> 4;
            n = (15 & i) << 4 | (o = this.keyStr.indexOf(root.charAt(l++))) >> 2;
            r = (3 & o) << 6 | (a = this.keyStr.indexOf(root.charAt(l++)));
            s += String.fromCharCode(t);
            if (o !== 64) {
                s += String.fromCharCode(n);
            }
            if (a !== 64) {
                s += String.fromCharCode(r);
            }
        }
        return s;
    }
}
function getLinks(encryptedInput) {
    const key2 = encryptedInput.slice(-10);
    const data2 = encryptedInput.slice(0, -10);
    const cipher = new Blowfish(key2);
    const decryptedData = cipher.decrypt(cipher.base64(data2)).match(/.{1,5}/g);
    if (!decryptedData) {
        throw new Error("No links found");
    } else {
        return decryptedData;
    }
}
async function search(ctx, imdbId) {
    const searchResult = await ctx.proxiedFetcher("/api/v1/show/", {
        baseUrl: primewireBase,
        query: {
            key: primewireApiKey,
            imdb_id: imdbId
        }
    });
    return searchResult.id;
}
async function getStreams(title) {
    const titlePage = load(title);
    const userData = titlePage("#user-data").attr("v");
    if (!userData) throw new NotFoundError("No user data found");
    const links = getLinks(userData);
    const embeds = [];
    if (!links) throw new NotFoundError("No links found");
    for (const link in links) {
        if (link.includes(link)) {
            const element = titlePage(`.propper-link[link_version='${link}']`);
            const sourceName = element.parent().parent().parent().find(".version-host").text().trim();
            let embedId;
            switch (sourceName) {
                case "mixdrop.co":
                    embedId = "mixdrop";
                    break;
                case "voe.sx":
                    embedId = "voe";
                    break;
                case "upstream.to":
                    embedId = "upstream";
                    break;
                case "streamvid.net":
                    embedId = "streamvid";
                    break;
                case "dood.watch":
                    embedId = "dood";
                    break;
                case "dropload.io":
                    embedId = "dropload";
                    break;
                case "filelions.to":
                    embedId = "filelions";
                    break;
                case "vtube.to":
                    embedId = "vtube";
                    break;
                default:
                    embedId = null;
            }
            if (!embedId) continue;
            embeds.push({
                url: `${primewireBase}/links/go/${links[link]}`,
                embedId
            });
        }
    }
    return embeds;
}
const primewireScraper = makeSourcerer({
    id: "primewire",
    name: "Primewire",
    rank: 10,
    disabled: true,
    flags: [flags.CORS_ALLOWED],
    async scrapeMovie(ctx) {
        if (!ctx.media.imdbId) throw new Error("No imdbId provided");
        const searchResult = await search(ctx, ctx.media.imdbId);
        const title = await ctx.proxiedFetcher(`movie/${searchResult}`, {
            baseUrl: primewireBase
        });
        const embeds = await getStreams(title);
        return {
            embeds
        };
    },
    async scrapeShow(ctx) {
        var _a;
        if (!ctx.media.imdbId) throw new Error("No imdbId provided");
        const searchResult = await search(ctx, ctx.media.imdbId);
        const season = await ctx.proxiedFetcher(`tv/${searchResult}`, {
            baseUrl: primewireBase
        });
        const seasonPage = load(season);
        const episodeLink = (_a = seasonPage(`.show_season[data-id='${ctx.media.season.number}'] > div > a`).toArray().find((link) => {
            return link.attribs.href.includes(`-episode-${ctx.media.episode.number}`);
        })) == null ? void 0 : _a.attribs.href;
        if (!episodeLink) throw new NotFoundError("No episode links found");
        const title = await ctx.proxiedFetcher(episodeLink, {
            baseUrl: primewireBase
        });
        const embeds = await getStreams(title);
        return {
            embeds
        };
    }
});
const ridoMoviesBase = `https://ridomovies.tv`;
const ridoMoviesApiBase = `${ridoMoviesBase}/core/api`;
const universalScraper$3 = async (ctx) => {
    const searchResult = await ctx.proxiedFetcher("/search", {
        baseUrl: ridoMoviesApiBase,
        query: {
            q: ctx.media.title
        }
    });
    const mediaData = searchResult.data.items.map((movieEl) => {
        const name = movieEl.title;
        const year = movieEl.contentable.releaseYear;
        const fullSlug = movieEl.fullSlug;
        return { name, year, fullSlug };
    });
    const targetMedia = mediaData.find((m) => m.name === ctx.media.title && m.year === ctx.media.releaseYear.toString());
    if (!(targetMedia == null ? void 0 : targetMedia.fullSlug)) throw new NotFoundError("No watchable item found");
    let iframeSourceUrl = `/${targetMedia.fullSlug}/videos`;
    if (ctx.media.type === "show") {
        const showPageResult = await ctx.proxiedFetcher(`/${targetMedia.fullSlug}`, {
            baseUrl: ridoMoviesBase
        });
        const fullEpisodeSlug = `season-${ctx.media.season.number}/episode-${ctx.media.episode.number}`;
        const regexPattern = new RegExp(
            `\\\\"id\\\\":\\\\"(\\d+)\\\\"(?=.*?\\\\\\"fullSlug\\\\\\":\\\\\\"[^"]*${fullEpisodeSlug}[^"]*\\\\\\")`,
            "g"
        );
        const matches = [...showPageResult.matchAll(regexPattern)];
        const episodeIds = matches.map((match) => match[1]);
        if (episodeIds.length === 0) throw new NotFoundError("No watchable item found");
        const episodeId = episodeIds.at(-1);
        iframeSourceUrl = `/episodes/${episodeId}/videos`;
    }
    const iframeSource = await ctx.proxiedFetcher(iframeSourceUrl, {
        baseUrl: ridoMoviesApiBase
    });
    const iframeSource$ = load(iframeSource.data[0].url);
    const iframeUrl = iframeSource$("iframe").attr("data-used2b");
    if (!iframeUrl) throw new NotFoundError("No watchable item found");
    const embeds = [];
    if (iframeUrl.includes("closeload")) {
        embeds.push({
            embedId: closeLoadScraper.id,
            url: iframeUrl
        });
    }
    if (iframeUrl.includes("ridoo")) {
        embeds.push({
            embedId: ridooScraper.id,
            url: iframeUrl
        });
    }
    return {
        embeds
    };
};
const ridooMoviesScraper = makeSourcerer({
    id: "ridomovies",
    name: "RidoMovies",
    rank: 120,
    flags: [],
    scrapeMovie: universalScraper$3,
    scrapeShow: universalScraper$3
});
const universalScraper$2 = async (ctx) => {
    const query = ctx.media.type === "movie" ? `?tmdb=${ctx.media.tmdbId}` : `?tmdb=${ctx.media.tmdbId}&season=${ctx.media.season.number}&episode=${ctx.media.episode.number}`;
    return {
        embeds: [
            {
                embedId: smashyStreamFScraper.id,
                url: `https://embed.smashystream.com/videofeee.php${query}`
            },
            {
                embedId: smashyStreamOScraper.id,
                url: `https://embed.smashystream.com/shortmoviec.php${query}`
            }
        ]
    };
};
const smashyStreamScraper = makeSourcerer({
    id: "smashystream",
    name: "SmashyStream",
    rank: 20,
    disabled: true,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: universalScraper$2,
    scrapeShow: universalScraper$2
});
async function convertPlaylistsToDataUrls(fetcher, playlistUrl, headers2) {
    const playlistData = await fetcher(playlistUrl, { headers: headers2 });
    const playlist = parse(playlistData);
    if (playlist.isMasterPlaylist) {
        await Promise.all(
            playlist.variants.map(async (variant) => {
                const variantPlaylistData = await fetcher(variant.uri, { headers: headers2 });
                const variantPlaylist = parse(variantPlaylistData);
                variant.uri = `data:application/vnd.apple.mpegurl;base64,${btoa(stringify(variantPlaylist))}`;
            })
        );
    }
    return `data:application/vnd.apple.mpegurl;base64,${btoa(stringify(playlist))}`;
}
const baseUrl = "https://soaper.live";
const universalScraper$1 = async (ctx) => {
    const searchResult = await ctx.proxiedFetcher("/search.html", {
        baseUrl,
        query: {
            keyword: ctx.media.title
        }
    });
    const searchResult$ = load(searchResult);
    let showLink = searchResult$("a").filter((_, el) => searchResult$(el).text() === ctx.media.title).attr("href");
    if (!showLink) throw new NotFoundError("Content not found");
    if (ctx.media.type === "show") {
        const seasonNumber = ctx.media.season.number;
        const episodeNumber = ctx.media.episode.number;
        const showPage = await ctx.proxiedFetcher(showLink, { baseUrl });
        const showPage$ = load(showPage);
        const seasonBlock = showPage$("h4").filter((_, el) => showPage$(el).text().trim().split(":")[0].trim() === `Season${seasonNumber}`).parent();
        const episodes = seasonBlock.find("a").toArray();
        showLink = showPage$(
            episodes.find((el) => parseInt(showPage$(el).text().split(".")[0], 10) === episodeNumber)
        ).attr("href");
    }
    if (!showLink) throw new NotFoundError("Content not found");
    const contentPage = await ctx.proxiedFetcher(showLink, { baseUrl });
    const contentPage$ = load(contentPage);
    const pass = contentPage$("#hId").attr("value");
    if (!pass) throw new NotFoundError("Content not found");
    const formData = new URLSearchParams();
    formData.append("pass", pass);
    formData.append("e2", "0");
    formData.append("server", "0");
    const infoEndpoint = ctx.media.type === "show" ? "/home/index/getEInfoAjax" : "/home/index/getMInfoAjax";
    const streamRes = await ctx.proxiedFetcher(infoEndpoint, {
        baseUrl,
        method: "POST",
        body: formData,
        headers: {
            referer: `${baseUrl}${showLink}`
        }
    });
    const streamResJson = JSON.parse(streamRes);
    const captions = [];
    for (const sub of streamResJson.subs) {
        let language = "";
        if (sub.name.includes(".srt")) {
            language = labelToLanguageCode(sub.name.split(".srt")[0]);
        } else if (sub.name.includes(":")) {
            language = sub.name.split(":")[0];
        } else {
            language = sub.name;
        }
        if (!language) continue;
        captions.push({
            id: sub.path,
            url: `${baseUrl}${sub.path}`,
            type: "srt",
            hasCorsRestrictions: false,
            language
        });
    }
    return {
        embeds: [],
        stream: [
            {
                id: "primary",
                playlist: await convertPlaylistsToDataUrls(ctx.proxiedFetcher, `${baseUrl}/${streamResJson.val}`),
                type: "hls",
                proxyDepth: 2,
                flags: [flags.CORS_ALLOWED],
                captions
            },
            ...streamResJson.val_bak ? [
                {
                    id: "backup",
                    playlist: await convertPlaylistsToDataUrls(ctx.proxiedFetcher, `${baseUrl}/${streamResJson.val_bak}`),
                    type: "hls",
                    flags: [flags.CORS_ALLOWED],
                    proxyDepth: 2,
                    captions
                }
            ] : []
        ]
    };
};
const soaperTvScraper = makeSourcerer({
    id: "soapertv",
    name: "SoaperTV",
    rank: 160,
    flags: [flags.CORS_ALLOWED],
    scrapeMovie: universalScraper$1,
    scrapeShow: universalScraper$1
});
const vidSrcToBase = "https://vidsrc.net";
const referer = `${vidSrcToBase}/`;
const universalScraper = async (ctx) => {
    var _a;
    const mediaId = ctx.media.imdbId ?? ctx.media.tmdbId;
    const url = ctx.media.type === "movie" ? `/embed/movie/${mediaId}` : `/embed/tv/${mediaId}/${ctx.media.season.number}/${ctx.media.episode.number}`;
    const mainPage = await ctx.proxiedFetcher(url, {
        baseUrl: vidSrcToBase,
        headers: {
            referer
        }
    });
    const mainPage$ = load(mainPage);
    const dataId = mainPage$("a[data-id]").attr("data-id");
    if (!dataId) throw new Error("No data-id found");
    const sources = await ctx.proxiedFetcher(`/ajax/embed/episode/${dataId}/sources`, {
        baseUrl: vidSrcToBase,
        headers: {
            referer
        }
    });
    if (sources.status !== 200) throw new Error("No sources found");
    const embeds = [];
    const embedArr = [];
    for (const source of sources.result) {
        const sourceRes = await ctx.proxiedFetcher(`/ajax/embed/source/${source.id}`, {
            baseUrl: vidSrcToBase,
            headers: {
                referer
            }
        });
        const decryptedUrl = decryptSourceUrl(sourceRes.result.url);
        embedArr.push({ source: source.title, url: decryptedUrl });
    }
    for (const embedObj of embedArr) {
        if (embedObj.source === "Vidplay") {
            const fullUrl = new URL(embedObj.url);
            embeds.push({
                embedId: "vidplay",
                url: fullUrl.toString()
            });
        }
        if (embedObj.source === "Filemoon") {
            const fullUrl = new URL(embedObj.url);
            const urlWithSubtitles = (_a = embedArr.find((v) => v.source === "Vidplay" && v.url.includes("sub.info"))) == null ? void 0 : _a.url;
            const subtitleUrl = urlWithSubtitles ? new URL(urlWithSubtitles).searchParams.get("sub.info") : null;
            if (subtitleUrl) fullUrl.searchParams.set("sub.info", subtitleUrl);
            embeds.push(
                {
                    embedId: "filemoon",
                    url: fullUrl.toString()
                },
                {
                    embedId: "filemoon-mp4",
                    url: fullUrl.toString()
                }
            );
        }
    }
    return {
        embeds
    };
};
const vidSrcToScraper = makeSourcerer({
    id: "vidsrcto",
    name: "VidSrcTo",
    disabled: true,
    scrapeMovie: universalScraper,
    scrapeShow: universalScraper,
    flags: [flags.PROXY_BLOCKED],
    rank: 260
});
async function getEmbeds(id, servers, ctx) {
    var _a;
    const embeds = [];
    for (const server of servers.split(",")) {
        await ctx.proxiedFetcher(`/getEmbed.php`, {
            baseUrl: warezcdnBase,
            headers: {
                Referer: `${warezcdnBase}/getEmbed.php?${new URLSearchParams({ id, sv: server })}`
            },
            method: "HEAD",
            query: { id, sv: server }
        });
        const embedPage = await ctx.proxiedFetcher(`/getPlay.php`, {
            baseUrl: warezcdnBase,
            headers: {
                Referer: `${warezcdnBase}/getEmbed.php?${new URLSearchParams({ id, sv: server })}`
            },
            query: { id, sv: server }
        });
        const url = (_a = embedPage.match(/window.location.href\s*=\s*"([^"]+)"/)) == null ? void 0 : _a[1];
        if (url && server === "warezcdn") {
            embeds.push(
                { embedId: warezcdnembedHlsScraper.id, url },
                { embedId: warezcdnembedMp4Scraper.id, url },
                { embedId: warezPlayerScraper.id, url }
            );
        } else if (url && server === "mixdrop") embeds.push({ embedId: mixdropScraper.id, url });
    }
    return { embeds };
}
const warezcdnScraper = makeSourcerer({
    id: "warezcdn",
    name: "WarezCDN",
    rank: 140,
    flags: [],
    scrapeMovie: async (ctx) => {
        if (!ctx.media.imdbId) throw new NotFoundError("This source requires IMDB id.");
        const serversPage = await ctx.proxiedFetcher(`/filme/${ctx.media.imdbId}`, {
            baseUrl: warezcdnBase
        });
        const [, id, servers] = serversPage.match(/let\s+data\s*=\s*'\[\s*\{\s*"id":"([^"]+)".*?"servers":"([^"]+)"/);
        if (!id || !servers) throw new NotFoundError("Failed to find episode id");
        return getEmbeds(id, servers, ctx);
    },
    scrapeShow: async (ctx) => {
        var _a, _b;
        if (!ctx.media.imdbId) throw new NotFoundError("This source requires IMDB id.");
        const url = `${warezcdnBase}/serie/${ctx.media.imdbId}/${ctx.media.season.number}/${ctx.media.episode.number}`;
        const serversPage = await ctx.proxiedFetcher(url);
        const seasonsApi = (_a = serversPage.match(/var\s+cachedSeasons\s*=\s*"([^"]+)"/)) == null ? void 0 : _a[1];
        if (!seasonsApi) throw new NotFoundError("Failed to find data");
        const streamsData = await ctx.proxiedFetcher(seasonsApi, {
            baseUrl: warezcdnBase,
            headers: {
                Referer: url,
                "X-Requested-With": "XMLHttpRequest"
            }
        });
        const season = Object.values(streamsData.seasons).find((s) => s.name === ctx.media.season.number.toString());
        if (!season) throw new NotFoundError("Failed to find season id");
        const episode = (_b = Object.values(season.episodes).find((e) => e.name === ctx.media.season.number.toString())) == null ? void 0 : _b.id;
        if (!episode) throw new NotFoundError("Failed to find episode id");
        const episodeData = await ctx.proxiedFetcher("/core/ajax.php", {
            baseUrl: warezcdnBase,
            headers: {
                Referer: url,
                "X-Requested-With": "XMLHttpRequest"
            },
            query: { audios: episode }
        });
        const [, id, servers] = episodeData.replace(/\\"/g, '"').match(/"\[\s*\{\s*"id":"([^"]+)".*?"servers":"([^"]+)"/);
        if (!id || !servers) throw new NotFoundError("Failed to find episode id");
        return getEmbeds(id, servers, ctx);
    }
});
function gatherAllSources() {
    return [
        catflixScraper,
        flixhqScraper,
        remotestreamScraper,
        kissAsianScraper,
        showboxScraper,
        goMoviesScraper,
        zoechipScraper,
        vidsrcScraper,
        lookmovieScraper,
        nsbxScraper,
        smashyStreamScraper,
        ridooMoviesScraper,
        vidSrcToScraper,
        nepuScraper,
        goojaraScraper,
        hdRezkaScraper,
        m4uScraper,
        primewireScraper,
        warezcdnScraper,
        insertunitScraper,
        nitesScraper,
        soaperTvScraper,
        autoembedScraper,
        tugaflixScraper,
        ee3Scraper,
        whvxScraper,
        fsharetvScraper,
        redStarScraper,
        bombtheirishScraper,
        vidsrcsuScraper,
        TASFScraper,
        mp4hydraScraper
    ];
}
function gatherAllEmbeds() {
    return [
        upcloudScraper,
        vidCloudScraper,
        mp4uploadScraper,
        streamsbScraper,
        upstreamScraper,
        febboxMp4Scraper,
        febboxHlsScraper,
        mixdropScraper,
        vidsrcembedScraper,
        streambucketScraper,
        smashyStreamFScraper,
        smashyStreamOScraper,
        ridooScraper,
        closeLoadScraper,
        fileMoonScraper,
        fileMoonMp4Scraper,
        deltaScraper,
        alphaScraper,
        vidplayScraper,
        wootlyScraper,
        doodScraper,
        streamvidScraper,
        voeScraper,
        streamtapeScraper,
        droploadScraper,
        filelionsScraper,
        vTubeScraper,
        warezcdnembedHlsScraper,
        warezcdnembedMp4Scraper,
        warezPlayerScraper,
        bflixScraper,
        playm4uNMScraper,
        hydraxScraper,
        autoembedEnglishScraper,
        autoembedHindiScraper,
        autoembedBengaliScraper,
        autoembedTamilScraper,
        autoembedTeluguScraper,
        turbovidScraper,
        novaScraper,
        astraScraper,
        orionScraper,
        streamwishScraper,
        mp4hydraServer1Scraper,
        mp4hydraServer2Scraper
    ];
}
function getBuiltinSources() {
    return gatherAllSources().filter((v) => !v.disabled && !v.externalSource);
}
function getBuiltinExternalSources() {
    return gatherAllSources().filter((v) => v.externalSource && !v.disabled);
}
function getBuiltinEmbeds() {
    return gatherAllEmbeds().filter((v) => !v.disabled);
}
function hasDuplicates(values) {
    return new Set(values).size !== values.length;
}
function getProviders(features, list) {
    const sources = list.sources.filter((v) => !(v == null ? void 0 : v.disabled));
    const embeds = list.embeds.filter((v) => !(v == null ? void 0 : v.disabled));
    const combined = [...sources, ...embeds];
    const anyDuplicateId = hasDuplicates(combined.map((v) => v.id));
    const anyDuplicateSourceRank = hasDuplicates(sources.map((v) => v.rank));
    const anyDuplicateEmbedRank = hasDuplicates(embeds.map((v) => v.rank));
    if (anyDuplicateId) throw new Error("Duplicate id found in sources/embeds");
    if (anyDuplicateSourceRank) throw new Error("Duplicate rank found in sources");
    if (anyDuplicateEmbedRank) throw new Error("Duplicate rank found in embeds");
    return {
        sources: sources.filter((s) => flagsAllowedInFeatures(features, s.flags)),
        embeds
    };
}
function makeProviders(ops) {
    var _a;
    const features = getTargetFeatures(
        ops.proxyStreams ? "any" : ops.target,
        ops.consistentIpForRequests ?? false,
        ops.proxyStreams
    );
    const sources = [...getBuiltinSources()];
    if (ops.externalSources === "all") sources.push(...getBuiltinExternalSources());
    else {
        (_a = ops.externalSources) == null ? void 0 : _a.forEach((source) => {
            const matchingSource = getBuiltinExternalSources().find((v) => v.id === source);
            if (!matchingSource) return;
            sources.push(matchingSource);
        });
    }
    const list = getProviders(features, {
        embeds: getBuiltinEmbeds(),
        sources
    });
    return makeControls({
        embeds: list.embeds,
        sources: list.sources,
        features,
        fetcher: ops.fetcher,
        proxiedFetcher: ops.proxiedFetcher,
        proxyStreams: ops.proxyStreams
    });
}
function buildProviders() {
    let consistentIpForRequests = false;
    let target = null;
    let fetcher = null;
    let proxiedFetcher = null;
    const embeds = [];
    const sources = [];
    const builtinSources = getBuiltinSources();
    const builtinExternalSources = getBuiltinExternalSources();
    const builtinEmbeds = getBuiltinEmbeds();
    return {
        enableConsistentIpForRequests() {
            consistentIpForRequests = true;
            return this;
        },
        setFetcher(f) {
            fetcher = f;
            return this;
        },
        setProxiedFetcher(f) {
            proxiedFetcher = f;
            return this;
        },
        setTarget(t) {
            target = t;
            return this;
        },
        addSource(input) {
            if (typeof input !== "string") {
                sources.push(input);
                return this;
            }
            const matchingSource = [...builtinSources, ...builtinExternalSources].find((v) => v.id === input);
            if (!matchingSource) throw new Error("Source not found");
            sources.push(matchingSource);
            return this;
        },
        addEmbed(input) {
            if (typeof input !== "string") {
                embeds.push(input);
                return this;
            }
            const matchingEmbed = builtinEmbeds.find((v) => v.id === input);
            if (!matchingEmbed) throw new Error("Embed not found");
            embeds.push(matchingEmbed);
            return this;
        },
        addBuiltinProviders() {
            sources.push(...builtinSources);
            embeds.push(...builtinEmbeds);
            return this;
        },
        build() {
            if (!target) throw new Error("Target not set");
            if (!fetcher) throw new Error("Fetcher not set");
            const features = getTargetFeatures(target, consistentIpForRequests);
            const list = getProviders(features, {
                embeds,
                sources
            });
            return makeControls({
                fetcher,
                proxiedFetcher: proxiedFetcher ?? void 0,
                embeds: list.embeds,
                sources: list.sources,
                features
            });
        }
    };
}
const isReactNative = () => {
    try {
        require("react-native");
        return true;
    } catch (e) {
        return false;
    }
};
function serializeBody(body) {
    if (body === void 0 || typeof body === "string" || body instanceof URLSearchParams || body instanceof FormData) {
        if (body instanceof URLSearchParams && isReactNative()) {
            return {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                body: body.toString()
            };
        }
        return {
            headers: {},
            body
        };
    }
    return {
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    };
}
function getHeaders(list, res) {
    const output = new Headers();
    list.forEach((header) => {
        var _a;
        const realHeader = header.toLowerCase();
        const realValue = res.headers.get(realHeader);
        const extraValue = (_a = res.extraHeaders) == null ? void 0 : _a.get(realHeader);
        const value = extraValue ?? realValue;
        if (!value) return;
        output.set(realHeader, value);
    });
    return output;
}
function makeStandardFetcher(f) {
    const normalFetch = async (url, ops) => {
        var _a;
        const fullUrl = makeFullUrl(url, ops);
        const seralizedBody = serializeBody(ops.body);
        const res = await f(fullUrl, {
            method: ops.method,
            headers: {
                ...seralizedBody.headers,
                ...ops.headers
            },
            body: seralizedBody.body,
            credentials: ops.credentials
        });
        let body;
        const isJson = (_a = res.headers.get("content-type")) == null ? void 0 : _a.includes("application/json");
        if (isJson) body = await res.json();
        else body = await res.text();
        return {
            body,
            finalUrl: res.extraUrl ?? res.url,
            headers: getHeaders(ops.readHeaders, res),
            statusCode: res.status
        };
    };
    return normalFetch;
}
const headerMap = {
    cookie: "X-Cookie",
    referer: "X-Referer",
    origin: "X-Origin",
    "user-agent": "X-User-Agent",
    "x-real-ip": "X-X-Real-Ip"
};
const responseHeaderMap = {
    "x-set-cookie": "Set-Cookie"
};
function makeSimpleProxyFetcher(proxyUrl, f) {
    const proxiedFetch = async (url, ops) => {
        const fetcher = makeStandardFetcher(async (a, b) => {
            const res = await f(a, b);
            res.extraHeaders = new Headers();
            Object.entries(responseHeaderMap).forEach((entry) => {
                var _a;
                const value = res.headers.get(entry[0]);
                if (!value) return;
                (_a = res.extraHeaders) == null ? void 0 : _a.set(entry[1].toLowerCase(), value);
            });
            res.extraUrl = res.headers.get("X-Final-Destination") ?? res.url;
            return res;
        });
        const fullUrl = makeFullUrl(url, ops);
        const headerEntries = Object.entries(ops.headers).map((entry) => {
            const key2 = entry[0].toLowerCase();
            if (headerMap[key2]) return [headerMap[key2], entry[1]];
            return entry;
        });
        return fetcher(proxyUrl, {
            ...ops,
            query: {
                destination: fullUrl
            },
            headers: Object.fromEntries(headerEntries),
            baseUrl: void 0
        });
    };
    return proxiedFetch;
}
export {
    NotFoundError,
    buildProviders,
    flags,
    getBuiltinEmbeds,
    getBuiltinExternalSources,
    getBuiltinSources,
    makeProviders,
    makeSimpleProxyFetcher,
    makeStandardFetcher,
    targets
};
