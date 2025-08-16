import axios from "axios";
import * as cheerio from "cheerio";
import * as crypto from "crypto";
import fetch from "node-fetch";
import { extract } from "../../../utils/Extractor.js";
import { ErrorObject } from "../../../helpers/ErrorObject.js";

const URL = "https://www.primewire.tf";
const DS_KEY = "JyjId97F9PVqUPuMO0";


export async function getPrimewire(media) {
  if (!media.imdb) {
    return new ErrorObject(
      "Primewire requires an IMDB ID",
      "Primewire",
      500,
      "Please provide an IMDB ID from the tmdb.js file",
      true,
      true
    );
  }

  const link = await lookupPage(media);
  if (link instanceof ErrorObject) {
    return link;
  }

  const servers = await loadServers(link);
  if (servers instanceof ErrorObject) {
    return servers;
  }

  const embeddableServers = await Promise.all(
    servers.map(async (server) => {
      const result = await extract(server);
      if (result instanceof ErrorObject) {
        return null;
      }
      return result;
    })
  );

  const files = embeddableServers
    .filter((embedLink) => embedLink && embedLink.file)
    .map((embedLink) => ({
      file: embedLink.file,
      type: embedLink.type,
      lang: "en",
      ...(embedLink.headers && { headers: embedLink.headers }),

    }));

  return {
    files: files.map((file) => {
      const result = {
        file: file.file,
        type: file.type,
        lang: file.lang,
      };
      if (file.headers) {
        result.headers = file.headers;
      }
      return result;
    }),
    subtitles: [],
  };
}

async function lookupPage(info) {
  const imdbId = info.imdb;
  const ds = sha1Hex(`${imdbId}${DS_KEY}`).slice(0, 10);

  try {
    const response = await axios.get(`${URL}/filter`, {
      params: { s: imdbId, ds },
    });
    const $ = cheerio.load(response.data);
    const originalLink = $(".index_container .index_item.index_item_ie a").attr(
      "href"
    );

    if (!originalLink) {
      return new ErrorObject(
        `No search results found for IMDB ID: ${imdbId}`,
        "Primewire",
        404,
        "Ensure the IMDB ID is correct or the content exists on Primewire.",
        true,
        true
      );
    }

    return info.type === "tv"
      ? `${URL}${originalLink.replace("-", "/", 1)}-season-${
          info.season
        }-episode-${info.episode}`
      : `${URL}${originalLink}`;
  } catch (error) {
    return new ErrorObject(
      `Error fetching data for IMDB ID: ${imdbId}`,
      "Primewire",
      500,
      "Check the network connection or Primewire's availability.",
      true,
      true
    );
  }
}

async function loadServers(link) {
  try {
    let website = await fetch(link);
    website = await website.text();
    const urls = Array.from(website.matchAll(/data-wp-menu="(.+?)"/g)).map(
      (match) => ({
        url: `https://primewire.tf/links/gos/${match[1]}`,
        idx: match[1],
      })
    );

    const embeds = [];
    for (const item of urls) {
      const response = await axios.get(item.url);
      const location = `https://${response.request.host}${response.request.path}`;
      embeds.push(location);
    }
    return embeds;
  } catch (error) {
    return new ErrorObject(
      `Error loading servers for link: ${link}`,
      "Primewire",
      500,
      "Check the link or Primewire's server response.",
      true,
      true
    );
  }
}

function sha1Hex(str) {
  return crypto.createHash("sha1").update(str).digest("hex");
}
