# CinePro Backend

## Description

This repository contains the logic for the Backend of CinePro. It is an **open-source movie and tv show scraper API**. You can get various sources for the movie or tv show you are looking for using this API. It also uses node-cache to store the data it scrapes, so it does not have to scrape the same movie or tv show repeatedly.

> [!Note]
> This project is **not** meant for public hosting (you should not be able to access it over the internet). It is meant to be used as a backend for your own personal use. You can host it on your local machine or on a private server. If you want to use it as a public API, you should consider using a different project, since this project is not optimized/secured for public use.

## Features

- NO ADS and NO TRACKING!
- Supported Media types:
    - Movie
    - TV Show

> [!Warning]
> Since this project is still in development, some features might not work as expected. TV shows are not fully supported yet. It will come after the movie scraping is done.

**Found a bug?** If you encounter bugs, errors, or unexpected behavior, please open a new issue (use one of our bug templates) — or reply to this comment on our Discussions page so we can follow up: https://github.com/cinepro-org/Discussions/discussions/1#discussioncomment-14706483

## API Documentation

The API is documented using the OpenAPI 3.0 specification. The specification file is located at [`openapi.yml`](./openapi.yml) in the project root.

### Viewing the Documentation

You can use various tools to view and interact with the API documentation:

**Online Editors**: You can also use online editors like [Swagger Editor](https://editor.swagger.io/) or [Stoplight Studio](https://stoplight.io/studio) by uploading the [`openapi.yml`](./openapi.yml) file.

### Using the Documentation

The OpenAPI specification provides detailed information about:

- Available endpoints
- Request parameters
- Response schemas
- Error responses

This can be useful for:

- Understanding the API structure
- Generating client libraries
- Testing the API
- Creating mock servers

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

You can use this project for **personal and non-commercial use ONLY**! You are **NOT allowed to sell this project or any part of it and/or add ANY KIND of tracking or advertisement to it.**

## Contributing

We have several Bug templates and Feature Request templates to make it easier for you to contribute. Just open a new issue and select the appropriate template.

If you want to contribute code, please fork the repository and create a new branch for your feature or bugfix.

Feel free to open issues or submit pull requests. Please make sure to follow the existing code style and include tests for any new functionality. To read more about contributing, please refer to the [CONTRIBUTING.md](.github/CONTRIBUTING.md) file.

**Found a bug?** If you encounter bugs, errors, or unexpected behavior, please open a new issue (use one of our bug templates) — or reply to this comment on our Discussions page so we can follow up: https://github.com/cinepro-org/Discussions/discussions/1#discussioncomment-14706483

## Notice

This project is for educational purposes only. We do not host any kind of content. We provide only the links to already
available content on the internet. We do not host, upload any videos, films, or media files. We are not responsible for
the accuracy, compliance, copyright, legality, decency, or any other aspect of the content of other linked sites. If you
have any legal issues, please contact the appropriate media file owners or host sites. And fun fact: If you are law
enforcement, this project might actually help you take sites down, since you can check where the media is hosted on. (
pls don't come and get our asses😔😔)
