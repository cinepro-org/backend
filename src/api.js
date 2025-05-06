import {getEmbedsu} from "./controllers/providers/EmbedSu/embedsu.js";
import {getTwoEmbed} from "./controllers/providers/2Embed/2embed.js";
import {getAutoembed} from "./controllers/providers/AutoEmbed/autoembed.js";
import {getPrimewire} from "./controllers/providers/PrimeWire/primewire.js";
import {getVidSrcCC} from "./controllers/providers/VidSrcCC/vidsrccc.js";
import {getVidSrc} from "./controllers/providers/VidSrc/VidSrc.js";
import {getVidSrcSu} from "./controllers/providers/VidSrcSu/VidSrcSu.js";
import {getVidSrcVip} from "./controllers/providers/VidSrcVip/VidSrcVip.js";
import {getXprime} from "./controllers/providers/xprime/xprime.js";
import {ErrorObject} from "./helpers/ErrorObject.js";
import {getVidsrcWtf} from "./controllers/providers/VidSrcWtf/VidSrcWtf.js";

const shouldDebug = process.argv.includes("--debug");

export async function scrapeMedia(media) {
    const providers = [
        {fn: () => getEmbedsu(media)},
        {fn: () => getTwoEmbed(media)},
        {fn: () => getAutoembed(media)},
        {fn: () => getPrimewire(media)},
        {fn: () => getVidSrcCC(media)},
        {fn: () => getVidSrc(media)},
        {fn: () => getVidSrcSu(media)},
        {fn: () => getVidSrcVip(media)},
        {fn: () => getXprime(media)},
        {fn: () => getVidsrcWtf(media)},
    ];

    const results = await Promise.all(
        providers.map(async (provider) => {
            try {
                return {data: await provider.fn()};
            } catch (e) {
                return {data: null};
            }
        })
    );

    const files = results
        .filter(({data}) => data && !(data instanceof Error || data instanceof ErrorObject))
        .flatMap(({data}) => data.files)
        .filter((file, index, self) =>
            file.file &&
            typeof file.file === "string" &&
            file.file.includes("https://") &&
            self.findIndex(f => f.file === file.file) === index
        );

    const subtitles = results
        .filter(({data}) => data && !(data instanceof Error || data instanceof ErrorObject))
        .flatMap(({data}) => data.subtitles)
        .filter((sub, index, self) =>
            sub.url &&
            self.findIndex(s => s.url === sub.url) === index
        );

    if (shouldDebug) {
        results
            .filter(({data}) => data instanceof Error || data instanceof ErrorObject)
            .forEach(({data}) => {
                if (data instanceof ErrorObject) console.error(data.toString()); else console.error(data)
            });

        let errors = results
            .filter(({data}) => data instanceof Error || data instanceof ErrorObject)
            .map(({data}) => data)

        return {files, subtitles, errors: errors};
    }

    return {files, subtitles};
}
