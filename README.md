# CinePro Backend

## Description

This repository contains the logic for the Backend of CinePro. It is an open-source movie and tv show scraper API. If you go on specitfic routes, you can get various sources for the movie or tv show you are looking for. It also uses MongoDB to store the data it scrapes, so it can be used as a cache and does not have to scrape the same movie or tv show repeatedly. You can host this API on your own server or use the one we provide. This is stil in early development, so it might not even work when you are reading this.

## Features

- NO ADS and NO TRACKING!
- Supported Media types:
  - Movie
  - TV Show

## Usage

### Routes

#### GET /movie/:tmdbId

This route returns all the scraping information it can find for the movie with the given tmdbId. If the movie is not in the tmdb database, it will return a 404.

#### GET /tv/:tmdbId?s=:season&e=:episode

This route returns all the scraping information it can find for the tv show with the given tmdbId. If the tv show is not in the tmdb database, it will return a 404. If you provide the season and episode query parameters, it will return the information for that specific episode.

### Response

Both routes return a JSON object with the following structure:

```json
{
    "sources": [{                             // is an array of sources for the media (each source is a provider)
        "provider": "providerName",         // is a friendly name for the provider
        "files": [
            {
                "file": "fileUrl",          // is the url to the file (most of the time a .m3u8 file)
                "type": "fileType",         // is the type of the file (hls, mp4 or embed). More information below.
                "quality": "fileQuality",   // is the quality of the file (varies from provider to provider). Can also be unknown.
                "lang": "fileLanguage"      // is the language of the media file (en, fr...). Can also be unknown. More information below.
            }
        ],
        "headers": {
            "Referer": "refererUrl",        // is the url for the referer header. This is most of the time the same as the file url. USE IT TO MAKE REQUESTS TO THE FILE URL! Won't work without it.
            "User-Agent": "userAgent",     // is the user agent for the request. Also recommended for making requests to the file url.
            "Origin": "originUrl"          // is the origin for the request. Also recommended for making requests to the file url.
        }
    }],
    "subtitles": [{                          // is an array of subtitles for the media. This is not provider specific. It lists all subtitles for the media. Most of the time there are several subtitles.
        "url": "subtitleUrl",              // is the url to the subtitle file
        "lang": "subtitleLanguage",        // is the language of the subtitle file (en, fr...)
        "type": "subtitleType"             // is the type of the subtitle file (srt, vtt...)
    }]
}
```

#### More Information

##### File Type

- hls: is a .m3u8 file that can be played with a player that supports HLS (like video.js or hls.js)
- mp4: is a .mp4 file that can be played with a player that supports mp4 (like video.js)
- embed: is a url that can be embedded in an iframe to play the media. Important: Since you are embedding the media, you do NOT have control of what stuff the iframe is loading. (Ads, tracking, etc. might appear).

##### Language

All language values follow the ISO 639-1:2002 standard. You can find more information [here](https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes).

### Example

#### Request

```http
GET /movie/718930 HTTP/1.1
```

```json
{
    "sources": [{
        "provider": "ExampleProvider",
        "files": [
            {
                "file": "http://example.com/file.mp4",
                "type": "mp4",
                "quality": "1080p",
                "lang": "en"
            }
        ],
        "headers": {
            "Referer": "http://example.com",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Origin": "http://example.com"
        }
    }],
    "subtitles": [{
        "url": "http://example.com/subtitle.vtt",
        "lang": "en",
        "type": "vtt"
    }]
}
```

## Installation

### Requirements

- Node.js
- MongoDB

### Steps

1. Clone the repository
2. Install the dependencies with `npm install`
3. Check the `.env.example` file and create a `.env` file with the same structure
4. Start the server with `npm start`
5. The server should now be running on `http://localhost:3000`

## License

You can use this project for **personal and non-commercial use ONLY**! You are **not allowed to sell this project or any part of it and/or add ANY KIND of tracking or advertisement to it.**

## Notice

This project is for educational purposes only. We do not host any kind of content. We provide only the links to already available content on the internet. We do not host, upload any videos, films or media files. We are not responsible for the accuracy, compliance, copyright, legality, decency, or any other aspect of the content of other linked sites. If you have any legal issues please contact the appropriate media file owners or host sites. And fun fact: If you are law enforcement, this project might acctually help you take sites down, since you can easily check where the media is hosted on. (pls dont)
