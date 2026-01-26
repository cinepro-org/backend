import { getMoviesAPI } from './Movieapiclub.js';

/**
 * test script for moviesapi provider
 */

async function testMoviesAPI() {
    console.log('=== testing moviesapi provider ===\n');

    // test 1: movie
    const movie = {
        tmdb: '155',
        type: 'movie',
        title: 'The Dark Knight',
        releaseYear: '2008'
    };

    console.log('test 1: the dark knight (movie)');
    const result1 = await getMoviesAPI(movie);

    if (result1.files) {
        console.log(
            `success! found ${result1.files.length} streams, ${result1.subtitles.length} tracks`
        );
        result1.files.slice(0, 3).forEach((f, i) => {
            console.log(
                `  ${i + 1}. [${f.type}] ${f.label}: ${f.file.substring(0, 60)}...`
            );
        });
    } else {
        console.log('failed:', result1.message);
    }

    console.log('\n' + '='.repeat(60) + '\n');

    // test 2: tv show
    const tv = {
        tmdb: '1399',
        type: 'tv',
        title: 'Game of Thrones',
        season: 1,
        episode: 1
    };

    console.log('test 2: game of thrones s01e01 (tv)');
    const result2 = await getMoviesAPI(tv);

    if (result2.files) {
        console.log(
            `success! found ${result2.files.length} streams, ${result2.subtitles.length} tracks`
        );
        result2.files.slice(0, 3).forEach((f, i) => {
            console.log(
                `  ${i + 1}. [${f.type}] ${f.label}: ${f.file.substring(0, 60)}...`
            );
        });
    } else {
        console.log('failed:', result2.message);
    }

    console.log('\n=== tests complete ===');
}

testMoviesAPI().catch(console.error);
