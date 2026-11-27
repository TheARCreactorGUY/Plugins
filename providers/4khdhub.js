/**
 * 4KHDHub Provider Plugin for Euthopiar / Universal Streaming Architecture
 *
 * Dedicated provider for 4KHDHub supporting Movies, TV Series, and Anime
 * across FSL R2, 10Gbps Pixel Cloud (Google CDN), ZipDisk, and Pixeldrain
 * with rich release metadata, dynamic multi-audio tagging, and QuickJS compliance.
 */

/* =========================================================================
   CONFIG BLOCK: If site changes domain, update ONLY the URLs in this block.
   ========================================================================= */
var BASE_URL = 'https://4khdhub.one';
var GREENMOTORS_REFERER = 'https://greenmotors.cc/';
var GAMERXYT_REFERER = 'https://gamerxyt.com/';
var SUB_VDRK_URL = 'https://sub.vdrk.site/v2';
var TMDB_PROXY_URL = 'https://db.wecollege.net/3';
/* ========================================================================= */

var DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Referer': BASE_URL + '/'
};

var DEFUNCT_OR_AD_REGEX = /busycdn|rtmark|redirect|advert|ad\.|shortlink|clk|icy-king-205d|download\.goldmines|goldmines\.server-|cdn\.faceboook\.workers\.dev/i;

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

var LANGUAGE_MAP = {
    'en': { name: 'English', tag: 'ENG' }, 'hi': { name: 'Hindi', tag: 'HIN' },
    'ja': { name: 'Japanese', tag: 'JPN' }, 'es': { name: 'Spanish', tag: 'SPA' },
    'fr': { name: 'French', tag: 'FRA' }, 'de': { name: 'German', tag: 'GER' },
    'it': { name: 'Italian', tag: 'ITA' }, 'ko': { name: 'Korean', tag: 'KOR' },
    'ru': { name: 'Russian', tag: 'RUS' }, 'ta': { name: 'Tamil', tag: 'TAM' },
    'te': { name: 'Telugu', tag: 'TEL' }, 'ml': { name: 'Malayalam', tag: 'MAL' },
    'kn': { name: 'Kannada', tag: 'KAN' }
};

function getLanguageInfo(code) {
    if (!code) return { name: 'English', tag: 'ENG' };
    var lower = String(code).toLowerCase().trim();
    if (LANGUAGE_MAP[lower]) return LANGUAGE_MAP[lower];
    for (var k in LANGUAGE_MAP) {
        if (LANGUAGE_MAP[k].name.toLowerCase() === lower) return LANGUAGE_MAP[k];
    }
    return { name: String(code).toUpperCase(), tag: String(code).slice(0, 3).toUpperCase() };
}

function parseAudiosFromText(text) {
    if (!text) return { isMulti: false, primary: 'English', tag: 'ENG', badge: '[ENG]' };
    var upper = String(text).toUpperCase();
    var langs = [];
    var isMultiCue = /\b(MULTI|DUAL|MULTI-AUDIO|DUAL-AUDIO)\b/i.test(upper) ||
                     (/\b(HINDI|HIN)\b/i.test(upper) && /\b(ENGLISH|ENG)\b/i.test(upper));

    if (/\b(HINDI|HIN)\b/i.test(upper)) langs.push('HIN');
    if (/\b(ENGLISH|ENG)\b/i.test(upper)) langs.push('ENG');
    if (/\b(TAMIL|TAM)\b/i.test(upper)) langs.push('TAM');
    if (/\b(TELUGU|TEL)\b/i.test(upper)) langs.push('TEL');
    if (/\b(KOREAN|KOR)\b/i.test(upper)) langs.push('KOR');
    if (/\b(JAPANESE|JPN)\b/i.test(upper)) langs.push('JPN');
    if (/\b(SPANISH|SPA)\b/i.test(upper)) langs.push('SPA');
    if (/\b(FRENCH|FRA)\b/i.test(upper)) langs.push('FRA');
    if (/\b(GERMAN|GER)\b/i.test(upper)) langs.push('GER');
    if (/\b(RUSSIAN|RUS)\b/i.test(upper)) langs.push('RUS');
    if (/\b(MALAYALAM|MAL)\b/i.test(upper)) langs.push('MAL');
    if (/\b(KANNADA|KAN)\b/i.test(upper)) langs.push('KAN');

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
        var info = getLanguageInfo(tag.toLowerCase());
        return { isMulti: false, primary: info.name, tag: tag, badge: '[' + tag + ']' };
    }
    return { isMulti: false, primary: 'English', tag: 'ENG', badge: '[ENG]' };
}

function parseQualityFromText(text) {
    if (!text) return '1080p';
    var t = String(text);
    if (/2160p\b/i.test(t)) return '4K 2160p';
    if (/1080[pi]\b|fhd\b/i.test(t)) return '1080p';
    if (/720p\b/i.test(t)) return '720p';
    if (/(?:480|576)p\b|sd\b/i.test(t)) return '480p';

    var clean = t.replace(/\bds-?4k\b/gi, '')
                 .replace(/\b4k[-_ ]?hdhub[a-z0-9.]*\b/gi, '')
                 .replace(/4k[- ]?remaster(?:ed)?/gi, '')
                 .replace(/4k[- ]?sdr/gi, '')
                 .replace(/4k[- ]?hdr/gi, '');

    if (/\b(?:4k|uhd)\b/i.test(clean)) return '4K 2160p';
    if (/\b(?:hd)\b/i.test(clean)) return '720p';
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

function rot13(str) {
    return String(str).replace(/[a-zA-Z]/g, function(c) {
        var base = c <= 'Z' ? 65 : 97;
        return String.fromCharCode((c.charCodeAt(0) - base + 13) % 26 + base);
    });
}

function decodeB64(str) {
    try {
        if (typeof atob === 'function') {
            var b64 = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
            while (b64.length % 4) b64 += '=';
            return atob(b64);
        }
    } catch (_) {}
    return '';
}

function decodeGreenmotorsPayload(encoded) {
    try {
        var s1 = decodeB64(encoded);
        var s2 = decodeB64(s1);
        var s3 = rot13(s2);
        var s4 = decodeB64(s3);
        var parsed = JSON.parse(s4);
        return decodeB64(parsed.o);
    } catch (e) {
        return null;
    }
}

function pickBestGreenmotorsLink(blockHtml) {
    if (!blockHtml) return '';
    var aRe = /<a[^>]+href="(https:\/\/greenmotors\.[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    var first = '';
    var m;
    while ((m = aRe.exec(blockHtml)) !== null) {
        if (!first) first = m[1];
        var label = m[2].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').trim();
        if (/hubcloud/i.test(label)) return m[1];
    }
    return first;
}

async function resolveGreenmotorsUrl(gmUrl) {
    try {
        var res = await safeFetch(gmUrl, {
            headers: DEFAULT_HEADERS,
            redirect: 'follow'
        }, 2500);
        var text = await res.text();
        var m = text.match(/s\('o',\s*'([^']+)'/);
        if (!m) return null;
        return decodeGreenmotorsPayload(m[1]);
    } catch (e) {
        return null;
    }
}

async function resolvePixelCloud(pixelUrl) {
    var curUrl = pixelUrl;
    var referer = GAMERXYT_REFERER;
    try {
        for (var hop = 0; hop < 3; hop++) {
            var resp = await safeFetch(curUrl, {
                headers: {
                    'User-Agent': DEFAULT_HEADERS['User-Agent'],
                    'Referer': referer
                },
                redirect: 'manual'
            }, 2000);

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
                var extracted = decodeURIComponent(loc.split('?link=')[1]);
                if (extracted && extracted.indexOf('googleusercontent.com') >= 0) return extracted;
                curUrl = extracted;
            } else {
                curUrl = loc;
            }

            if (curUrl.indexOf('googleusercontent.com') >= 0) return curUrl;
            referer = curUrl;
        }
        if (curUrl && curUrl !== pixelUrl && curUrl.indexOf('googleusercontent.com') >= 0) return curUrl;
    } catch (e) {}
    return null;
}

async function analyzeCloudStreamHealth(streamUrl) {
    if (!streamUrl || typeof streamUrl !== 'string' || !/^https?:\/\//i.test(streamUrl)) return false;
    if (DEFUNCT_OR_AD_REGEX.test(streamUrl) || /\.zip(?:$|\?)/i.test(streamUrl)) return false;
    try {
        var probeRes = await safeFetch(streamUrl, {
            method: 'GET',
            headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'], 'Range': 'bytes=0-0' },
            redirect: 'follow'
        }, 2400);

        if (probeRes.status < 200 || probeRes.status >= 400) {
            return false;
        }

        var cType = (probeRes.headers && (probeRes.headers.get('content-type') || probeRes.headers.get('Content-Type'))) || '';
        var lowerCt = cType.toLowerCase();
        if ((lowerCt.indexOf('text/') >= 0 || lowerCt.indexOf('application/json') >= 0) &&
            (probeRes.status === 200 || probeRes.status === 206)) {
            return false;
        }
        return true;
    } catch (e) {
        return false;
    }
}

async function resolveHubCloud(hubUrl) {
    try {
        var res = await safeFetch(hubUrl, {
            headers: {
                'User-Agent': DEFAULT_HEADERS['User-Agent'],
                'Referer': GREENMOTORS_REFERER
            }
        }, 2500);
        var text = await res.text();

        if (hubUrl.indexOf('hubdrive.') >= 0) {
            var m = text.match(/https:\/\/hubcloud\.[a-z0-9.]+\/drive\/[a-z0-9]+/i);
            if (m) return resolveHubCloud(m[0]);
        }

        var gx = text.match(/https:\/\/gamerxyt\.com\/hubcloud\.php\?[^"'\s<>]+/);
        if (!gx) return [];

        var gRes = await safeFetch(gx[0], {
            headers: {
                'User-Agent': DEFAULT_HEADERS['User-Agent'],
                'Referer': hubUrl
            }
        }, 2500);
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
                    asyncTasks.push(analyzeCloudStreamHealth(pUrl).then(function(isHealthy) {
                        if (isHealthy) {
                            servers.push({
                                serverName: 'Pixeldrain',
                                displayName: 'Pixeldrain',
                                url: pUrl,
                                priority: 2,
                                headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                            });
                        }
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
                servers.push({
                    serverName: 'FSL R2',
                    displayName: 'FSL R2',
                    url: href,
                    priority: 1,
                    headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                });
            } else if (label.indexOf('PixelServer') >= 0 || href.indexOf('pixeldrain') >= 0) {
                if (href.indexOf('negn6f') >= 0) continue;
                var directPixeldrain = href.replace(/\/u\/([a-zA-Z0-9_-]+)/, '/api/file/$1?download')
                                           .replace('pixeldrain.dev', 'pixeldrain.com');
                (function(pUrl) {
                    asyncTasks.push(analyzeCloudStreamHealth(pUrl).then(function(isHealthy) {
                        if (isHealthy) {
                            servers.push({
                                serverName: 'Pixeldrain',
                                displayName: 'Pixeldrain',
                                url: pUrl,
                                priority: 2,
                                headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                            });
                        }
                    }).catch(function() {}));
                })(directPixeldrain);
            } else if (label.indexOf('ZipDisk') >= 0 || href.indexOf('workers.dev') >= 0) {
                (function(zh) {
                    asyncTasks.push(analyzeCloudStreamHealth(zh).then(function(isHealthy) {
                        if (isHealthy) {
                            servers.push({
                                serverName: 'ZipDisk',
                                displayName: 'ZipDisk',
                                url: zh,
                                priority: 3,
                                headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                            });
                        }
                    }).catch(function() {}));
                })(href);
            } else if (label.indexOf('10Gbps') >= 0 || /pixel\.hubcloud\.[a-z0-9]+/i.test(href) || /gpdl\.hubcloud\.[a-z0-9]+/i.test(href)) {
                (function(h) {
                    asyncTasks.push(resolvePixelCloud(h).then(async function(directPixel) {
                        if (directPixel && await analyzeCloudStreamHealth(directPixel)) {
                            servers.push({
                                serverName: 'Pixel Cloud',
                                displayName: '10Gbps Pixel Cloud',
                                url: directPixel,
                                priority: 4,
                                headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                            });
                        }
                    }).catch(function() {}));
                })(href);
            } else if (label.indexOf('Watch Online') >= 0 || href.indexOf('hbplay.pages.dev') >= 0) {
                var uMatch = href.match(/[?&]u=([a-zA-Z0-9+/=]+)/);
                if (uMatch) {
                    var decodedStream = decodeB64(uMatch[1]);
                    if (decodedStream && /^https?:\/\//i.test(decodedStream) && !seenUrls[decodedStream] && !DEFUNCT_OR_AD_REGEX.test(decodedStream)) {
                        seenUrls[decodedStream] = true;
                        (function(dsUrl) {
                            asyncTasks.push(analyzeCloudStreamHealth(dsUrl).then(function(isHealthy) {
                                if (isHealthy) {
                                    servers.push({
                                        serverName: 'FSL R2',
                                        displayName: 'FSL R2',
                                        url: dsUrl,
                                        priority: 1,
                                        headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
                                    });
                                }
                            }).catch(function() {}));
                        })(decodedStream);
                    }
                }
            }
        }
        if (asyncTasks.length > 0) {
            await Promise.all(asyncTasks);
        }
        return servers;
    } catch (e) {
        return [];
    }
}

async function resolveMetadata(tmdbId, mediaType, extraArgs) {
    var callArgs = (typeof globalThis !== 'undefined' && globalThis.__CALL_ARGS__) || {};
    extraArgs = Object.assign({}, callArgs, extraArgs || {});
    var title = extraArgs.title || extraArgs.name || '';
    var year = extraArgs.year || (extraArgs.releaseDate ? String(extraArgs.releaseDate).substring(0, 4) : '');
    var origLang = extraArgs.originalLanguage || extraArgs.original_language || '';

    if (!title) {
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
        year: year ? String(year) : '2020',
        originalLanguage: origLang || (mediaType === 'anime' ? 'ja' : 'en')
    };
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

function scoreCandidateTitle(targetTitle, targetYear, candTitle, isMovie, sNum) {
    var targetClean = cleanTitle(targetTitle);
    var candClean = cleanTitle(candTitle);
    var stopWords = { 'the': 1, 'a': 1, 'an': 1, 'of': 1, 'and': 1, 'in': 1, 'to': 1, 'for': 1, 'on': 1, 'with': 1, 'at': 1, 'by': 1, 'from': 1 };
    var targetWords = targetClean.split(' ').filter(function(w) { return w.length > 1 && !stopWords[w]; });
    if (targetWords.length === 0) targetWords = targetClean.split(' ').filter(function(w) { return w.length > 1; });
    if (targetWords.length === 0) return 0;

    var matchedWords = 0;
    for (var w = 0; w < targetWords.length; w++) {
        if (candClean.indexOf(targetWords[w]) >= 0) matchedWords++;
    }
    if (matchedWords / targetWords.length < 0.6) return -100;

    var score = matchedWords * 10;
    if (candClean.indexOf(targetClean) >= 0) score += 30;

    var sequelRegex = /\b(2|3|4|5|6|7|8|9|ii|iii|iv|v|vi|part\s*\d+|chapter\s*\d+)\b/i;
    var targetSequelMatch = targetClean.match(sequelRegex);
    var candSequelMatch = cleanTitle(stripReleaseMetadata(candTitle)).match(sequelRegex);
    var targetSequel = targetSequelMatch ? targetSequelMatch[0].replace(/\s+/g, '') : null;
    var candSequel = candSequelMatch ? candSequelMatch[0].replace(/\s+/g, '') : null;

    if (!targetSequel && candSequel) score -= 80;
    else if (targetSequel && !candSequel) score -= 50;
    else if (targetSequel && candSequel && targetSequel !== candSequel) score -= 80;

    if (isMovie && targetYear) {
        var metaY = parseInt(targetYear, 10);
        var candYearMatches = candTitle.match(/\b(19\d\d|20\d\d)\b/g);
        if (candYearMatches && candYearMatches.length > 0) {
            var hasYearMatch = candYearMatches.some(function(yStr) { return Math.abs(parseInt(yStr, 10) - metaY) <= 1; });
            score += hasYearMatch ? 50 : -80;
        }
    }

    if (isMovie) {
        if (/season\s*\d+|complete\s*series|s\d{1,2}e\d{1,2}/i.test(candTitle)) score -= 100;
    } else {
        if (/\bmovie\b|\bfilm\b/i.test(candTitle)) score -= 80;
        var rangeMatch = candTitle.match(/season\s*0*(\d+)\s*(?:-|to|&#8211;)\s*0*(\d+)/i) ||
                         candTitle.match(/s0*(\d+)\s*(?:-|to)\s*s?0*(\d+)/i);
        var singleMatch = candTitle.match(/season\s*0*(\d+)/i) || candTitle.match(/s0*(\d+)/i);

        if (rangeMatch) {
            var startS = Number(rangeMatch[1]);
            var endS = Number(rangeMatch[2]);
            score += (sNum >= startS && sNum <= endS) ? 60 : -100;
        } else if (singleMatch) {
            score += (Number(singleMatch[1]) === sNum) ? 80 : -100;
        } else if (/complete|series/i.test(candTitle)) {
            score += 30;
        }
    }

    return score;
}

async function search4khdHub(query) {
    try {
        var url = BASE_URL + '/?s=' + encodeURIComponent(query);
        var res = await safeFetch(url, { headers: DEFAULT_HEADERS }, 3200);
        if (!res.ok) return [];
        var text = await res.text();

        var results = [];
        var cardRegex = /<a[^>]+href="([^"]+)"[^>]*class="[^"]*movie-card[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
        var m;
        while ((m = cardRegex.exec(text)) !== null) {
            var href = m[1];
            var raw = m[2];
            var titleMatch = raw.match(/alt="([^"]+)"/i) || raw.match(/aria-label="([^"]+)"/i);
            var title = titleMatch ? titleMatch[1].replace(/ details$/i, '').trim() : '';
            var fullUrl = href.indexOf('http') === 0 ? href : (BASE_URL + (href.charAt(0) === '/' ? '' : '/') + href);
            results.push({ url: fullUrl, title: title, type: fullUrl.indexOf('-movie-') >= 0 ? 'movie' : 'tv' });
        }

        if (results.length === 0) {
            var fallbackRegex = /<a[^>]+href="([^"]*(?:-movie-|-series-)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
            var fMatch;
            while ((fMatch = fallbackRegex.exec(text)) !== null) {
                var fHref = fMatch[1];
                var fTitleMatch = fMatch[2].match(/alt="([^"]+)"/i) || fMatch[2].match(/aria-label="([^"]+)"/i);
                var fTitle = fTitleMatch ? fTitleMatch[1].replace(/ details$/i, '').trim() : '';
                var fFullUrl = fHref.indexOf('http') === 0 ? fHref : (BASE_URL + (fHref.charAt(0) === '/' ? '' : '/') + fHref);
                results.push({ url: fFullUrl, title: fTitle, type: fFullUrl.indexOf('-movie-') >= 0 ? 'movie' : 'tv' });
            }
        }
        return results;
    } catch (e) {
        return [];
    }
}

async function queryVdrkSubtitles(tmdbId, isMovie, sNum, eNum) {
    try {
        var subUrl = isMovie
            ? (SUB_VDRK_URL + '/movie/' + encodeURIComponent(tmdbId))
            : (SUB_VDRK_URL + '/tv/' + encodeURIComponent(tmdbId) + '/' + sNum + '/' + eNum);
        var res = await safeFetch(subUrl, { headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] } }, 2200);
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
                headers: { 'User-Agent': DEFAULT_HEADERS['User-Agent'] }
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
    var epTag = !isMovie ? ('S' + (sNum < 10 ? '0' : '') + sNum + 'E' + (eNum < 10 ? '0' : '') + eNum) : '';

    var meta = await resolveMetadata(tmdbId, mediaType, extraArgs);
    var searchTitle = meta.title.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

    var initParallel = await Promise.all([
        search4khdHub(searchTitle),
        queryVdrkSubtitles(tmdbId, isMovie, sNum, eNum)
    ]);
    var searchResults = initParallel[0];
    var externalSubs = initParallel[1];
    if (searchResults.length === 0) return [];

    var scoredResults = [];
    for (var sr = 0; sr < searchResults.length; sr++) {
        var cand = searchResults[sr];
        var sc = scoreCandidateTitle(meta.title, meta.year, cand.title, isMovie, sNum);
        if (sc > 0 && cand.type === (isMovie ? 'movie' : 'tv')) sc += 10;
        if (sc >= 50) scoredResults.push({ cand: cand, score: sc });
    }
    scoredResults.sort(function(a, b) { return b.score - a.score; });
    var matching = scoredResults.length > 0 ? scoredResults[0].cand : null;
    if (!matching) return [];

    var pageRes = await safeFetch(matching.url, { headers: DEFAULT_HEADERS }, 3200);
    if (!pageRes.ok) return [];
    var html = await pageRes.text();

    var releases = [];
    var epRegex = new RegExp('(?:S0*' + sNum + '\\s*E0*' + eNum + '|Episode[-_\\s]*0*' + eNum + ')\\b', 'i');

    if (!isMovie) {
        var epSectionIdx = html.indexOf('id="episodes"');
        var searchArea = epSectionIdx !== -1 ? html.slice(epSectionIdx) : html;
        var blocks = searchArea.split('<div class="episode-download-item">');
        for (var i = 1; i < blocks.length; i++) {
            var block = blocks[i];
            var titleMatch = block.match(/<div class="episode-file-title">([\s\S]*?)<\/div>/i);
            var title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
            var link = pickBestGreenmotorsLink(block);
            if (link && epRegex.test(title)) {
                releases.push({ rawTitle: title, quality: parseQualityFromText(title), audio: parseAudiosFromText(title), link: link });
            }
        }
    } else {
        var mBlocks = html.split(/<div[^>]+id="content-file\d+"/i);
        for (var j = 1; j < mBlocks.length; j++) {
            var mBlock = mBlocks[j];
            var mTitleMatch = mBlock.match(/<div class="file-title">([\s\S]*?)<\/div>/i);
            var mTitle = mTitleMatch ? mTitleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
            var mLink = pickBestGreenmotorsLink(mBlock);
            if (mLink) {
                releases.push({ rawTitle: mTitle, quality: parseQualityFromText(mTitle), audio: parseAudiosFromText(mTitle), link: mLink });
            }
        }
    }

    if (releases.length === 0) return [];

    // Prioritize top 4 releases covering distinct quality tiers
    var qRank = { '4K 2160p': 4, '1080p': 3, '720p': 2, '480p': 1 };
    releases.sort(function(a, b) { return (qRank[b.quality] || 0) - (qRank[a.quality] || 0); });
    var selectedReleases = [];
    var seenQ = {};
    for (var ri = 0; ri < releases.length; ri++) {
        if (!seenQ[releases[ri].quality]) {
            seenQ[releases[ri].quality] = true;
            selectedReleases.push(releases[ri]);
        }
    }
    for (var rj = 0; rj < releases.length && selectedReleases.length < 4; rj++) {
        if (selectedReleases.indexOf(releases[rj]) === -1) selectedReleases.push(releases[rj]);
    }
    selectedReleases = selectedReleases.slice(0, 4);

    var settled = await Promise.all(selectedReleases.map(async function(rel) {
        var hubUrl = await resolveGreenmotorsUrl(rel.link);
        if (!hubUrl) return [];
        var servers = await resolveHubCloud(hubUrl);
        return servers.map(function(srv) { return { release: rel, server: srv }; });
    }));
    var flattened = Array.prototype.concat.apply([], settled);

    var streams = [];
    var seenStreamKeys = {};

    for (var k = 0; k < flattened.length; k++) {
        var item = flattened[k];
        var rel = item.release;
        var srv = item.server;
        var audio = rel.audio;
        var quality = rel.quality;

        var dedupeKey = srv.url + '|' + quality;
        if (seenStreamKeys[dedupeKey]) continue;
        seenStreamKeys[dedupeKey] = true;

        var tech = extractMediaTags(rel.rawTitle + ' ' + matching.title);
        var techSuffix = tech.tags.length > 0 ? (' [' + tech.tags.join(' · ') + ']') : '';

        var streamTitle = !isMovie
            ? (meta.title + ' ' + epTag + ' ' + audio.badge + ' - 4KHDHub ' + srv.serverName + ' [' + quality + ']' + techSuffix)
            : (meta.title + ' (' + meta.year + ') ' + audio.badge + ' - 4KHDHub ' + srv.serverName + ' [' + quality + ']' + techSuffix);
        var displayName = '4KHDHub | HubCloud › ' + srv.displayName + ' • ' + audio.badge + ' (' + quality + ')' + techSuffix;

        var sizeMatch = rel.rawTitle.match(/\[\s*([0-9.]+\s*[MG]B)\s*\]/i) ||
                        rel.rawTitle.match(/(\d+(?:\.\d+)?\s*(?:GB|MB))/i);
        var parsedSize = sizeMatch ? sizeMatch[1].trim() : (isMovie ? '2.5 GB' : '950 MB');

        var isHls = srv.url.indexOf('.m3u8') >= 0;
        var isMkv = srv.url.indexOf('.mkv') >= 0 || srv.url.indexOf('googleusercontent.com') >= 0 || (rel.rawTitle && rel.rawTitle.toLowerCase().indexOf('.mkv') >= 0);
        var streamFormat = isHls ? 'm3u8' : (isMkv ? 'mkv' : 'mp4');
        var stLabel = isHls ? 'HLS' : (isMkv ? 'Direct MKV' : 'Direct MP4');
        var descParts = [stLabel, quality, parsedSize, audio.badge].concat(tech.tags);

        streams.push({
            name: displayName,
            title: streamTitle,
            rawTitle: rel.rawTitle || matching.title,
            description: descParts.join(' • '),
            url: srv.url,
            quality: quality,
            isAdaptive: false,
            streamType: stLabel,
            size: parsedSize,
            priority: srv.priority || 99,
            type: streamFormat === 'mkv' ? 'mp4' : streamFormat,
            format: streamFormat,
            container: streamFormat,
            isSequential: streamFormat === 'mp4' || streamFormat === 'mkv',
            provider: '4khdhub',
            server: 'HubCloud',
            subServer: srv.serverName,
            language: audio.tag.toLowerCase(),
            audio: audio,
            hdrType: tech.hdrType,
            codec: tech.codec,
            audioFormat: tech.audioFormat,
            sourceType: tech.sourceType,
            tags: tech.tags,
            headers: srv.headers || { 'User-Agent': DEFAULT_HEADERS['User-Agent'] },
            subtitles: externalSubs
        });
    }

    streams.sort(function(a, b) {
        var wa = qRank[a.quality] || 0;
        var wb = qRank[b.quality] || 0;
        if (wb !== wa) return wb - wa;
        return (a.priority || 99) - (b.priority || 99);
    });

    console.log('[4KHDHub] Discovered ' + streams.length + ' stream(s), subtitles: ' + externalSubs.length);
    return streams;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams: getStreams };
}
if (typeof globalThis !== 'undefined') {
    globalThis.getStreams = getStreams;
}
