import express from "express";
import cors from "cors";
import fetch from "node-fetch";


// Add as needed the orbit proxy and proxy-uira.live I saw in another issue
const PROXY_DOMAINS = [
  "hls1.vid1.site",
  "orbitproxy.cc",
  "hls3.vid1.site",
  "hls2.vid1.site",
  "proxy-m3u8.uira.live",
];

// defaultt user agent i think adding the user agent in the url it self wil mess things up
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// We will at first Check if url needs proxying
function needsProxy(url) {
  try {
    const urlObj = new URL(url);
    return PROXY_DOMAINS.some((domain) => urlObj.hostname.includes(domain));
  } catch {
    return false;
  }
}

function extractOriginalUrl(proxyUrl) {
  try {
    const url = new URL(proxyUrl);

    // right now only for hls1.vid1.site/proxy/ and hls3.vid1.site/proxy/ because they are the ones that has not been working...
    if (
      (url.hostname === "hls1.vid1.site" ||
        url.hostname === "hls3.vid1.site") &&
      url.pathname.startsWith("/proxy/")
    ) {
      const encodedUrl = url.pathname.replace("/proxy/", "");
      return decodeURIComponent(encodedUrl);
    }

    if (url.searchParams.has("url")) {
      return decodeURIComponent(url.searchParams.get("url"));
    }

    return proxyUrl; // we will Return as-is if no proxy pattern found
  } catch {
    return proxyUrl;
  }
}

export function createProxyRoutes(app) {

  // M3U8 Proxy endpoint main this is main thing which I am scared of...
  app.get("/m3u8-proxy", cors(), async (req, res) => {
    const targetUrl = req.query.url;
    let headers = {};

    try {
      headers = JSON.parse(req.query.headers || "{}");
    } catch (e) {
      console.log("Invalid headers JSON:", req.query.headers);
    }

    if (!targetUrl) {
      return res.status(400).json({ error: "URL parameter is required" });
    }

    try {
      console.log(`[M3U8 Proxy] Fetching: ${targetUrl}`);

      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": DEFAULT_USER_AGENT,
          ...headers,
        },
      });

      if (!response.ok) {
        return res.status(response.status).json({
          error: `Failed to fetch M3U8: ${response.status}`,
        });
      }

      let m3u8Content = await response.text();

      const lines = m3u8Content.split("\n");
      const newLines = [];

      for (const line of lines) {
        if (line.startsWith("#")) {
          // encryption keys sooo this is a bit tricky
          if (line.startsWith("#EXT-X-KEY:")) {
            const regex = /https?:\/\/[^""\s]+/g;
            const keyUrl = regex.exec(line)?.[0];
            if (keyUrl) {
              const proxyUrl = `/ts-proxy?url=${encodeURIComponent(
                keyUrl
              )}&headers=${encodeURIComponent(JSON.stringify(headers))}`;
              newLines.push(line.replace(keyUrl, proxyUrl));
            } else {
              newLines.push(line);
            }
          } else {
            newLines.push(line);
          }
        } else if (line.trim()) {

          // Segment URLs 
          try {
            const segmentUrl = new URL(line, targetUrl).href;
            const proxyUrl = `/ts-proxy?url=${encodeURIComponent(
              segmentUrl
            )}&headers=${encodeURIComponent(JSON.stringify(headers))}`;
            newLines.push(proxyUrl);
          } catch {
            newLines.push(line); // we will in case Keep original if URL parsing fails
          }
        } else {
          newLines.push(line); // Keep empty lines
        }
      }

      // We will also need to Set response headers to add proper content support for HLS

      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "*");
      res.setHeader("Access-Control-Allow-Methods", "*");

      res.send(newLines.join("\n"));
    } catch (error) {
      console.error("[M3U8 Proxy Error]:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // TS/Segment Proxy endpoint
  app.get("/ts-proxy", cors(), async (req, res) => {
    const targetUrl = req.query.url;
    let headers = {};

    try {
      headers = JSON.parse(req.query.headers || "{}");
    } catch (e) {
      console.log("Invalid headers JSON:", req.query.headers);
    }

    if (!targetUrl) {
      return res.status(400).json({ error: "URL parameter is required" });
    }

    try {
      console.log(`[TS Proxy] Fetching: ${targetUrl}`);

      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": DEFAULT_USER_AGENT,
          ...headers,
        },
      });

      if (!response.ok) {
        return res.status(response.status).json({
          error: `Failed to fetch segment: ${response.status}`,
        });
      }

      // Set response headers for the segment file to treat as it as a segmentsssssss
      res.setHeader("Content-Type", "video/mp2t");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "*");
      res.setHeader("Access-Control-Allow-Methods", "*");

      // Stream the response
      response.body.pipe(res);
    } catch (error) {
      console.error("[TS Proxy Error]:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // HLS Proxy endpoint it will get url as query parameter and headers as well
  app.get("/proxy/hls", cors(), async (req, res) => {
    const targetUrl = req.query.link;
    let headers = {};

    try {
      headers = JSON.parse(req.query.headers || "{}");
    } catch (e) {
      console.log("Invalid headers JSON for HLS proxy:", req.query.headers);
    }

    if (!targetUrl) {
      return res.status(400).json({ error: "Link parameter is required" });
    }

    try {
      console.log(`[HLS Proxy] Fetching: ${targetUrl}`);
      console.log(`[HLS Proxy] Headers: ${JSON.stringify(headers)}`);

      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent": DEFAULT_USER_AGENT,
          ...headers,
        },
      });

      if (!response.ok) {
        console.log(`[HLS Proxy] Error: ${response.status} for ${targetUrl}`);
        return res.status(response.status).json({
          error: `Failed to fetch HLS: ${response.status}`,
        });
      }

      let m3u8Content = await response.text();

      const lines = m3u8Content.split("\n");
      const newLines = [];

      for (const line of lines) {
        if (line.startsWith("#")) {
          // Handle encryption keys
          if (line.startsWith("#EXT-X-KEY:")) {
            const regex = /https?:\/\/[^""\s]+/g;
            const keyUrl = regex.exec(line)?.[0];
            if (keyUrl) {
              const proxyUrl = `/ts-proxy?url=${encodeURIComponent(
                keyUrl
              )}&headers=${encodeURIComponent(JSON.stringify(headers))}`;
              newLines.push(line.replace(keyUrl, proxyUrl));
            } else {
              newLines.push(line);
            }
          } else {
            newLines.push(line);
          }
        } else if (line.trim()) {
          // Handle segment URLs
          try {
            const segmentUrl = new URL(line, targetUrl).href;
            const proxyUrl = `/ts-proxy?url=${encodeURIComponent(
              segmentUrl
            )}&headers=${encodeURIComponent(JSON.stringify(headers))}`;
            newLines.push(proxyUrl);
          } catch {
            newLines.push(line); // Keep original if URL parsing fails
          }
        } else {
          newLines.push(line); // Keep empty lines
        }
      }

      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "*");
      res.setHeader("Access-Control-Allow-Methods", "*");

      console.log(`[HLS Proxy] Successfully proxied HLS for: ${targetUrl}`);
      res.send(newLines.join("\n"));
    } catch (error) {
      console.error("[HLS Proxy Error]:", error.message);
      res.status(500).json({ error: error.message });
    }
  });
}

export function processApiResponse(apiResponse, serverUrl) {
  if (!apiResponse.files) return apiResponse;

  const processedFiles = apiResponse.files.map((file) => {
    if (!file.file || typeof file.file !== "string") return file;

    // Check if this is an external proxy URL that we want to replace
    if (needsProxy(file.file)) {
      const originalUrl = extractOriginalUrl(file.file);
      const urlObj = new URL(file.file);

      // Only process hls1.vid1.site, hls2.vid1.site, and hls3.vid1.site URLs
      if (
        urlObj.hostname === "hls1.vid1.site" ||
        urlObj.hostname === "hls2.vid1.site" ||
        urlObj.hostname === "hls3.vid1.site"
      ) {
        // Use the M3U8's origin as the referer, not the provider's domain
        const m3u8Origin = new URL(originalUrl).origin;
        console.log(`[HLS Proxy Replacement] Original URL: ${originalUrl}`);
        console.log(`[HLS Proxy Replacement] M3U8 Origin: ${m3u8Origin}`);

        const proxyHeaders = {
          Referer: m3u8Origin,
          Origin: m3u8Origin,
        };

        const localProxyUrl = `${serverUrl}/proxy/hls?link=${encodeURIComponent(
          originalUrl
        )}&headers=${encodeURIComponent(JSON.stringify(proxyHeaders))}`;

        console.log(`[HLS Proxy Replacement] ${file.file} -> ${localProxyUrl}`);
        console.log(`[HLS Proxy Headers] ${JSON.stringify(proxyHeaders)}`);

        return {
          ...file,
          file: localProxyUrl,
          type: "hls",
          headers: proxyHeaders,
        };
      }
    }

    // For non-proxy URLs, also fix the referer if it's pointing to the wrong domain
    if (file.file && file.file.includes(".m3u8") && file.headers) {
      try {
        const m3u8Origin = new URL(file.file).origin;

        // If the current referer doesn't match the M3U8's origin, fix it
        if (
          file.headers.Referer &&
          !file.headers.Referer.includes(new URL(file.file).hostname)
        ) {
          console.log(`[Direct M3U8] Fixing referer for: ${file.file}`);
          console.log(
            `[Direct M3U8] Old referer: ${file.headers.Referer} -> New referer: ${m3u8Origin}`
          );

          return {
            ...file,
            headers: {
              ...file.headers,
              Referer: m3u8Origin,
              Origin: m3u8Origin,
            },
          };
        }
      } catch (error) {
        // If URL parsing fails, keep the original file
        console.log(`[Direct M3U8] URL parsing failed for: ${file.file}`);
      }
    }

    return file; // Return unchanged if no proxy needed
  });

  return {
    ...apiResponse,
    files: processedFiles,
  };
}

export { needsProxy, extractOriginalUrl };
