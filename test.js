const getMixdropVideoViaInternalId = async (id) => {
    const resp = await fetch("https://mixdrop.ps/e/" + id);
    var cookie = resp.headers.getSetCookie()[0];
    const [csrf, evalFun] = await resp
        .text()
        .then((r) => [
            r.match(/['"]csrf['"]\s*content=['"](.*?)['"]/)[1],
            eval(
                /(eval)(\(function[\s\S]*?)(<\/script>)/s.exec(r)[2].replace("eval", "")
            ),
        ]);

    let url = evalFun.match(/MDCore.wurl=['"](.*?)['"]/)[1];
    let referer = evalFun.match(/MDCore.referrer=['"](.*?)['"]/)[1].trim();

    const r2 = await fetch("https://mixdrop.ps/e/" + id, {
        method: "POST",
        body: `referrer=&adblock=0&csrf=${csrf}&a=count`,
        headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
            cookie: cookie,
            Referer: "https://mixdrop.ps/e/" + id,
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        },
    });
    const json = await r2.json();
    if (!json.type.ok){
        return new Error();
    }

    const data = {
        url: url.startsWith("http") ? url : "http:" + url,
        headers: {
            cookie: cookie,
            Referer: referer.length > 0 ? referer : "https://mixdrop.ps/",
        },
    };
    console.log(data);
    return data;
};

getMixdropVideoViaInternalId("wljv9jxoip86d7");
