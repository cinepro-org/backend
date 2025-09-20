import { extract_voesx } from './voesx.js';

const testUrl = 'https://voe.sx/e/e22zlshxgm8b';
(async () => {
    try {
        const result = await extract_voesx(testUrl);
        console.log(result);
    } catch (e) {
        console.error('Extraction Error: ', e);
    }
})();
