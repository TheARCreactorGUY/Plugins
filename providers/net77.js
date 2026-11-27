/**
 * Net77 (NetMirror) Provider Plugin for Euthopiar / Universal Streaming Architecture
 *
 * Dedicated provider for NetMirror (Netflix, Prime Video, Hotstar)
 * delivering Adaptive HLS Master Playlists (.m3u8) with multi-audio tracks
 * and WebVTT subtitle extraction across 30+ languages.
 */

/* =========================================================================
   CONFIG BLOCK: If site changes domain, update ONLY the URLs in this block.
   ========================================================================= */
var BASE_URL = 'https://net77.cc';
var VERIFY_BASE = 'https://net52.cc';
var VERIFY_URL = VERIFY_BASE + '/verify.php';
var DEFAULT_API_BASE = 'https://tv.imgcdn.kim';
var TMDB_PROXY_URL = 'https://db.wecollege.net/3';
var API_DISCOVERY_HOSTS = [
    'https://mobiledetects.com',
    'https://mobiledetect.app',
    'https://mobidetect.art',
    'https://mobidetect.cc',
    'https://mobidetect.live',
    'https://mobidetect.vip',
    'https://mobidetect.xyz'
];
/* ========================================================================= */

var DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0',
    'Accept': 'application/json, text/plain, */*',
    'Referer': VERIFY_BASE + '/'
};

var OTT_PLATFORMS = [
    { id: 'nf', name: 'Netflix' },
    { id: 'pv', name: 'Prime Video' },
    { id: 'hs', name: 'Hotstar' }
];

var cachedCookie = null;
var cachedCookieExpiry = 0;
var cachedApiBase = DEFAULT_API_BASE;

function safeFetch(url, options, timeoutMs) {
    timeoutMs = timeoutMs || 3200;
    var timer;
    var timeoutPromise = new Promise(function(_, reject) {
        timer = setTimeout(function() {
            reject(new Error('Request timed out (' + timeoutMs + 'ms): ' + url));
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

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0;
        var v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

async function refreshApiBase() {
    for (var i = 0; i < API_DISCOVERY_HOSTS.length; i++) {
        try {
            var dUrl = API_DISCOVERY_HOSTS[i] + '/checknewtv.php';
            var res = await safeFetch(dUrl, {
                headers: {
                    'X-Requested-With': 'NetmirrorNewTV v1.0',
                    'User-Agent': DEFAULT_HEADERS['User-Agent'],
                    'Accept': 'application/json'
                }
            }, 2200);
            if (res.ok) {
                var json = await res.json();
                if (json && json.token_hash && typeof atob === 'function') {
                    cachedApiBase = atob(json.token_hash).replace(/\/+$/, '');
                    return cachedApiBase;
                }
            }
        } catch (e) {}
    }
    return cachedApiBase;
}

async function getSessionCookie(forceRefresh) {
    if (!forceRefresh && cachedCookie && Date.now() < cachedCookieExpiry) {
        return cachedCookie;
    }

    try {
        var uuid = generateUUID();
        var formBody = 'g-recaptcha-response=' + encodeURIComponent(uuid);
        var res = await safeFetch(VERIFY_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Origin': VERIFY_BASE,
                'Referer': VERIFY_BASE + '/verify2',
                'User-Agent': DEFAULT_HEADERS['User-Agent']
            },
            body: formBody,
            redirect: 'manual'
        }, 3200);

        var setCookie = res.headers.get('set-cookie');
        if (setCookie && setCookie.indexOf('t_hash_t=') >= 0) {
            var m = setCookie.match(/t_hash_t=([^;]+)/);
            if (m) {
                cachedCookie = 't_hash_t=' + m[1];
                cachedCookieExpiry = Date.now() + 24 * 3600 * 1000;
                return cachedCookie;
            }
        }
    } catch (e) {
        console.error('[Net77] Session cookie verification error:', e.message);
    }
    return null;
}

function parseMasterPlaylist(m3u8Text, baseUrl, streamHeaders) {
    var audios = [];
    var subs = [];
    var lines = m3u8Text.split('\n');
    var maxW = 0;
    var maxH = 0;
    var variantCount = 0;
    var hasHevc = false;
    var hasHdr = false;
    var hasDv = false;
    var hasAtmos = false;

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.indexOf('#EXT-X-MEDIA:TYPE=AUDIO') === 0) {
            var nameMatch = line.match(/NAME="([^"]+)"/);
            var langMatch = line.match(/LANGUAGE="([^"]+)"/);
            var chMatch = line.match(/CHANNELS="([^"]+)"/);
            var name = nameMatch ? nameMatch[1].replace(/^(?:\[\d+\]|\d+\.)\s*/, '').trim() : '';
            var lang = langMatch ? langMatch[1].trim() : '';
            if (chMatch && /JOC/i.test(chMatch[1])) hasAtmos = true;
            audios.push({ name: name, lang: lang });
        } else if (line.indexOf('#EXT-X-MEDIA:TYPE=SUBTITLES') === 0) {
            var subNameMatch = line.match(/NAME="([^"]+)"/);
            var subLangMatch = line.match(/LANGUAGE="([^"]+)"/);
            var uriMatch = line.match(/URI="([^"]+)"/);
            var sName = subNameMatch ? subNameMatch[1].replace(/^(?:\[\d+\]|\d+\.)\s*/, '').trim() : '';
            var sLang = subLangMatch ? subLangMatch[1].trim() : '';
            if (uriMatch) {
                var rawVtt = uriMatch[1].replace(/\.m3u8(?=\?|$)/i, '.vtt');
                var directVtt = rawVtt;
                if (!/^https?:\/\//i.test(rawVtt) && baseUrl) {
                    try {
                        directVtt = new URL(rawVtt, baseUrl).href;
                    } catch (_) {
                        if (rawVtt.charAt(0) === '/') {
                            var m = baseUrl.match(/^(https?:\/\/[^\/]+)/);
                            directVtt = m ? m[1] + rawVtt : rawVtt;
                        } else {
                            directVtt = baseUrl.replace(/\/[^\/]*$/, '/') + rawVtt;
                        }
                    }
                }
                var displaySub = sName || sLang || 'English';
                subs.push({
                    url: directVtt,
                    language: displaySub,
                    lang: displaySub,
                    name: displaySub,
                    headers: streamHeaders || {
                        'User-Agent': DEFAULT_HEADERS['User-Agent'],
                        'Referer': VERIFY_BASE + '/'
                    }
                });
            }
        } else if (line.indexOf('#EXT-X-STREAM-INF:') === 0) {
            variantCount++;
            var resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i);
            if (resMatch) {
                var w = parseInt(resMatch[1], 10) || 0;
                var h = parseInt(resMatch[2], 10) || 0;
                if (w > maxW) maxW = w;
                if (h > maxH) maxH = h;
            }
            if (/CODECS="[^"]*(?:hev1|hvc1)/i.test(line)) hasHevc = true;
            if (/CODECS="[^"]*(?:dvh1|dvhe)/i.test(line)) hasDv = true;
            if (/VIDEO-RANGE=PQ/i.test(line)) hasHdr = true;
            if (/ec-3.*joc|eac3-joc/i.test(line)) hasAtmos = true;
        }
    }

    var seenLangs = {};
    var distinctLangs = [];
    for (var j = 0; j < audios.length; j++) {
        var a = audios[j];
        var code = '';
        if (a.lang && a.lang.length >= 2 && a.lang.length <= 3) {
            code = a.lang.toUpperCase();
        } else if (a.name) {
            code = a.name.split(' ')[0].toUpperCase().slice(0, 3);
        }
        if (code && !seenLangs[code] && code !== 'UND' && code !== 'UNK') {
            seenLangs[code] = true;
            distinctLangs.push(code);
        }
    }

    var isMulti = distinctLangs.length > 1;
    var badge = isMulti
        ? '[MULTI] [' + distinctLangs.slice(0, 5).join(' · ') + ']'
        : (distinctLangs[0] ? '[' + distinctLangs[0] + ']' : '[ENG]');
    var primaryTag = isMulti ? 'multi' : (distinctLangs[0] ? distinctLangs[0].toLowerCase() : 'eng');

    var quality = 'Auto';
    if (maxW >= 3800 || maxH >= 2100) quality = '4K 2160p';
    else if (maxW >= 1800 || maxH >= 900) quality = '1080p';
    else if (maxW >= 1200 || maxH >= 650) quality = '720p';
    else if (maxW >= 640 || maxH >= 440) quality = '480p';

    var tags = [];
    if (hasDv) tags.push('DV');
    else if (hasHdr) tags.push('HDR');
    if (hasHevc) tags.push('HEVC');
    if (hasAtmos) tags.push('Dolby Atmos');

    return {
        badge: badge,
        primaryTag: primaryTag,
        quality: quality,
        isAdaptive: variantCount > 1,
        hdrType: hasDv ? 'DV' : (hasHdr ? 'HDR' : null),
        codec: hasHevc ? 'HEVC' : null,
        audioFormat: hasAtmos ? 'Dolby Atmos' : null,
        tags: tags,
        subs: subs
    };
}

async function resolveMetadata(tmdbId, mediaType, extraArgs) {
    extraArgs = extraArgs || {};
    var title = extraArgs.title || extraArgs.name || '';
    var year = extraArgs.year || (extraArgs.releaseDate ? String(extraArgs.releaseDate).substring(0, 4) : '');

    if (!title) {
        try {
            var tmdbType = mediaType === 'movie' ? 'movie' : 'tv';
            var res = await safeFetch(TMDB_PROXY_URL + '/' + tmdbType + '/' + tmdbId + '?language=en-US', {}, 2500);
            if (res.ok) {
                var data = await res.json();
                title = data.title || data.name || '';
                year = (data.release_date || data.first_air_date || '').substring(0, 4);
            }
        } catch (e) {}
    }

    return {
        title: title || ('Media ' + tmdbId),
        year: year || ''
    };
}

function normalizeDiacritics(t) {
    if (!t) return '';
    var expanded = t
        .replace(/[āĀ]/g, 'aa')
        .replace(/[īĪ]/g, 'ee')
        .replace(/[ūŪ]/g, 'oo')
        .replace(/[ḍḌ]/g, 'd')
        .replace(/[ṭṬ]/g, 't')
        .replace(/[ṇṆ]/g, 'n')
        .replace(/[ṣṢ]/g, 'sh')
        .replace(/[śŚ]/g, 'sh');
    if (typeof expanded.normalize === 'function') {
        expanded = expanded.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    return expanded;
}

function stripReleaseMetadata(t) {
    return String(t || '')
        .replace(/\[[^\]]*\]/g, ' ')
        .replace(/\([^\)]*\)/g, ' ')
        .replace(/\b(?:480p|720p|1080p|2160p|4k|uhd|fhd|hd|sd|dual\s*audio|multi\s*audio|bluray|web-?dl|webrip|hdrip|esub|x264|x265|hevc|season\s*\d+|s\d+)\b[\s\S]*/i, '');
}

function cleanTitle(t) {
    return normalizeDiacritics(String(t || '')).toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function phoneticNormalize(t) {
    return String(t || '').replace(/aa+/g, 'a').replace(/ee+/g, 'i').replace(/oo+/g, 'u');
}

function scoreCandidateTitle(targetTitle, targetYear, candTitle, isMovie) {
    var targetClean = cleanTitle(targetTitle);
    var candClean = cleanTitle(candTitle);
    var targetNorm = phoneticNormalize(targetClean);
    var candNorm = phoneticNormalize(candClean);

    var stopWords = { 'the': 1, 'a': 1, 'an': 1, 'of': 1, 'and': 1, 'in': 1, 'to': 1, 'for': 1, 'on': 1, 'with': 1, 'at': 1, 'by': 1, 'from': 1 };
    var targetWords = targetNorm.split(' ').filter(function(w) { return w.length > 1 && !stopWords[w]; });
    if (targetWords.length === 0) {
        targetWords = targetNorm.split(' ').filter(function(w) { return w.length > 1; });
    }
    if (targetWords.length === 0) return 0;

    var matchedWords = 0;
    for (var w = 0; w < targetWords.length; w++) {
        if (candNorm.indexOf(targetWords[w]) >= 0) matchedWords++;
    }
    if (matchedWords / targetWords.length < 0.6) return -100;

    var score = matchedWords * 10;
    if (candNorm.indexOf(targetNorm) >= 0 || targetNorm.indexOf(candNorm) >= 0) score += 40;

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
            var hasYearMatch = candYearMatches.some(function(yStr) {
                return Math.abs(parseInt(yStr, 10) - metaY) <= 1;
            });
            score += hasYearMatch ? 50 : -80;
        }
        if (/season\s*\d+|complete\s*series|s\d{1,2}e\d{1,2}/i.test(candTitle)) score -= 100;
    } else if (!isMovie) {
        if (/\bmovie\b|\bfilm\b/i.test(candTitle)) score -= 80;
    }

    return score;
}

async function searchAndResolveOtt(ott, meta, isMovie, season, episode, cookie) {
    try {
        var rawCookie = decodeURIComponent((cookie || '').replace(/^t_hash_t=/, ''));
        var headers = {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'X-Requested-With': 'NetmirrorNewTV v1.0',
            'User-Agent': DEFAULT_HEADERS['User-Agent'],
            'Accept': 'application/json, text/plain, */*',
            'Ott': ott.id,
            'Cookie': cookie || '',
            'Usertoken': rawCookie,
            'Lastep': '',
            'Referer': VERIFY_BASE + '/'
        };

        var q1 = cleanTitle(meta.title);
        var q2 = (meta.title || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
        var queries = [q1];
        if (q2 && q2 !== q1 && queries.indexOf(q2) === -1) queries.push(q2);
        var prefix = (meta.title || '').split(/[:\-]/)[0].trim();
        if (prefix && prefix !== meta.title) {
            var p1 = cleanTitle(prefix);
            if (p1 && queries.indexOf(p1) === -1) queries.push(p1);
        }

        var playId = null;
        var selectedTitle = null;

        for (var qIdx = 0; qIdx < queries.length; qIdx++) {
            var queryStr = queries[qIdx];
            var searchUrl = cachedApiBase + '/newtv/search.php?s=' + encodeURIComponent(queryStr);
            try {
                var sRes = await safeFetch(searchUrl, { headers: headers }, 3000);
                if (!sRes.ok) {
                    await refreshApiBase();
                    searchUrl = cachedApiBase + '/newtv/search.php?s=' + encodeURIComponent(queryStr);
                    sRes = await safeFetch(searchUrl, { headers: headers }, 2500);
                    if (!sRes.ok) continue;
                }

                var sJson = await sRes.json();
                var results = (sJson && sJson.searchResult) || [];
                if (results.length === 0) continue;

                if (isMovie) {
                    var scoredMovies = [];
                    for (var mIdx = 0; mIdx < results.length; mIdx++) {
                        var r = results[mIdx];
                        var sc = scoreCandidateTitle(meta.title, meta.year, r.t, true);
                        if (sc >= 40) scoredMovies.push({ item: r, score: sc });
                    }
                    scoredMovies.sort(function(a, b) { return b.score - a.score; });
                    if (scoredMovies.length > 0) {
                        playId = scoredMovies[0].item.id;
                        selectedTitle = scoredMovies[0].item.t;
                        break;
                    }
                } else {
                    var scoredShows = [];
                    for (var sIdx = 0; sIdx < results.length; sIdx++) {
                        var candShow = results[sIdx];
                        var sScore = scoreCandidateTitle(meta.title, meta.year, candShow.t, false);
                        if (sScore >= 40) scoredShows.push({ item: candShow, score: sScore });
                    }
                    scoredShows.sort(function(a, b) { return b.score - a.score; });
                    if (scoredShows.length > 0) {
                        var candidates = scoredShows.slice(0, 2);
                        for (var c = 0; c < candidates.length; c++) {
                            var cand = candidates[c].item;
                            var postUrl = cachedApiBase + '/newtv/post.php?id=' + cand.id;
                            var postRes = await safeFetch(postUrl, { headers: headers }, 2800);
                            if (!postRes.ok) continue;
                            var postJson = await postRes.json();

                            var seasons = (postJson && postJson.season) || [];
                            if (seasons.length === 0) continue;

                            var targetSeason = seasons.find(function(s) {
                                var sNumMatch = (s.s || '').match(/Season\s*(\d+)/i);
                                return sNumMatch && Number(sNumMatch[1]) === season;
                            }) || seasons[season - 1] || seasons[0];

                            if (!targetSeason || !targetSeason.id) continue;

                            var targetPage = Math.max(1, Math.floor((episode - 1) / 10) + 1);
                            var epUrl = cachedApiBase + '/newtv/episodes.php?id=' + targetSeason.id + '&page=' + targetPage;
                            var epRes = await safeFetch(epUrl, { headers: headers }, 2800);
                            var epJson = epRes.ok ? await epRes.json() : {};
                            var epList = epJson.episodes || [];

                            var matchedEp = epList.find(function(e) {
                                return Number(String(e.ep || '').replace(/\D/g, '')) === episode;
                            });

                            if (!matchedEp && targetPage !== 1) {
                                var p1Res = await safeFetch(cachedApiBase + '/newtv/episodes.php?id=' + targetSeason.id + '&page=1', { headers: headers }, 2500);
                                if (p1Res.ok) {
                                    var p1Json = await p1Res.json();
                                    matchedEp = (p1Json.episodes || []).find(function(e) {
                                        return Number(String(e.ep || '').replace(/\D/g, '')) === episode;
                                    });
                                }
                            }

                            if (matchedEp && matchedEp.id) {
                                playId = matchedEp.id;
                                selectedTitle = cand.t;
                                break;
                            }
                        }
                        if (playId) break;
                    }
                }
            } catch (err) {}
        }

        if (!playId) return null;

        var playerUrl = cachedApiBase + '/newtv/player.php?id=' + playId;
        var pRes = await safeFetch(playerUrl, { headers: headers }, 3000);
        if (!pRes.ok) return null;
        var pJson = await pRes.json();

        var isStatusValid = pJson && (pJson.status === 'ok' || pJson.status === 'otp') && Boolean(pJson.video_link);
        if (!isStatusValid) {
            var freshCookie = await getSessionCookie(true);
            if (freshCookie) {
                cookie = freshCookie;
                headers['Cookie'] = freshCookie;
                headers['Usertoken'] = decodeURIComponent(freshCookie.replace(/^t_hash_t=/, ''));
                pRes = await safeFetch(playerUrl, { headers: headers }, 2800);
                if (pRes.ok) pJson = await pRes.json();
            }
        }

        if (!pJson || (pJson.status !== 'ok' && pJson.status !== 'otp') || !pJson.video_link) return null;

        var streamHeaders = {
            'User-Agent': DEFAULT_HEADERS['User-Agent'],
            'Referer': VERIFY_BASE + '/',
            'Cookie': cookie || ''
        };

        var playlistInfo = {
            badge: '[MULTI]',
            primaryTag: 'multi',
            quality: '1080p',
            isAdaptive: true,
            hdrType: null,
            codec: null,
            audioFormat: null,
            tags: [],
            subs: []
        };
        try {
            var plRes = await safeFetch(pJson.video_link, { headers: streamHeaders }, 2800);
            if (plRes.ok) {
                var plText = await plRes.text();
                playlistInfo = parseMasterPlaylist(plText, pJson.video_link, streamHeaders);
            }
        } catch (e) {}

        var streamTypeLabel = playlistInfo.isAdaptive ? 'Adaptive HLS' : 'HLS';
        var techSuffix = playlistInfo.tags.length > 0 ? (' [' + playlistInfo.tags.join(' · ') + ']') : '';

        var epTag = !isMovie ? ('S' + (season < 10 ? '0' : '') + season + 'E' + (episode < 10 ? '0' : '') + episode) : '';
        var streamTitle = isMovie
            ? (meta.title + (meta.year ? ' (' + meta.year + ')' : '') + ' ' + playlistInfo.badge + ' - Net77 ' + ott.name + ' [' + playlistInfo.quality + ']' + techSuffix)
            : (meta.title + ' ' + epTag + ' ' + playlistInfo.badge + ' - Net77 ' + ott.name + ' [' + playlistInfo.quality + ']' + techSuffix);

        var displayName = 'Net77 | ' + ott.name + ' › ' + streamTypeLabel + ' • ' + playlistInfo.badge + ' (' + playlistInfo.quality + ')' + techSuffix;
        var descParts = [streamTypeLabel, playlistInfo.quality, isMovie ? '2.5 GB' : '900 MB', playlistInfo.badge].concat(playlistInfo.tags);

        return {
            name: displayName,
            title: streamTitle,
            rawTitle: selectedTitle || streamTitle,
            description: descParts.join(' • '),
            url: pJson.video_link,
            quality: playlistInfo.quality,
            isAdaptive: playlistInfo.isAdaptive,
            streamType: streamTypeLabel,
            size: isMovie ? '2.5 GB' : '900 MB',
            type: 'm3u8',
            format: 'hls',
            container: 'hls',
            provider: 'net77',
            server: ott.name,
            subServer: streamTypeLabel,
            language: playlistInfo.primaryTag,
            audio: {
                isMulti: playlistInfo.primaryTag === 'multi',
                primary: playlistInfo.primaryTag === 'multi' ? 'Multi' : playlistInfo.primaryTag.toUpperCase(),
                tag: playlistInfo.primaryTag.toUpperCase(),
                badge: playlistInfo.badge
            },
            hdrType: playlistInfo.hdrType,
            codec: playlistInfo.codec,
            audioFormat: playlistInfo.audioFormat,
            sourceType: 'WEB-DL',
            tags: playlistInfo.tags,
            headers: streamHeaders,
            subtitles: playlistInfo.subs
        };
    } catch (e) {
        return null;
    }
}

async function getStreams(tmdbId, mediaType, season, episode, extraArgs) {
    var callArgs = (typeof globalThis !== 'undefined' && globalThis.__CALL_ARGS__) || {};
    extraArgs = Object.assign({}, callArgs, extraArgs || {});

    if (!tmdbId) return [];

    var isMovie = mediaType === 'movie';
    var sNum = Number(season) || 1;
    var eNum = Number(episode) || 1;

    var init = await Promise.all([
        resolveMetadata(tmdbId, mediaType, extraArgs),
        getSessionCookie(false)
    ]);
    var meta = init[0];
    var cookie = init[1];

    var results = await Promise.all(OTT_PLATFORMS.map(function(ott) {
        return searchAndResolveOtt(ott, meta, isMovie, sNum, eNum, cookie);
    }));

    var streams = results.filter(Boolean);
    console.log('[Net77] Discovered ' + streams.length + ' stream(s)');
    return streams;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams: getStreams };
}
if (typeof globalThis !== 'undefined') {
    globalThis.getStreams = getStreams;
}
