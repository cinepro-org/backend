export const strings = {
    HOME_NAME: 'CinePro API',
    ROUTES: {
        MOVIE: '/movie/:tmdbID',
        TV: '/tv/:tmdbID?s=seasonNumber&e=episodeNumber'
    },
    INFORMATION:
        'This project is for educational purposes only. We do not host any kind of content. We provide only the links to already available content on the internet. We do not host, upload any videos, films or media files. We are not responsible for the accuracy, compliance, copyright, legality, decency, or any other aspect of the content of other linked sites. If you have any legal issues please contact the appropriate media file owners or host sites.',
    LICENSE:
        'You can use this project for personal and NON-COMMERCIAL use ONLY! You are NOT allowed to SELL this project or any part of it and/or ADD ANY KIND of tracking or advertisement to it.',
    SOURCE: 'https://GitHub.com/cinepro-org/backend',
    INVALID_MOVIE_ID: 'Invalid movie id',
    INVALID_MOVIE_ID_HINT:
        'Check the documentation again to see how to use this endpoint',
    MOVIE_NOT_FOUND: 'Did not find any sources for this one :(',
    MOVIE_NOT_FOUND_HINT: function () {
        return `If you know where to find this movie and know programming feel free to join us on GitHub: ${this.SOURCE} to add it.`;
    },
    INVALID_TV_ID: 'Invalid tv id, season, or episode number',
    INVALID_TV_ID_HINT:
        'Check the documentation again to see how to use this endpoint',
    TV_NOT_FOUND: 'Did not find any sources for this one :(',
    TV_NOT_FOUND_HINT: function () {
        return `If you know where to find this movie and know programming feel free to join us on GitHub: ${this.SOURCE} to add it.`;
    },
    DEFAULT_ISSUE_LINK:
        'https://github.com/cinepro-org/backend/issues/new/choose',
    ROUTE_NOT_FOUND: '404 not found',
    ROUTE_NOT_FOUND_HINT:
        'Check the documentation again to see how to use this endpoint'
};
