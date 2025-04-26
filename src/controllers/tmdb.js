import dotenv from 'dotenv';

dotenv.config();
const apiKey = process.env.TMDB_API_KEY;

export async function getMovieFromTmdb(tmdb_id) {
    try {
        const url = `https://api.themoviedb.org/3/movie/${tmdb_id}?api_key=${apiKey}`;
        const response = await fetch(url);
        if (response.status !== 200) {
            return new Error("Invalid movie id");
        }
        const data = await response.json();
        if (new Date(data.release_date) > new Date().getTime()) {
            return new Error("Media not released yet");
        }
        // check for tmdb_id
        // https://developer.themoviedb.org/reference/movie-external-ids
        let secondData = await fetch(`https://api.themoviedb.org/3/movie/${tmdb_id}/external_ids?api_key=${apiKey}`);
        secondData = await secondData.json();
        let imdb_id = secondData.imdb_id;
        let info = {
            type: "movie",
            title: data.original_title,
            name: data.original_title,
            releaseYear: Number(data.release_date.split("-")[0]),
            releaseyear: Number(data.release_date.split("-")[0]),
            tmdbId: tmdb_id,
            tmdb: tmdb_id,
            imdbId: imdb_id,
            imdb: imdb_id
        }
        return info;
    } catch (e) {
        return new Error("An error occurred" + e);
    }
}

export async function getTvFromTmdb(tmdb_id, season, episode) {
    try {
        const url = `https://api.themoviedb.org/3/tv/${tmdb_id}/season/${season}/episode/${episode}?api_key=${apiKey}&append_to_response=external_ids`;
        const response = await fetch(url);
        if (response.status !== 200) {
            return new Error("Invalid movie id");
        }
        const data = await response.json();
        if (new Date(data.air_date) > new Date().getTime()) {
            return new Error("Not released yet");
        }
        let secondData = await fetch(`https://api.themoviedb.org/3/tv/${tmdb_id}?api_key=${apiKey}`);
        secondData = await secondData.json();
        let title = secondData.name;
        
        // check for tmdb_id
        // https://developer.themoviedb.org/reference/movie-external-ids
        let thirdData = await fetch(`https://api.themoviedb.org/3/tv/${tmdb_id}/external_ids?api_key=${apiKey}`);
        thirdData = await thirdData.json();
        let imdb_id = thirdData.imdb_id;
        
        let info = {
            type: "tv",
            title: title,
            name: title,
            releaseYear: data.air_date.split("-")[0],
            releaseyear: data.air_date.split("-")[0],
            tmdbId: tmdb_id,
            tmdb: tmdb_id,
            imdbId: imdb_id,
            imdb: imdb_id,
            season: season,
            episode: episode,
            episodeid: episode,
            episodeName: data.name
        }
        return info;
    } catch (e) {
        return new Error("An error occurred" + e);
    }
}