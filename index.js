import express from "express";
import { getMovie, getTv } from './src/api.js';
import { getMovieFromTmdb, getTvFromTmdb } from './src/tmdb.js';

const port = 3000;
const app = express()


app.get('/', (req, res) => {
    res.status(200).json({
        home: "CinePro API",
        routes: {
            movie: "/movie/tmdbId",
            tv: "/tv/tmdbId?s=seasonNumber&e=episodeNumber"
        },
        information: "This project is for educational purposes only. We do not host any kind of content. We provide only the links to already available content on the internet. We do not host, upload any videos, films or media files. We are not responsible for the accuracy, compliance, copyright, legality, decency, or any other aspect of the content of other linked sites. If you have any legal issues please contact the appropriate media file owners or host sites.",
        license: "You can use this project for personal and non-commercial use ONLY! You are not allowed to sell this project or any part of it and/or add ANY KIND of tracking or advertisement to it.",
        source: "https://github.com/cinepro-org/"
    });
});

app.get('/movie/:tmdbId', async (req, res) => {
    const media = await getMovieFromTmdb(req.params.tmdbId);
    
    if (media instanceof Error) {
        res.status(405).json({ error: media.message });
        return;
    }

    let output = await getMovie(media);
    
    if (output === null) {
        res.status(404).json({ error: 'Not found', hint: 'If Input is correct, we could not find anything :(' });
        return;
    } 
    
    res.status(200).json(output);
});

app.get('/tv/:tmdbId', async (req, res) => {
    const media = await getTvFromTmdb(req.params.tmdbId, req.query.s, req.query.e);
    
    if (media instanceof Error) {
        res.status(405).json({ error: media.message });
        return;
    }
    
    let output = await getTv(media, req.query.s, req.query.e);
    
    if (output === null) {
        res.status(404).json({ error: 'Not found', hint: 'Go to /' });
        return;
    } 
    
    res.status(200).json(output);
});

app.get('/movie/', (req, res) => {
    res.status(405).json({ error: 'Movie id is required', hint: 'Go to /movie/_movieTMDBid_' });
});

app.get('/tv/', (req, res) => {
    res.status(405).json({ error: 'TV id is required', hint: 'Go to /tv/_tvTMDBid?s=seasonNumber&e=episodeNumber' });
});

app.get('*', (req, res) => {
    res.status(404).json({ error: 'Not found', hint: 'Go to /' });
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
