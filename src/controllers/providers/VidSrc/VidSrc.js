import axios from "axios";
import { Buffer } from 'buffer';
import { atob } from 'buffer';
import { URL } from 'url';
import base64 from "base-64";

const URI = "https://vidsrc.xyz";
const HOST_URL = "https://edgedeliverynetwork.com";

const IFRAME2_SRC_RE = /id="player_iframe" src="(?<url>[^"]+)"/;
const IFRAME3_SRC_RE = /src: '(?<url>\/prorcp\/[^']+)'/;
const PARAMS_RE = /<div id="(?<id>[^"]+)" style="display:none;">(?<content>[^>]+)<\/div>/;

export async function getVidSrc(params) {
    const tmdbId = params.tmdbId.toString();
    const id = params.imdbId || tmdbId;

    const url = params.ep
        ? `${URI}/embed/tv/${id}/${params.ep.s}-${params.ep.e}`
        : `${URI}/embed/movie/${id}`;

    const client = axios.create();

    const iframeHtml1 = (await client.get(url)).data;

    const secondUrlMatch = iframeHtml1.match(IFRAME2_SRC_RE);
    if (!secondUrlMatch) return new Error("[vidsrc] No second iframe found");
    const secondUrl = new URL(secondUrlMatch.groups.url, URI).toString();

    const iframeHtml2 = (await client.get(secondUrl, {
        headers: {
            Referer: url,
            Origin: secondUrl
        }
    })).data;

    const thirdUrlMatch = iframeHtml2.match(IFRAME3_SRC_RE);
    if (!thirdUrlMatch) return new Error("[vidsrc] No third iframe found");
    const thirdUrl = new URL(thirdUrlMatch.groups.url, HOST_URL).toString();

    const iframeHtml3 = (await client.get(thirdUrl, {
        headers: {
            Referer: secondUrl
        }
    })).data;

    const paramsMatch = iframeHtml3.match(PARAMS_RE);
    if (!paramsMatch) return new Error("[vidsrc] No params in third iframe found");
    const { id: decoderId, content } = paramsMatch.groups;

    let decoded;
    switch (decoderId) {
        case "NdonQLf1Tzyx7bMG": decoded = decoder1(content); break;
        case "sXnL9MQIry": decoded = decoder2(content); break;
        case "IhWrImMIGL": decoded = decoder3(content); break;
        case "KJHidj7det": decoded = decoder7(content); break;
        case "Oi3v1dAlaM": decoded = decoder9(content, 5); break;
        case "TsA2KGDGux": decoded = decoder9(content, 7); break;
        case "JoAHUMCLXV": decoded = decoder9(content, 3); break;
        case "eSfH1IRMyL": decoded = decoder6(content); break;
        case "o2VSUnjnZl": decoded = decoder8(content); break;
        case "xTyBxQyGTA": decoded = decoder4(content); break;
        case "ux8qjPHC66": decoded = decoder5(content); break;
        default: decoderId;
    }

    return {
        files: [
            {
                file: decoded,
                type: "hls",
                lang: "en"
            }
        ],
        subtitles: []
    };
}

function decoder1(a) {
    const b = 3;
    const c = [];
    let d = 0;
    while (d < a.length) {
        c.push(a.substring(d, Math.min(d + b, a.length)));
        d += b;
    }
    const e = c.reverse().join('');
    return e;
}

function decoder2(a) {
    const b = "pWB9V)[*4I`nJpp?ozyB~dbr9yt!_n4u".split("").map(c => c.charCodeAt(0));
    const shift = 3;
    const d = a.match(/.{2}/g).map(hex => parseInt(hex, 16));
    const decrypted = d.map((v, i) => (v ^ b[i % b.length]) - shift);
    return base64.decode(String.fromCharCode(...decrypted));
}

function decoder3(a) {
    const d = a.split("").map(ch => {
        if (/[a-mA-M]/.test(ch)) return String.fromCharCode(ch.charCodeAt(0) + 13);
        if (/[n-zN-Z]/.test(ch)) return String.fromCharCode(ch.charCodeAt(0) - 13);
        return ch;
    });
    return base64.decode(d.join(""));
}

function decoder4(a) {
    const b = a.split('').reverse().join('');
    const c = Array.from(b).filter((_, index) => index % 2 === 0).join('');
    const decoded = atob(c);
    return decoded;
}

function decoder5(a) {
    const b = a.split('').reverse().join('');
    const c = Array.from(b).map(char => String.fromCharCode(char.charCodeAt(0) - 1)).join('');
    const d = c.match(/.{1,2}/g).map(pair => String.fromCharCode(parseInt(pair, 16))).join('');
    return d;
}

function decoder6(a) {
    const d = Array.from(a).reverse().map(ch => ch.charCodeAt(0) - 1);
    const chunks = [];
    for (let i = 0; i < d.length; i += 2) {
        chunks.push(parseInt(String.fromCharCode(d[i], d[i + 1]), 16));
    }
    return Buffer.from(chunks).toString('utf8');
}

function decoder7(a) {
    const b = a.slice(10, -16);
    const c = "3SAY~#%Y(V%>5d/Yg\"$G[Lh1rK4a;7ok".split("").map(ch => ch.charCodeAt(0));
    const d = base64.decode(b).split("").map(ch => ch.charCodeAt(0));
    const decrypted = d.map((v, i) => v ^ c[i % c.length]);
    return String.fromCharCode(...decrypted);
}

function decoder8(a) {
    const b = {
        'x': 'a', 'y': 'b', 'z': 'c', 'a': 'd', 'b': 'e', 'c': 'f', 'd': 'g', 'e': 'h', 'f': 'i',
        'g': 'j', 'h': 'k', 'i': 'l', 'j': 'm', 'k': 'n', 'l': 'o', 'm': 'p', 'n': 'q', 'o': 'r',
        'p': 's', 'q': 't', 'r': 'u', 's': 'v', 't': 'w', 'u': 'x', 'v': 'y', 'w': 'z',
        'X': 'A', 'Y': 'B', 'Z': 'C', 'A': 'D', 'B': 'E', 'C': 'F', 'D': 'G', 'E': 'H', 'F': 'I',
        'G': 'J', 'H': 'K', 'I': 'L', 'J': 'M', 'K': 'N', 'L': 'O', 'M': 'P', 'N': 'Q', 'O': 'R',
        'P': 'S', 'Q': 'T', 'R': 'U', 'S': 'V', 'T': 'W', 'U': 'X', 'V': 'Y', 'W': 'Z'
    };
    const result = Array.from(a).map(char => b[char] || char).join('');
    return result;
}

function decoder9(a, shift) {
    const c = a.split("").reverse().map(ch => (ch === '-' ? '+' : ch === '_' ? '/' : ch)).join("");
    const d = base64.decode(c).split("").map(ch => ch.charCodeAt(0) - shift);
    return String.fromCharCode(...d);
}