import fetch from 'node-fetch';
import { ErrorObject } from '../../helpers/ErrorObject.js';

//TODO: not finished yet... check: https://github.com/Gujal00/ResolveURL/blob/master/script.module.resolveurl/lib/resolveurl/plugins/streamtape.py

export async function extract_streamtape(url) {
    console.log('STREAMTAPE FUNCTION STARTED');
    console.log('extract_streamtape called with URL:', url);
    try {
        let hostname = url.match(/https?:\/\/([^\/]+)/)[1];
        console.log('Debug: hostname extracted:', hostname); 
        const response = await fetch(url, {
            headers: {
                'User-Agent':
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/y130.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                Connection: 'keep-alive',
                Referer: url,
                Host: `${hostname}`,
                Origin: `${hostname}`
            }
        });

        if (!response.ok) {
            return new ErrorObject(
                `Failed to fetch Streamtape URL: Status ${response.status}`,
                'Streamtape',
                response.status,
                'Check the URL or server status.',
                true,
                true
            );
        }

        const html = await response.text();
        console.log('Debug: HTML length:', html.length);
        console.log('Debug: Looking for ById pattern...');

        const fullUrlRegex = /ById\('.+?=\s*(["']\/\/[^;<]+)/g;
        const allMatches = html.match(fullUrlRegex);
        if (!allMatches) {
            return new ErrorObject(
                'ById URL pattern not found in the response.',
                'Streamtape',
                500,
                'The page structure might have changed.',
                true,
                true
            );
        }
        // Get the last match like Python does with src[-1]
        const lastMatch = allMatches[allMatches.length - 1];
        const fullUrlMatch = lastMatch.match(/ById\('.+?=\s*(["']\/\/[^;<]+)/);

        console.log('Debug: All matches found:', allMatches?.length || 0);
        console.log('Debug: Last match:', lastMatch);
        console.log('Debug: Extracted URL part:', fullUrlMatch[1]);
        if (!fullUrlMatch) {
            return new ErrorObject(
                'ideoooolink URL not found in the response.',
                'Streamtape',
                500,
                'The page structure might have changed.',
                true,
                true
            );
        }

        let srcUrl = '';
        const parts = fullUrlMatch[1].replace(/'/g, '"').split('+');
        console.log('Debug: Parts to process:', parts);
        console.log('Debug: Reconstructing URL...');

        for (const part of parts) {
            console.log('Debug: Processing part:', part);
            const p1Match = part.match(/"([^"]*)/);
            if (p1Match) {
                let p1 = p1Match[1];
                let p2 = 0;
                if (part.includes('substring')) {
                    const substMatches = part.match(/substring\((\d+)/g);
                    if (substMatches) {
                        for (const sub of substMatches) {
                            // p2 += parseInt(sub.match(/\d+/)[0]);

                            const num = sub.match(/substring\((\d+)/)[1];
                            p2 += parseInt(num);
                        }
                    }
                }
                srcUrl += p1.substring(p2);
                console.log(
                    'Debug: p1:',
                    p1,
                    'p2:',
                    p2,
                    'result:',
                    p1.substring(p2)
                );
            }
        }
        srcUrl += '&stream=1';
        let finalUrl = srcUrl.startsWith('//') ? 'https:' + srcUrl : srcUrl;
        
        // NOTE: Second fetch removed - Python implementation shows the final URL is constructed
        // This second fetch was attempting to follow redirects, which I think so Correct me Guys...
        // But the python implementation for refrence does not do this ??.

        // const fetchUrl = await fetch(finalUrl, {
        //     referrer: url,
        //     headers: {
        //         'User-Agent':
        //             'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/y130.0.0.0 Safari/537.36',
        //         Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        //         'Accept-Language': 'en-US,en;q=0.5',
        //         'Accept-Encoding': 'gzip, deflate, br',
        //         Connection: 'keep-alive',
        //         Referer: url,
        //         Host: hostname,
        //         'Upgrade-Insecure-Requests': '1',
        //         cookie: '_b=kube11; _csrf=822ec8cb97ba224e8ed314c00303276b8a030fa1fa7751f05507cce0fa1db8f3a%3A2%3A%7Bi%3A0%3Bs%3A5%3A%22_csrf%22%3Bi%3A1%3Bs%3A32%3A%228_a9Qu8qKOy8vXbu6bUZ50ULkGMWAcxO%22%3B%7D'
        //     }
        // });

        // let data = await fetchUrl.text();

        // if (!fetchUrl.ok) {
        //     return new ErrorObject(
        //         `Failed to fetch the final video link: Status ${fetchUrl.status}`,
        //         'Streamtape',
        //         fetchUrl.status,
        //         'Check the final URL or server status.',
        //         true,
        //         true
        //     );
        // }
        
        // The &stream=1 parameter is already added during URL reconstruction above
        // finalUrl = fetchUrl.url + '&stream=1';

        if (!finalUrl) {
            return new ErrorObject(
                'Failed to get the video link.',
                'Streamtape',
                500,
                'The final URL might be invalid or inaccessible.',
                true,
                true
            );
        }
        console.log('Final reconstructed URL:', finalUrl);

        return {
            file: finalUrl,
            type: 'mp4'
        };
    } catch (error) {
        console.error('Error in extract_streamtape:', error);
        return new ErrorObject(
            `Unexpected error: ${error.message}`,
            'Streamtape',
            500,
            'Check the implementation or server status.',
            true,
            true
        );
    }
}
