export async function getVidSrcVip(media) {
    const hashedId = hashId(media.tmdbId);

    try {
        let sources = await fetch("https://api.vid3c.site/allmvse.php?id=" + hashedId, {
            headers: {
                Referer: "https://vidsrc.vip/",
                Origin: "https://vidsrc.vip",
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3"
            }
        });
        if (!sources.ok) {
            throw new Error("[vidsrcvip] Failed to scrape sources from api.vid3c.site");
        } else {
            sources = await sources.json();
            if (Object.keys(sources).length === 0) {
                throw new Error("[vidsrcvip] No sources found");
            }

            const formattedSources = Object.values(sources)
                .filter(source => source) // Filter out null or empty sources
                .map(source => ({
                    file: source,
                    type: source.includes('.m3u8') ? 'hls' : source.includes('.mp4') ? 'mp4' : 'unknown',
                    lang: 'en'
                    }));
            let subtitles = [];
            try {
                subtitles = await getSubtitles(media);
            } catch (error) {
                
            }
            return {
                files: formattedSources,
                subtitles: subtitles
            };
        }
    } catch (error) {
        return error;
    }
}

const hashId = (id) => {
    // how to hash the id? 693134 => WldSaVpHcG4=
    // sources: https://api.vid3c.site/allmvse.php?id=WldSaVpHcG4=
    return id;
};

async function getSubtitles(media) {
    await fetch(`https://vid3c.site/s.php?id=${media.tmdbId}`, {
        headers: {
            Referer: "https://vidsrc.vip/",
            Origin: "https://vidsrc.vip",
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3"
        }
    });
    if (!subtitles.ok) {
        throw new Error("[vidsrcvip] Failed to get subtitles");
    }
    const subtitle = await subtitles.json();
    // go through the subtitle object and match response format
    let formattedSubtitles = [];
    subtitle.forEach(sub => {
        const labelWithoutNumbers = sub.label.split(' ')[0].replace(/[0-9]/g, '').trim();
        const langCode = languageMap[labelWithoutNumbers] || 'unknown';
        let type = sub.file.split('.').pop();
        formattedSubtitles.push({
            lang: langCode,
            url: sub.file,
            type
        });
    });
}