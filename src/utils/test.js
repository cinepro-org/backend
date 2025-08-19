// test.js (test script to test Extractors ( Amma be Honest This logging is much better than debug )
import { extract } from './Extractor.js';

(async () => {
    // your test Url
    const url = 'https://bigwarp.cc/bxr5szzn1wqm';
    const result = await extract(url);

    console.log('Final Extract Result:', result);
})();
