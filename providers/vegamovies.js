/**
 * Vegamovies Provider Plugin for Euthopiar / Universal Streaming Architecture
 *
 * High-speed direct CDN provider for Bollywood, Hollywood, South Indian Dubbed,
 * and Web Series via Fast-DL Google Cloud CDN, HubCloud (FSL R2, Pixeldrain,
 * ZipDisk, 10Gbps Pixel Cloud), with rich technical metadata and VTT subtitles.
 */

/* =========================================================================
   CONFIG BLOCK: If site changes domain, update ONLY the URLs in this block.
   ========================================================================= */
var BASE_URL = 'https://vegamovies19.co.in';
var BACKUP_URLS = [
    'https://vegamovies19.co.in',
    'https://1vegamovies.shop',
    'https://veqamovies.mobi'
];
var DYNAMIC_URLS_ENDPOINT = 'https://raw.githubusercontent.com/SaurabhKaperwan/Utils/refs/heads/main/urls.json';
var FASTDL_BASE = 'https://fast-dl.one';
var GAMERXYT_REFERER = 'https://gamerxyt.com/';
var SUB_VDRK_URL = 'https://sub.vdrk.site/v2';
var TMDB_PROXY_URL = 'https://db.wecollege.net/3';
/* ========================================================================= */

var USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

var DEFAULT_HEADERS = {
    'User-Agent': USER_AGENT,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Referer': BASE_URL + '/'
};

var DEFUNCT_OR_AD_REGEX = /busycdn|rtmark|redirect|advert|ad\.|shortlink|clk|icy-king-205d|download\.goldmines|goldmines\.server-|cdn\.faceboook\.workers\.dev/i;

function safeFetch(url, options, timeoutMs) {
    timeoutMs = timeoutMs || 3000;
    var timer;
    var timeoutPromise = new Promise(function(_, reject) {
        timer = setTimeout(function() {
            reject(new Error('Request timed out: ' + url));
        }, timeoutMs);
    });

    return Promise.race([
        fetch(url, options),
        timeoutPromise
    ]).then(function(res) {
        clearTimeout(timer);
        return res;
    }, function(err) {
        clearTimeout(timer);
        throw err;
    });
}

function pad(num, size) {
    var s = String(num);
    while (s.length < (size || 2)) s = '0' + s;
    return s;
}

function cleanTitle(t) {
    return String(t || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function stripReleaseMetadata(t) {
    return String(t || '')
        .replace(/\[[^\]]*\]/g, ' ')
        .replace(/\([^\)]*\)/g, ' ')
        .replace(/\b(?:480p|720p|1080p|2160p|4k|uhd|fhd|hd|sd|dual\s*audio|multi\s*audio|bluray|web-?dl|webrip|hdrip|esub|x264|x265|hevc|season\s*\d+|s\d+)\b[\s\S]*/i, '');
}

function parseQualityFromText(text) {
    if (!text) return null;
    var t = String(text);
    if (/\b2160p\b/i.test(t)) return '4K 2160p';
    if (/\b(?:1080[pi]|fhd)\b/i.test(t)) return '1080p';
    if (/\b720p\b/i.test(t)) return '720p';
    if (/\b(?:480p|540p|360p)\b/i.test(t)) return '480p';
    var clean = t.replace(/\bds-?4k\b/gi, '').replace(/4k[- ]?remaster(?:ed)?/gi, '');
    if (/\b(?:4k|uhd)\b/i.test(clean)) return '4K 2160p';
    if (/\b(hd)\b/i.test(clean) && !/hdrip|webrip|hdts|hdtc/i.test(clean)) return '720p';
    if (/\b(sd)\b/i.test(clean)) return '480p';
    return null;
}

function extractQualityFromContext(html, linkIndex, label) {
    var q = parseQualityFromText(label);
    if (q) return q;

    var sliceBefore = html.substring(Math.max(0, linkIndex - 1500), linkIndex);
    var cleanSlice = sliceBefore.replace(/hdrip|webrip|bluray|hdts|hdtc/gi, ' ');
    var matches = [];
    var qRegex = /\b(2160p|1080[pi]\b|fhd\b|720p\b|540p\b|480p\b|360p\b|4k\b|uhd\b)/gi;
    var qm;
    while ((qm = qRegex.exec(cleanSlice)) !== null) matches.push(qm[1]);
    if (matches.length > 0) {
        var found = parseQualityFromText(matches[matches.length - 1]);
        if (found) return found;
    }

    var generalMatch = cleanSlice.match(/\b(hd|sd)\b/i);
    if (generalMatch) {
        var gFound = parseQualityFromText(generalMatch[1]);
        if (gFound) return gFound;
    }
    return '1080p';
}

function extractMediaTags(text) {
    var upper = String(text || '').toUpperCase();
    var sourceType = null;
    if (/\bREMUX\b/.test(upper)) sourceType = 'REMUX';
    else if (/\bBLU-?RAY\b|\bBDRIP\b/.test(upper)) sourceType = 'BluRay';
    else if (/\bWEB-?DL\b/.test(upper)) sourceType = 'WEB-DL';
    else if (/\bWEBRIP\b/.test(upper)) sourceType = 'WEBRip';
    else if (/\bHDRIP\b/.test(upper)) sourceType = 'HDRip';

    var hdrType = null;
    if (/DOLBY\s*VISION|\bDOVI\b|\bDV\b/.test(upper)) hdrType = 'DV';
    else if (/HDR10\+|HDR10PLUS/.test(upper)) hdrType = 'HDR10+';
    else if (/HDR10/.test(upper)) hdrType = 'HDR10';
    else if (/\bHLG\b/.test(upper)) hdrType = 'HLG';
    else if (/\bHDR\b/.test(upper)) hdrType = 'HDR';

    var codec = null;
    if (/\bAV1\b/.test(upper)) codec = 'AV1';
    else if (/\b(?:HEVC|H\.?265|X265)\b/.test(upper)) codec = 'HEVC';
    else if (/\b(?:AVC|H\.?264|X264)\b/.test(upper)) codec = 'AVC';
    else if (/\bVP9\b/.test(upper)) codec = 'VP9';

    var bitDepth = /\b10[- ]?BIT\b/.test(upper) ? '10bit' : null;

    var audioFormat = null;
    var hasAtmos = /\bATMOS\b/.test(upper);
    var has71 = /\b7\.1\b/.test(upper);
    var has51 = /\b5\.1\b/.test(upper);
    if (hasAtmos) audioFormat = has71 ? 'Dolby Atmos 7.1' : (has51 ? 'Dolby Atmos 5.1' : 'Dolby Atmos');
    else if (/\bTRUE-?HD\b/.test(upper)) audioFormat = has71 ? 'TrueHD 7.1' : 'TrueHD';
    else if (/\b(?:DDP|DD\+|EAC3|E-AC-3)\b/.test(upper)) audioFormat = has51 ? 'DDP 5.1' : 'DDP';
    else if (/\bDTS-?HD\b/.test(upper)) audioFormat = 'DTS-HD';
    else if (/\bDTS\b/.test(upper)) audioFormat = has51 ? 'DTS 5.1' : 'DTS';

    var tags = [];
    if (sourceType) tags.push(sourceType);
    if (hdrType) tags.push(hdrType);
    if (codec) tags.push(codec);
    if (bitDepth) tags.push(bitDepth);
    if (audioFormat) tags.push(audioFormat);
    return { sourceType: sourceType, hdrType: hdrType, codec: codec, bitDepth: bitDepth, audioFormat: audioFormat, tags: tags };
}

function parseAudiosFromText(text) {
    if (!text) return { isMulti: false, primary: 'Hindi', tag: 'HIN', badge: '[HIN]' };
    var upper = String(text).toUpperCase();
    var langs = [];
    var isMultiCue = /\b(MULTI|DUAL|MULTI-AUDIO|DUAL-AUDIO)\b/i.test(upper) ||
                     (/\b(HINDI|HIN)\b/i.test(upper) && /\b(ENGLISH|ENG)\b/i.test(upper));

    if (/\b(HINDI|HIN)\b/i.test(upper)) langs.push('HIN');
    if (/\b(ENGLISH|ENG)\b/i.test(upper)) langs.push('ENG');
    if (/\b(TAMIL|TAM)\b/i.test(upper)) langs.push('TAM');
    if (/\b(TELUGU|TEL)\b/i.test(upper)) langs.push('TEL');
    if (/\b(MALAYALAM|MAL)\b/i.test(upper)) langs.push('MAL');
    if (/\b(KANNADA|KAN)\b/i.test(upper)) langs.push('KAN');
    if (/\b(BENGALI|BEN)\b/i.test(upper)) langs.push('BEN');
    if (/\b(MARATHI|MAR)\b/i.test(upper)) langs.push('MAR');
    if (/\b(KOREAN|KOR)\b/i.test(upper)) langs.push('KOR');
    if (/\b(JAPANESE|JPN)\b/i.test(upper)) langs.push('JPN');
    if (/\b(SPANISH|SPA)\b/i.test(upper)) langs.push('SPA');
    if (/\b(FRENCH|FRA)\b/i.test(upper)) langs.push('FRA');
    if (/\b(GERMAN|GER)\b/i.test(upper)) langs.push('GER');

    var distinct = [];
    for (var i = 0; i < langs.length; i++) {
        if (distinct.indexOf(langs[i]) === -1) distinct.push(langs[i]);
    }

    if (isMultiCue || distinct.length > 1) {
        var langJoin = distinct.length > 0 ? distinct.join(' · ') : 'MULTI';
        return { isMulti: true, primary: 'Multi', tag: 'MULTI', badge: '[MULTI] [' + langJoin + ']' };
    }
    if (distinct.length === 1) {
        var tag = distinct[0];
        return { isMulti: false, primary: tag === 'HIN' ? 'Hindi' : (tag === 'ENG' ? 'English' : tag), tag: tag, badge: '[' + tag + ']' };
    }
    return { isMulti: false, primary: 'Hindi', tag: 'HIN', badge: '[HIN]' };
}

async function resolveMetadata(tmdbId, mediaType, extraArgs) {
    var callArgs = (typeof globalThis !== 'undefined' && globalThis.__CALL_ARGS__) || {};
    extraArgs = Object.assign({}, callArgs, extraArgs || {});
    var title = extraArgs.title || extraArgs.name || '';
    var year = extraArgs.year || (extraArgs.releaseDate ? String(extraArgs.releaseDate).substring(0, 4) : '');
    var origLang = extraArgs.originalLanguage || extraArgs.original_language || '';

    if (!title && tmdbId) {
        try {
            var tmdbType = mediaType === 'movie' ? 'movie' : 'tv';
            var res = await safeFetch(TMDB_PROXY_URL + '/' + tmdbType + '/' + tmdbId, { headers: DEFAULT_HEADERS }, 2500);
            if (res.ok) {
                var meta = await res.json();
                title = meta.title || meta.name || '';
                var relDate = meta.release_date || meta.first_air_date || '';
                year = year || (relDate ? String(relDate).substring(0, 4) : '');
                origLang = origLang || meta.original_language || '';
            }
        } catch (_) {}
    }

    return {
        title: title || ('Media ' + tmdbId),
        year: year ? String(year) : '2024',
        originalLanguage: origLang || 'hi'
    };
}

async function analyzeCloudStreamHealth(streamUrl) {
    if (!streamUrl || DEFUNCT_OR_AD_REGEX.test(streamUrl) || /\.zip(?:$|\?)/i.test(streamUrl)) return false;
    try {
        var isWorkersDev = streamUrl.indexOf('workers.dev') >= 0;
        var reqHeaders = { 'User-Agent': USER_AGENT };
        if (!isWorkersDev) reqHeaders['Range'] = 'bytes=0-0';

        var probeRes = await safeFetch(streamUrl, {
            method: isWorkersDev ? 'HEAD' : 'GET',
            headers: reqHeaders,
            redirect: 'follow'
        }, 2200);

        if (isWorkersDev && (probeRes.status === 405 || probeRes.status === 501)) {
            probeRes = await safeFetch(streamUrl, {
                method: 'GET',
                headers: { 'User-Agent': USER_AGENT, 'Range': 'bytes=0-0' },
                redirect: 'follow'
            }, 2200);
        }

        if (probeRes.status === 403 || probeRes.status === 404 || probeRes.status === 410 ||
            (probeRes.status >= 500 && probeRes.status <= 599)) {
            return false;
        }
        var cType = (probeRes.headers && (probeRes.headers.get('content-type') || probeRes.headers.get('Content-Type'))) || '';
        var lowerCt = cType.toLowerCase();
        if ((lowerCt.indexOf('text/') >= 0 || lowerCt.indexOf('application/json') >= 0) &&
            (probeRes.status === 200 || probeRes.status === 206)) {
            return false;
        }
        return true;
    } catch (_) {
        return false;
    }
}

async function resolvePixelCloud(pixelUrl) {
    var curUrl = pixelUrl;
    var referer = GAMERXYT_REFERER;
    try {
        for (var hop = 0; hop < 3; hop++) {
            var resp = await safeFetch(curUrl, {
                headers: { 'User-Agent': USER_AGENT, 'Referer': referer },
                redirect: 'manual'
            }, 2500);
            var loc = resp.headers && (resp.headers.get('location') || resp.headers.get('Location'));
            if (!loc) {
                var cType = (resp.headers && resp.headers.get('content-type')) || '';
                if (cType.toLowerCase().indexOf('text/html') >= 0) {
                    var text = await resp.text();
                    var m = text.match(/href=['"](https:\/\/video-downloads\.googleusercontent\.com\/[^'"]+)['"]/i) ||
                            text.match(/href=['"](https:\/\/[^'"]*googleusercontent\.com\/[^'"]+)['"]/i);
                    if (m) return m[1];
                }
                break;
            }
            if (loc.indexOf('?link=') >= 0) {
                var ext = decodeURIComponent(loc.split('?link=')[1]);
                if (ext && ext.indexOf('googleusercontent.com') >= 0) return ext;
                curUrl = ext;
            } else {
                curUrl = loc;
            }
            if (curUrl.indexOf('googleusercontent.com') >= 0) return curUrl;
            referer = curUrl;
        }
    } catch (_) {}
    return null;
}

async function resolveHubCloud(hubUrl) {
    try {
        var res = await safeFetch(hubUrl, {
            headers: { 'User-Agent': USER_AGENT, 'Referer': BASE_URL + '/' }
        }, 3000);
        var text = await res.text();
        if (!text || /cf-turnstile|challenges\.cloudflare\.com/i.test(text)) return [];

        if (hubUrl.indexOf('hubdrive.') >= 0 || hubUrl.indexOf('/drive/') >= 0) {
            var driveMatch = text.match(/https:\/\/hubcloud\.[a-z0-9.]+\/drive\/[a-z0-9]+/i);
            if (driveMatch && driveMatch[0] !== hubUrl) return resolveHubCloud(driveMatch[0]);
        }

        var gx = text.match(/https:\/\/gamerxyt\.com\/hubcloud\.php\?[^"'\s<>]+/);
        if (!gx) return [];

        var gRes = await safeFetch(gx[0], {
            headers: { 'User-Agent': USER_AGENT, 'Referer': hubUrl }
        }, 3000);
        var gText = await gRes.text();

        var servers = [];
        var seenUrls = {};
        var asyncTasks = [];

        var pxlMatch = gText.match(/var\s+pxl\s*=\s*['"](https?:\/\/[^'"]*\/u\/([a-zA-Z0-9_-]+))['"]/i) ||
                       gText.match(/var\s+pxl\s*=\s*['"](https?:\/\/[^'"]*pixeldrain[^'"]*)['"]/i);
        if (pxlMatch) {
            var rawPxl = pxlMatch[1];
            var pxlDirect = rawPxl.replace(/\/u\/([a-zA-Z0-9_-]+)/, '/api/file/$1?download')
                                  .replace('pixeldrain.dev', 'pixeldrain.com');
            if (!DEFUNCT_OR_AD_REGEX.test(pxlDirect)) {
                (function(pUrl) {
                    asyncTasks.push(analyzeCloudStreamHealth(pUrl).then(function(ok) {
                        if (ok) servers.push({ serverName: 'Pixeldrain', displayName: 'Pixeldrain', url: pUrl, priority: 2, headers: { 'User-Agent': USER_AGENT } });
                    }).catch(function() {}));
                })(pxlDirect);
            }
            seenUrls[rawPxl] = true;
            seenUrls[pxlDirect] = true;
        }

        var aRegex = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        var match;
        while ((match = aRegex.exec(gText)) !== null) {
            var href = match[1];
            var label = match[2].replace(/<[^>]+>/g, '').trim();
            if (seenUrls[href] || DEFUNCT_OR_AD_REGEX.test(href)) continue;
            seenUrls[href] = true;

            if (label.indexOf('FSL Server') >= 0 || label.indexOf('FSLv2 Server') >= 0 ||
                href.indexOf('r2.cloudflarestorage.com') >= 0 || href.indexOf('r2.dev') >= 0) {
                servers.push({ serverName: 'FSL R2', displayName: 'FSL R2', url: href, priority: 1, headers: { 'User-Agent': USER_AGENT } });
            } else if (label.indexOf('PixelServer') >= 0 || href.indexOf('pixeldrain') >= 0) {
                if (href.indexOf('negn6f') >= 0) continue;
                var directPxl = href.replace(/\/u\/([a-zA-Z0-9_-]+)/, '/api/file/$1?download')
                                    .replace('pixeldrain.dev', 'pixeldrain.com');
                (function(pUrl) {
                    asyncTasks.push(analyzeCloudStreamHealth(pUrl).then(function(ok) {
                        if (ok) servers.push({ serverName: 'Pixeldrain', displayName: 'Pixeldrain', url: pUrl, priority: 2, headers: { 'User-Agent': USER_AGENT } });
                    }).catch(function() {}));
                })(directPxl);
            } else if (label.indexOf('ZipDisk') >= 0 || href.indexOf('workers.dev') >= 0) {
                (function(zh) {
                    asyncTasks.push(analyzeCloudStreamHealth(zh).then(function(ok) {
                        if (ok) servers.push({ serverName: 'ZipDisk', displayName: 'ZipDisk', url: zh, priority: 3, headers: { 'User-Agent': USER_AGENT } });
                    }).catch(function() {}));
                })(href);
            } else if (label.indexOf('10Gbps') >= 0 || /pixel\.hubcloud\.[a-z0-9]+/i.test(href) || /gpdl\.hubcloud\.[a-z0-9]+/i.test(href)) {
                (function(h) {
                    asyncTasks.push(resolvePixelCloud(h).then(async function(directPixel) {
                        if (directPixel && await analyzeCloudStreamHealth(directPixel)) {
                            servers.push({ serverName: '10Gbps Pixel Cloud', displayName: 'Pixel Cloud (Google CDN)', url: directPixel, priority: 4, headers: { 'User-Agent': USER_AGENT } });
                        }
                    }).catch(function() {}));
                })(href);
            }
        }
        if (asyncTasks.length > 0) await Promise.all(asyncTasks);
        return servers;
    } catch (_) {
        return [];
    }
}

async function resolveFastDlOne(fastDlUrl) {
    try {
        var pageRes = await safeFetch(fastDlUrl, { headers: { 'User-Agent': USER_AGENT, 'Referer': BASE_URL + '/' } }, 3000);
        var setCookie = pageRes.headers && (pageRes.headers.get('set-cookie') || '');
        var cookieHeader = setCookie ? setCookie.split(',').map(function(c) { return c.split(';')[0].trim(); }).filter(Boolean).join('; ') : '';
        var pageHtml = await pageRes.text();
        if (!pageHtml || /cf-turnstile|challenges\.cloudflare\.com/i.test(pageHtml)) return null;

        var dlMatch = pageHtml.match(/href="([^"]*dl\.php[^"]+)"/i);
        if (!dlMatch) return null;

        var target = dlMatch[1].replace(/&amp;/g, '&');
        if (target.indexOf('http') !== 0) {
            try { target = new URL(target, fastDlUrl).toString(); }
            catch (_) { target = FASTDL_BASE + '/dl/' + target.replace(/^\//, ''); }
        }

        var dlHeaders = { 'User-Agent': USER_AGENT, 'Referer': fastDlUrl };
        if (cookieHeader) dlHeaders['Cookie'] = cookieHeader;

        var dlRes = await safeFetch(target, { headers: dlHeaders, redirect: 'manual' }, 3000);
        var cdnUrl = dlRes.headers && (dlRes.headers.get('location') || dlRes.headers.get('Location'));
        if (cdnUrl && cdnUrl.indexOf('http') === 0) {
            return (await analyzeCloudStreamHealth(cdnUrl)) ? cdnUrl : null;
        }

        var prepSep = target.indexOf('?') >= 0 ? '&' : '?';
        var randHex = function(len) {
            var s = '';
            for (var i = 0; i < len; i++) s += Math.floor(Math.random() * 16).toString(16);
            return s;
        };
        var prepHeaders = Object.assign({}, dlHeaders, { 'Accept': 'application/json' });
        var prepRes = await safeFetch(target + prepSep + 'prepare=1&hash=' + randHex(24) + '&cfs=' + randHex(16), { headers: prepHeaders }, 3000);
        if (prepRes && prepRes.ok) {
            try {
                var prepData = await prepRes.json();
                if (prepData && prepData.ok && prepData.url && /^https?:\/\//i.test(prepData.url)) {
                    return (await analyzeCloudStreamHealth(prepData.url)) ? prepData.url : null;
                }
            } catch (_) {}
        }
    } catch (_) {}
    return null;
}

async function resolveNexdrive(nexdriveUrl, isMovie, seasonNum, episodeNum) {
    try {
        var html = '';
        try {
            var res = await safeFetch(nexdriveUrl, { headers: { 'User-Agent': USER_AGENT, 'Referer': BASE_URL + '/' } }, 3000);
            if (res.ok) html = await res.text();
        } catch (_) {}

        if (!html || /cf-turnstile|challenges\.cloudflare\.com|Just a moment\.\.\./i.test(html)) {
            return null;
        }

        var pageTitleMatch = html.match(/<title>([\s\S]*?)<\/title>/i) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
        var pageTitle = pageTitleMatch ? pageTitleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
        var nexQuality = pageTitle ? parseQualityFromText(pageTitle) : null;

        var fastDlLinks = [];
        var aRegex = /<a[^>]+href="([^"]*fast-dl\.one[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        var m;
        while ((m = aRegex.exec(html)) !== null) fastDlLinks.push(m[1].replace(/&amp;/g, '&'));

        if (fastDlLinks.length === 0) {
            var vcloudMatch = html.match(/https?:\/\/[^\s"'<>]*(?:vcloud|hubcloud)[^\s"'<>]*/gi);
            if (vcloudMatch && vcloudMatch.length > 0) return { hubUrls: vcloudMatch.slice(0, 2), quality: nexQuality, pageTitle: pageTitle };
            return null;
        }

        if (isMovie) return { directFastDl: fastDlLinks[0], quality: nexQuality, pageTitle: pageTitle };
        var epIndex = episodeNum - 1;
        return { directFastDl: (epIndex >= 0 && epIndex < fastDlLinks.length) ? fastDlLinks[epIndex] : fastDlLinks[0], quality: nexQuality, pageTitle: pageTitle };
    } catch (_) {
        return null;
    }
}

function hasRelevantVegamoviesResult(results, query) {
    if (!results || results.length === 0) return false;
    var qClean = cleanTitle(query);
    var stop = { 'the': 1, 'a': 1, 'an': 1, 'of': 1, 'and': 1, 'in': 1, 'to': 1, 'for': 1 };
    var tokens = qClean.split(' ').filter(function(w) { return w.length > 2 && !stop[w]; });
    if (tokens.length === 0) tokens = qClean.split(' ').filter(function(w) { return w.length > 1; });
    if (tokens.length === 0) return true;
    for (var i = 0; i < results.length; i++) {
        for (var t = 0; t < tokens.length; t++) {
            if (results[i].clean.indexOf(tokens[t]) >= 0) return true;
        }
    }
    return false;
}

async function searchVegamoviesOnBase(currentBase, query) {
    try {
        var normBase = String(currentBase || '').replace(/\/+$/, '');
        var postBody = 'do=search&subaction=search&story=' + encodeURIComponent(query) + '&titleonly=3';
        var html = '';

        var postRes = await safeFetch(normBase + '/index.php?do=search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT, 'Referer': normBase + '/' },
            body: postBody,
            redirect: 'manual'
        }, 3200);

        if (postRes && postRes.status >= 300 && postRes.status < 400) {
            var loc = postRes.headers && (postRes.headers.get('location') || postRes.headers.get('Location'));
            if (loc) {
                var redirOriginMatch = loc.match(/^(https?:\/\/[^\/]+)/i);
                var redirBase = redirOriginMatch ? redirOriginMatch[1] : normBase;
                postRes = await safeFetch(redirBase + '/index.php?do=search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT, 'Referer': redirBase + '/' },
                    body: postBody
                }, 3200);
                normBase = redirBase;
            }
        }

        if (postRes && postRes.ok) html = await postRes.text();
        if (!html || html.indexOf('<article') === -1) {
            var getDleRes = await safeFetch(normBase + '/index.php?do=search&subaction=search&story=' + encodeURIComponent(query), {
                headers: { 'User-Agent': USER_AGENT, 'Referer': normBase + '/' }
            }, 3000);
            if (getDleRes && getDleRes.ok) html = await getDleRes.text();
        }
        if (!html || html.indexOf('<article') === -1) {
            var getRes = await safeFetch(normBase + '/?s=' + encodeURIComponent(query), {
                headers: { 'User-Agent': USER_AGENT, 'Referer': normBase + '/' }
            }, 3000);
            if (getRes && getRes.ok) html = await getRes.text();
        }

        var articles = (html || '').match(/<article[\s\S]*?<\/article>/gi) || [];
        if (articles.length === 0) return null;

        var results = [];
        for (var i = 0; i < articles.length; i++) {
            var art = articles[i];
            var linkMatch = art.match(/href="([^"]+)"/);
            var titleMatch = art.match(/title="([^"]+)"/) || art.match(/alt="([^"]+)"/);
            if (linkMatch && titleMatch) {
                var rawTitle = titleMatch[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&quot;/g, '"').trim();
                results.push({ url: linkMatch[1], title: rawTitle, clean: cleanTitle(rawTitle) });
            }
        }
        return hasRelevantVegamoviesResult(results, query) ? results : null;
    } catch (_) {
        return null;
    }
}

async function searchVegamovies(query) {
    var seenBases = {};
    for (var b = 0; b < BACKUP_URLS.length; b++) {
        var currentBase = BACKUP_URLS[b];
        if (seenBases[currentBase]) continue;
        seenBases[currentBase] = true;
        var baseResults = await searchVegamoviesOnBase(currentBase, query);
        if (baseResults && baseResults.length > 0) return baseResults;
    }

    if (DYNAMIC_URLS_ENDPOINT) {
        try {
            var dynRes = await safeFetch(DYNAMIC_URLS_ENDPOINT, { headers: { 'User-Agent': USER_AGENT } }, 2500);
            if (dynRes.ok) {
                var dynData = await dynRes.json();
                var dynBase = dynData && (dynData.vegamovies || dynData['1vegamovies']);
                if (dynBase && !seenBases[dynBase]) {
                    var dynResults = await searchVegamoviesOnBase(dynBase, query);
                    if (dynResults && dynResults.length > 0) return dynResults;
                }
            }
        } catch (_) {}
    }
    return [];
}

async function resolveVgmlinks(vgmUrl, isMovie, seasonNum, episodeNum) {
    try {
        var pageHtml = '';
        var res = await safeFetch(vgmUrl, { headers: { 'User-Agent': USER_AGENT, 'Referer': BASE_URL + '/' } }, 2800);
        if (res.ok) pageHtml = await res.text();
        if (!pageHtml || /cf-turnstile|g-recaptcha|challenges\.cloudflare\.com|Just a moment\.\.\./i.test(pageHtml)) {
            return [];
        }

        var nexMatch = pageHtml.match(/https?:\/\/[^\s"'<>]*nexdrive[^\s"'<>]*/i);
        if (nexMatch) {
            var nexRes = await resolveNexdrive(nexMatch[0], isMovie, seasonNum, episodeNum);
            if (nexRes && nexRes.directFastDl) {
                var cdn = await resolveFastDlOne(nexRes.directFastDl);
                if (cdn) {
                    return [{
                        serverName: 'Fast-DL',
                        displayName: '10Gbps Google CDN',
                        url: cdn,
                        quality: nexRes.quality,
                        pageTitle: nexRes.pageTitle,
                        priority: 1,
                        headers: { 'User-Agent': USER_AGENT }
                    }];
                }
            } else if (nexRes && nexRes.hubUrls) {
                var hubBatches = await Promise.all(nexRes.hubUrls.map(function(hUrl) {
                    return resolveHubCloud(hUrl).then(function(srvs) {
                        return srvs.map(function(s) { return Object.assign({}, s, { quality: nexRes.quality, pageTitle: nexRes.pageTitle }); });
                    }).catch(function() { return []; });
                }));
                return Array.prototype.concat.apply([], hubBatches);
            }
        }
    } catch (_) {}
    return [];
}

async function queryVdrkSubtitles(tmdbId, isMovie, sNum, eNum) {
    try {
        var subUrl = isMovie
            ? (SUB_VDRK_URL + '/movie/' + encodeURIComponent(tmdbId))
            : (SUB_VDRK_URL + '/tv/' + encodeURIComponent(tmdbId) + '/' + sNum + '/' + eNum);
        var res = await safeFetch(subUrl, { headers: { 'User-Agent': USER_AGENT } }, 2200);
        if (!res.ok) return [];
        var list = await res.json();
        if (!Array.isArray(list)) return [];
        return list.map(function(s) {
            var label = (s && (s.label || s.lang || 'English')) || 'English';
            return {
                url: s && (s.file || s.url),
                language: label,
                lang: label,
                name: label,
                headers: { 'User-Agent': USER_AGENT }
            };
        }).filter(function(s) { return s.url && typeof s.url === 'string'; });
    } catch (_) {
        return [];
    }
}

async function getStreams(tmdbId, mediaType, season, episode, extraArgs) {
    var callArgs = (typeof globalThis !== 'undefined' && globalThis.__CALL_ARGS__) || {};
    extraArgs = Object.assign({}, callArgs, extraArgs || {});
    if (!tmdbId) return [];

    var isMovie = mediaType === 'movie';
    var sNum = Number(season) || 1;
    var eNum = Number(episode) || 1;
    var epTag = !isMovie ? ('S' + pad(sNum) + 'E' + pad(eNum)) : '';

    var meta = await resolveMetadata(tmdbId, mediaType, extraArgs);
    var searchTitle = meta.title.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

    var initParallel = await Promise.all([
        searchVegamovies(searchTitle),
        queryVdrkSubtitles(tmdbId, isMovie, sNum, eNum)
    ]);
    var candidates = initParallel[0];
    var subtitleList = initParallel[1];

    if (candidates.length === 0) {
        var firstWord = searchTitle.split(' ')[0];
        if (firstWord && firstWord.length > 3) candidates = await searchVegamovies(firstWord);
    }
    if (candidates.length === 0) return [];

    var targetClean = cleanTitle(meta.title);
    var stopWords = { 'the': 1, 'a': 1, 'an': 1, 'of': 1, 'and': 1, 'in': 1, 'to': 1, 'for': 1, 'on': 1, 'with': 1, 'at': 1, 'by': 1, 'from': 1 };
    var targetWords = targetClean.split(' ').filter(function(w) { return w.length > 1 && !stopWords[w]; });
    if (targetWords.length === 0) targetWords = targetClean.split(' ').filter(function(w) { return w.length > 1; });
    if (targetWords.length === 0) return [];

    var scoredCandidates = [];
    for (var i = 0; i < candidates.length; i++) {
        var cand = candidates[i];
        var candClean = cand.clean;
        var candTitle = cand.title;
        var score = 0;

        var matchedWords = 0;
        for (var w = 0; w < targetWords.length; w++) {
            if (candClean.indexOf(targetWords[w]) >= 0) matchedWords++;
        }
        if (matchedWords / targetWords.length < 0.6) continue;
        score += matchedWords * 10;
        if (candClean.indexOf(targetClean) >= 0) score += 30;

        var sequelRegex = /\b(2|3|4|5|6|7|8|9|ii|iii|iv|v|vi|part\s*\d+|chapter\s*\d+)\b/i;
        var targetSequelMatch = targetClean.match(sequelRegex);
        var candSequelMatch = cleanTitle(stripReleaseMetadata(candTitle)).match(sequelRegex);
        var targetSequel = targetSequelMatch ? targetSequelMatch[0].replace(/\s+/g, '') : null;
        var candSequel = candSequelMatch ? candSequelMatch[0].replace(/\s+/g, '') : null;

        if (!targetSequel && candSequel) score -= 80;
        else if (targetSequel && !candSequel) score -= 50;
        else if (targetSequel && candSequel && targetSequel !== candSequel) score -= 80;

        if (isMovie) {
            if (meta.year) {
                var metaY = parseInt(meta.year, 10);
                var candYearMatches = candTitle.match(/\b(19\d\d|20\d\d)\b/g);
                if (candYearMatches && candYearMatches.length > 0) {
                    var hasYearMatch = candYearMatches.some(function(yStr) { return Math.abs(parseInt(yStr, 10) - metaY) <= 1; });
                    score += hasYearMatch ? 50 : -80;
                }
            }
            if (/season\s*\d+|complete\s*series|s\d{1,2}e\d{1,2}/i.test(candTitle)) score -= 100;
        } else {
            var rangeMatch = candTitle.match(/season\s*0*(\d+)\s*(?:-|to)\s*0*(\d+)/i) ||
                             candTitle.match(/s0*(\d+)\s*(?:-|to)\s*s?0*(\d+)/i);
            var singleMatch = candTitle.match(/season\s*0*(\d+)/i) || candTitle.match(/s0*(\d+)/i);

            if (rangeMatch) {
                score += (sNum >= Number(rangeMatch[1]) && sNum <= Number(rangeMatch[2])) ? 60 : -100;
            } else if (singleMatch) {
                score += (Number(singleMatch[1]) === sNum) ? 80 : -100;
            } else if (/complete|series/i.test(candTitle)) {
                score += 30;
            }

            if (meta.year) {
                var metaYv = parseInt(meta.year, 10);
                var candYearM = candTitle.match(/\b(19\d\d|20\d\d)\b/g);
                if (candYearM && candYearM.length > 0) {
                    var expectedMaxY = (sNum === 1) ? metaYv + 2 : metaYv + sNum * 2 + 1;
                    var hasMY = candYearM.some(function(yStr) { var y = parseInt(yStr, 10); return y >= metaYv - 1 && y <= expectedMaxY; });
                    score += hasMY ? 40 : -80;
                }
            }
        }

        if (targetWords.length === 1) {
            var candWords = candClean.split(' ');
            if (candWords.indexOf(targetWords[0]) > 0) score -= 50;
        }

        var spinoffRegex = /\b(?:the\s+challenge|in\s+conversation|making\s+of|behind\s+the\s+scenes|theatrical\s*preview|preview|trailer|teaser|recap|explained|special)\b/i;
        if (spinoffRegex.test(candTitle) && !spinoffRegex.test(meta.title || '')) score -= 150;

        if (score >= 40) scoredCandidates.push({ cand: cand, score: score });
    }

    scoredCandidates.sort(function(a, b) { return b.score - a.score; });
    var selected = scoredCandidates.length > 0 ? scoredCandidates[0].cand : null;
    if (!selected) return [];

    var postHtml = '';
    try {
        var postRes = await safeFetch(selected.url, { headers: DEFAULT_HEADERS }, 3000);
        if (postRes.ok) postHtml = await postRes.text();
    } catch (_) {}
    if (!postHtml || /cf-turnstile|challenges\.cloudflare\.com|Just a moment\.\.\./i.test(postHtml)) return [];

    var audioInfo = parseAudiosFromText(selected.title + ' ' + postHtml.slice(0, 4000));
    var streamPromises = [];
    var seenStreamKeys = {};

    var aRegex = /<a[^>]+href="([^"]*(?:nexdrive|v-?cloud|fast-dl|hubcloud|vgmlinks)[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    var m;
    var linkCount = 0;
    while ((m = aRegex.exec(postHtml)) !== null && linkCount < 6) {
        var href = m[1].replace(/&amp;/g, '&');
        var label = m[2].replace(/<[^>]+>/g, '').trim();
        var linkQuality = extractQualityFromContext(postHtml, m.index, label);
        linkCount++;

        if (href.indexOf('nexdrive') >= 0) {
            (function(nexUrl, quality) {
                streamPromises.push(
                    resolveNexdrive(nexUrl, isMovie, sNum, eNum).then(async function(result) {
                        if (!result) return [];
                        var effectiveQuality = (result && result.quality) ? result.quality : (quality || '1080p');
                        if (result.directFastDl) {
                            var directCdn = await resolveFastDlOne(result.directFastDl);
                            if (directCdn) {
                                return [{
                                    serverName: 'Fast-DL',
                                    displayName: '10Gbps Google CDN',
                                    url: directCdn,
                                    quality: effectiveQuality,
                                    pageTitle: result.pageTitle,
                                    priority: 1,
                                    headers: { 'User-Agent': USER_AGENT }
                                }];
                            }
                        } else if (result.hubUrls && result.hubUrls.length > 0) {
                            var hubBatches = await Promise.all(result.hubUrls.map(function(hUrl) {
                                return resolveHubCloud(hUrl).then(function(srvs) {
                                    return srvs.map(function(s) { return Object.assign({}, s, { quality: effectiveQuality, pageTitle: result.pageTitle }); });
                                }).catch(function() { return []; });
                            }));
                            return Array.prototype.concat.apply([], hubBatches);
                        }
                        return [];
                    })
                );
            })(href, linkQuality);
        } else if (href.indexOf('vgmlinks') >= 0) {
            (function(vgmUrl, quality) {
                streamPromises.push(
                    resolveVgmlinks(vgmUrl, isMovie, sNum, eNum).then(function(servers) {
                        return servers.map(function(s) { return Object.assign({}, s, { quality: s.quality || quality || '1080p' }); });
                    })
                );
            })(href, linkQuality);
        } else if (href.indexOf('fast-dl.one') >= 0) {
            (function(fdlUrl, quality) {
                streamPromises.push(
                    resolveFastDlOne(fdlUrl).then(function(directCdn) {
                        if (!directCdn) return [];
                        return [{ serverName: 'Fast-DL', displayName: '10Gbps Google CDN', url: directCdn, quality: quality || '1080p', priority: 1, headers: { 'User-Agent': USER_AGENT } }];
                    })
                );
            })(href, linkQuality);
        } else if (href.indexOf('vcloud') >= 0 || href.indexOf('v-cloud') >= 0 || href.indexOf('hubcloud') >= 0) {
            (function(hubUrl, quality) {
                streamPromises.push(
                    resolveHubCloud(hubUrl).then(function(servers) {
                        return servers.map(function(s) { return Object.assign({}, s, { quality: s.quality || quality || '1080p' }); });
                    })
                );
            })(href, linkQuality);
        }
    }

    var resolvedBatches = await Promise.all(streamPromises);
    var finalStreams = [];

    for (var b = 0; b < resolvedBatches.length; b++) {
        var batch = resolvedBatches[b];
        if (!Array.isArray(batch)) continue;
        for (var s = 0; s < batch.length; s++) {
            var item = batch[s];
            if (!item || !item.url) continue;

            var streamKey = item.url + '|' + item.quality;
            if (seenStreamKeys[streamKey]) continue;
            seenStreamKeys[streamKey] = true;

            var tech = extractMediaTags(selected.title + ' ' + (item.pageTitle || ''));
            var techSuffix = tech.tags.length > 0 ? (' [' + tech.tags.join(' · ') + ']') : '';

            var finalTitle = isMovie
                ? (meta.title + ' (' + meta.year + ') ' + audioInfo.badge + ' - Vegamovies ' + item.displayName + ' [' + item.quality + ']' + techSuffix)
                : (meta.title + ' ' + epTag + ' ' + audioInfo.badge + ' - Vegamovies ' + item.displayName + ' [' + item.quality + ']' + techSuffix);

            var isHls = item.url.indexOf('.m3u8') >= 0;
            var isDASH = item.url.indexOf('.mpd') >= 0;
            var isMkv = item.url.indexOf('.mkv') >= 0 || item.url.indexOf('googleusercontent.com') >= 0;
            var streamFormat = isHls ? 'm3u8' : (isDASH ? 'mpd' : (isMkv ? 'mkv' : 'mp4'));
            var stLabel = isHls ? 'HLS' : (isDASH ? 'DASH' : (isMkv ? 'Direct MKV' : 'Direct MP4'));
            var descParts = [stLabel, item.quality, audioInfo.badge].concat(tech.tags);

            finalStreams.push({
                name: 'Vegamovies | ' + item.serverName + ' › ' + item.displayName + ' • ' + audioInfo.badge + ' (' + item.quality + ')' + techSuffix,
                title: finalTitle,
                rawTitle: item.pageTitle || selected.title,
                description: descParts.join(' • '),
                url: item.url,
                quality: item.quality,
                isAdaptive: false,
                streamType: stLabel,
                size: isMovie ? '1.8 GB' : '650 MB',
                type: streamFormat === 'mkv' ? 'mp4' : streamFormat,
                format: streamFormat,
                container: streamFormat,
                isSequential: streamFormat === 'mp4' || streamFormat === 'mkv',
                provider: 'vegamovies',
                server: item.serverName,
                subServer: item.displayName,
                language: (audioInfo.tag || 'hin').toLowerCase(),
                headers: item.headers || { 'User-Agent': USER_AGENT },
                subtitles: subtitleList,
                audio: audioInfo,
                hdrType: tech.hdrType,
                codec: tech.codec,
                audioFormat: tech.audioFormat,
                sourceType: tech.sourceType,
                tags: tech.tags
            });
        }
    }

    console.log('[Vegamovies] Discovered ' + finalStreams.length + ' stream(s), subtitles: ' + subtitleList.length);
    return finalStreams;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams: getStreams };
}
if (typeof globalThis !== 'undefined') {
    globalThis.getStreams = getStreams;
}
