import {languageMap} from "../../../utils/languages.js";

export async function getVidSrcVip(media) {
    const link = getLink(media);

    try {
        let sources = await fetch(link, {
            headers: {
                Referer: "https://vidsrc.vip/",
                Origin: "https://vidsrc.vip",
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3"
            }
        });
        if (!sources.ok) {
            throw new Error("[vidsrcvip] Failed to scrape sources from https://api2.vidsrc.vip");
        } else {
            sources = await sources.json();
            if (Object.keys(sources).length === 0) {
                throw new Error("[vidsrcvip] No sources found");
            }

            const formattedSources = Object.values(sources)
                .filter(source => source && source.url) // Ensure source and url are valid
                .map(source => ({
                    file: source.url,
                    type: source.url.includes('.m3u8') ? 'hls' : source.url.includes('.mp4') ? 'mp4' : 'unknown',
                    lang: languageMap[source.language] || source.language,
                }));

            if (formattedSources.length === 0) {
                return new Error("[vidsrcvip] No valid sources found");
            }
            
            return {
                files: formattedSources,
                subtitles: []
            };
        }
    } catch (error) {
        return error;
    }
}

const getLink = (media) => {
    const C = media.tmdb
        .toString()
        .split("")
        .map((digit) => {
            const encoding = "abcdefghij";
            return encoding[parseInt(digit)];
        })
        .join("");
    const B = C.split("").reverse().join("");
    const A = btoa(B);
    const D = btoa(A);
    if (media.type === "tv") {
        return `https://api2.vidsrc.vip/tv/${D}`;
    }else {
        return `https://api2.vidsrc.vip/movie/${D}`;
    }
};