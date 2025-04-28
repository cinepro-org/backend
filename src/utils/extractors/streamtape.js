import fetch from "node-fetch";
import {ErrorObject} from "../../helpers/ErrorObject.js";

export async function extract_streamtape(url) {
    try {
        let hostname = url.match(/https?:\/\/([^\/]+)/)[1];
        const response = await fetch(url);

        if (!response.ok) {
            return new ErrorObject(
                `Failed to fetch Streamtape URL: Status ${response.status}`,
                "Streamtape",
                response.status,
                "Check the URL or server status.",
                true,
                true
            );
        }

        const html = await response.text();

        const urlRegex = /document\.getElementById\('norobotlink'\)\.innerHTML = (.*);/;
        const urlMatch = html.match(urlRegex);
        if (!urlMatch) {
            return new ErrorObject(
                "norobotlink URL not found in the response.",
                "Streamtape",
                500,
                "The page structure might have changed.",
                true,
                true
            );
        }

        const tokenRegex = /token=([^&']+)/;
        const tokenMatch = urlMatch[1].match(tokenRegex);
        if (!tokenMatch) {
            return new ErrorObject(
                "Token not found in the norobotlink URL.",
                "Streamtape",
                500,
                "The page structure might have changed.",
                true,
                true
            );
        }

        const fullUrlRegex = /<div id="ideoooolink" style="display:none;">(.*)<[/]div>/;
        const fullUrlMatch = html.match(fullUrlRegex);
        if (!fullUrlMatch) {
            return new ErrorObject(
                "ideoooolink URL not found in the response.",
                "Streamtape",
                500,
                "The page structure might have changed.",
                true,
                true
            );
        }

        let finalUrl = fullUrlMatch[1].split(hostname)[1];
        finalUrl = `https://${hostname}${finalUrl}&token=${tokenMatch[1]}`;

        const fetchUrl = await fetch(finalUrl, {
            referrer: url,
        });

        if (!fetchUrl.ok) {
            return new ErrorObject(
                `Failed to fetch the final video link: Status ${fetchUrl.status}`,
                "Streamtape",
                fetchUrl.status,
                "Check the final URL or server status.",
                true,
                true
            );
        }

        finalUrl = fetchUrl.url;

        if (!finalUrl) {
            return new ErrorObject(
                "Failed to get the video link.",
                "Streamtape",
                500,
                "The final URL might be invalid or inaccessible.",
                true,
                true
            );
        }

        return {
            file: finalUrl,
            type: "mp4"
        };
    } catch (error) {
        return new ErrorObject(
            `Unexpected error: ${error.message}`,
            "Streamtape",
            500,
            "Check the implementation or server status.",
            true,
            true
        );
    }
}