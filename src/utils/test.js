// test.js (test script to test Streamtape Resolver
import { extract } from "./Extractor.js";

(async () => {
  const url = "https://strtape.tech/v/pj3KxJrv1ZCr8Ob"; // your test URL
  const result = await extract(url);

  console.log("Final Extract Result:", result);
})();
