import fetch from "node-fetch";
import { ErrorObject } from "../../../helpers/ErrorObject.js";
import { extract } from "../../../utils/Extractor.js";
import * as cheerio from 'cheerio';
import JsUnpacker from "../../../utils/jsunpack.js";

const DOMAIN = "https://www.2embed.cc";
const PLAYER_URL = "https://uqloads.xyz";
let subtitles = [];

const headers = {
    'User-Agent': "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    'Referer': DOMAIN,
    'Origin': DOMAIN,
};

function parseQuality(qualityString) {
    if (!qualityString) return 0;
    const q = qualityString.toUpperCase();
    if (q === '4K') return 4000;
    if (q.includes('1080P')) return 1080;
    if (q.includes('720P')) return 720;
    const numMatch = q.match(/(\d+)/);
    return numMatch ? parseInt(numMatch[1], 10) : 0;
};

export async function getTwoEmbed(params) {
    const { tmdb, season, episode } = params;
    const url = season && episode
        ? `${DOMAIN}/embedtv/${tmdb}&s=${season}&e=${episode}`
        : `${DOMAIN}/embed/${tmdb}`;

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                Referer: url,
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": headers['User-Agent'],
            },
            body: "pls=pls"
        });

        if (!response.ok) {
            return new ErrorObject(`HTTP error fetching initial URL! Status: ${response.status}`, "2Embed", 500, "Check the URL or server status", true, true);
        }

        const data = await response.text();
        const match = data.match(/swish\?id=(?<id>[\w\d]+)/) || data.match(/'(.*?player4u.*?)'/);

        if (!match || !match[1]) {
            return new ErrorObject("No relevant swish ID or player4u URL found in initial data.", "2Embed", 500, "The backend logic might have changed.", true, true);
        }

        const extractedValue = match[1];
        const isSwishId = match[0].includes("swish");

        subtitles = [];

        if (isSwishId) {
            const streamUrl = await extract(`${PLAYER_URL}/e/${extractedValue}`, DOMAIN);
            if (!streamUrl) {
                return new ErrorObject(`Could not resolve stream URL for swish ID: ${extractedValue}`, "2Embed", 500, "Check the swish ID or backend logic.", true, true);
            }

            return {
                files: {
                    file: streamUrl,
                    type: "hls",
                    lang: "en"
                },
                subtitles: []
            };
        } else {
            const listPageResponse = await fetch(extractedValue, {
                headers: {
                    Referer: url,
                    "User-Agent": headers['User-Agent']
                }
            });

            if (!listPageResponse.ok) {
                return new ErrorObject(`Failed to fetch player4u list page ${extractedValue}: ${listPageResponse.status}`);
            }

            const listPageHtml = await listPageResponse.text();

            const $ = cheerio.load(listPageHtml);
            let highestQuality = -1;
            let bestPartialUrl = null;

            $('li.slide-toggle a.playbtnx').each((index, element) => {
                const linkText = $(element).text();
                const onclickAttr = $(element).attr('onclick');

                if (!linkText || !onclickAttr) return;

                const qualityMatch = linkText.match(/\s*(\d+p|4K)\s*/i);
                const qualityString = qualityMatch ? qualityMatch[1].toUpperCase() : null;

                const urlMatch = onclickAttr.match(/go\('([^']+)'\)/);
                const partialUrl = urlMatch ? urlMatch[1] : null;

                if (!qualityString || !partialUrl) return;

                const qualityValue = parseQuality(qualityString);

                if (qualityValue > highestQuality) {
                    highestQuality = qualityValue;
                    bestPartialUrl = partialUrl;
                }
            });

            if (bestPartialUrl) {
                const idMatch = bestPartialUrl.match(/\?id=([\w\d]+)/);
                if (idMatch && idMatch[1]) {
                    const player4uId = idMatch[1];
                    const resolveUrl = `${PLAYER_URL}/e/${player4uId}`;

                    const streamUrl = await resolve(resolveUrl, extractedValue);
                    if (!streamUrl) {
                        return new ErrorObject(`Could not resolve stream URL for player4u ID: ${player4uId}`);
                    }
                    return {
                        files: {
                            file: streamUrl,
                            type: "hls",
                            lang: "en"
                        },
                        subtitles: subtitles
                    };
                } else {
                    return new ErrorObject("Could not extract player4u ID from best quality URL");
                }
            } else {
                return new ErrorObject("No valid quality options found on player4u page");
            }
        }
    } catch (error) {
        return new ErrorObject(`Unexpected error: ${error.message}`, "2Embed", 500, "Check the implementation or server status.", true, true);
    }
};

async function resolve(url, referer) {
    try {
        const response = await fetch(url, {
            headers: {
                Referer: referer,
                "User-Agent": headers['User-Agent']
            }
        });

        if (!response.ok) {
            console.error(`Resolve failed for ${url}: Status ${response.status}`);
            return null;
        }

        const data = await response.text();
        const packedDataRegex = /eval\(function(.*?)split.*\)\)\)/s;
        const packedDataMatch = data.match(packedDataRegex);

        if (packedDataMatch) {
            const packedJS = packedDataMatch[0];
            const unpacker = new JsUnpacker(packedJS);

            if (unpacker.detect()) {
                const unpackedJS = unpacker.unpack();
                if (!unpackedJS) {
                    console.error("JsUnpacker failed to unpack");
                    return null;
                }

                await parseSubs(unpackedJS);

                const docheck = unpackedJS.includes("\"hls2\":\"https");

                if (docheck) {
                    const fileRegex = /links=.*hls2\":\"(.*?)\"};/;

                    const matchUri = unpackedJS.match(fileRegex);

                    if (matchUri && matchUri[1]) {
                        return matchUri[1];
                    } else {
                        console.error("Could not find file URL in unpacked JS");
                        return null;
                    }
                } else {
                    const fileRegex = /sources\s*:\s*\[\s*\{\s*file\s*:\s*"([^"]+)"/;

                    const matchUri = unpackedJS.match(fileRegex);

                    if (matchUri && matchUri[1]) {
                        return matchUri[1];
                    } else {
                        console.error("Could not find file URL in unpacked JS");
                        return null;
                    }
                }


            } else {
                console.error("JsUnpacker could not detect packed data in resolve response");
                return null;
            }
        } else {
            console.error("No packed JS data found in resolve response for:", url);
            if (url.includes('.m3u8')) return url;
            return null;
        }
    } catch (error) {
        console.error(`Error during resolve for ${url}:`, error);
        return null;
    }
};

async function parseSubs(scriptstring) {
    if (typeof subtitles === 'undefined') {
        console.error("Subtitles array is not accessible in parseSubs");
        return;
    }

    try {
        const linksMatch = scriptstring.match(/var links\s*=\s*({[^;]*});/);
        if (!linksMatch) {
            console.error("Could not find links object in script");
            return;
        }

        let linksStr = linksMatch[1]
            .replace(/'/g, '"')
            .replace(/([{,]\s*)([a-zA-Z0-9_$]+)(\s*:)/g, '$1"$2"$3');

        const links = JSON.parse(linksStr);
        const videoUrl = links.hls2;

        const setupMatch = scriptstring.match(/jwplayer\(["']vplayer["']\)\.setup\((\{[\s\S]*?\})\);[\s\S]*?$/);
        if (!setupMatch || !setupMatch[1]) {
            console.error("Could not find JWPlayer setup configuration");
            return;
        }

        let setupStr = setupMatch[1];

        setupStr = setupStr.replace(/links\.hls4\s*\|\|\s*links\.hls2/g, `"${videoUrl}"`);

        setupStr = setupStr
            .replace(/\\'/g, "'")
            .replace(/([{,]\s*)([a-zA-Z0-9_$]+)(\s*:)/g, '$1"$2"$3')
            .replace(/'/g, '"')
            .replace(/,\s*([}\]])/g, '$1')
            .replace(/"true"/g, 'true')
            .replace(/"false"/g, 'false')
            .replace(/"null"/g, 'null');

        let setupConfig;
        try {
            setupConfig = JSON.parse(setupStr);
        } catch (err) {
            console.error("JSON parse error:", err, "in string:", setupStr);
            return;
        }

        if (!setupConfig.tracks) {
            return;
        }

        const subtitleTracks = (setupConfig.tracks || []).filter(track =>
            track && (track.kind === "captions" || track.kind === "subtitles") && track.file
        ).map(track => ({
            url: track.file,
            lang: track.label || track.kind
        }));

        subtitleTracks.forEach(newSub => {
            if (!subtitles.some(existingSub => existingSub.url === newSub.url && existingSub.lang === newSub.lang)) {
                subtitles.push(newSub);
            }
        });

    } catch (error) {
        console.error("Error during subtitle parsing:", error);
    }
};