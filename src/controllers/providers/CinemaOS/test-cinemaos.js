import { getCinemaOS } from './CinemaOS.js';

async function testCinemaOS() {
    console.log('=== Testing CinemaOS Provider ===\n');

    // Test with movie from Python example
    const movieMedia = {
        tmdb: '1061474' // Movie from Python code
    };

    console.log('Testing with movie TMDB ID:', movieMedia.tmdb);

    try {
        const result = await getCinemaOS(movieMedia);

        if (result.message) {
            console.log('\n❌ Error:', result.message);
            console.log('Hint:', result.hint);
        } else {
            console.log('\n✅ Success! Found', result.files.length, 'sources');
            console.log('\nSources:');
            result.files.forEach((file, index) => {
                console.log(`\n[${index + 1}] ${file.file}`);
                console.log(`    Type: ${file.type}`);
                console.log(`    Language: ${file.lang}`);
            });
        }
    } catch (error) {
        console.error('\n❌ Unexpected error:', error.message);
        console.error(error.stack);
    }
}

testCinemaOS();
