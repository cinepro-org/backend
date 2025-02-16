import express from "express";
import { getMovie, getTv } from './src/api.js';
import { getMovieFromTmdb, getTvFromTmdb } from './src/Controllers/tmdb.js';
// import { MongoClient } from "mongodb";
import cors from "cors";

const PORT = process.env.PORT;
const app = express()
// const MONGO_URI = process.env.MONGO_URI;

// const client = new MongoClient(MONGO_URI);
// try {
//     await client.connect();
//     console.log("Connected to the database");
// } catch (e) {
//     console.error(e);
// }
// let db = client.db("CineProDB");

app.use(cors());

app.get('/', (req, res) => {
    res.status(200).json({
        home: "CinePro API",
        routes: {
            movie: "/movie/:tmdbID",
            tv: "/tv/:tmdbID?s=seasonNumber&e=episodeNumber"
        },
        information: "This project is for educational purposes only. We do not host any kind of content. We provide only the links to already available content on the internet. We do not host, upload any videos, films or media files. We are not responsible for the accuracy, compliance, copyright, legality, decency, or any other aspect of the content of other linked sites. If you have any legal issues please contact the appropriate media file owners or host sites.",
        license: "You can use this project for personal and non-commercial use ONLY! You are not allowed to sell this project or any part of it and/or add ANY KIND of tracking or advertisement to it.",
        source: "https://github.com/cinepro-org/backend"
    });
});

app.get('/movie/:tmdbId', async (req, res) => {
    if (isNaN(parseInt(req.params.tmdbId))) {
        res.status(405).json({ error: 'Invalid movie id (contained more than only numbers)', hint: 'Check the documentation again to see how to use this endpoint' });
        return;
    }
    
    const media = await getMovieFromTmdb(req.params.tmdbId);
    
    if (media instanceof Error) {
        res.status(405).json({ error: media.message });
        return;
    }

    // let movieInDb = await db.collection("movies").findOne({ tmdbId: media.tmdbId });
    // if (movieInDb) {
    //     res.status(200).json(movieInDb);
    //     return;
    // }

    let output = await getMovie(media);
    
    if (output === null || output.sources.length === 0 || output instanceof Error) {
        res.status(404).json({ error: 'Did not find any sources for this one :(', hint: 'If you know where to find this movie and know programming feel free to join us on github: https://github.com/cinepro-org/backend to add it.' });
    } else {
        res.status(200).json(output);
        //await db.collection("movies").insertOne({output, tmdbId: media.tmdbId});
    }
});

app.get('/tv/:tmdbId', async (req, res) => {
    if (!req.params.tmdbId || isNaN(parseInt(req.params.tmdbId)) || !req.query.s || isNaN(parseInt(req.query.s)) || !req.query.e || isNaN(parseInt(req.query.e))) {
        res.status(405).json({ error: 'Invalid tv id, season, or episode number (must be numbers)', hint: 'Check the documentation again to see how to use this endpoint' });
        return;
    }
    
    const media = await getTvFromTmdb(req.params.tmdbId, req.query.s, req.query.e);
    
    if (media instanceof Error) {
        res.status(405).json({ error: media.message });
        return;
    }
    
    // let tvInDb = await db.collection("tv").findOne({ tmdbId: media.tmdbId });
    // if (tvInDb) {
    //     res.status(200).json(tvInDb);
    //     return;
    // }
    
    let output = await getTv(media, req.query.s, req.query.e);
    
    if (output === null || output.sources.length === 0 || output instanceof Error) {
        res.status(404).json({ error: 'Did not find any sources for this one :(', hint: 'If you know where to find this TV show and know programming feel free to join us on github: https://github.com/cinepro-org/backend to add it.' });
    } else {
        res.status(200).json(output);
        //await db.collection("tv").insertOne({output, tmdbId: media.tmdbId});
    }
});

app.get('/movie/', (req, res) => {
    res.status(405).json({ error: 'Movie id is required', hint: 'check the documentation again to see how to use this endpoint' });
});

app.get('/tv/', (req, res) => {
    res.status(405).json({ error: 'TV id is required', hint: 'check the documentation again to see how to use this endpoint' });
});

app.get('*', (req, res) => {
    res.status(404).json({ error: 'Not found', hint: 'Go to /' });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
