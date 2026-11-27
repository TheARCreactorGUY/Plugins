/**
 * HDHub4u Provider Plugin for Euthopiar / Universal Streaming Architecture
 *
 * Dedicated high-speed direct stream provider powered by dynamic Pingora domain
 * failover and Typesense indexing across FSL R2, 10Gbps Pixel Cloud (Google CDN),
 * Pixeldrain, and ZipDisk with rich release metadata and VTT subtitles.
 */

/* =========================================================================
   CONFIG BLOCK: If site changes domain, update ONLY the URLs in this block.
   ========================================================================= */
var BASE_URL = 'https://new17.hdhub4u.cl';
var BACKUP_URLS = [
    'https://new17.hdhub4u.cl',
    'https://new13.hdhub4u.cl',
    'https://hdhub4u.ms',
    'https://hdhub4u.tv'
];
var DYNAMIC_CONFIG_ENDPOINTS = [
    'https://dns.pingora.fyi/v2/ping',
    'https://cdn.hub4u.cloud/v2/ping',
    'https://srv-1.cdndot.fans/v2/ping'
];
var TYPESENSE_SEARCH_URL = 'https://search.pingora.fyi/collections/post/documents/search';
var GREENMOTORS_REFERER = 'https://greenmotors.cc/';
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

var cachedBaseUrl = null;
var lastBaseUrlCheck = 0;

function safeFetch(url, options, timeoutMs) {
    timeoutMs = timeoutMs || 3200;
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

function stripReleaseMetadata(t) {
    return String(t || '')
        .replace(/\[[^\]]*\]/g, ' ')
        .replace(/\([^\)]*\)/g, ' ')
        .replace(/\b(?:480p|720p|1080p|2160p|4k|uhd|fhd|hd|sd|dual\s*audio|multi\s*audio|bluray|web-?dl|webrip|hdrip|esub|x264|x265|hevc|season\s*\d+|s\d+)\b[\s\S]*/i, '');
}

function cleanTitle(t) {
    return String(t || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
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
        var detailTag = distinct.length > 0 ? distinct.join(' · ') : 'HIN · ENG';
        return { isMulti: true, primary: 'Multi', tag: 'MULTI', badge: '[MULTI] [' + detailTag + ']' };
    }
    if (distinct.length === 1) {
        var single = distinct[0];
        var nameMap = { 'HIN': 'Hindi', 'ENG': 'English', 'TAM': 'Tamil', 'TEL': 'Telugu', 'MAL': 'Malayalam', 'KAN': 'Kannada', 'BEN': 'Bengali', 'MAR': 'Marathi' };
        return { isMulti: false, primary: nameMap[single] || single, tag: single, badge: '[' + single + ']' };
    }
    return { isMulti: false, primary: 'Hindi', tag: 'HIN', badge: '[HIN]' };
}

async function resolveMetadata(tmdbId, mediaType, extraArgs) {
    extraArgs = extraArgs || {};
    var isMovie = mediaType === 'movie';
    var title = extraArgs.title || extraArgs.name || '';
    var year = extraArgs.year || (extraArgs.releaseDate ? String(extraArgs.releaseDate).substring(0, 4) : '');
    var origLang = extraArgs.originalLanguage || extraArgs.original_language || '';
    var imdbId = extraArgs.imdbId || '';

    if (!title && tmdbId) {
        try {
            var url = TMDB_PROXY_URL + '/' + (isMovie ? 'movie' : 'tv') + '/' + tmdbId + '?api_key=test';
            var res = await safeFetch(url, { headers: { 'Accept': 'application/json' } }, 2500);
            if (res.ok) {
                var meta = await res.json();
                title = meta.title || meta.name || '';
                var relDate = meta.release_date || meta.first_air_date || '';
                year = year || (relDate ? String(relDate).substring(0, 4) : '');
                origLang = origLang || meta.original_language || '';
                imdbId = imdbId || meta.imdb_id || '';
            }
        } catch (_) {}
    }

    return {
        title: title || ('Media ' + tmdbId),
        year: year ? String(year) : '2024',
        originalLanguage: origLang || 'hi',
        imdbId: imdbId || ''
    };
}

async function getActiveBaseUrl() {
    var now = Date.now();
    if (cachedBaseUrl && (now - lastBaseUrlCheck < 1800000)) return cachedBaseUrl;

    try {
        var settled = await Promise.any(DYNAMIC_CONFIG_ENDPOINTS.map(async function(pingUrl) {
            var res = await safeFetch(pingUrl, { headers: { 'User-Agent': USER_AGENT } }, 2200);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var json = await res.json();
            if (json && json.info && json.info.c && typeof atob === 'function') {
                var decoded = atob(json.info.c.replace(/\\/g, ''));
                if (decoded && /^https?:\/\//i.test(decoded)) return decoded.replace(/\/+$/, '');
            }
            throw new Error('No domain');
        }));
        if (settled) {
            cachedBaseUrl = settled;
            lastBaseUrlCheck = now;
            return cachedBaseUrl;
        }
    } catch (_) {}

    cachedBaseUrl = BASE_URL;
    lastBaseUrlCheck = now;
    return cachedBaseUrl;
}

async function searchTypesense(query, activeBase) {
    try {
        var cleanQ = query.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
        var params = 'q=' + encodeURIComponent(cleanQ) +
                     '&query_by=' + encodeURIComponent('post_title,category,stars,director,imdb_id') +
                     '&query_by_weights=' + encodeURIComponent('4,2,2,2,4') +
                     '&sort_by=' + encodeURIComponent('sort_by_date:desc') +
                     '&limit=15&highlight_fields=none&use_cache=true&page=1';

        var res = await safeFetch(TYPESENSE_SEARCH_URL + '?' + params, {
            headers: { 'User-Agent': USER_AGENT, 'Referer': activeBase + '/search.html?q=' + encodeURIComponent(cleanQ), 'Origin': activeBase }
        }, 2800);
        if (!res.ok) return [];
        var data = await res.json();
        if (!data || !Array.isArray(data.hits)) return [];

        var results = [];
        for (var i = 0; i < data.hits.length; i++) {
            var doc = data.hits[i].document;
            if (!doc || !doc.permalink) continue;
            results.push({ title: doc.post_title || '', clean: cleanTitle(doc.post_title || ''), url: doc.permalink, imdbId: doc.imdb_id || '', category: doc.category || [] });
        }
        return results;
    } catch (_) {
        return [];
    }
}

async function searchFallback(query, activeBase) {
    var searchBases = [activeBase].concat(BACKUP_URLS);
    var seenBases = {};
    for (var b = 0; b < searchBases.length; b++) {
        var curBase = searchBases[b];
        if (seenBases[curBase]) continue;
        seenBases[curBase] = true;
        try {
            var res = await safeFetch(curBase + '/search.html?q=' + encodeURIComponent(query), { headers: DEFAULT_HEADERS }, 2800);
            if (!res.ok) continue;
            var html = await res.text();
            var aRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
            var am;
            var results = [];
            while ((am = aRegex.exec(html)) !== null) {
                var href = am[1];
                var rawTitle = am[2].replace(/<[^>]+>/g, '').trim();
                if (href.indexOf('hdhub4u') >= 0 && !/\/category\/|\/tag\/|\/page\/|wp-content|feed|\/app\//i.test(href) && rawTitle.length > 3) {
                    results.push({ title: rawTitle, clean: cleanTitle(rawTitle), url: href, imdbId: '', category: [] });
                }
            }
            if (results.length > 0) return results;
        } catch (_) {}
    }
    return [];
}

function gmRot13(str) {
    return String(str).replace(/[a-zA-Z]/g, function(c) {
        var base = c <= 'Z' ? 65 : 97;
        return String.fromCharCode((c.charCodeAt(0) - base + 13) % 26 + base);
    });
}

function gmDecodeB64(str) {
    if (typeof atob === 'function') {
        try {
            var b64 = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
            while (b64.length % 4) b64 += '=';
            return atob(b64);
        } catch (_) {}
    }
    return '';
}

function decodeGreenmotorsPayload(encoded) {
    try {
        var s1 = gmDecodeB64(encoded);
        var s2 = gmDecodeB64(s1);
        var s3 = gmRot13(s2);
        var s4 = gmDecodeB64(s3);
        return gmDecodeB64(JSON.parse(s4).o);
    } catch (_) {
        return null;
    }
}

async function resolveGreenmotorsUrl(gmUrl) {
    try {
        var res = await safeFetch(gmUrl, { headers: DEFAULT_HEADERS, redirect: 'follow' }, 3000);
        var text = await res.text();
        var m = text.match(/s\('o',\s*'([^']+)'/);
        if (m && m[1]) {
            var decoded = decodeGreenmotorsPayload(m[1]);
            if (decoded && /^https?:\/\//i.test(decoded)) return decoded;
        }
        var hbMatch = text.match(/https?:\/\/hblinks\.[a-z0-9.]+\/[^\s"'<>]+/i);
        if (hbMatch) return hbMatch[0];
    } catch (_) {}
    return null;
}

async function unwrapHdhubIntermediary(rawUrl) {
    var curUrl = rawUrl;
    if (curUrl.indexOf('greenmotors.') >= 0) {
        var gmTarget = await resolveGreenmotorsUrl(curUrl);
        if (!gmTarget) return [];
        curUrl = gmTarget;
    }

    if (curUrl.indexOf('hblinks.') >= 0) {
        try {
            var hbHtml = '';
            var hbRes = await safeFetch(curUrl, {
                headers: { 'User-Agent': USER_AGENT, 'Referer': GREENMOTORS_REFERER }
            }, 3000);
            if (hbRes.ok) {
                var txt = await hbRes.text();
                if (txt && txt.indexOf('Just a moment...') === -1 && txt.indexOf('challenges.cloudflare.com') === -1) hbHtml = txt;
            }
            if (!hbHtml) return [];

            var cloudLinks = [];
            var driveLinks = [];
            var seenHub = {};
            var hbRegex = /<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>/gi;
            var hm;
            while ((hm = hbRegex.exec(hbHtml)) !== null) {
                var u = hm[1].replace(/&amp;/g, '&');
                if (seenHub[u]) continue;
                seenHub[u] = true;
                if (u.indexOf('hubcloud.') >= 0 || u.indexOf('gamerxyt.') >= 0) cloudLinks.push(u);
                else if (u.indexOf('hubdrive.') >= 0) driveLinks.push(u);
            }
            var combined = cloudLinks.length > 0 ? cloudLinks : driveLinks;
            return combined.slice(0, 2);
        } catch (_) {
            return [];
        }
    }

    if (curUrl.indexOf('hubdrive.') >= 0 || curUrl.indexOf('hubcloud.') >= 0 || curUrl.indexOf('gamerxyt.') >= 0) {
        return [curUrl];
    }
    return [];
}

async function analyzeCloudStreamHealth(streamUrl) {
    if (!streamUrl || typeof streamUrl !== 'string' || !/^https?:\/\//i.test(streamUrl)) return false;
    if (DEFUNCT_OR_AD_REGEX.test(streamUrl) || /\.zip(?:$|\?)/i.test(streamUrl)) return false;
    try {
        var probeRes = await safeFetch(streamUrl, {
            method: 'GET',
            headers: { 'User-Agent': USER_AGENT, 'Range': 'bytes=0-0' },
            redirect: 'follow'
        }, 2400);

        if (probeRes.status < 200 || probeRes.status >= 400) {
            return false;
        }
        var cType = (probeRes.headers && (probeRes.headers.get('content-type') || probeRes.headers.get('Content-Type'))) || '';
        var lowerCt = cType.toLowerCase();
        if (lowerCt.indexOf('application/zip') >= 0 || lowerCt.indexOf('application/x-zip') >= 0 || lowerCt.indexOf('application/x-rar') >= 0) return false;
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
            }, 2000);
            var loc = resp.headers && (resp.headers.get('location') || resp.headers.get('Location'));
            if (!loc) break;
            if (loc.indexOf('?link=') >= 0) return decodeURIComponent(loc.split('?link=')[1]);
            if (loc.indexOf('googleusercontent.com') >= 0) return loc;
            referer = curUrl;
            curUrl = loc;
        }
        if (curUrl && curUrl !== pixelUrl && curUrl.indexOf('googleusercontent.com') >= 0) return curUrl;
    } catch (_) {}
    return null;
}

async function resolveHubCloud(hubUrl, activeBase) {
    try {
        var pageHtml = '';
        var res = await safeFetch(hubUrl, {
            headers: { 'User-Agent': USER_AGENT, 'Referer': activeBase + '/' }
        }, 2500);
        if (res.ok) {
            var txt = await res.text();
            if (txt && txt.indexOf('Just a moment...') === -1 && txt.indexOf('challenges.cloudflare.com') === -1) pageHtml = txt;
        }
        if (!pageHtml) return [];

        if (hubUrl.indexOf('hubdrive.') >= 0 || hubUrl.indexOf('/file/') >= 0) {
            var hubCloudMatch = pageHtml.match(/https:\/\/hubcloud\.[a-z0-9.]+\/drive\/[a-z0-9]+/i);
            if (hubCloudMatch && hubCloudMatch[0] !== hubUrl) return resolveHubCloud(hubCloudMatch[0], activeBase);
        }

        var gx = pageHtml.match(/https:\/\/gamerxyt\.com\/hubcloud\.php\?[^"'\s<>]+/);
        var gText = '';
        if (gx) {
            try {
                var gRes = await safeFetch(gx[0], { headers: { 'User-Agent': USER_AGENT, 'Referer': hubUrl } }, 2500);
                if (gRes.ok) gText = await gRes.text();
            } catch (_) {}
        }
        if (!gText) gText = pageHtml;

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
                (function(h) {
                    asyncTasks.push(analyzeCloudStreamHealth(h).then(function(ok) {
                        if (ok) servers.push({ serverName: 'ZipDisk', displayName: 'ZipDisk', url: h, priority: 3, headers: { 'User-Agent': USER_AGENT } });
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

    var initMetaAndBase = await Promise.all([
        resolveMetadata(tmdbId, mediaType, extraArgs),
        getActiveBaseUrl(),
        queryVdrkSubtitles(tmdbId, isMovie, sNum, eNum)
    ]);
    var meta = initMetaAndBase[0];
    var activeBase = initMetaAndBase[1];
    var externalSubs = initMetaAndBase[2];

    var searchTitle = meta.title.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    var candidates = await searchTypesense(searchTitle, activeBase);
    if (candidates.length === 0) {
        var firstWord = searchTitle.split(' ')[0];
        if (firstWord && firstWord.length > 3) candidates = await searchTypesense(firstWord, activeBase);
    }
    if (candidates.length === 0) candidates = await searchFallback(searchTitle, activeBase);
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

        if (meta.imdbId && cand.imdbId && cand.imdbId === meta.imdbId) score += 100;

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
            if (/\bmovie\b|\bfilm\b/i.test(candTitle)) score -= 80;
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
        }

        var spinoffRegex = /\b(?:the\s+challenge|in\s+conversation|making\s+of|behind\s+the\s+scenes|trailer|recap|explained|special)\b/i;
        if (spinoffRegex.test(candTitle) && !spinoffRegex.test(meta.title || '')) score -= 120;

        if (score >= 40) scoredCandidates.push({ cand: cand, score: score });
    }

    scoredCandidates.sort(function(a, b) { return b.score - a.score; });
    var selected = scoredCandidates.length > 0 ? scoredCandidates[0].cand : null;
    if (!selected) return [];

    var targetUrl = selected.url;
    try {
        targetUrl = activeBase + new URL(targetUrl).pathname;
    } catch (_) {}

    var postHtml = '';
    try {
        var postRes = await safeFetch(targetUrl, { headers: { 'User-Agent': USER_AGENT, 'Referer': activeBase + '/' } }, 3200);
        if (postRes.ok) postHtml = await postRes.text();
    } catch (_) {}
    if (!postHtml || /cf-turnstile|challenges\.cloudflare\.com|Just a moment\.\.\./i.test(postHtml)) return [];

    var audioInfo = parseAudiosFromText(selected.title + ' ' + postHtml.slice(0, 4000));
    var epTag = !isMovie ? ('S' + pad(sNum) + 'E' + pad(eNum)) : '';

    var aRegex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    var m;
    var streamPromises = [];
    var seenStreamKeys = {};

    if (isMovie) {
        var movieLinks = [];
        var seenMovieQualities = {};
        while ((m = aRegex.exec(postHtml)) !== null) {
            var href = m[1];
            var label = m[2].replace(/<[^>]+>/g, '').trim();
            if (/how-to-download|tutorial|telegram|join/i.test(label) || /how-to-download/i.test(href)) continue;

            if (href.indexOf('hubdrive.') >= 0 || href.indexOf('hubcloud.') >= 0 ||
                href.indexOf('gamerxyt.') >= 0 || href.indexOf('greenmotors.') >= 0 ||
                href.indexOf('hblinks.') >= 0) {
                var linkQuality = extractQualityFromContext(postHtml, m.index, label) || '1080p';
                if (!seenMovieQualities[linkQuality]) {
                    seenMovieQualities[linkQuality] = true;
                    movieLinks.push({ href: href, quality: linkQuality, context: postHtml.slice(Math.max(0, m.index - 250), m.index) + ' ' + label });
                }
            }
        }
        var selectedMovieLinks = movieLinks.slice(0, 4);
        for (var c = 0; c < selectedMovieLinks.length; c++) {
            (function(linkItem) {
                streamPromises.push(
                    unwrapHdhubIntermediary(linkItem.href).then(async function(hubUrls) {
                        if (!hubUrls || hubUrls.length === 0) return [];
                        var nested = await Promise.all(hubUrls.map(function(u) {
                            return resolveHubCloud(u, activeBase).catch(function() { return []; });
                        }));
                        var merged = Array.prototype.concat.apply([], nested);
                        return merged.map(function(s) { return Object.assign({}, s, { quality: s.quality || linkItem.quality || '1080p', context: linkItem.context }); });
                    })
                );
            })(selectedMovieLinks[c]);
        }
    } else {
        var epCandidates = [];
        var epRegex = new RegExp('(?:^|\\b)(?:episode|ep|e)\\s*0*' + eNum + '(?:\\b|\\D|$)', 'i');

        while ((m = aRegex.exec(postHtml)) !== null) {
            var eHref = m[1];
            var eLabel = m[2].replace(/<[^>]+>/g, '').trim();
            if (/how-to-download|tutorial|telegram|join/i.test(eLabel) || /how-to-download/i.test(eHref)) continue;
            if (/\b(?:pack|zip|batch)\b|\[\s*[0-9.]+\s*gb\s*\]/i.test(eLabel)) continue;

            if (eHref.indexOf('hubdrive.') >= 0 || eHref.indexOf('hubcloud.') >= 0 ||
                eHref.indexOf('gamerxyt.') >= 0 || eHref.indexOf('greenmotors.') >= 0 ||
                eHref.indexOf('hblinks.') >= 0) {
                var preSlice = postHtml.substring(Math.max(0, m.index - 400), m.index);
                var hrIdx = preSlice.lastIndexOf('<hr');
                var segPre = hrIdx >= 0 ? preSlice.slice(hrIdx) : preSlice;
                var fullContext = segPre + ' ' + eLabel;
                var qFromContext = parseQualityFromText(fullContext) || '1080p';

                var matchedEpisode = epRegex.test(eLabel);
                if (!matchedEpisode) {
                    var epCueRegex = /(?:^|\b)(?:episode|ep)\s*0*(\d+)\b/gi;
                    var lastEpNum = null;
                    var epCm;
                    while ((epCm = epCueRegex.exec(segPre)) !== null) lastEpNum = parseInt(epCm[1], 10);
                    if (lastEpNum === eNum) matchedEpisode = true;
                }
                if (matchedEpisode) epCandidates.push({ href: eHref, quality: qFromContext, context: fullContext });
            }
        }

        if (epCandidates.length === 0) {
            var allHubLinks = [];
            aRegex.lastIndex = 0;
            while ((m = aRegex.exec(postHtml)) !== null) {
                var rawH = m[1];
                var rawL = m[2].replace(/<[^>]+>/g, '').trim();
                if (/\b(?:pack|zip|batch)\b|\[\s*[0-9.]+\s*gb\s*\]/i.test(rawL)) continue;
                if (rawH.indexOf('hubdrive.') >= 0 || rawH.indexOf('hubcloud.') >= 0 ||
                    rawH.indexOf('greenmotors.') >= 0 || rawH.indexOf('hblinks.') >= 0) {
                    allHubLinks.push(rawH);
                }
            }
            var epIdx = eNum - 1;
            if (epIdx >= 0 && epIdx < allHubLinks.length) epCandidates.push({ href: allHubLinks[epIdx], quality: '1080p', context: '' });
        }

        var topEpCandidates = epCandidates.slice(0, 2);
        for (var t = 0; t < topEpCandidates.length; t++) {
            (function(cand) {
                streamPromises.push(
                    unwrapHdhubIntermediary(cand.href).then(async function(hubUrls) {
                        if (!hubUrls || hubUrls.length === 0) return [];
                        var nested = await Promise.all(hubUrls.map(function(u) {
                            return resolveHubCloud(u, activeBase).catch(function() { return []; });
                        }));
                        var merged = Array.prototype.concat.apply([], nested);
                        return merged.map(function(s) { return Object.assign({}, s, { quality: s.quality || cand.quality || '1080p', context: cand.context }); });
                    })
                );
            })(topEpCandidates[t]);
        }
    }

    var settled = await Promise.allSettled(streamPromises);
    var finalStreams = [];

    for (var bIdx = 0; bIdx < settled.length; bIdx++) {
        var resObj = settled[bIdx];
        if (resObj.status !== 'fulfilled' || !Array.isArray(resObj.value)) continue;
        var batch = resObj.value;

        for (var s = 0; s < batch.length; s++) {
            var item = batch[s];
            if (!item || !item.url) continue;

            var streamKey = item.url + '|' + item.quality;
            if (seenStreamKeys[streamKey]) continue;
            seenStreamKeys[streamKey] = true;

            var tech = extractMediaTags(selected.title + ' ' + (item.context || ''));
            var techSuffix = tech.tags.length > 0 ? (' [' + tech.tags.join(' · ') + ']') : '';

            var finalTitle = isMovie
                ? (meta.title + ' (' + meta.year + ') ' + audioInfo.badge + ' - HDHub4u ' + item.displayName + ' [' + item.quality + ']' + techSuffix)
                : (meta.title + ' ' + epTag + ' ' + audioInfo.badge + ' - HDHub4u ' + item.displayName + ' [' + item.quality + ']' + techSuffix);

            var streamFormat = item.url.indexOf('.m3u8') >= 0 ? 'm3u8' :
                               (item.url.indexOf('.mpd') >= 0 ? 'mpd' :
                               ((item.url.indexOf('.mkv') >= 0 || item.url.indexOf('googleusercontent.com') >= 0) ? 'mkv' : 'mp4'));
            var stLabel = streamFormat === 'm3u8' ? 'HLS' : (streamFormat === 'mpd' ? 'DASH' : (streamFormat === 'mkv' ? 'Direct MKV' : 'Direct MP4'));
            var descParts = [stLabel, item.quality, audioInfo.badge].concat(tech.tags);

            finalStreams.push({
                name: 'HDHub4u | HubCloud › ' + item.serverName + ' • ' + audioInfo.badge + ' (' + item.quality + ')' + techSuffix,
                title: finalTitle,
                rawTitle: selected.title,
                description: descParts.join(' • '),
                url: item.url,
                quality: item.quality,
                isAdaptive: false,
                streamType: stLabel,
                size: isMovie ? '2.2 GB' : '900 MB',
                type: streamFormat === 'mkv' ? 'mp4' : streamFormat,
                format: streamFormat,
                container: streamFormat === 'mkv' ? 'mkv' : (streamFormat === 'mpd' ? 'dash' : (streamFormat === 'm3u8' ? 'hls' : 'mp4')),
                isSequential: streamFormat === 'mkv' || streamFormat === 'mp4',
                provider: 'hdhub4u',
                server: 'HubCloud',
                subServer: item.serverName,
                language: (audioInfo.tag || 'hin').toLowerCase(),
                headers: item.headers || { 'User-Agent': USER_AGENT },
                subtitles: externalSubs,
                audio: audioInfo,
                hdrType: tech.hdrType,
                codec: tech.codec,
                audioFormat: tech.audioFormat,
                sourceType: tech.sourceType,
                tags: tech.tags
            });
        }
    }

    console.log('[HDHub4u] Discovered ' + finalStreams.length + ' stream(s), subtitles: ' + externalSubs.length);
    return finalStreams;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams: getStreams };
}
if (typeof globalThis !== 'undefined') {
    globalThis.getStreams = getStreams;
}
