import dotenv from 'dotenv';
import { strings } from '../strings.js';
import { ErrorObject } from './ErrorObject.js';

dotenv.config();
const apiKey = process.env.TMDB_API_KEY;

/**
 * Fetches movie information from TMDB API using the movie ID
 * @param {string|number} tmdb_id - The TMDB ID of the movie
 * @returns {Promise<Object|ErrorObject>} Object containing movie information or Error if any part of the request fails
 * @property {string} type - Always "movie"
 * @property {string} title - Original title of the movie
 * @property {string} name - Original title of the movie
 * @property {number} releaseYear - Year the movie was released
 * @property {string|number} tmdb - TMDB ID of the movie
 * @property {string} imdb - IMDB ID of the movie
 */
export async function getMovieFromTmdb(tmdb_id) {
    try {
        const url = `https://api.themoviedb.org/3/movie/${tmdb_id}?api_key=${apiKey}`;
        const response = await fetch(url);
        if (response.status !== 200) {
            return new ErrorObject(
                strings.INVALID_MOVIE_ID,
                'user',
                404,
                strings.INVALID_MOVIE_ID_HINT,
                true,
                false
            );
        }
        const data = await response.json();
        if (new Date(data.release_date) > new Date().getTime()) {
            return new ErrorObject(
                'This movie has not been released.',
                'user',
                400,
                strings.INVALID_MOVIE_ID_HINT,
                true,
                false
            );
        }

        let secondData = await fetch(
            `https://api.themoviedb.org/3/movie/${tmdb_id}/external_ids?api_key=${apiKey}`
        );
        if (secondData.status !== 200) {
            return new ErrorObject(
                strings.INVALID_MOVIE_ID,
                'user',
                404,
                strings.INVALID_MOVIE_ID_HINT,
                true,
                false
            );
        }
        secondData = await secondData.json();

        return {
            type: 'movie',
            title: data.original_title,
            name: data.original_title,
            releaseYear: Number(data.release_date.split('-')[0]),
            tmdb: tmdb_id,
            imdb: secondData.imdb_id
        };
    } catch (e) {
        return new ErrorObject(
            'An error occurred' + e,
            'backend',
            500,
            undefined,
            true,
            true
        );
    }
}

/**
 * Fetches TV show episode information from TMDB API
 * @param {string|number} tmdb_id - The TMDB ID of the TV show
 * @param {string|number} season - Season number
 * @param {string|number} episode - Episode number
 * @returns {Promise<Object|ErrorObject>} Object containing episode information or Error if any part of the request fails
 * @property {string} type - Always "tv"
 * @property {string|number} releaseYear - Year the episode was aired
 * @property {string|number} tmdb - TMDB ID of the show (duplicate)
 * @property {string} imdb - IMDB ID of the show (duplicate)
 * @property {string|number} season - Season number
 * @property {string|number} episode - Episode number
 * @property {string|number} episodeid - Episode number (duplicate)
 * @property {string} episodeName - Name of the episode
 */
export async function getTvFromTmdb(tmdb_id, season, episode) {
    try {
        const url = `https://api.themoviedb.org/3/tv/${tmdb_id}/season/${season}/episode/${episode}?api_key=${apiKey}&append_to_response=external_ids`;
        const response = await fetch(url);
        if (response.status !== 200) {
            return new ErrorObject(
                strings.INVALID_TV_ID,
                'user',
                404,
                strings.INVALID_TV_ID_HINT,
                true,
                false
            );
        }
        const data = await response.json();
        if (new Date(data.air_date) > new Date().getTime()) {
            return new ErrorObject(
                'This episode has not been released yet.',
                'user',
                405,
                undefined,
                true,
                false
            );
        }
        let secondData = await fetch(
            `https://api.themoviedb.org/3/tv/${tmdb_id}?api_key=${apiKey}`
        );
        if (secondData.status !== 200) {
            return new ErrorObject(
                strings.INVALID_TV_ID,
                'user',
                404,
                strings.INVALID_TV_ID_HINT,
                true,
                false
            );
        }
        secondData = await secondData.json();
        let title = secondData.name;

        let thirdData = await fetch(
            `https://api.themoviedb.org/3/tv/${tmdb_id}/external_ids?api_key=${apiKey}`
        );
        if (thirdData.status !== 200) {
            return new ErrorObject(
                strings.INVALID_TV_ID,
                'user',
                404,
                strings.INVALID_TV_ID_HINT,
                true,
                false
            );
        }
        thirdData = await thirdData.json();

        return {
            type: 'tv',
            name: title,
            releaseYear: data.air_date.split('-')[0],
            tmdb: tmdb_id,
            imdb: thirdData.imdb_id,
            season: season,
            episode: episode,
            episodeName: data.name
        };
    } catch (e) {
        return new ErrorObject(
            'An error occurred' + e,
            'backend',
            500,
            undefined,
            true,
            true
        );
    }
}
