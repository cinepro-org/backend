import fetch from 'node-fetch';
import JsUnpacker from '../jsunpack.js';

const regex = /(?:\/\/|\.)((?:(?:stream|flas|obey|sfast|str|embed|[mads]|cdn|asn|player|hls)?wish(?:embed|fast|only|srv)?|ajmidyad|atabkhha|atabknha|atabknhk|atabknhs|abkrzkr|abkrzkz|vidmoviesb|kharabnahs|hayaatieadhab|cilootv|tuktukcinema|doodporn|ankrzkz|volvovideo|strmwis|ankrznm|yadmalik|khadhnayad|eghjrutf|eghzrutw|playembed|egsyxurh|egtpgrvh|uqloads|javsw|cinemathek|trgsfjll|fsdcmo|anime4low|mohahhda|ma2d|dancima|swhoi|gsfqzmqu|jodwish|swdyu|katomen|iplayerhls|hlsflast|4yftwvrdz7|ghbrisk)\.(?:com|to|sbs|pro|xyz|store|top|site|online|me|shop|fun))(?:\/e\/|\/f\/|\/d\/)?([0-9a-zA-Z$:\/.]+)/;
const referer = "https://www.2embed.cc/";

export async function resolve_streamwish(url) {
    if (regex.test(url)) {
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
    } else {
        return null;
    }
}