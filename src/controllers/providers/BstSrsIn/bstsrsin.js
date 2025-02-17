const URL = "https://bstsrs.in/";

export async function getBstrsrIn(media) {
    if (media.type === "movie")
        return new Error("BstrsrIn does not support movies");

    const id = media.tmdbId;
    const season = media.season;
    const episode = media.episode;

    const tvshowUrl = `${URL}/show/${media.title.replaceAll(" ", "-").toLowerCase()}-s${season.toString().padStart(2, '0')}e${episode.toString().padStart(2, '0')}/season/${season}/episode/${episode}`;
    let html = await fetch(tvshowUrl);

    if (!html.ok)
        return new Error("Failed to fetch BstrsrIn");

    html = await html.text();

    let sources = [];
    html.match(/dbneg\('[^"]+'\)/g).forEach(link => {
        sources.push(decode(link));
    });


}


function decode(link) {
    // TODO: somehow decode the link.
}