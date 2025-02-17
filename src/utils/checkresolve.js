import {resolve_streamwish} from "./resolvers/streamwish.js";

const streamwish = /(?:\/\/|\.)((?:(?:stream|flas|obey|sfast|str|embed|[mads]|cdn|asn|player|hls)?wish(?:embed|fast|only|srv)?|ajmidyad|atabkhha|atabknha|atabknhk|atabknhs|abkrzkr|abkrzkz|vidmoviesb|kharabnahs|hayaatieadhab|cilootv|tuktukcinema|doodporn|ankrzkz|volvovideo|strmwis|ankrznm|yadmalik|khadhnayad|eghjrutf|eghzrutw|playembed|egsyxurh|egtpgrvh|uqloads|javsw|cinemathek|trgsfjll|fsdcmo|anime4low|mohahhda|ma2d|dancima|swhoi|gsfqzmqu|jodwish|swdyu|katomen|iplayerhls|hlsflast|4yftwvrdz7|ghbrisk)\.(?:com|to|sbs|pro|xyz|store|top|site|online|me|shop|fun))(?:\/e\/|\/f\/|\/d\/)?([0-9a-zA-Z$:\/.]+)/;

export async function resolve(url) {
    if (streamwish.test(url)) {
        return await resolve_streamwish(url);
    }
}