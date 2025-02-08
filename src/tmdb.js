import dotenv from 'dotenv';

dotenv.config();

export async function getMovieFromTmdb(tmdb_id) {
    try {
        const apiKey = process.env.TMDB_API_KEY;
        const url = `https://api.themoviedb.org/3/movie/${tmdb_id}?api_key=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();
        if (new Date(data.release_date) > new Date().getTime()) {
            return new Error("Not released yet");
        }
        let info = {
            type: "movie",
            title: data.original_title,
            releaseYear: Number(data.release_date.split("-")[0]),
            tmdbId: tmdb_id,
            imdbId: data.imdb_id
        }
        return info;
    } catch (e) {
        return new Error("Not valid tmdb id");
    }
}

export async function getTvFromTmdb(tmdb_id, season, episode) {
    try {
        const apiKey = process.env.TMDB_API_KEY;
        const url = `https://api.themoviedb.org/3/tv/${tmdb_id}/season/${season}/episode/${episode}?api_key=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();
        if (new Date(data.air_date) > new Date().getTime()) {
            return new Error("Not released yet");
        }
        let info = {
            type: "tv",
            title: data.name,
            releaseYear: data.air_date.split("-")[0],
            tmdbId: tmdb_id,
            imdbId: data.imdb_id
        }
        return info;
    } catch (e) {
        return new Error("Not valid tmdb id");
    }
}