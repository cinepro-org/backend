import { languageMap } from "../../../utils/languages.js";

const DOMAIN = "https://xprime.tv/";

export async function getXprime(media) {
    let status = await fetch(DOMAIN + "servers/", {    
        "headers": {
            "accept": "*/*"
        },
        "referrer": DOMAIN + "watch/" + media.tmdbId
    });
    // TODO: Check why when going directly to DOMAIN + "servers/" it works, but when fetching it, it returns a 404 (cloudflare??) 
    if (status.status !== 200) {
        return new Error("[Xprime] could not fetch status");
    }
    status = await status.json();
    let servers = status.servers;
    if (servers.length === 0) {
        return new Error("[Xprime] no servers available");
    }

    let files = [];
    let subtitles = [];

    for (let server of servers) {
        if (server.status !== "ok") continue;
        // all servers except "nas" are encrypted. will have to implement decryption later
        if (server.name !== "nas" || server.name != "primebox" ) continue;

        let url = `${DOMAIN}${server.name}?`;
        if (server.required) {
            if (typeof server.required.includes(',')) {
                server.required.split(', ').forEach(param => {
                    url += `${param}=${media[param]}&`;
                });
            } else {
                url += `${server.required}=${media[server.required]}&`;
            }
        }
        if (server.optional) {
            if (typeof server.optional.includes(',')) {
                server.optional.split(', ').forEach(param => {
                    if (media[param]) {
                        url += `${param}=${media[param]}&`;
                    }
                });
            } else {
                if (media[server.optional]) {
                    url += `${server.optional}=${media[server.optional]}&`;
                }
            }
        }

        let response = await fetch(url, {
            "headers": {
                "accept": "*/*"
            },
            "referrer": DOMAIN + "watch/" + media.tmdbId
        });
        if (response.status !== 200) {
            console.log(`[Xprime] Failed to fetch from server: ${server.name}`);
            continue;
        }
        let data = await response.json();
        if (data.status === "error") {
            console.log(`[Xprime] Server ${server.name} returned an error`);
            continue;
        }


        // Process streams
        for (const quality in data.streams) {
            files.push({
                file: data.streams[quality],
                type: "mp4",
                lang: "en"
            });
        }

        // Process subtitles
        data.subtitles.forEach(subtitle => {
            subtitles.push({
                url: subtitle.file,
                lang: languageMap[subtitle.label.split(' ')[0]] || subtitle.label,
                type: subtitle.file.split('.').pop()
            });
        });
    }

    return {
        files: files.map(file => ({
            file: file.file,
            type: file.type,
            lang: file.lang,
            headers: file.headers
        })),
        subtitles: subtitles.map(subtitle => ({
            url: subtitle.url,
            lang: subtitle.lang,
            type: subtitle.type
        }))
    };
}