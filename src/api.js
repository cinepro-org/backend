import { getTwoEmbed } from './controllers/providers/2Embed/2embed.js';
import { getAutoembed } from './controllers/providers/AutoEmbed/autoembed.js';
import { getPrimewire } from './controllers/providers/PrimeWire/primewire.js';
import { getVidSrcCC } from './controllers/providers/VidSrcCC/vidsrccc.js';
import { getVidSrc } from './controllers/providers/VidSrc/VidSrc.js';
import { getVidRock } from './controllers/providers/vidrock/Vidrock.js';
import { getXprime } from './controllers/providers/xprime/xprime.js';
import { ErrorObject } from './helpers/ErrorObject.js';
import { getVidsrcWtf } from './controllers/providers/VidSrcWtf/VidSrcWtf.js';
import { getVidZee } from './controllers/providers/vidzee/vidzee.js';
import { getCacheKey, getFromCache, setToCache } from './cache/cache.js';

const shouldDebug = process.argv.includes('--debug');
const bypassCache = process.argv.includes('--no-cache');
export async function scrapeMedia(media) {
    // First thing - check if we already have this data cached (unless you're debugging and want fresh data)
    const cacheKey = getCacheKey(media);

    if (!bypassCache) {
        const cachedResult = getFromCache(cacheKey);

        if (cachedResult) {
            // Found it in cache, then we don't need to scrape again
            if (shouldDebug) {
                console.log(
                    `Cache for ${cacheKey} - serving from memory instead of scraping`
                );
            }
            return cachedResult;
        }
    }

    // If no cache or bypassed, time to do the actual workkkk
    if (shouldDebug) {
        console.log(
            `${bypassCache ? 'Cache bypassed' : 'No cache Found'} for ${cacheKey}, work starts now...`
        );
    }
    const providers = [
        { getTwoEmbed: () => getTwoEmbed(media) },
        { getAutoembed: () => getAutoembed(media) },
        { getPrimewire: () => getPrimewire(media) },
        { getVidSrcCC: () => getVidSrcCC(media) },
        { getVidSrc: () => getVidSrc(media) },
        { getVidRock: () => getVidRock(media) },
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
    // Here comes the big boy to loook for nothing okay here you go
    // We need finalResult coz you can't cache what doesn't exist yet - lowkey just consolidating the return logic
    // Build it once, cache it, return it - way cleaner than scattered returns everywhere

    let finalResult;
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

        finalResult = { files, subtitles, errors };
    } else {
        finalResult = { files, subtitles };
    }

    // Only cache if we actually found some streams and we're not bypassing cache
    if (files.length > 0 && !bypassCache) {
        setToCache(cacheKey, finalResult);
        if (shouldDebug) {
            console.log(
                `Cached result for ${cacheKey}, next request will be much faster`
            );
        }
    } else if (bypassCache && shouldDebug) {
        console.log(
            `Not caching result for ${cacheKey} - cache is bypassed for debugging`
        );
    } else if (shouldDebug) {
        console.log(
            `Not caching empty result for ${cacheKey} - maybe the media doesn't exist or if cache is having a bad day ?`
        );
    }

    return finalResult;
}
