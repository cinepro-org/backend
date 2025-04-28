import {extract_streamwish} from "./extractors/streamwish.js";
import {ErrorObject} from "../helpers/ErrorObject.js";
import {extract_mixdrop} from "./extractors/mixdrop.js";
import {extract_streamtape} from "./extractors/streamtape.js";

const streamwish = /(?:\/\/|\.)((?:(?:stream|flas|obey|sfast|str|embed|[mads]|cdn|asn|player|hls)?wish(?:embed|fast|only|srv)?|ajmidyad|atabkhha|atabknha|atabknhk|atabknhs|abkrzkr|abkrzkz|vidmoviesb|kharabnahs|hayaatieadhab|cilootv|tuktukcinema|doodporn|ankrzkz|volvovideo|strmwis|ankrznm|yadmalik|khadhnayad|eghjrutf|eghzrutw|playembed|egsyxurh|egtpgrvh|uqloads|javsw|cinemathek|trgsfjll|fsdcmo|anime4low|mohahhda|ma2d|dancima|swhoi|gsfqzmqu|jodwish|swdyu|katomen|iplayerhls|hlsflast|4yftwvrdz7|ghbrisk)\.(?:com|to|sbs|pro|xyz|store|top|site|online|me|shop|fun))(?:\/e\/|\/f\/|\/d\/)?([0-9a-zA-Z$:\/.]+)/;
const mixdrop = /mxdrop|mixdrop/;
const streamtape = /streamtape/;

export async function extract(url, DOMAIN = "") {
    if (streamwish.test(url)) {
        return await extract_streamwish(url, DOMAIN);
    } else if (mixdrop.test(url)) {
        let data = await extract_mixdrop(url.split("/").pop());
        if (data instanceof ErrorObject) {
            return {file: server, type: "embed"};
        }
        return {
            file: data.url,
            type: "mp4",
            headers: data.headers
        }
    } else if (streamtape.test(url)) {
        let data = await extract_streamtape(url);
        if (data instanceof ErrorObject) {
            return {file: server, type: "embed"};
        }
        return {
            file: data.url,
            type: "mp4"
        }
    }
    
    if (process.env.DEBUG === "true" || process.env.DEBUG === 1) {
        console.log(`[extractor] ${url} (${DOMAIN}) is not a supported server... maybe check this out!`);
    }
    return new ErrorObject("No extractor found", "Extractor", 500, "No extractor found matching for this URL: " + url, true, true);
}