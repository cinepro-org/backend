import { ErrorObject } from '../../../helpers/ErrorObject.js';
import { languageMap } from '../../../utils/languages.js';

const DOMAIN = 'https://xprime.tv/';
const BACKEND_DOMAIN = 'https://backend.xprime.tv/';

export async function getXprime(media) {
    try {
        let status = await fetch(BACKEND_DOMAIN + 'servers', {
            headers: {
                Accept: '*/*',
                Referer: DOMAIN + 'watch/' + media.tmdb,
                Origin: DOMAIN
            }
        });

        if (status.status !== 200) {
            return new ErrorObject(
                'Could not fetch status',
                'Xprime',
                status.status,
                'Check if the server is accessible or if Cloudflare is blocking the request.',
                true,
                true
            );
        }

        status = await status.json();
        let servers = status.servers;

        if (!servers || servers.length === 0) {
            return new ErrorObject(
                'No servers available',
                'Xprime',
                404,
                'The server list is empty. Ensure the media exists or the API is functioning correctly.',
                true,
                true
            );
        }

        let files = [];
        let subtitles = [];
        let errors = [];
        let goodServers = servers.filter((server) => server.status === 'ok');

        for (let server of goodServers) {
            switch (server.name.toLowerCase()) {
                case 'phoenix':
                    await doPhoenixStuff(media, files, subtitles, errors);
                    break;

                case 'primenet':
                    doPrimenetStuff(media, files, subtitles, errors);
                    break;

                case 'primebox':
                    doPrimeboxStuff(media, files, subtitles, errors);
                    break;

                case 'kraken':
                    doKrakenStuff(media, files, subtitles, errors);
                    break;

                case 'harbour':
                    doHarbourStuff(media, files, subtitles, errors);
                    break;

                case 'volkswagen':
                    doVolkswagenStuff(media, files, subtitles, errors);
                    break;

                case 'fendi':
                    doFendiStuff(media, files, subtitles, errors);
                    break;
            }
        }

        if (files.length === 0) {
            return new ErrorObject(
                'No valid files found',
                'Xprime',
                404,
                'No valid streams were found. Check the server responses or media availability.',
                true,
                true
            );
        }

        return {
            files: files.map((file) => ({
                file: file.file,
                type: file.type,
                lang: file.lang,
                headers: file.headers
            })),
            subtitles: subtitles.map((subtitle) => ({
                url: subtitle.url,
                lang: subtitle.lang,
                type: subtitle.type
            }))
        };
    } catch (error) {
        return new ErrorObject(
            `Unexpected error: ${error.message}`,
            'Xprime',
            500,
            'Check the implementation or server status.',
            true,
            true
        );
    }
}

async function doPhoenixStuff(media, files, subtitles, errors) {
    let url;

    if (media.type === 'movie') {
        url = `${BACKEND_DOMAIN}phoenix?name=${encodeURI(media.title)}&year=${media.year}&id=${media.tmdb}&imdb=${media.imdb}`;
    } else if (media.type === 'tv') {
        url = `${BACKEND_DOMAIN}phoenix?name=${encodeURI(media.title)}&year=${media.year}&id=${media.tmdb}&imdb=${media.imdb}&season=${media.season}&episode=${media.episode}`;
    }

    let data = await fetch(url, {
        headers: {
            Accept: '*/*',
            Referer: DOMAIN + 'watch/' + media.tmdb,
            Origin: DOMAIN
        }
    });
    if (data.status !== 200) {
        errors.push(
            new ErrorObject(
                'Failed to fetch Phoenix data',
                'Xprime',
                data.status,
                'Check if the Phoenix server is accessible or if the media exists.',
                true,
                true
            )
        );
    }
    // TODO: I did not find a working pheonix response to map to. Will have to try later again.
}

async function doPrimenetStuff(media, files, subtitles, errors) {
    let url;

    if (media.type === 'movie') {
        url = `${BACKEND_DOMAIN}primenet?name=${encodeURI(media.title)}&year=${media.year}&id=${media.tmdb}&imdb=${media.imdb}`;
    } else if (media.type === 'tv') {
        url = `${BACKEND_DOMAIN}primenet?name=${encodeURI(media.title)}&year=${media.year}&id=${media.tmdb}&imdb=${media.imdb}&season=${media.season}&episode=${media.episode}`;
    }

    let data = await fetch(url, {
        headers: {
            Accept: '*/*',
            Referer: DOMAIN + 'watch/' + media.tmdb,
            Origin: DOMAIN
        }
    });

    if (data.status !== 200) {
        errors.push(
            new ErrorObject(
                'Failed to fetch Primenet data',
                'Xprime',
                data.status,
                'Check if the Primenet server is accessible or if the media exists.',
                true,
                true
            )
        );
        return;
    }

    data = await data.json();
    if (data.url) {
        files.push({
            file: data.url,
            type: 'hls',
            lang: 'en',
            headers: {
                Referer: DOMAIN + 'watch/' + media.tmdb,
                Origin: DOMAIN
            }
        });
    }
}

async function doPrimeboxStuff(media, files, subtitles, errors) {
    let url;

    if (media.type === 'movie') {
        url = `${BACKEND_DOMAIN}primebox?name=${encodeURI(media.title)}&year=${media.year}`;
    } else if (media.type === 'tv') {
        url = `${BACKEND_DOMAIN}primebox?name=${encodeURI(media.title)}&year=${media.year}&season=${media.season}&episode=${media.episode}`;
    }

    let data = await fetch(url, {
        headers: {
            Accept: '*/*',
            Referer: DOMAIN + 'watch/' + media.tmdb,
            Origin: DOMAIN
        }
    });

    if (data.status !== 200) {
        errors.push(
            new ErrorObject(
                'Failed to fetch Primebox data',
                'Xprime',
                data.status,
                'Check if the Primebox server is accessible or if the media exists.',
                true,
                true
            )
        );
        return;
    }

    data = await data.json();
    if (data.streams && data.available_qualities) {
        for (const quality of data.available_qualities) {
            if (data.streams[quality]) {
                files.push({
                    file: data.streams[quality],
                    type: 'hls',
                    lang: 'en',
                    quality: quality,
                    headers: {
                        Referer: DOMAIN + 'watch/' + media.tmdb,
                        Origin: DOMAIN
                    }
                });
            }
        }
    }
    if (Array.isArray(data.subtitles)) {
        for (const sub of data.subtitles) {
            subtitles.push({
                url: sub.file,
                lang: languageMap[sub.language] || 'unknown',
                type: 'vtt'
            });
        }
    }
}

async function doKrakenStuff(media, files, subtitles, errors) {
    // TODO: Xprime was not completely working when i tried to implement this.
}

async function doHarbourStuff(media, files, subtitles, errors) {
    // TODO: Xprime was not completely working when i tried to implement this.
}

async function doVolkswagenStuff(media, files, subtitles, errors) {
    // TODO: Xprime was not completely working when i tried to implement this.
}

async function doFendiStuff(media, files, subtitles, errors) {
    // TODO: Xprime was not completely working when i tried to implement this.
}
