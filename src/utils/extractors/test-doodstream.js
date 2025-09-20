import { extract_doodstream } from './doodstream.js';

const testUrl = 'https://dood.watch/e/m0r3cil6u6t5';

(async function () {
    try {
        const result = await extract_doodstream(testUrl);
    } catch (e) {
        console.error('Failed to Extract From doodstream ' + e);
    }
})();
