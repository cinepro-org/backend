import { getTwoEmbed } from './controllers/providers/2Embed/2embed.js';
import { getAutoembed } from './controllers/providers/AutoEmbed/autoembed.js';
import { getPrimewire } from './controllers/providers/PrimeWire/primewire.js';
import { getVidSrcCC } from './controllers/providers/VidSrcCC/vidsrccc.js';
import { getVidSrc } from './controllers/providers/VidSrc/VidSrc.js';
import { getVidrock } from './controllers/providers/Vidrock/Vidrock.js';
import { getXprime } from './controllers/providers/xprime/xprime.js';
import { ErrorObject } from './helpers/ErrorObject.js';
import { getVidsrcWtf } from './controllers/providers/VidSrcWtf/VidSrcWtf.js';
import { getVidZee } from './controllers/providers/vidzee/vidzee.js';

const shouldDebug = process.argv.includes('--debug');

export async function scrapeMedia(media) {
    const providers = [
        { getTwoEmbed: () => getTwoEmbed(media) },
        { getAutoembed: () => getAutoembed(media) },
        { getPrimewire: () => getPrimewire(media) },
        { getVidSrcCC: () => getVidSrcCC(media) },
        { getVidSrc: () => getVidSrc(media) },
        { getVidrock: () => getVidrock(media) },
        { getXprime: () => getXprime(media) },
        { getVidsrcWtf: () => getVidsrcWtf(media) },
        { getVidZee: () => getVidZee(media) }
    ];

    const results = await Promise.all(
        providers.map(async (provider) => {
            const providerName = Object.keys(provider)[0];

            try {
                return {
                    data: await provider[providerName](),
                    provider: providerName
                };
            } catch (e) {
                return { data: null, provider: providerName };
            }
        })
    );

    const files = results
        .filter(
            ({ data }) =>
                data && !(data instanceof Error || data instanceof ErrorObject)
        )
        .flatMap(({ data }) =>
            Array.isArray(data.files) ? data.files : [data.files]
        )
        .filter(
            (file, index, self) =>
                file &&
                file.file &&
                typeof file.file === 'string' &&
                file.file.includes('https://') &&
                self.findIndex((f) => f.file === file.file) === index
        );

    const subtitles = results
        .filter(
            ({ data }) =>
                data && !(data instanceof Error || data instanceof ErrorObject)
        )
        .flatMap(({ data }) => data.subtitles)
        .filter(
            (sub, index, self) =>
                sub.url && self.findIndex((s) => s.url === sub.url) === index
        );

    if (shouldDebug) {
        results
            .filter(
                ({ data }) =>
                    data instanceof Error || data instanceof ErrorObject
            )
            .forEach(({ data }) => {
                if (data instanceof ErrorObject) console.error(data.toString());
                else console.error(data);
            });

        let errors = results
            .filter(
                ({ data }) =>
                    data instanceof Error || data instanceof ErrorObject
            )
            .map(({ data }) => data);

        return { files, subtitles, errors };
    }

    return { files, subtitles };
}
