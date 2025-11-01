import fetch from 'node-fetch';
import { ErrorObject } from '../../helpers/ErrorObject.js';

export const extract_mixdrop = async (id) => {
    try {
        // Use the correct domain
        const resp = await fetch('https://mixdrop.ag/e/' + id);

        // Get cookies
        const cookieHeader = resp.headers.get('set-cookie');
        const cookie = cookieHeader ? cookieHeader.split(',')[0] : '';

        // Get page HTML
        const html = await resp.text();

        // Extract the eval function content
        const evalMatch = html.match(
            /eval\(function\(p,a,c,k,e,d\){.*?}\((.*?)\)\)/s
        );

        if (!evalMatch) {
            throw new Error('Could not find eval function in page');
        }

        // Deobfuscate the packed JavaScript
        const evalCode = evalMatch[0];

        // Create a sandbox environment with MDCore
        const sandbox = {
            MDCore: {}
        };

        // Execute in sandbox to populate MDCore
        const fullCode = `
            var MDCore = {};
            ${evalCode};
            return MDCore;
        `;

        const deobfuscated = new Function(fullCode)();

        // Now extract from the MDCore object
        const url = deobfuscated.wurl;
        const referer = deobfuscated.referrer || '';

        if (!url) {
            throw new Error('Could not extract video URL from page');
        }

        // Make sure URL has protocol
        let finalUrl = url;
        if (!finalUrl.startsWith('http')) {
            finalUrl = 'https:' + finalUrl;
        }

        // Default referer if empty
        let finalReferer = referer.trim();
        if (!finalReferer || finalReferer.length === 0) {
            finalReferer = 'https://mixdrop.ag/';
        }

        return {
            url: finalUrl,
            headers: {
                cookie: cookie,
                Referer: finalReferer
            }
        };
    } catch (error) {
        console.error('[Mixdrop] Extract error:', error.message);
        return new ErrorObject(
            'Failed to extract video from Mixdrop',
            'Mixdrop Extractor',
            500,
            error.message,
            true,
            true
        );
    }
};
