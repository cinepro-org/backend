import { ErrorObject } from '../helpers/ErrorObject.js';

export function startup() {
    // check required env keys
    const TMDB_API_KEY =
        process.env.TMDB_API_KEY ||
        (() => {
            throw new ErrorObject(
                'Missing TMDB_API_KEY environment variable',
                'system',
                500,
                'Please set the TMDB_API_KEY environment variable',
                true,
                false
            );
        });

    const PORT = process.env.PORT;
    if (!PORT) {
        throw new ErrorObject(
            'Missing PORT environment variable',
            'system',
            500,
            'Please set the PORT environment variable',
            true,
            false
        );
    }
}
