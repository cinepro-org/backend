import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { ErrorObject } from '../../helpers/ErrorObject.js';

export async function extract_voesx(url) {
    try {
        // extract hostname from url
        const hostname = url.match(/https?:\/\/([^\/]+)/)?.[1];
        if (!hostname) {
            return new ErrorObject(
                'invalid url format',
                'VoeSX',
                400,
                'could not extract hostname from url',
                true,
                true
            );
        }

        // extract media id from url pattern
        const pattern =
            /(?:\/\/|\.)((?:audaciousdefaulthouse|launchreliantcleaverriver|kennethofficialitem|reputationsheriffkennethsand|fittingcentermondaysunday|paulkitchendark|housecardsummerbutton|fraudclatterflyingcar|35volitantplimsoles5\.com|sethniceletter|bigclatterhomesguideservice|uptodatefinishconferenceroom|edwardarriveoften|realfinanceblogcenter|tinycat-voe-fashion|20demidistance9elongations|michaelapplysome|telyn610zoanthropy|toxitabellaeatrebates306|greaseball6eventual20|jayservicestuff|745mingiestblissfully|19turanosephantasia|30sensualizeexpression|sandrataxeight|321naturelikefurfuroid|449unceremoniousnasoseptal|guidon40hyporadius9|brucevotewithin|cyamidpulverulence530|boonlessbestselling244|antecoxalbobbing1010|lukecomparetwo|matriculant401merited|scatch176duplicates|availedsmallest|stevenimaginelittle|counterclockwisejacky|simpulumlamerop|wolfdyslectic|nectareousoverelate|metagnathtuggers|gamoneinterrupted|chromotypic|crownmakermacaronicism|diananatureforeign|yodelswartlike|figeterpiazine|strawberriesporail|valeronevijao|timberwoodanotia|generatesnitrosate|apinchcaseation|nonesnanking|kathleenmemberhistory|jamiesamewalk|bradleyviewdoctor|graceaddresscommunity|shannonpersonalcost|cindyeyefinal|rebeccaneverbase|loriwithinfamily|roberteachfinal|erikcoldperson|jasminetesttry|heatherdiscussionwhen|robertplacespace|alleneconomicmatter|josephseveralconcern|donaldlineelse|lisatrialidea|toddpartneranimal|jamessoundcost|brittneystandardwestern|sandratableother|robertordercharacter|maxfinishseveral|chuckle-tube|kristiesoundsimply|adrianmissionminute|nathanfromsubject|richardsignfish|jennifercertaindevelopment|jonathansociallike|mariatheserepublican|johnalwayssame|kellywhatcould|jilliandescribecompany|(?:v-?o-?e)?(?:-?un-?bl[o0]?c?k\d{0,2})?(?:-?voe)?)\.(?:sx|com|net))\/(?:e\/)?([0-9A-Za-z]+)/;

        const match = url.match(pattern);
        if (!match) {
            return new ErrorObject(
                'url pattern not supported',
                'VoeSX',
                400,
                'this url format is not supported by voesx extractor',
                true,
                true
            );
        }

        const mediaId = match[2];

        // construct the embed url
        const embedUrl = `https://${hostname}/e/${mediaId}`;

        // setup headers
        const headers = {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            Connection: 'keep-alive'
        };

        // fetch the embed page
        const response = await fetch(embedUrl, { headers });

        if (!response.ok) {
            return new ErrorObject(
                `failed to fetch voesx url: status ${response.status}`,
                'VoeSX',
                response.status,
                'check the url or server status',
                true,
                true
            );
        }

        let html = await response.text();

        // handle redirect if currentUrl is present
        if (html.includes('const currentUrl')) {
            const redirectMatch = html.match(
                /window\.location\.href\s*=\s*'([^']+)'/
            );
            if (redirectMatch) {
                const redirectUrl = redirectMatch[1];

                const redirectResponse = await fetch(redirectUrl, { headers });
                if (redirectResponse.ok) {
                    html = await redirectResponse.text();
                }
            }
        }

        // decode method first
        const jsonScriptMatch = html.match(
            /json">\["([^"]+)"]<\/script>\s*<script\s*src="([^"]+)/
        );
        if (jsonScriptMatch) {
            const encodedData = jsonScriptMatch[1];
            const scriptUrl = new URL(jsonScriptMatch[2], embedUrl).href;

            const scriptResponse = await fetch(scriptUrl, { headers });
            if (scriptResponse.ok) {
                const scriptContent = await scriptResponse.text();
                const replMatch = scriptContent.match(
                    /(\[(?:'\W{2}'[,\]]){1,9})/
                );
                if (replMatch) {
                    const decodedData = voeDecode(encodedData, replMatch[1]);

                    if (decodedData) {
                        const sources = [];
                        for (const key of [
                            'file',
                            'source',
                            'direct_access_url'
                        ]) {
                            if (decodedData[key]) {
                                const url = decodedData[key].split('?')[0];
                                const ext = url.split('.').pop();
                                sources.push({
                                    url: decodedData[key],
                                    label: ext
                                });
                            }
                        }

                        if (sources.length > 0) {
                            // sort sources by quality if available
                            sources.sort((a, b) => {
                                const aNum =
                                    parseInt(a.label.replace(/\D/g, '')) || 0;
                                const bNum =
                                    parseInt(b.label.replace(/\D/g, '')) || 0;
                                return bNum - aNum;
                            });

                            return {
                                file: sources[0].url,
                                type: getVideoType(sources[0].url),
                                quality: sources[0].label || 'unknown'
                            };
                        }
                    }
                }
            }
        }

        // fallback to basic scraping patterns

        const sources = scrapeBasicSources(html);

        if (!sources || sources.length === 0) {
            return new ErrorObject(
                'no video sources found',
                'VoeSX',
                404,
                'the page does not contain any playable video sources',
                true,
                true
            );
        }

        // pick the best quality source

        return {
            file: selectedSource.url,
            type: getVideoType(selectedSource.url),
            quality: selectedSource.label || 'unknown'
        };
    } catch (error) {
        console.error('error in extract_voesx:', error);
        return new ErrorObject(
            `unexpected error: ${error.message}`,
            'VoeSX',
            500,
            'check the implementation or server status',
            true,
            true
        );
    }
}

// helper function to decode voe encrypted data
function voeDecode(ct, luts) {
    try {
        // parse lookup table
        const lut = luts
            .slice(2, -2)
            .split("','")
            .map((i) =>
                i
                    .split('')
                    .map((x) => ('.*+?^${}()|[]\\'.includes(x) ? '\\' + x : x))
                    .join('')
            );

        let txt = '';
        // decode character transformation
        for (const char of ct) {
            let x = char.charCodeAt(0);
            if (64 < x && x < 91) {
                x = ((x - 52) % 26) + 65;
            } else if (96 < x && x < 123) {
                x = ((x - 84) % 26) + 97;
            }
            txt += String.fromCharCode(x);
        }

        // apply lookup table transformations
        for (const pattern of lut) {
            txt = txt.replace(new RegExp(pattern, 'g'), '');
        }

        // base64 decode
        let decoded = b64decode(txt);

        // shift characters back by 3
        txt = decoded
            .split('')
            .map((char) => String.fromCharCode(char.charCodeAt(0) - 3))
            .join('');

        // reverse and decode again
        txt = b64decode(txt.split('').reverse().join(''));

        return JSON.parse(txt);
    } catch (error) {
        console.error('voe decode failed:', error);
        return null;
    }
}

// helper function to scrape basic video sources
function scrapeBasicSources(html) {
    const sources = [];

    // pattern 1: mp4 with video_height
    const pattern1 =
        /mp4["']:\s*["']([^"']+)["'],\s*["']video_height["']:\s*([^,]+)/g;
    let match;
    while ((match = pattern1.exec(html)) !== null) {
        sources.push({
            url: match[1],
            label: match[2].replace(/["']/g, '') + 'p'
        });
    }

    // pattern 2: hls streams
    const pattern2 = /hls['"]:\s*['"]([^'"]+)/g;
    while ((match = pattern2.exec(html)) !== null) {
        sources.push({
            url: match[1],
            label: 'hls'
        });
    }

    // pattern 3: hls with video_height
    const pattern3 = /hls":\s*"([^"]+)",\s*"video_height":\s*([^,]+)/g;
    while ((match = pattern3.exec(html)) !== null) {
        sources.push({
            url: match[1],
            label: match[2].replace(/["']/g, '') + 'p'
        });
    }

    // remove duplicates and sort by quality
    const uniqueSources = removeDuplicates(sources);
    return sortSourcesByQuality(uniqueSources);
}

// helper function to remove duplicate sources
function removeDuplicates(sources) {
    const seen = new Set();
    return sources.filter((source) => {
        if (seen.has(source.url)) {
            return false;
        }
        seen.add(source.url);
        return true;
    });
}

// helper function to sort sources by quality
function sortSourcesByQuality(sources) {
    return sources.sort((a, b) => {
        const qualityA = parseInt(a.label.match(/\d+/)?.[0] || '0');
        const qualityB = parseInt(b.label.match(/\d+/)?.[0] || '0');
        return qualityB - qualityA; // descending order
    });
}

// helper function to determine video type from url
function getVideoType(url) {
    if (url.includes('.m3u8')) return 'hls';
    if (url.includes('.mpd')) return 'dash';
    if (url.includes('.mp4')) return 'mp4';
    if (url.includes('.webm')) return 'webm';
    return 'mp4'; // default
}

// helper function for base64 decoding
function b64decode(str) {
    try {
        // add padding if needed
        while (str.length % 4 !== 0) {
            str += '=';
        }
        return Buffer.from(str, 'base64').toString('utf8');
    } catch (error) {
        console.error('base64 decode failed:', error);
        return str;
    }
}
