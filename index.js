import express from "express";
import { getMovie, getTv } from "./src/api.js";
import { getMovieFromTmdb, getTvFromTmdb } from "./src/helpers/tmdb.js";
import cors from "cors";
import { strings } from "./src/strings.js";
import {checkIfPossibleTmdbId, handleErrorResponse} from "./src/helpers/helper.js";
import {ErrorObject} from "./src/helpers/ErrorObject.js";

const PORT = process.env.PORT;
const app = express();
const debugMode = process.env.DEBUG.toLowerCase() === "true" || process.env.DEBUG === "1"

app.use(cors());

app.get("/", (req, res) => {
  res.status(200).json({
    home: strings.HOME_NAME,
    routes: strings.ROUTES,
    information: strings.INFORMATION,
    license: strings.LICENSE,
    source: strings.SOURCE,
  });
});

app.get("/movie/:tmdbId", async (req, res) => {
  if (!checkIfPossibleTmdbId(req.params.tmdbId)) {
    return handleErrorResponse(res, new ErrorObject(strings.INVALID_MOVIE_ID, "user", 405, strings.INVALID_MOVIE_ID_HINT, true, false));
  }

  const media = await getMovieFromTmdb(req.params.tmdbId);
  if (media instanceof ErrorObject) {
    return handleErrorResponse(res, media);
  }

  const output = await getMovie(media);
  if (output instanceof ErrorObject) {
    return handleErrorResponse(res, output);
  }

  res.status(200).json(output);
});

app.get("/tv/:tmdbId", async (req, res) => {
  if (!checkIfPossibleTmdbId(req.params.tmdbId) || !checkIfPossibleTmdbId(req.query.s) || !checkIfPossibleTmdbId(req.query.e)) {
    return handleErrorResponse(res, new ErrorObject(strings.INVALID_TV_ID, "user", 405, strings.INVALID_TV_ID_HINT, true, false));
  }

  const media = await getTvFromTmdb(req.params.tmdbId, req.query.s, req.query.e);
  if (media instanceof ErrorObject) {
    return handleErrorResponse(res, media);
  }

  const output = await getTv(media);
  if (output instanceof ErrorObject) {
    return handleErrorResponse(res, output);
  }

  res.status(200).json(output);
});

app.get("/movie/", (req, res) => {
  handleErrorResponse(res, new ErrorObject(strings.INVALID_MOVIE_ID, "user", 405, strings.INVALID_MOVIE_ID_HINT, true, false));
});

app.get("/tv/", (req, res) => {
  handleErrorResponse(res, new ErrorObject(strings.INVALID_TV_ID, "user", 405, strings.INVALID_TV_ID_HINT, true, false));
});

app.get("*", (req, res) => {
  handleErrorResponse(res, new ErrorObject(strings.ROUTE_NOT_FOUND, "user", 404, strings.ROUTE_NOT_FOUND_HINT, true, false));
});

app.listen(PORT, () => {
  console.log(`Server is running on port http://localhost:${PORT};`);
  if (debugMode) {
        console.log(`Debug mode is enabled.`);
  } else {
        console.log("Debug mode is disabled.");
  }
});
