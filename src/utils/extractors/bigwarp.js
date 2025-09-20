import { ErrorObject } from '../../helpers/ErrorObject.js';

export async function extract_bigwarp(url) {
    let hostname = url.match(/https?:\/\/([^\/]+)/)[1];

    try {
        const headers = {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/y130.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            Connection: 'keep-alive',
            Referer: url,
            Host: `${hostname}`,
            Origin: `${hostname}`
        };

        const response = await fetch(url, { headers });
        const html = await response.text();

        // Now, ... Extractingg video sources using regex
        const sourceRegex =
            /file\s*:\s*['"]([^'"]+)['"],\s*label\s*:\s*['"](\d+p?)/g;
        const sources = [];
        let match;

        while ((match = sourceRegex.exec(html)) !== null) {
            sources.push({
                url: match[1],
                label: match[2]
            });
        }

        if (sources.length === 0) {
            return new ErrorObject(
                'Video Link Not Found',
                'BigWarp',
                404,
                'No video sources found'
            );
        }

        // Sorting sources by quality
        sources.sort((a, b) => {
            const aQuality = parseInt(a.label.replace('p', '')) || 0;
            const bQuality = parseInt(b.label.replace('p', '')) || 0;
            return bQuality - aQuality;
        });

        let bestSource = sources[0].url;

        // This is because I think Python lib which we are converting... to js
        // the python lib uses the headers to parse it to the url so I think we should join this with
        // '&' (not sure tho)
        const headerParams = Object.entries(headers)
            .map(
                ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`
            )
            .join('&');

        bestSource = `${bestSource}|${headerParams}`;

        // well i checked and voila we get the file url exact so... good to go i think
        return {
            url: bestSource,
            headers: headers
        };
    } catch (error) {
        return new ErrorObject(
            'Extraction failed',
            'BigWarp',
            500,
            error.message
        );
    }
}
