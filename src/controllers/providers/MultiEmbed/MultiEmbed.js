import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';
import { ErrorObject } from '../../../helpers/ErrorObject.js';

/* ================= DEBUG ================= */
const DEBUG = true;
const dbg = (...args) => DEBUG && console.log('[Multiembed][debug]', ...args);
/* ========================================= */

const userAgent =
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36';

const headers = {
    Referer: 'https://multiembed.mov',
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': userAgent
};

function baseTransform(d, e, f) {
    const charset =
        '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/';
    const g = [...charset];
    const h = g.slice(0, e);
    const i = g.slice(0, f);

    let j = 0;
    const reversedD = d.split('').reverse();
    for (let c = 0; c < reversedD.length; c++) {
        const b = reversedD[c];
        if (h.includes(b)) {
            j += h.indexOf(b) * Math.pow(e, c);
        }
    }

    let k = '';
    while (j > 0) {
        k = i[j % f] + k;
        j = Math.floor(j / f);
    }
    return k || '0';
}

function decodeHunter(h, u, n, t, e, r = '') {
    let i = 0;
    while (i < h.length) {
        let s = '';
        while (h[i] !== n[e]) {
            s += h[i];
            i++;
        }
        i++;

        for (let j = 0; j < n.length; j++) {
            s = s.replace(
                new RegExp(n[j].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
                j.toString()
            );
        }

        const charCode = parseInt(baseTransform(s, e, 10)) - t;
        r += String.fromCharCode(charCode);
    }
    return decodeURIComponent(r);
}

export async function getMultiembed(params) {
    const { imdb } = params;
    let baseUrl = `https://multiembed.mov/?video_id=${imdb}`;

    try {
        dbg('IMDB:', imdb);
        dbg('Initial URL:', baseUrl);

        if (baseUrl.includes('multiembed')) {
            const resolved = await axios.get(baseUrl, { headers });
            baseUrl = resolved.request.res.responseUrl || baseUrl;
            dbg('Resolved URL:', baseUrl);
        }

        const defaultDomain = new URL(baseUrl).origin + '/';

        const data = {
            'button-click':
                'ZEhKMVpTLVF0LVBTLVF0LVAtMGs1TFMtUXpPREF0TC0wLVYzTi0wVS1RTi0wQTFORGN6TmprLTU=',
            'button-referer': ''
        };

        const resp1 = await axios.post(baseUrl, new URLSearchParams(data), {
            headers
        });

        dbg('Button POST done');
        dbg('Sources raw HTML:', resp1.data);

        const tokenMatch = resp1.data.match(/load_sources\(\"(.*?)\"\)/);
        if (!tokenMatch) {
            dbg('Token NOT found. HTML preview:', resp1.data.substring(0, 300));
            throw new Error('Token not found');
        }

        const token = tokenMatch[1];
        dbg('Token:', token);

        const resp2 = await axios.post(
            'https://streamingnow.mov/response.php',
            new URLSearchParams({ token }),
            { headers }
        );

        dbg('Sources HTML length:', resp2.data.length);
        dbg('Sources raw HTML:', resp2.data);

        const $ = cheerio.load(resp2.data);

        const allSources = [];
        $('li').each((i, el) => {
            allSources.push({
                text: $(el).text().trim(),
                server: $(el).attr('data-server'),
                id: $(el).attr('data-id')
            });
        });

        dbg('All sources found:', allSources);

        const vipSource = $('li')
            .filter((i, el) => {
                const txt = $(el).text().toLowerCase();
                return txt.includes('vipstream') && $(el).attr('data-id');
            })
            .first();

        if (!vipSource.length) {
            dbg('VIP source NOT found');
            throw new Error('No VIP source (B/S) found with valid data-id');
        }

        const serverId = vipSource.attr('data-server');
        const videoId = vipSource.attr('data-id');

        dbg('VIP source selected:', { serverId, videoId });

        const vipUrl = `https://streamingnow.mov/playvideo.php?video_id=${videoId}&server_id=${serverId}&token=${token}&init=1`;
        dbg('VIP URL:', vipUrl);

        const resp3 = await axios.get(vipUrl, { headers });
        dbg('Sources raw HTML:', resp3.data);
        const $2 = cheerio.load(resp3.data);

        let iframeUrl = $2('iframe.source-frame.show').attr('src');
        if (!iframeUrl) iframeUrl = $2('iframe.source-frame').attr('src');

        dbg('Iframe URL:', iframeUrl);

        if (!iframeUrl) {
            throw new Error('Iframe src empty');
        }

        const resp4 = await axios.get(iframeUrl, { headers });
        dbg('Iframe HTML length:', resp4.data.length);
        dbg('Sources raw HTML:', resp4.data);

        const hunterMatch = resp4.data.match(
            /\(\s*function\s*\([^\)]*\)\s*\{[\s\S]*?\}\s*\(\s*(.*?)\s*\)\s*\)/
        );

        let videoUrl = null;

        if (hunterMatch) {
            dbg('Hunter pack found');

            let dataArray;
            try {
                dataArray = new Function('return [' + hunterMatch[1] + ']')();
            } catch {
                dataArray = eval('[' + hunterMatch[1] + ']');
            }

            dbg('Hunter array length:', dataArray.length);

            const [h, u, n, t, e, r] = dataArray;
            const decoded = decodeHunter(h, u, n, t, e, r);

            dbg('Decoded hunter preview:', decoded.substring(0, 200));

            const videoMatch = decoded.match(/file:"(https?:\/\/[^"]+)"/);
            if (videoMatch) {
                videoUrl = videoMatch[1];
            }
        }

        if (!videoUrl) {
            dbg('Trying direct file match');
            const fileMatch = resp4.data.match(/file\s*:\s*"([^"]+)"/);
            if (fileMatch) {
                videoUrl = decodeURIComponent(
                    fileMatch[1].match(/src=([^&]+)/)?.[1] || fileMatch[1]
                );
            }
        }

        if (!videoUrl) {
            dbg(
                'NO video URL found. HTML preview:',
                resp4.data.substring(0, 400)
            );
            throw new Error('No video URL found');
        }

        dbg('Final video URL:', videoUrl);

        return {
            files: {
                file: videoUrl,
                type: 'hls',
                lang: 'en',
                headers: {
                    Referer: defaultDomain,
                    'User-Agent': userAgent
                }
            },
            subtitles: []
        };
    } catch (err) {
        console.error('Multiembed error:', err.message);
        return new ErrorObject(
            `Unexpected error: ${err.message}`,
            'Multiembed',
            500,
            'Check implementation or site status',
            true,
            true
        );
    }
}
