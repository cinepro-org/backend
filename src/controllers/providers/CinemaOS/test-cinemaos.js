import { getCinemaOS } from './CinemaOS1.js';

async function testCinemaOS() {
    console.log('=== Testing CinemaOS HTML Extraction ===\n');

    const movieMedia = {
        tmdb: '755898' // War of the Worlds (2025) - from your HTML
    };

    console.log('Testing with movie TMDB ID:', movieMedia.tmdb);

    try {
        const result = await getCinemaOS(movieMedia);

        if (result.error) {
            console.log('Error:', result.message);
        } else {
            console.log('Success!');
            console.log('Video URL:', result.files.file);
        }
    } catch (error) {
        console.error('Unexpected error:', error.message);
    }
}

testCinemaOS();
