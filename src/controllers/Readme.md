# Controllers

Here you can find the followin files:

- [tmdb.js](../helpers/tmdb.js): This file contains the logic to get the data from the TMDB API. You can call `getMovieFromTmdb(tmdbId)` and `getTvFromTmdb(tmdbId)` to get a media object back.
    media:
    ```json
    {
        "type": "media type: movie or tv",
        "title": "media title",
        "releaseYear": "media release year",
        "tmdb": "media tmdb id",
        "imdb": "media imdb id"
    }
    ```

- [providers](./providers/): This folder contains all the providers are being used by the [api.js](../api.js) to get the data from each provider. Each provider has a function called `getControllerName(media)` that should return an object with the following structure:

```json
{
    "files": [
        {
            "file": "url",
            "type": "Specify the type (refer to the /README for details)",
            "lang": "(Specify language using ISO standard; refer to utils/languages.js for available languages)",
            "headers": {
                "description": "If the request to that specific file needs headers (i.e. cookies), specify them here"
            }
        }
    ],
        "subtitles": [
        {
            "url": "the url to the file",
            "lang": "the language of the subtitle file (use ISO standard)",
            "type": "subtitleType (srt, vtt, etc.)"
        }
    ]
}
```