// test.js (test script to test Streamtape Resolver
import { extract } from './Extractor.js';

(async () => {
    const url = 'https://streamtape.com/v/ro9YM27Oo4sb1jL'; // your test URL
    const result = await extract(url);

    console.log('Final Extract Result:', result);
})();
