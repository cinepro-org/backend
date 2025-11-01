import { ErrorObject } from '../../helpers/ErrorObject.js';
import JsUnpacker from '../jsunpack.js';

// Special Thanks to
// https://github.com/Gujal00/ResolveURL/blob/master/script.module.resolveurl/lib/resolveurl/plugins/filemoon.py

/**
 * Tear decode implementation from Python helpers
 * This decodes the obfuscated video URL
 */
function tearDecode(encoded, seed) {
    try {
        const seedArray = seed.toString().split('');
        const encoded64 = atob(encoded);
        let decoded = '';

        for (let i = 0; i < encoded64.length; i++) {
            const seedChar = seedArray[i % seedArray.length];
            const seedCharCode = seedChar.charCodeAt(0);
            const encodedCharCode = encoded64.charCodeAt(i);
            decoded += String.fromCharCode(encodedCharCode ^ seedCharCode);
        }

        return decodeURIComponent(escape(decoded));
    } catch (e) {
        console.log('[tearDecode] Error:', e.message);
        return null;
    }
}

/**
 * Extract packed JavaScript data from HTML
 * This handles both standard p.a.c.k.e.r and custom FileMoon obfuscation
 */
function getPackedData(html) {
    let packed = '';

    // Try standard p.a.c.k.e.r format
    const packedRegex = /eval\(function\(p,a,c,k,e,(?:r|d).*?\)\)/gs;
    const matches = html.matchAll(packedRegex);

    let matchCount = 0;
    for (const match of matches) {
        matchCount++;
        console.log(`[getPackedData] Found packed code #${matchCount}`);
        const unpacker = new JsUnpacker(match[0]);
        if (unpacker.detect()) {
            const unpacked = unpacker.unpack();
            if (unpacked) {
                console.log(
                    `[getPackedData] Successfully unpacked code #${matchCount}, length: ${unpacked.length}`
                );
                packed += '\n' + unpacked;
            } else {
                console.log(
                    `[getPackedData] Failed to unpack code #${matchCount}`
                );
            }
        } else {
            console.log(
                `[getPackedData] Code #${matchCount} not detected as packed`
            );
        }
    }

    // Try to extract FileMoon custom obfuscation
    // Look for patterns like: var K='...'...split("").reduce(...)
    const customObfuscationRegex =
        /var\s+\w+\s*=\s*'[^']{1000,}'.*?\.split\(""\)\.reduce\(/gs;
    const customMatches = html.matchAll(customObfuscationRegex);

    for (const match of customMatches) {
        console.log(
            `[getPackedData] Found custom obfuscation, attempting to extract...`
        );
        // Try to find sources or file URLs in the obfuscated code
        // The sources are often in the format: sources:[{file:"URL"}]
        const sourceInObfuscated = match[0].match(
            /sources.*?\[.*?file.*?["']([^"']+)["']/
        );
        if (sourceInObfuscated) {
            console.log(
                `[getPackedData] Found source in obfuscated code:`,
                sourceInObfuscated[1]
            );
            packed += `\nsources:[{file:"${sourceInObfuscated[1]}"}]`;
        }
    }

    console.log(`[getPackedData] Total packed data length: ${packed.length}`);
    return packed;
}

export async function extract_filemoon(url) {
    try {
        console.log('[extract_filemoon] Starting extraction for:', url);

        // Extract host and media_id from URL
        const match = url.match(
            /(?:\/\/|\.)((?:filemoon|cinegrab|moonmov|kerapoxy|furher|1azayf9w|81u6xl9d|smdfs40r|bf0skv|z1ekv717|l1afav|222i8x|8mhlloqo|96ar|xcoic|f51rm|c1z39|boosteradx)\.(?:sx|to|s?k?in|link|nl|wf|com|eu|art|pro|cc|xyz|org|fun|net|lol|online))\/(?:e|d|download)\/([0-9a-zA-Z$:\/._-]+)/
        );

        if (!match) {
            console.log('[extract_filemoon] URL pattern did not match');
            return new ErrorObject(
                'Invalid URL',
                'FileMoon',
                400,
                'Could not extract host and media ID from URL',
                true,
                false
            );
        }

        const host = match[1];
        let mediaId = match[2];
        let referer = false;

        console.log('[extract_filemoon] Host:', host);
        console.log('[extract_filemoon] Media ID:', mediaId);

        // Handle $$ separator for referer
        if (mediaId.includes('$$')) {
            const parts = mediaId.split('$$');
            mediaId = parts[0];
            referer = parts[1];
            console.log('[extract_filemoon] Found referer:', referer);
            try {
                const refererUrl = new URL(referer);
                referer = `${refererUrl.protocol}//${refererUrl.host}/`;
                console.log('[extract_filemoon] Processed referer:', referer);
            } catch (e) {
                console.log(
                    '[extract_filemoon] Invalid referer URL:',
                    e.message
                );
                referer = false;
            }
        }

        // Handle / in media_id
        if (mediaId.includes('/')) {
            const oldMediaId = mediaId;
            mediaId = mediaId.split('/')[0];
            console.log(
                '[extract_filemoon] Media ID had slash, extracted:',
                oldMediaId,
                '->',
                mediaId
            );
        }

        // Construct web URL
        let webUrl = `https://${host}/e/${mediaId}`;
        console.log('[extract_filemoon] Web URL:', webUrl);

        // Set up headers
        const headers = {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Cookie: '__ddg1_=PZYJSmASXDCQGP6auJU9; __ddg2_=hxAe1bBqtlYhVSik'
        };

        if (referer) {
            headers['Referer'] = referer;
        }

        console.log(
            '[extract_filemoon] Request headers:',
            JSON.stringify(headers, null, 2)
        );

        // First request
        console.log('[extract_filemoon] Making first request...');
        let response = await fetch(webUrl, { headers });
        console.log(
            '[extract_filemoon] Response status:',
            response.status,
            response.statusText
        );

        if (!response.ok) {
            return new ErrorObject(
                'Fetch failed',
                'FileMoon',
                response.status,
                `Failed to fetch page: ${response.statusText}`,
                true,
                false
            );
        }

        let html = await response.text();
        console.log('[extract_filemoon] HTML length:', html.length);

        // Check for error pages
        if (
            html.includes('<h1>Page not found</h1>') ||
            html.includes(
                '<h1>This video cannot be watched under this domain</h1>'
            )
        ) {
            console.log(
                '[extract_filemoon] Error page detected, trying /d/ endpoint'
            );
            webUrl = webUrl.replace('/e/', '/d/');
            console.log('[extract_filemoon] New URL:', webUrl);
            response = await fetch(webUrl, { headers });
            console.log(
                '[extract_filemoon] Response status:',
                response.status,
                response.statusText
            );

            if (!response.ok) {
                return new ErrorObject(
                    'Fetch failed',
                    'FileMoon',
                    response.status,
                    `Failed to fetch download page: ${response.statusText}`,
                    true,
                    false
                );
            }
            html = await response.text();
            console.log('[extract_filemoon] New HTML length:', html.length);
        }

        // Check for iframe redirect
        console.log('[extract_filemoon] Checking for iframe redirect...');
        const iframeMatch = html.match(/<iframe\s*src="([^"]+)/);
        if (iframeMatch) {
            console.log('[extract_filemoon] Found iframe:', iframeMatch[1]);
            headers['accept-language'] = 'en-US,en;q=0.9';
            headers['sec-fetch-dest'] = 'iframe';
            headers['Referer'] = webUrl;

            webUrl = iframeMatch[1];
            console.log('[extract_filemoon] Fetching iframe URL:', webUrl);
            response = await fetch(webUrl, { headers });
            console.log(
                '[extract_filemoon] Iframe response status:',
                response.status,
                response.statusText
            );

            if (!response.ok) {
                return new ErrorObject(
                    'Fetch failed',
                    'FileMoon',
                    response.status,
                    `Failed to fetch iframe: ${response.statusText}`,
                    true,
                    false
                );
            }
            html = await response.text();
            console.log('[extract_filemoon] Iframe HTML length:', html.length);
        } else {
            console.log('[extract_filemoon] No iframe found');
        }

        // CRITICAL: Look for blob URL in video tag FIRST before trying to unpack
        console.log(
            '[extract_filemoon] Searching for video element with src...'
        );
        const videoSrcMatch = html.match(/<video[^>]+src=["']([^"']+)["']/);
        if (videoSrcMatch && videoSrcMatch[1].includes('blob:')) {
            console.log(
                '[extract_filemoon] Found blob URL in video tag, this is client-side generated'
            );
            console.log(
                '[extract_filemoon] Need to extract the actual m3u8/mp4 URL from JavaScript'
            );
        }

        // Look for jwplayer setup which might contain the file URL
        console.log('[extract_filemoon] Searching for jwplayer setup...');
        const jwplayerSetup = html.match(
            /jwplayer\([^)]+\)\.setup\(({[\s\S]+?})\);/
        );
        if (jwplayerSetup) {
            console.log('[extract_filemoon] Found jwplayer setup');
            try {
                // Try to extract file URL from setup
                const fileMatch = jwplayerSetup[1].match(
                    /["']?file["']?\s*:\s*["']([^"']+)["']/
                );
                if (fileMatch) {
                    console.log(
                        '[extract_filemoon] Found file in jwplayer setup:',
                        fileMatch[1]
                    );

                    // Update headers
                    delete headers['Cookie'];
                    const webUrlObj = new URL(webUrl);
                    headers['Referer'] = webUrl;
                    headers['Origin'] =
                        `${webUrlObj.protocol}//${webUrlObj.host}`;
                    headers['verifypeer'] = 'false';

                    console.log(
                        '[extract_filemoon] SUCCESS via jwplayer setup'
                    );
                    return {
                        file: fileMatch[1],
                        type: 'mp4',
                        headers: headers
                    };
                }
            } catch (e) {
                console.log(
                    '[extract_filemoon] Error parsing jwplayer setup:',
                    e.message
                );
            }
        }

        // Get packed data and append to html
        console.log('[extract_filemoon] Getting packed data...');
        const packedData = getPackedData(html);
        html += packedData;
        console.log(
            '[extract_filemoon] Total HTML length after packed data:',
            html.length
        );

        // Try to find postData for dl endpoint
        console.log('[extract_filemoon] Looking for postData...');
        const postDataMatch = html.match(/var\s*postData\s*=\s*(\{.+?\})/s);

        if (postDataMatch) {
            console.log('[extract_filemoon] Found postData block');
            const postDataStr = postDataMatch[1];
            console.log('[extract_filemoon] postData string:', postDataStr);

            // Extract b, file_code, and hash
            const bMatch = postDataStr.match(/b:\s*'([^']+)/);
            const fileCodeMatch = postDataStr.match(/file_code:\s*'([^']+)/);
            const hashMatch = postDataStr.match(/hash:\s*'([^']+)/);

            console.log(
                '[extract_filemoon] bMatch:',
                bMatch ? bMatch[1] : 'NOT FOUND'
            );
            console.log(
                '[extract_filemoon] fileCodeMatch:',
                fileCodeMatch ? fileCodeMatch[1] : 'NOT FOUND'
            );
            console.log(
                '[extract_filemoon] hashMatch:',
                hashMatch ? hashMatch[1] : 'NOT FOUND'
            );

            if (!bMatch || !fileCodeMatch || !hashMatch) {
                return new ErrorObject(
                    'Extraction failed',
                    'FileMoon',
                    500,
                    'Could not extract postData parameters',
                    true,
                    false
                );
            }

            const postData = {
                b: bMatch[1],
                file_code: fileCodeMatch[1],
                hash: hashMatch[1]
            };

            console.log(
                '[extract_filemoon] postData:',
                JSON.stringify(postData, null, 2)
            );

            // Update headers for POST request
            const webUrlObj = new URL(webUrl);
            headers['Referer'] = webUrl;
            headers['Origin'] = `${webUrlObj.protocol}//${webUrlObj.host}`;
            headers['X-Requested-With'] = 'XMLHttpRequest';
            headers['Content-Type'] =
                'application/x-www-form-urlencoded; charset=UTF-8';

            // Make POST request to /dl endpoint
            const dlUrl = `${webUrlObj.protocol}//${webUrlObj.host}/dl`;
            console.log('[extract_filemoon] POST URL:', dlUrl);

            const formBody = Object.keys(postData)
                .map(
                    (key) =>
                        encodeURIComponent(key) +
                        '=' +
                        encodeURIComponent(postData[key])
                )
                .join('&');

            console.log('[extract_filemoon] POST body:', formBody);

            const postResponse = await fetch(dlUrl, {
                method: 'POST',
                headers: headers,
                body: formBody
            });

            console.log(
                '[extract_filemoon] POST response status:',
                postResponse.status,
                postResponse.statusText
            );

            if (!postResponse.ok) {
                return new ErrorObject(
                    'POST failed',
                    'FileMoon',
                    postResponse.status,
                    `Failed to POST to /dl endpoint: ${postResponse.statusText}`,
                    true,
                    false
                );
            }

            const responseText = await postResponse.text();
            console.log('[extract_filemoon] POST response text:', responseText);

            const edata = JSON.parse(responseText)[0];
            console.log(
                '[extract_filemoon] Parsed edata:',
                JSON.stringify(edata, null, 2)
            );

            if (!edata || !edata.file || !edata.seed) {
                return new ErrorObject(
                    'Invalid response',
                    'FileMoon',
                    500,
                    'Response missing file or seed data',
                    true,
                    false
                );
            }

            console.log('[extract_filemoon] Encoded file:', edata.file);
            console.log('[extract_filemoon] Seed:', edata.seed);

            // Decode the URL using tear_decode
            const videoUrl = tearDecode(edata.file, edata.seed);

            console.log('[extract_filemoon] Decoded video URL:', videoUrl);

            if (!videoUrl) {
                return new ErrorObject(
                    'Decode failed',
                    'FileMoon',
                    500,
                    'Failed to decode video URL',
                    true,
                    false
                );
            }

            // Prepare final headers
            delete headers['X-Requested-With'];
            delete headers['Cookie'];
            delete headers['Content-Type'];
            headers['verifypeer'] = 'false';

            console.log('[extract_filemoon] SUCCESS via postData method');
            return {
                file: videoUrl,
                type: 'mp4',
                headers: headers
            };
        } else {
            // Fallback: try to find sources directly
            console.log(
                '[extract_filemoon] No postData found, trying fallback method'
            );
            console.log(
                '[extract_filemoon] Searching for sources pattern in HTML...'
            );

            const sourcesMatch = html.match(
                /sources:\s*\[{\s*file:\s*["']([^"']+)["']/s
            );

            if (sourcesMatch) {
                console.log(
                    '[extract_filemoon] Found sources match:',
                    sourcesMatch[1]
                );
                const videoUrl = sourcesMatch[1];

                // Update headers
                delete headers['Cookie'];
                const webUrlObj = new URL(webUrl);
                headers['Referer'] = webUrl;
                headers['Origin'] = `${webUrlObj.protocol}//${webUrlObj.host}`;
                headers['verifypeer'] = 'false';

                console.log('[extract_filemoon] SUCCESS via fallback method');
                return {
                    file: videoUrl,
                    type: 'mp4',
                    headers: headers
                };
            } else {
                console.log('[extract_filemoon] No sources pattern found');
                // Try alternate patterns
                const m3u8Match = html.match(
                    /(https?:\/\/[^\s"']+\.m3u8[^\s"']*)/
                );
                if (m3u8Match) {
                    console.log(
                        '[extract_filemoon] Found m3u8 URL:',
                        m3u8Match[1]
                    );

                    delete headers['Cookie'];
                    const webUrlObj = new URL(webUrl);
                    headers['Referer'] = webUrl;
                    headers['Origin'] =
                        `${webUrlObj.protocol}//${webUrlObj.host}`;
                    headers['verifypeer'] = 'false';

                    console.log('[extract_filemoon] SUCCESS via m3u8 pattern');
                    return {
                        file: m3u8Match[1],
                        type: 'hls',
                        headers: headers
                    };
                }
            }
        }

        return new ErrorObject(
            'No video found',
            'FileMoon',
            404,
            'Could not find video source in page - the video might be protected or require browser execution',
            true,
            false
        );
    } catch (error) {
        console.log('[extract_filemoon] EXCEPTION:', error.message);
        console.log('[extract_filemoon] Stack trace:', error.stack);
        return new ErrorObject(
            'Extraction failed',
            'FileMoon',
            500,
            `Error during extraction: ${error.message}`,
            true,
            true
        );
    }
}
