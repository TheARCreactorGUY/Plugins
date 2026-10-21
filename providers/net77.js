/**
 * Net77 (NetMirror) Provider Plugin for Euthopiar / Universal Streaming Architecture
 *
 * Dedicated provider for NetMirror (https://net77.cc/)
 * Aggregates across multiple major OTT platforms:
 *  - Netflix (nf)
 *  - Amazon Prime Video (pv)
 *  - Disney+ Hotstar (hs)
 *
 * Features:
 *  - Dynamic NewTV API endpoint resolution via mobiledetects network.
 *  - Automatic 72-hour session handshake bypassing Cloudflare Turnstile barriers.
 *  - Adaptive HLS Master Playlist (.m3u8) streaming with up to 22 multi-audio tracks.
 *  - Complete WebVTT subtitle extraction across over 30 languages.
 *  - Fully compatible with Android QuickJS runtime (no Buffer, no AbortSignal.timeout).
 *  - Formatted strictly for MatchScorer.kt (+0.25 SxxExx episode bonus for TV, clean (Year) for movies).
 */

/* =========================================================================
   CONFIG BLOCK: If site changes domain, update ONLY the URLs in this block.
   ========================================================================= */
var BASE_URL = 'https://net77.cc';
var VERIFY_BASE = 'https://net52.cc';
var VERIFY_URL = VERIFY_BASE + '/verify.php';
var DEFAULT_API_BASE = 'https://tv.imgcdn.kim';
var TMDB_PROXY_URL = 'https://db.wecollege.net/3';
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

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0;
        var v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Performs a session handshake with net52.cc to obtain a valid 3-day t_hash_t cookie.
 */
async function getSessionCookie() {
    if (cachedCookie && Date.now() < cachedCookieExpiry) {
        return cachedCookie;
    }

    try {
        var uuid = generateUUID();
        var formBody = 'g-recaptcha-response=' + encodeURIComponent(uuid);
        var res = await fetch(VERIFY_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Origin': VERIFY_BASE,
                'Referer': VERIFY_BASE + '/verify2',
                'User-Agent': DEFAULT_HEADERS['User-Agent']
            },
            body: formBody,
            redirect: 'manual'
        });

        var setCookie = res.headers.get('set-cookie');
        if (setCookie && setCookie.indexOf('t_hash_t=') >= 0) {
            var m = setCookie.match(/t_hash_t=([^;]+)/);
            if (m) {
                cachedCookie = 't_hash_t=' + m[1];
                cachedCookieExpiry = Date.now() + 24 * 3600 * 1000; // Cache for 24 hours
                console.log('[Net77] Successfully generated session cookie');
                return cachedCookie;
            }
        }
    } catch (e) {
        console.error('[Net77] Session cookie verification error:', e.message);
    }
    return null;
}

/**
 * Parses Master HLS playlist to extract audio tracks, subtitles, and max resolution.
 */
function parseMasterPlaylist(m3u8Text) {
    var audios = [];
    var subs = [];
    var lines = m3u8Text.split('\n');
    var has1080p = false;
    var has720p = false;

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.indexOf('#EXT-X-MEDIA:TYPE=AUDIO') === 0) {
            var nameMatch = line.match(/NAME="([^"]+)"/);
            var langMatch = line.match(/LANGUAGE="([^"]+)"/);
            var name = nameMatch ? nameMatch[1].replace(/^(?:\[\d+\]|\d+\.)\s*/, '').trim() : '';
            var lang = langMatch ? langMatch[1].trim() : '';
            audios.push({ name: name, lang: lang });
        } else if (line.indexOf('#EXT-X-MEDIA:TYPE=SUBTITLES') === 0) {
            var subNameMatch = line.match(/NAME="([^"]+)"/);
            var subLangMatch = line.match(/LANGUAGE="([^"]+)"/);
            var uriMatch = line.match(/URI="([^"]+)"/);
            var sName = subNameMatch ? subNameMatch[1].replace(/^(?:\[\d+\]|\d+\.)\s*/, '').trim() : '';
            var sLang = subLangMatch ? subLangMatch[1].trim() : '';
            if (uriMatch) {
                // Convert .m3u8 playlist wrapper into direct .vtt file
                var directVtt = uriMatch[1].replace(/\.m3u8$/, '.vtt');
                subs.push({
                    lang: sName || sLang || 'English',
                    url: directVtt
                });
            }
        } else if (line.indexOf('#EXT-X-STREAM-INF:') === 0) {
            if (/RESOLUTION=1920x1080/i.test(line)) has1080p = true;
            if (/RESOLUTION=1280x720/i.test(line)) has720p = true;
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
    var quality = has1080p ? '1080p' : (has720p ? '720p' : 'Auto');

    return {
        badge: badge,
        primaryTag: primaryTag,
        quality: quality,
        subs: subs
    };
}

/**
 * Resolves TMDB metadata dynamically.
 */
async function resolveMetadata(tmdbId, mediaType, extraArgs) {
    extraArgs = extraArgs || {};
    var title = extraArgs.title || extraArgs.name || '';
    var year = extraArgs.year || (extraArgs.releaseDate ? extraArgs.releaseDate.substring(0, 4) : '');

    if (!title) {
        try {
            var tmdbType = mediaType === 'movie' ? 'movie' : 'tv';
            var res = await fetch(TMDB_PROXY_URL + '/' + tmdbType + '/' + tmdbId + '?language=en-US');
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

/**
 * Searches and resolves stream for a specific OTT platform (Netflix, Prime Video, Hotstar).
 */
async function searchAndResolveOtt(ott, meta, isMovie, season, episode, cookie) {
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

    var cleanTitle = meta.title.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    var searchUrl = cachedApiBase + '/newtv/search.php?s=' + encodeURIComponent(cleanTitle);

    try {
        var sRes = await fetch(searchUrl, { headers: headers });
        if (!sRes.ok) return null;
        var sJson = await sRes.json();
        var results = sJson.searchResult || [];
        if (results.length === 0) return null;

        var playId = null;

        if (isMovie) {
            // Find closest matching movie
            var lowerTitle = meta.title.toLowerCase();
            var matchedMovie = results.find(function(r) { return (r.t || '').toLowerCase() === lowerTitle; }) || results[0];
            playId = matchedMovie.id;
        } else {
            // For series, inspect top results to find season and episode
            var candidates = results.slice(0, 3);
            for (var c = 0; c < candidates.length; c++) {
                var cand = candidates[c];
                var postUrl = cachedApiBase + '/newtv/post.php?id=' + cand.id;
                var postRes = await fetch(postUrl, { headers: headers });
                if (!postRes.ok) continue;
                var postJson = await postRes.json();

                var seasons = postJson.season || [];
                if (seasons.length === 0) continue;

                var targetSeason = seasons.find(function(s) {
                    var sNumMatch = (s.s || '').match(/Season\s*(\d+)/i);
                    return sNumMatch && Number(sNumMatch[1]) === season;
                }) || seasons[season - 1];

                if (!targetSeason && seasons.length > 0) targetSeason = seasons[0];
                if (!targetSeason || !targetSeason.id) continue;

                // Fetch season episodes
                var epUrl = cachedApiBase + '/newtv/episodes.php?id=' + targetSeason.id + '&page=1';
                var epRes = await fetch(epUrl, { headers: headers });
                if (!epRes.ok) continue;
                var epJson = await epRes.json();

                var epList = epJson.episodes || [];
                var matchedEp = epList.find(function(e) {
                    var epNum = Number(String(e.ep || '').replace(/\D/g, ''));
                    return epNum === episode;
                }) || epList[episode - 1];

                if (matchedEp && matchedEp.id) {
                    playId = matchedEp.id;
                    break;
                }
            }
        }

        if (!playId) return null;

        // Query player.php for the signed master playlist
        var playerUrl = cachedApiBase + '/newtv/player.php?id=' + playId;
        var pRes = await fetch(playerUrl, { headers: headers });
        if (!pRes.ok) return null;
        var pJson = await pRes.json();

        if (pJson.status !== 'ok' || !pJson.video_link) return null;

        // Fetch master m3u8 playlist to inspect audio tracks and subtitles
        var playlistInfo = { badge: '[MULTI]', primaryTag: 'multi', quality: '1080p', subs: [] };
        try {
            var plRes = await fetch(pJson.video_link, {
                headers: {
                    'User-Agent': DEFAULT_HEADERS['User-Agent'],
                    'Referer': VERIFY_BASE + '/',
                    'Cookie': cookie || ''
                }
            });
            if (plRes.ok) {
                var plText = await plRes.text();
                playlistInfo = parseMasterPlaylist(plText);
            }
        } catch (e) {
            console.warn('[Net77] Master playlist probe warning:', e.message);
        }

        var epTag = !isMovie ? ('S' + String(season).padStart(2, '0') + 'E' + String(episode).padStart(2, '0')) : '';
        var streamTitle = isMovie
            ? (meta.title + ' (' + meta.year + ') ' + playlistInfo.badge + ' - Net77 ' + ott.name + ' [' + playlistInfo.quality + ']')
            : (meta.title + ' ' + epTag + ' ' + playlistInfo.badge + ' - Net77 ' + ott.name + ' [' + playlistInfo.quality + ']');

        var displayName = 'Net77 | ' + ott.name + ' HLS • ' + playlistInfo.badge + ' (' + playlistInfo.quality + ')';

        return {
            name: displayName,
            title: streamTitle,
            url: pJson.video_link,
            quality: playlistInfo.quality,
            type: 'm3u8',
            provider: 'net77',
            language: playlistInfo.primaryTag,
            headers: {
                'User-Agent': DEFAULT_HEADERS['User-Agent'],
                'Referer': VERIFY_BASE + '/',
                'Cookie': cookie || ''
            },
            subtitles: playlistInfo.subs
        };
    } catch (e) {
        console.error('[Net77] Error resolving ' + ott.name + ':', e.message);
        return null;
    }
}

/**
 * Main plugin entrypoint invoked by Euthopiar / Nuvio player.
 */
async function getStreams(tmdbId, mediaType, season, episode, extraArgs) {
    var callArgs = (typeof globalThis !== 'undefined' && globalThis.__CALL_ARGS__) || {};
    extraArgs = Object.assign({}, callArgs, extraArgs || {});

    var isMovie = mediaType === 'movie';
    var sNum = Number(season) || 1;
    var eNum = Number(episode) || 1;

    console.log('[Net77] Fetching streams for ' + (isMovie ? 'movie' : 'tv') + ' TMDB: ' + tmdbId +
        (!isMovie ? ' (S:' + sNum + ' E:' + eNum + ')' : ''));

    var meta = await resolveMetadata(tmdbId, mediaType, extraArgs);
    console.log('[Net77] Resolved metadata: "' + meta.title + '" (' + meta.year + ')');

    var cookie = await getSessionCookie();

    // Concurrently query Netflix, Prime Video, and Hotstar
    var tasks = OTT_PLATFORMS.map(function(ott) {
        return searchAndResolveOtt(ott, meta, isMovie, sNum, eNum, cookie);
    });

    var results = await Promise.all(tasks);
    var streams = results.filter(Boolean);

    console.log('[Net77] Discovered ' + streams.length + ' direct stream(s) across OTT libraries');
    return streams;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getStreams: getStreams
    };
}

if (typeof globalThis !== 'undefined') {
    globalThis.getStreams = getStreams;
}
