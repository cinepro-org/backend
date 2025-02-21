import fetch from 'node-fetch';
import {languageMap} from '../../../utils/languages.js';

export async function getEmbedsu(tmdb_id, s, e) {
    const DOMAIN = "https://embed.su";
    const headers = {
        'User-Agent': "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        'Referer': DOMAIN,
        'Origin': DOMAIN,
    };

    try {
        const urlSearch = s && e ? `${DOMAIN}/embed/tv/${tmdb_id}/${s}/${e}` : `${DOMAIN}/embed/movie/${tmdb_id}`;
        const htmlSearch = await fetch(urlSearch, {method: 'GET', headers});
        if (!htmlSearch.ok) return new Error(htmlSearch.statusText);
        const textSearch = await htmlSearch.text();

        const hashEncodeMatch = textSearch.match(/JSON\.parse\(atob\(\`([^\`]+)/i);
        const hashEncode = hashEncodeMatch ? hashEncodeMatch[1] : "";

        if (!hashEncode) return;

        const hashDecode = JSON.parse(await stringAtob(hashEncode));
        const mEncrypt = hashDecode.hash;
        if (!mEncrypt) return;

        const firstDecode = (await stringAtob(mEncrypt)).split(".").map(item => item.split("").reverse().join(""));
        const secondDecode = JSON.parse(await stringAtob(firstDecode.join("").split("").reverse().join("")));

        if (!secondDecode || secondDecode.length === 0) return;

        let originalPlaylist = "";
        let bestQuality = null;
        let tracks = [];

        for (const item of secondDecode) {
            if (item.name.toLowerCase() !== "viper") continue;

            const urlDirect = `${DOMAIN}/api/e/${item.hash}`;
            const dataDirect = await requestGet(urlDirect, {
                "Referer": DOMAIN,
                "User-Agent": headers['User-Agent'],
                "Accept": "*/*"
            });

            if (!dataDirect.source) continue;

            originalPlaylist = dataDirect.source;

            tracks = dataDirect.subtitles.map(sub => ({
                url: sub.file,
                lang: languageMap[sub.label.split(' ')[0]] || sub.label,
                type: sub.file.split('.').pop()
            })).filter(track => track.lang);

            const requestDirectSize = await fetch(dataDirect.source, {headers, method: "GET"});
            const parseRequest = await requestDirectSize.text();

            const patternSize = parseRequest.split('\n').filter(item => item.includes('/proxy/'));

            const directQuality = patternSize.map(patternItem => {
                const sizeQuality = getSizeQuality(patternItem);
                let dURL = `${DOMAIN}${patternItem}`;
                dURL = dURL.replace("embed.su/api/proxy/viper/", "").replace(".png", ".m3u8");
                return {file: dURL, type: 'hls', quality: `${sizeQuality}p`, lang: 'en'};
            });

            if (!directQuality.length) continue;

            const highestQuality = directQuality.reduce((prev, current) => {
                return (parseInt(current.quality) > parseInt(prev.quality)) ? current : prev;
            }, directQuality[0]);

            if (!bestQuality || parseInt(highestQuality.quality) > parseInt(bestQuality.quality)) {
                bestQuality = highestQuality;
            }
        }

    return {
        files: [{
            file: originalPlaylist.replace("embed.su/api/proxy/viper/", ""),
            type: "hls",
            quality: bestQuality.quality,
            lang: "en",
            headers: {
                "User-Agent": headers['User-Agent'],
                "Referer": DOMAIN,
                "Origin": DOMAIN
            }
        }],
        subtitles: tracks
    };
    } catch (e) {
        return {provider: "EmbedSu", originalPlaylist: "", bestQuality: null};
    }
}

function getSizeQuality(url) {
    const parts = url.split('/');
    const base64Part = parts[parts.length - 2];
    const decodedPart = atob(base64Part);
    return Number(decodedPart) || 1080;
}

async function stringAtob(input) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let str = input.replace(/=+$/, '');
    let output = '';

    if (str.length % 4 === 1) {
        throw new Error("'atob' failed: The string to be decoded is not correctly encoded.");
    }

    for (let bc = 0, bs = 0, buffer, i = 0; buffer = str.charAt(i++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
        buffer = chars.indexOf(buffer);
    }

    return output;
}

async function requestGet(url, headers = {}) {
    try {
        const response = await fetch(url, {method: 'GET', headers});

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        return "";
    }
}