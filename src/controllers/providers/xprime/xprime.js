import { languageMap } from "../../../utils/languages.js";
import { ErrorObject } from "../../../helpers/ErrorObject.js";

const DOMAIN = "https://xprime.tv/";
const BACKEND_DOMAIN = "https://backend.xprime.tv/";

export async function getXprime(media) {
  try {
    let status = await fetch(DOMAIN + "servers", {
      headers: {
        Accept: "*/*",
        Referer: DOMAIN + "watch/" + media.tmdb,
        Origin: DOMAIN,
      },
    });

    if (status.status !== 200) {
      return new ErrorObject(
        "Could not fetch status",
        "Xprime",
        status.status,
        "Check if the server is accessible or if Cloudflare is blocking the request.",
        true,
        true
      );
    }

    status = await status.json();
    let servers = status.servers;

    if (!servers || servers.length === 0) {
      return new ErrorObject(
        "No servers available",
        "Xprime",
        404,
        "The server list is empty. Ensure the media exists or the API is functioning correctly.",
        true,
        true
      );
    }

    let files = [];
    let subtitles = [];
    let errors = [];

    for (let server of servers) {
      if (server.status !== "ok") {
        return new ErrorObject(
          `Server ${server.name} is not operational`,
          "Xprime",
          500,
          "The server status is not 'ok'.",
          true,
          true
        );
      }

      switch (server.name) {
        case "nas":
          let nas = await handleNas(media);
          if (nas instanceof ErrorObject) {
            errors.push(nas);
            break;
          }
          files.push(...nas.files);
          subtitles.push(...nas.subtitles);
          break;

        case "primenet":
          let url = await fetch(DOMAIN + `primenet?id=${media.tmdb}`, {
            headers: {
              Accept: "*/*",
              Referer: DOMAIN + "watch/" + media.tmdb,
              Origin: DOMAIN,
            },
          });
          if (url.ok) continue;
          url = await url.json();
          files.push(
            ...{
              file: url.url,
              lang: "en",
              type: "hls",
            }
          );
          break;

        case "primebox":
          let primebox = await handlePrimebox(media);
          if (primebox instanceof ErrorObject) {
            errors.push(primebox);
            break;
          }
          files.push(...primebox.files);
          subtitles.push(...primebox.subtitles);
          break;
      }
    }

    let volkswagen = await handleVolkswagen(media);
    if (volkswagen instanceof ErrorObject) {
      errors.push(volkswagen);
    } else {
      files.push(...volkswagen.files);
      subtitles.push(...volkswagen.subtitles);
    }

    if (process.argv.includes("--debug")) {
      for (let error in errors) {
        console.error(error.toString());
      }
    }

    if (files.length === 0) {
      return new ErrorObject(
        "No valid files found",
        "Xprime",
        404,
        "No valid streams were found. Check the server responses or media availability.",
        true,
        true
      );
    }

    return {
      files: files.map((file) => ({
        file: file.file,
        type: file.type,
        lang: file.lang,
        headers: file.headers,
      })),
      subtitles: subtitles.map((subtitle) => ({
        url: subtitle.url,
        lang: subtitle.lang,
        type: subtitle.type,
      })),
    };
  } catch (error) {
    return new ErrorObject(
      `Unexpected error: ${error.message}`,
      "Xprime",
      500,
      "Check the implementation or server status.",
      true,
      true
    );
  }
}

function handleSuccess(data, lang) {
  const files = [];
  const subtitles = [];

  // Process streams (quality files)
  for (const quality in data.streams) {
    files.push({
      file: data.streams[quality],
      type: "mp4",
      lang: lang,
      quality: quality,
      headers: {
        Referer: DOMAIN,
      },
    });
  }

  // Process subtitles
  if (data.has_subtitles && data.subtitles) {
    data.subtitles.forEach((subtitle) => {
      subtitles.push({
        url: subtitle.file,
        lang: languageMap[subtitle.label.split(" ")[0]] || subtitle.label,
        type: subtitle.file.split(".").pop().slice(0, 3),
      });
    });
  }

  return { files, subtitles };
}

async function handleNas(media) {
  try {
    const url = `${DOMAIN}nas?imdb=${media.imdb}`;
    console.log(`Fetching URL: ${url}`); // Log the URL for debugging

    let data = await fetch(url, {
      headers: {
        Accept: "*/*",
      },
    });

    if (!data.ok) {
      console.error(`Fetch failed with status: ${data.status}`);
      return new ErrorObject(
        "Failed to fetch nas",
        "xprime - nas",
        data.status,
        "Check if the URL is valid or the server is accessible.",
        true,
        true
      );
    }

    data = await data.json();
    if (data.status !== "ok") {
      return new ErrorObject(
        "Nas reported: " + data.details,
        "xprime - nas",
        404,
        undefined,
        true,
        false
      );
    }

    return handleSuccess(data, "en");
  } catch (error) {
    console.error(`Error during fetch: ${error.message}`);
    return new ErrorObject(
      `Unexpected error: ${error.message}`,
      "xprime - nas",
      500,
      "An unexpected error occurred while fetching nas.",
      true,
      true
    );
  }
}

async function handlePrimebox(media) {
  let data = await fetch(
    DOMAIN + `primebox?name=${media.title}&year=${media.releaseYear}`,
    {
      headers: {
        Accept: "*/*",
        Referer: DOMAIN + "watch/" + media.tmdb,
        Origin: DOMAIN,
      },
    }
  );
  if (!data.ok) {
    return new ErrorObject(
      "Failed to fetch primebox",
      "xprime - primebox",
      data.status,
      "check if valid url",
      true,
      true
    );
  }
  data = await data.json();
  if (data.status !== "ok") {
    return new ErrorObject(
      "primebox reported: " + data.details,
      "xprime - primebox",
      404,
      undefined,
      true,
      false
    );
  }
  return handleSuccess(data, "en");
}

async function handleVolkswagen(media) {
  let data = await fetch(
    BACKEND_DOMAIN + `volkswagen?name=${media.title}&year=${media.releaseYear}`,
    {
      headers: {
        Accept: "*/*",
        Referer: DOMAIN + "watch/" + media.tmdb,
        Origin: DOMAIN,
      },
    }
  );
  if (!data.ok) {
    return new ErrorObject(
      "Failed to fetch volkswagen",
      "xprime - volkswagen",
      data.status,
      "check if valid url",
      true,
      true
    );
  }
  data = await data.json();
  if (data.status !== "ok") {
    return new ErrorObject(
      "volkswagen reported: " + data.details,
      "xprime - volkswagen",
      404,
      undefined,
      true,
      false
    );
  }
  return handleSuccess(data, "de");
}
