import fetch from 'node-fetch';
import JsUnpacker from '../jsunpack.js';
import {ErrorObject} from "../../helpers/ErrorObject.js";

const referer = "https://www.2embed.cc/";

export async function extract_streamwish(url) {

    try {
        const response = await fetch(url, {
            headers: {
                "Referer": referer
            }
        });

        if (!response.ok) {
            return new ErrorObject("Failed to fetch streamwish data.", "streamwish extractor", 500, "the wrong URL received or streamwish is experiencing some downtime", false, false);
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
            return new ErrorObject("No packed data was found.", "streamwish extractor", 500, "streamwish probably changed their backend logic :(", false, false);
        }
    } catch (error) {
        return new ErrorObject("Error occurred while extracting streamwish data: " + error, "streamwish extractor", 500, "could be anything...", false, false);
    }

}