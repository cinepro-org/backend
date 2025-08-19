/**
 * @description Check if the given text could be a valid TMDB ID.
 * @param text {string} The text to check.
 * @returns {boolean} True if the text could be a valid TMDB ID, false otherwise.
 *
 * @example
 * // checkIfPossibleTmdbId("155"); // true
 * // checkIfPossibleTmdbId("1234567890abc"); // false
 */
export function checkIfPossibleTmdbId(text) {
    let regex = /^[0-9]+$/;
    return regex.test(text);
}

/**
 * @description Handle error response.
 * @param res {Response} The response object.
 * @param errorObject {ErrorObject} The error object to handle.
 */
export function handleErrorResponse(res, errorObject) {
    res.status(errorObject._responseCode).json(errorObject.toJSON());
}
