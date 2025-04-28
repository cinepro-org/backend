import {languageMap} from "../../../utils/languages.js";
import {ErrorObject} from "../../../helpers/ErrorObject.js";

const DOMAIN = "https://xprime.tv/";

export async function getXprime(media) {
    try {
        let status = await fetch(DOMAIN + "servers/", {
            "headers": {
                Accept: "*/*",
                Referer: DOMAIN + "watch/" + media.tmdb,
                Origin: DOMAIN
            }
        });

        if (status.status !== 200) {
            return new ErrorObject("[Xprime] Could not fetch status", "Xprime", status.status, "Check if the server is accessible or if Cloudflare is blocking the request.", true, true);
        }

        status = await status.json();
        let servers = status.servers;

        if (!servers || servers.length === 0) {
            return new ErrorObject("[Xprime] No servers available", "Xprime", 404, "The server list is empty. Ensure the media exists or the API is functioning correctly.", true, true);
        }

        let files = [];
        let subtitles = [];

        for (let server of servers) {
            if (server.status !== "ok") {
                return new ErrorObject(`[Xprime] Server ${server.name} is not operational`, "Xprime", 500, "The server status is not 'ok'.", true, true);
            }

            // Only process "nas" and "primebox" servers
            if (server.name !== "nas" && server.name !== "primebox") {
                return new ErrorObject(`[Xprime] Unsupported server: ${server.name}`, "Xprime", 500, "Only 'nas' and 'primebox' servers are supported.", true, true);
            }

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

            try {
                let response = await fetch(url, {
                    "headers": {
                        "accept": "*/*",
                        "referrer": DOMAIN + "watch/" + media.tmdb,
                        "origin": DOMAIN
                    }
                });

                if (response.status !== 200) {
                    return new ErrorObject(`[Xprime] Failed to fetch from server: ${server.name}`, "Xprime", response.status, "Check the server response or URL.", true, true);
                }

                let data = await response.json();
                if (data.status === "error") {
                    return new ErrorObject(`[Xprime] Server ${server.name} returned an error`, "Xprime", 500, "The server response indicates an error.", true, true);
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
            } catch (error) {
                return new ErrorObject(`[Xprime] Error processing server: ${server.name}`, "Xprime", 500, `Unexpected error: ${error.message}`, true, true);
            }
        }

        if (files.length === 0) {
            return new ErrorObject("[Xprime] No valid files found", "Xprime", 404, "No valid streams were found. Check the server responses or media availability.", true, true);
        }

        return {
            files: files.map(file => ({
                file: file.file, type: file.type, lang: file.lang, headers: file.headers
            })), subtitles: subtitles.map(subtitle => ({
                url: subtitle.url, lang: subtitle.lang, type: subtitle.type
            }))
        };
    } catch (error) {
        return new ErrorObject(`Unexpected error: ${error.message}`, "Xprime", 500, "Check the implementation or server status.", true, true);
    }
}