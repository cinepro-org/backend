import express from 'express';
import { scrapeMedia } from './src/api.js';
import {
    createProxyRoutes,
    processApiResponse
} from './src/proxy/proxyserver.js';
import { getMovieFromTmdb, getTvFromTmdb } from './src/helpers/tmdb.js';
import cors from 'cors';
import { strings } from './src/strings.js';
import {
    checkIfPossibleTmdbId,
    handleErrorResponse
} from './src/helpers/helper.js';
import { ErrorObject } from './src/helpers/ErrorObject.js';
import { getCacheStats } from './src/cache/cache.js';
const PORT = process.env.PORT;
const allowedOrigins = ['https://cinepro.mintlify.app/']; // localhost is also allowed. (from any localhost port)
const app = express();

app.use(
    cors({
        origin: (origin, callback) => {
            !origin ||
            allowedOrigins.includes(origin) ||
            /^http:\/\/localhost/.test(origin)
                ? callback(null, true)
                : callback(new Error('Not allowed by CORS'));
        }
    })
);
createProxyRoutes(app);

app.get('/', (req, res) => {
    res.status(200).json({
        home: strings.HOME_NAME,
        routes: strings.ROUTES,
        information: strings.INFORMATION,
        license: strings.LICENSE,
        source: strings.SOURCE
    });
});

app.get('/movie/:tmdbId', async (req, res) => {
    if (!checkIfPossibleTmdbId(req.params.tmdbId)) {
        return handleErrorResponse(
            res,
            new ErrorObject(
                strings.INVALID_MOVIE_ID,
                'user',
                405,
                strings.INVALID_MOVIE_ID_HINT,
                true,
                false
            )
        );
    }

    const media = await getMovieFromTmdb(req.params.tmdbId);
    if (media instanceof ErrorObject) {
        return handleErrorResponse(res, media);
    }

    const output = await scrapeMedia(media);
    if (output instanceof ErrorObject) {
        return handleErrorResponse(res, output);
    }
    const serverUrl = `${req.protocol}://${req.get('host')}`;
    const processedOutput = processApiResponse(output, serverUrl);

    res.status(200).json(processedOutput);
});

app.get('/tv/:tmdbId', async (req, res) => {
    if (
        !checkIfPossibleTmdbId(req.params.tmdbId) ||
        !checkIfPossibleTmdbId(req.query.s) ||
        !checkIfPossibleTmdbId(req.query.e)
    ) {
        return handleErrorResponse(
            res,
            new ErrorObject(
                strings.INVALID_TV_ID,
                'user',
                405,
                strings.INVALID_TV_ID_HINT,
                true,
                false
            )
        );
    }

    const media = await getTvFromTmdb(
        req.params.tmdbId,
        req.query.s,
        req.query.e
    );
    if (media instanceof ErrorObject) {
        return handleErrorResponse(res, media);
    }

    const output = await scrapeMedia(media);
    if (output instanceof ErrorObject) {
        return handleErrorResponse(res, output);
    }
    const serverUrl = `${req.protocol}://${req.get('host')}`;
    const processedOutput = processApiResponse(output, serverUrl);

    res.status(200).json(processedOutput);
});

app.get('/movie/', (req, res) => {
    handleErrorResponse(
        res,
        new ErrorObject(
            strings.INVALID_MOVIE_ID,
            'user',
            405,
            strings.INVALID_MOVIE_ID_HINT,
            true,
            false
        )
    );
});

app.get('/tv/', (req, res) => {
    handleErrorResponse(
        res,
        new ErrorObject(
            strings.INVALID_TV_ID,
            'user',
            405,
            strings.INVALID_TV_ID_HINT,
            true,
            false
        )
    );
});

// Endpoint to flex how well our cache is doing - because who doesn't love stats
// Hell Yeah we love it, Because STONE COLD SAID SOOOOO
app.get('/cache-stats', (req, res) => {
    const stats = getCacheStats();
    res.status(200).json({
        ...stats,
        cacheEnabled: true,
        ttl: '3 hours (10800 seconds)'
    });
});

app.get('*', (req, res) => {
    handleErrorResponse(
        res,
        new ErrorObject(
            strings.ROUTE_NOT_FOUND,
            'user',
            404,
            strings.ROUTE_NOT_FOUND_HINT,
            true,
            false
        )
    );
});

app.listen(PORT, () => {
    console.log(`Server is running on port http://localhost:${PORT};`);
    if (process.argv.includes('--debug')) {
        console.log(`Debug mode is enabled.`);
    } else {
        console.log('Debug mode is disabled.');
    }

    if (process.argv.includes('--no-cache')) {
        console.log('Cache is disabled.');
    } else {
        console.log('Cache is enabled.');
    }
});
