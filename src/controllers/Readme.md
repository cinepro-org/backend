# Controllers

Here you can find the followin files:

- [tmdb.js](./tmdb.js): This file contains the logic to get the data from the TMDB API. You can call `getMovieFromTmdb(tmdbId)` and `getTvFromTmdb(tmdbId)` to get a media object back.
    media:
    ```js
    {
        "type": "media type: movie or tv",
        "title": "media title",
        "releaseYear": "media release year",
        "tmdbId": "media tmdb id",
        "imdbId": "media imdb id",
    }
    ```

- [providers](./providers/): This folder contains all the providers are being used by the [api.js](../api.js) to get the data from each provider. Each provider has a function called `getControllerName(media)` that should return an object with the following structure:

```js
{
    provider: "Provider Name",      // This field is required
    sources: [                      // This array is required (leave empty if nothing is found)
        {
            provider: "Friendly Provider Name",
            files: [
                {
                    file: url,
                    type: "Specify the type (refer to the README for details)",
                    quality: "(If possible, indicate the quality; otherwise, use 'unknown')",
                    lang: "(Specify language using ISO standard; refer to utils/languages.js for available languages)"
                },
                headers: {
                    // Include any special headers required for requests here
                }
            ]
        }
    ], 
    subtitles: [  // This array is required (leave empty if nothing is found)
          // If there are subtitles, follow the same format as defined in the README
    ]
}
```