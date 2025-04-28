# CinePro Backend

## Description

This repository contains the logic for the Backend of CinePro. It is an open-source movie and tv show scraper API. If
you go on specitfic routes, you can get various sources for the movie or tv show you are looking for. It also uses
MongoDB to store the data it scrapes, so it can be used as a cache and does not have to scrape the same movie or tv show
repeatedly. You can host this API on your own server or use the one we provide. This is stil in early development, so it
might not even work when you are reading this.

## Features

- NO ADS and NO TRACKING!
- Supported Media types:
    - Movie
    - TV Show

> [!Warning]
> Since this project is still in development, some features might not work as expected. TV shows are not fully supported
> yet. It will come after the movie scraping is done.

## Usage

### Routes

#### GET /movie/:tmdbId

This route returns all the scraping information it can find for the movie with the given tmdbId. If the movie is not in
the tmdb database, it will return a 405.

#### GET /tv/:tmdbId?s=:season&e=:episode

This route returns all the scraping information it can find for the tv show with the given tmdbId. If the tv show is not
in the tmdb database or you did not specify a required field, it will return a 405.

### Response

Both routes return a JSON object with the following structure:

```json
{
  "files": [
    {
      "file": "url",
      "type": "file type (hls, mp4, embed)",
      "lang": "(Specify language using an ISO standard; refer to utils/languages.js for available languages)"
    }
  ],
  "subtitles": [
    {
      "url": "the url to the file",
      "lang": "the language of the subtitle file (use an ISO standard)",
      "type": "subtitleType (srt, vtt, etc.)"
    }
  ]
}
```

#### More Information

> [!Note]
> It can be that some files require specific headers to be played. Instead of moving that problem to the frontend,
> CinePro should automatically route the request with a headers param to the proxy endpoint. On the frontend, you can
> then
> use the proxy endpoint to play the media. This is not implemented yet!!

##### File Types

- hls: is a .m3u8 file that can be played with a player that supports HLS (like video.js or hls.js)
- mp4: is a .mp4 file that can be played with a player that supports mp4 (like video.js)
- embed: is an url that can be embedded in an iframe to play the media. Important: Since you are embedding the media,
  you do NOT have control of what stuff the iframe is loading. (Ads, tracking, etc. might appear/happen). It can also be
  that embedding is restricted to certain domains. That is a ~pain in the ass~, but you can't do anything about it.

##### Language

All language values follow the ISO 639-1:2002 standard. You can find more
information [here](https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes). When using this project as a backend,
consider checking the `languages.js` file in the `utils` folder. It contains a list of all languages that are supported
by the project. (Possible return values for the `lang` field in the response).

### Example

#### Request

```http
GET /movie/718930 HTTP/1.1
```

```json
{
  "files": [
    {
      "file": "https://example.com/file.mp4",
      "type": "mp4",
      "lang": "en"
    },
    {
      "file": "https://example.com/file.m3u8",
      "type": "hls",
      "lang": "en"
    },
    {
      "file": "https://example.com/embed",
      "type": "embed",
      "lang": "en"
    }
  ],
  "subtitles": [
    {
      "url": "https://example.com/subtitle.srt",
      "lang": "en",
      "type": "srt"
    }
  ]
}
```

## Installation

### Requirements

- Node.js

### Steps

1. Clone the repository
2. Install the dependencies with `npm install`
3. Check the `.env.example` file and create a `.env` file with the same structure
4. Start the server with `npm start`
5. The server should now be running on `http://localhost:3000`

## License

You can use this project for **personal and non-commercial use ONLY**! You are **NOT allowed to sell this project or any
part of it and/or add ANY KIND of tracking or advertisement to it.**

## Notice

This project is for educational purposes only. We do not host any kind of content. We provide only the links to already
available content on the internet. We do not host, upload any videos, films, or media files. We are not responsible for
the accuracy, compliance, copyright, legality, decency, or any other aspect of the content of other linked sites. If you
have any legal issues, please contact the appropriate media file owners or host sites. And fun fact: If you are law
enforcement, this project might actually help you take sites down, since you can check where the media is hosted on. (
pls don't come and get our asses😔😔)
