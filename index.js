import express from "express";
import { getMovie, getTv } from "./src/api.js";
import { getMovieFromTmdb, getTvFromTmdb } from "./src/controllers/tmdb.js";
import cors from "cors";
import { strings } from "./src/strings.js";

const PORT = process.env.PORT;
const app = express();

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
  if (isNaN(parseInt(req.params.tmdbId))) {
    res.status(405).json({
      error: strings.INVALID_MOVIE_ID,
      hint: strings.INVALID_MOVIE_ID_HINT,
    });
    return;
  }

  const media = await getMovieFromTmdb(req.params.tmdbId);

  if (media instanceof Error) {
    res.status(405).json({ error: media.message });
    return;
  }

  let output = await getMovie(media);

  if (output === null || output instanceof Error) {
    res.status(404).json({
      error: strings.MOVIE_NOT_FOUND,
      hint: strings.MOVIE_NOT_FOUND_HINT,
    });
  } else {
    res.status(200).json(output);
  }
});

app.get("/tv/:tmdbId", async (req, res) => {
  if (
    !req.params.tmdbId ||
    isNaN(parseInt(req.params.tmdbId)) ||
    !req.query.s ||
    isNaN(parseInt(req.query.s)) ||
    !req.query.e ||
    isNaN(parseInt(req.query.e))
  ) {
    res.status(405).json({
      error: strings.INVALID_TV_ID,
      hint: strings.INVALID_TV_ID_HINT,
    });
    return;
  }

  const media = await getTvFromTmdb(
    req.params.tmdbId,
    req.query.s,
    req.query.e
  );

  if (media instanceof Error) {
    res.status(405).json({ error: media.message });
    return;
  }

  let output = await getTv(media, req.query.s, req.query.e);

  if (output === null || output instanceof Error) {
    res.status(404).json({
      error: strings.TV_NOT_FOUND,
      hint: strings.TV_NOT_FOUND_HINT,
    });
  } else {
    res.status(200).json(output);
  }
});

app.get("/movie/", (req, res) => {
  res.status(405).json({
    error: strings.INVALID_MOVIE_ID,
    hint: strings.INVALID_MOVIE_ID_HINT,
  });
});

app.get("/tv/", (req, res) => {
  res.status(405).json({
    error: strings.INVALID_TV_ID,
    hint: strings.INVALID_TV_ID_HINT,
  });
});

app.get("*", (req, res) => {
  res.status(404).json({ error: "Not found", hint: "Go to /" });
});

app.listen(PORT, () => {
  console.log(`Server is running on port http://localhost:${PORT}`);
});
