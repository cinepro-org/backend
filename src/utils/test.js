// test.js (test script to test Streamtape Resolver
import { extract } from './Extractor.js';

(async () => {
    const url = 'https://bigwarp.cc/bxr5szzn1wqm'; // your test URL
    const result = await extract(url);

    console.log('Final Extract Result:', result);
})();
