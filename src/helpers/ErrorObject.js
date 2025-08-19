import { strings } from '../strings.js';

/**
 * Represents an error object that encapsulates details about an error, including
 * its message, provider, response code, hint, and whether it should be sent to the frontend.
 */
export class ErrorObject {
    provider;
    message;
    responseCode;
    hint;
    goesToFrontend;
    issueLink;

    /**
     * Constructs an instance of the ErrorObject class.
     *
     * @param {string} message - The error message.
     * @param {string} provider - The provider where the error occurred (e.g., "backend", "Vidrock").
     * @param {number} responseCode - The HTTP response code associated with the error. Null if not applicable.
     * @param {string} hint - If it goes to the frontend this is the hint to help extract the error. In the backend it is a note/hint for the developer of what could be the cause of the error.
     * @param {boolean} goesToFrontend - Whether the error should be sent to the frontend. Also influences the format of the error.
     * @param {boolean} issueLink - Whether to include an issue reporting link in the error.
     */
    constructor(
        message,
        provider,
        responseCode,
        hint,
        goesToFrontend = false,
        issueLink = false
    ) {
        this._message = message || 'Unknown error';
        this._provider = provider || 'backend';
        this._responseCode = responseCode || 500;
        this._hint = hint || 'No hint available';
        this._goesToFrontend = goesToFrontend;
        this._issueLink = issueLink;
    }

    /**
     * Gets the error message.
     * @returns {string} The error message.
     */
    get message() {
        return this._message;
    }

    /**
     * Sets the error message.
     * @param {string} value - The new error message.
     */
    set message(value) {
        this._message = value;
    }

    /**
     * Gets the provider where the error occurred.
     * @returns {string} The provider name.
     */
    get provider() {
        return this._provider;
    }

    /**
     * Sets the provider where the error occurred.
     * @param {string} value - The new provider name.
     */
    set provider(value) {
        this._provider = value;
    }

    /**
     * Gets the HTTP response code associated with the error.
     * @returns {number} The response code.
     */
    get responseCode() {
        return this._responseCode;
    }

    /**
     * Sets the HTTP response code associated with the error.
     * @param {number} value - The new response code.
     */
    set responseCode(value) {
        this._responseCode = value;
    }

    /**
     * Gets the hint to help extract the error.
     * @returns {string} The hint.
     */
    get hint() {
        return this._hint;
    }

    /**
     * Sets the hint to help extract the error.
     * @param {string} value - The new hint.
     */
    set hint(value) {
        this._hint = value;
    }

    /**
     * Gets whether the error should be sent to the frontend.
     * @returns {boolean} True if the error should be sent to the frontend, false otherwise.
     */
    get goesToFrontend() {
        return this._goesToFrontend;
    }

    /**
     * Sets whether the error should be sent to the frontend.
     * @param {boolean} value - True if the error should be sent to the frontend, false otherwise.
     */
    set goesToFrontend(value) {
        this._goesToFrontend = value;
    }

    /**
     * Gets whether to include an issue reporting link in the error.
     * @returns {boolean} True if the issue link should be included, false otherwise.
     */
    get issueLink() {
        return this._issueLink;
    }

    /**
     * Sets whether to include an issue reporting link in the error.
     * @param {boolean} value - True if the issue link should be included, false otherwise.
     */
    set issueLink(value) {
        this._issueLink = value;
    }

    /**
     * Converts the error object to a string representation.
     * @returns {string} The error message.
     */
    toString() {
        if (this._hint) {
            return `============ERROR============\n[${this._provider}] ${this._message}\nPossible cause: ${this._hint}\n============END ERROR============\n\n\n`;
        }
        return `============ERROR============\n[${this._provider}] ${this._message}\n============END ERROR============\n\n\n`;
    }

    /**
     * Converts the error object to a JSON representation.
     * @returns {Object} A JSON object containing error details.
     */
    toJSON() {
        if (this._goesToFrontend && this._issueLink) {
            return {
                message: this._message,
                location_key: this._provider,
                response: this._responseCode,
                hint: this._hint,
                reportTo:
                    'Please report this error and as many details as possible to us by using this link: ' +
                    strings.DEFAULT_ISSUE_LINK,
                error: true
            };
        } else if (this._goesToFrontend) {
            return {
                message: this._message,
                response: this._responseCode,
                location_key: this._provider,
                hint: this._hint,
                error: true
            };
        } else {
            return {
                message: this._message,
                location_key: this._provider,
                'what could be the cause?': this._hint
            };
        }
    }
}
