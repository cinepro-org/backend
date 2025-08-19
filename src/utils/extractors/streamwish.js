import fetch from 'node-fetch';
import JsUnpacker from '../jsunpack.js';
import { ErrorObject } from '../../helpers/ErrorObject.js';

export async function extract_streamwish(url, referer) {
    try {
        const response = await fetch(url, {
            headers: {
                Referer: referer,
                'User-Agent':
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            }
        });

        if (!response.ok) {
            return new ErrorObject(
                `Resolve failed for ${url}: Status ${response.status}`,
                'streamwish',
                500,
                'Check the URL or server status.',
                true,
                true
            );
        }

        const data = await response.text();
        const packedDataRegex = /eval\(function(.*?)split.*\)\)\)/s;
        const packedDataMatch = data.match(packedDataRegex);

        if (packedDataMatch) {
            const unpacker = new JsUnpacker(packedDataMatch[0]);
            if (unpacker.detect()) {
                const unpackedJS = unpacker.unpack();
                if (!unpackedJS) {
                    return new ErrorObject(
                        'JsUnpacker failed to unpack.',
                        'streamwish',
                        500,
                        'Check the packed data format.',
                        true,
                        true
                    );
                }
                let fileRegex;
                let matchUri;
                if (unpackedJS.includes('"hls2":"https')) {
                    fileRegex = /links=.*hls2":"(.*?)"};/;
                    matchUri = unpackedJS.match(fileRegex);
                } else {
                    fileRegex = /sources\s*:\s*\[\s*\{\s*file\s*:\s*"([^"]+)"/;
                    matchUri = unpackedJS.match(fileRegex);
                }

                if (matchUri && matchUri[1]) {
                    if (matchUri[1].match('",\\"hls4\\":\\"')) {
                        matchUri[1] = matchUri[1].replace(
                            /",\\hls4\\":\\".*?"/,
                            ''
                        );
                        return matchUri[1];
                    }
                    return matchUri[1];
                } else {
                    return new ErrorObject(
                        'Could not find file URL in unpacked JS.',
                        'streamwish',
                        500,
                        'Check the backend logic.',
                        true,
                        true
                    );
                }
            } else {
                return new ErrorObject(
                    'JsUnpacker could not detect packed data.',
                    'streamwish',
                    500,
                    'Check the packed data format.',
                    true,
                    true
                );
            }
        } else {
            return new ErrorObject(
                'No packed JS data found in resolve response.',
                'streamwish',
                500,
                'Check the response content.',
                true,
                true
            );
        }
    } catch (error) {
        return new ErrorObject(
            `Error during resolve for ${url}: ${error.message}`,
            'streamwish',
            500,
            'Check the implementation or server status.',
            true,
            true
        );
    }
}
