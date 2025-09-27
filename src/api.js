import { getTwoEmbed } from './controllers/providers/2Embed/2embed.js';
import { getAutoembed } from './controllers/providers/AutoEmbed/autoembed.js';
import { getPrimewire } from './controllers/providers/PrimeWire/primewire.js';
import { getVidSrcCC } from './controllers/providers/VidSrcCC/vidsrccc.js';
import { getVidSrc } from './controllers/providers/VidSrc/VidSrc.js';
import { getVidRock } from './controllers/providers/VidRock/Vidrock.js';
import { getXprime } from './controllers/providers/xprime/xprime.js';
import { ErrorObject } from './helpers/ErrorObject.js';
import { getVidsrcWtf } from './controllers/providers/VidSrcWtf/VidSrcWtf.js';
import { getVidZee } from './controllers/providers/VidZee/VidZee.js';
import { getWyzie } from './controllers/subs/wyzie.js';
import { getLibre } from './controllers/subs/libresubs.js';
import { getCacheKey, getFromCache, setToCache } from './cache/cache.js';
import { get111Movies } from './controllers/providers/111movies/111movies.js';
import { getCinemaOS } from './controllers/providers/CinemaOS/CinemaOS.js';
import { getMultiembed } from './controllers/providers/MultiEmbed/MultiEmbed.js';

const shouldDebug = process.argv.includes('--debug');

export async function scrapeMedia(media) {
    // First thing - check if we already have this data cached (unless you're debugging and want fresh data)
    const cacheKey = getCacheKey(media);

    if (!shouldDebug) {
        const cachedResult = getFromCache(cacheKey);

        if (cachedResult) {
            // Found it in cache, then we don't need to scrape again
            if (shouldDebug) {
                console.log(
                    `[CACHE] Cache for ${cacheKey} - serving from memory instead of scraping`
                );
            }
            return cachedResult;
        }
    }

    // If no cache or bypassed, time to do the actual workkkk
    if (shouldDebug) {
        console.log(
            `[CACHE] ${shouldDebug ? 'Cache bypassed' : 'No cache Found'} for ${cacheKey}, work starts now...`
        );
    }
    const providers = [
        // WORKING
        { getTwoEmbed: () => getTwoEmbed(media) },
        { getAutoembed: () => getAutoembed(media) },
        { get111Movies: () => get111Movies(media) },
        { getVidSrcCC: () => getVidSrcCC(media) },
        { getVidSrc: () => getVidSrc(media) },
        { getVidrock: () => getVidRock(media) },
        { getCinemaOS: () => getCinemaOS(media) },
        { getMultiembed: () => getMultiembed(media) },
        { getVidsrcWtf: () => getVidsrcWtf(media) },

        // It does need to fixed but it acts like it is down sometimes throws 520 or 524 so,
        // You got my point right ?
        { getVidZee: () => getVidZee(media) },

        // NEED TO FIX
        // { getXprime: () => getXprime(media) },
        // { getPrimewire: () => getPrimewire(media) },

        // SUB SEARCH
        { getWyzie: () => getWyzie(media) },
        { getLibre: () => getLibre(media) }
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
    if (files.length > 0 && !shouldDebug) {
        setToCache(cacheKey, finalResult);
        if (shouldDebug) {
            console.log(
                `[CACHE] Cached result for ${cacheKey}, next request will be much faster`
            );
        }
    } else if (shouldDebug) {
        console.log(
            `[CACHE] Not caching result for ${cacheKey} - cache is bypassed for debugging`
        );
    }

    return finalResult;
}

export default { scrapeMedia };
