import fetch from 'node-fetch';
import JsUnpacker from '../jsunpack.js';

const referer = "https://www.2embed.cc/";

export async function resolve_streamwish(url) {

    try {
        const response = await fetch(url, {
            headers: {
                "Referer": referer
            }
        });

        if (!response.ok) {
            return null;
        }

        const data = await response.text();

        const packedDataRegex = /eval\(function(.*?)split.*\)\)\)/;

        const packedDataMatch = data.match(packedDataRegex);
        if (packedDataMatch) {
            const packedJS = packedDataMatch[0];

            const unpacker = new JsUnpacker(packedJS);
            if (unpacker.detect()) {
                const unpackedJS = unpacker.unpack();
                const fileregex = /sources\:\[{file:"(.*?)"}/;
                const matcheuri = unpackedJS.match(fileregex);

                return matcheuri[1];

            }
        } else {
            return null;
        }
    } catch (error) {
        return null;
    }

}