# Euthopiar Provider Plugin Creation Guide (v2.0)

**Audience:** An AI agent or developer with no prior knowledge of this project. Assume nothing. Read the entire guide before touching code. Follow each phase in order.

**What you will build:** A standalone, high-performance JavaScript scraper plugin (`providers/<name>.js`) and a corresponding `manifest.json` entry. Given a movie or TV episode, the plugin returns an array of direct, playable video stream links with verified audio and quality metadata.

**What you will NOT do:** Modify Kotlin code, alter the `All-in-One-Nuvio` reference folder, or invent features not explicitly requested.

> The user will typically provide a **provider name and a URL** (or app name). Everything else—API structure, decryption keys, CDN hosts, intermediate gateways, and audio/quality parsers—must be analyzed, reverse-engineered, and verified by you.

---

## 0. Golden Rules (Read Twice)

1. **Never guess. Prove.** Every claim in your final report must come from an actual network request or executed script. If unverified, explicitly label it `"unverified"`.
2. **Never invent data.** Do not guess API endpoints, parameters, hashes, headers, or JSON fields.
3. **Never fail loudly.** The plugin must **never throw an unhandled exception** to the host app. Any top-level failure must resolve gracefully to an empty array `[]`.
4. **One broken server must never kill the plugin.** Query all mirror servers and CDNs in parallel. If one server times out, fails, or is blocked, the others must still succeed.
5. **QuickJS Sandbox Strictness (Fatal Pitfalls):**
   - **NO Node.js `Buffer`:** Calling `Buffer.from(...)` crashes the Android runtime with `ReferenceError: Buffer is not defined`. Strictly use browser globals: `atob()` and `btoa()`.
   - **NO `AbortSignal.timeout()`:** Calling `AbortSignal.timeout(...)` crashes the Android runtime with `TypeError: AbortSignal.timeout is not a function`. Implement timeouts with `Promise.race()` and `setTimeout()`.
   - **NO Node standard libraries:** Do not use `require('fs')`, `require('path')`, `require('crypto')`, or `process`.
6. **Strict `MatchScorer.kt` Title Formatting Contract:**
   The Android app scores and ranks streams using `MatchScorer.kt`. Violating title rules will penalize or discard your streams:
   - **TV Series & Anime:** The `title` field **MUST** include `SxxExx` (e.g. `S01E01`) to earn the **`+0.25` episode bonus**.
   - **Movies:** The `title` field **MUST** include the clean `(Year)` and **MUST NOT** include `SxxExx` or episode patterns (or it will be discarded as a TV episode).
7. **ExoPlayer Compatibility (No Cyberlockers or Turnstile Traps):**
   Android ExoPlayer is a media streaming client, **not a web browser**. It cannot solve Cloudflare Turnstile challenges, handle countdowns, or bypass captchas. Links that return `HTTP 403`, `HTTP 503`, or Cloudflare challenge HTML (`cf-mitigated: challenge`) will crash playback. **Filter out cyberlockers** (e.g. Buzz Server / `fuckingfast.net`, Rapidgator, 1fichier). Only return direct media endpoints (`HTTP 206 Partial Content`).
8. **Strict Quality Detection Hierarchy (The DS4K Trap):**
   Releases often contain tags like `DS4K 1080p` (Downscaled 4K), `4K Remastered 1080p`, or site branding like `4k-hdhub`. **Never test `/4k/i` first.** Follow the strict resolution order: `2160p` $\rightarrow$ `1080p` $\rightarrow$ `720p` $\rightarrow$ `480p`, and strip watermarks before testing standalone `4K`/`UHD`.
9. **Real-Time Dynamic Audio Tagging:**
   Never hardcode language tags. Release titles must be dynamically analyzed for audio tracks (`MULTI`, `HIN`, `ENG`, `TAM`, `TEL`, `JPN`, etc.) and formatted into clean UI badges.
10. **Save evidence & honest reporting:**
    Store raw payloads in the scratch directory. An honest report documenting 3 working servers and 1 dead server is a complete success. Hidden failures are the worst outcome.

---

## 1. Folder Layout and Repository Structure

Work inside these designated directories (replace `<name>` with the provider's short identifier, e.g. `4khdhub`):

- **Active Plugin Repository:** `c:\Euthopiar\scratch\TheARCreactorGUY-Plugins\`
  - `providers\<name>.js` — The production plugin.
  - `manifest.json` — The master manifest containing all active providers.
- **Research, Notes & Raw Responses:** `c:\Euthopiar\scratch\<name>\`
  - `NOTES.md` — Findings, API documentation, and cipher mechanics.
  - `raw\` — Saved network response samples (JSON, HTML, JS chunks).
  - `test_<name>.js` — Standalone Node verification script.
- **Reference Plugins:**
  - `providers/movy.js` — Decrypted Next.js JSON API, proprietary stream ciphers, multi-CDN routing.
  - `providers/bingr.js` — High-speed parallel HLS aggregator, dynamic multi-audio detection.
  - `providers/4khdhub.js` — HTML scraping, multi-hop redirector gateways (`greenmotors`, `hubcloud`), Cloudflare R2 S3 presigned URLs, 10Gbps Pixel Cloud, ZipDisk Workers, and Pixeldrain.

---

## 2. Phase 1: Understand the Android Runtime & Kotlin Contract

Skipping this phase causes plugins to pass Node tests but crash or return zero streams in the Android app.

### 2.1 The Android Execution Sandbox (QuickJS)

Plugins execute inside **QuickJS** on Android. The environment behaves like an ultra-lightweight ES2020 browser sandbox, **NOT** Node.js.

| Supported in QuickJS | Fatal / Missing in QuickJS |
|---|---|
| `fetch(url, options)` (GET/POST, headers, redirects) | ❌ `Buffer` (`Buffer.from(...)` $\rightarrow$ `ReferenceError`) |
| `atob(b64)` & `btoa(str)` (Base64 decode/encode) | ❌ `AbortSignal.timeout(ms)` $\rightarrow$ `TypeError` |
| `TextEncoder` & `TextDecoder` (UTF-8 bytes) | ❌ Node standard modules (`fs`, `path`, `crypto`, `http`) |
| `URL` & `URLSearchParams` | ❌ `process`, `__dirname`, `__filename` |
| `setTimeout`, `clearTimeout` | ❌ Heavy DOM libraries requiring Node C++ bindings |
| `console.log`, `console.error` (bridges to Android Logcat) | |

### 2.2 The `getStreams` Signature and `__CALL_ARGS__` Contract

In `PluginRuntime.kt`, the Android app executes:
```kotlin
val callCode = "await getStreams(\"$effectiveTmdbId\", \"${args.mediaType}\", $season, $episode);"
```
Notice that the app invokes `getStreams` with **exactly 4 arguments**.

If your plugin function is defined as `getStreams(tmdbId, mediaType, season, episode, extraArgs)`, the 5th argument (`extraArgs`) will **always be `undefined`** in the app!

However, the Kotlin runtime injects the complete request payload into `globalThis.__CALL_ARGS__`. Every plugin **MUST** unpack arguments at the very top of `getStreams`:

```javascript
async function getStreams(tmdbId, mediaType, season, episode, extraArgs) {
    // Merge runtime globalThis.__CALL_ARGS__ with any passed argument
    var callArgs = (typeof globalThis !== 'undefined' && globalThis.__CALL_ARGS__) || {};
    extraArgs = Object.assign({}, callArgs, extraArgs || {});

    var isMovie = mediaType === 'movie';
    var sNum = Number(season) || 1;
    var eNum = Number(episode) || 1;

    // Extracted metadata fields provided by the app:
    var mediaTitle = extraArgs.title || extraArgs.name || '';
    var releaseYear = extraArgs.year || (extraArgs.releaseDate ? extraArgs.releaseDate.substring(0, 4) : '');
    var originalLang = extraArgs.originalLanguage || extraArgs.original_language || '';
    var imdbId = extraArgs.imdbId || '';
    
    // ...
}
```

If `extraArgs.title` is missing, you can query the built-in TMDB proxy at `https://db.wecollege.net/3/movie/${tmdbId}` or `/tv/${tmdbId}`.

### 2.3 The `MatchScorer.kt` Stream Schema Contract

Each returned object in the `getStreams` array must match this exact schema:

```javascript
{
    // 1. Selector Display Name: Shown in player source picker
    name: "4KHDHub | FSL R2 Server • [MULTI] [HIN · ENG] (4K 2160p)",

    // 2. Stream Match Title: Strictly evaluated by MatchScorer.kt
    // TV: Must contain SxxExx. Movie: Must contain (Year) and no SxxExx.
    title: isMovie 
        ? `${cleanTitle} (${year}) ${audioBadge} - ${providerName} ${serverName} [${quality}]`
        : `${cleanTitle} S01E01 ${audioBadge} - ${providerName} ${serverName} [${quality}]`,

    // 3. Playable Media URL: Direct .mp4, .mkv, or .m3u8 link
    url: "https://pub-xxxx.r2.dev/stream.mkv",

    // 4. Quality Tag: '4K 2160p', '1080p', '720p', '480p', or 'Auto'
    quality: "4K 2160p",

    // 5. Container Type: 'm3u8' for HLS, 'mp4' for progressive MP4/MKV
    type: url.indexOf('.m3u8') >= 0 ? "m3u8" : "mp4",

    // 6. Provider ID: Unique lowercase string
    provider: "4khdhub",

    // 7. Audio Language: Normalized lowercase ('multi', 'hin', 'eng', 'jpn')
    language: audioInfo.tag.toLowerCase(),

    // 8. CDN Headers: Required Referer, Origin, and User-Agent
    headers: {
        "User-Agent": DEFAULT_HEADERS["User-Agent"],
        "Referer": "https://source-domain.com/"
    },

    // 9. Subtitles Array (Optional)
    subtitles: [
        {
            url: "https://.../en.vtt",
            lang: "English"
        }
    ]
}
```

---

## 3. Phase 2: Investigate the Provider

Analyze the target site or service before writing code. Document all answers in `c:\Euthopiar\scratch\<name>\NOTES.md`.

### 3.1 Classify the Provider Architecture

1. **Type A: Server-Rendered HTML (e.g. WordPress, CMS):**
   Media links or episode tables are inside HTML markup (`<div class="file-title">`, `<a>`). Requires regex DOM extraction.
2. **Type B: Decrypted JSON API (e.g. Next.js / React Apps):**
   Site UI is a shell; data is fetched via REST endpoints. Requires inspecting bundle chunks (`_app.js`, `page.js`) for API keys, seeds, and endpoints.
3. **Type C: Multi-Hop Gateway / Link Shortener (e.g. Hubcloud, GPDL, Greenmotors):**
   Site redirects through intermediate gate pages with base64/ROT13 payloads before reaching final CDN servers.
4. **Type D: Embed Aggregator:**
   Embeds third-party players (`vidsrc`, `superembed`). Must resolve through an embed extractor or be rejected if blocked by Cloudflare.

### 3.2 Network & Playability Probing (ExoPlayer Pre-Verification)

For every candidate stream URL discovered:
1. Run a **HTTP Byte-Range Request**:
   ```powershell
   curl -I -r 0-1024 -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" -H "Referer: <REFERER>" "<STREAM_URL>"
   ```
2. **Validation Rules:**
   - ✅ **Playable:** Status `206 Partial Content` (or `200 OK` for playlists) with `Content-Type: video/mp4`, `video/x-matroska`, or `application/vnd.apple.mpegurl`.
   - ❌ **Unplayable (Reject Immediately):** Status `403 Forbidden`, `503 Service Unavailable`, or responses returning `Content-Type: text/html` with Cloudflare challenge markers (`cf-mitigated: challenge`).
   - ❌ **Cyberlockers:** Sites that require browser rendering, timers, or captchas (e.g. `fuckingfast.net`, Katfile) cannot be streamed by ExoPlayer.

---

## 4. Phase 3: Build the Plugin

### 4.1 Production Core Helpers

Include these robust, QuickJS-compatible functions in your plugin:

#### Safe Base64 & Decryption (No `Buffer`)
```javascript
function decodeB64(str) {
    if (!str) return '';
    if (typeof atob === 'function') {
        return atob(str);
    }
    return '';
}

function encodeB64(str) {
    if (!str) return '';
    if (typeof btoa === 'function') {
        return btoa(str);
    }
    return '';
}

function rot13(str) {
    return String(str).replace(/[a-zA-Z]/g, function(c) {
        var base = c <= 'Z' ? 65 : 97;
        return String.fromCharCode((c.charCodeAt(0) - base + 13) % 26 + base);
    });
}
```

#### Safe HTTP Fetch With Timeout (No `AbortSignal.timeout`)
```javascript
async function fetchWithTimeout(url, options, timeoutMs) {
    timeoutMs = timeoutMs || 8000;
    var timer;
    var timeoutPromise = new Promise(function(_, reject) {
        timer = setTimeout(function() {
            reject(new Error('Request timeout (' + timeoutMs + 'ms)'));
        }, timeoutMs);
    });

    try {
        var res = await Promise.race([
            fetch(url, options),
            timeoutPromise
        ]);
        clearTimeout(timer);
        return res;
    } catch (err) {
        clearTimeout(timer);
        throw err;
    }
}
```

#### Strict Quality Resolution Hierarchy (The "DS4K" Solution)
```javascript
function parseQualityFromText(text) {
    if (!text) return '1080p';
    var t = String(text);

    // 1. Explicit 2160p is definitely 4K UHD
    if (/2160p\b/i.test(t)) return '4K 2160p';

    // 2. Explicit 1080p or 1080i is definitely 1080p (even if 'DS4K' or '4K Remastered' is in the string)
    if (/1080[pi]\b|fhd\b/i.test(t)) return '1080p';

    // 3. Explicit 720p is definitely 720p
    if (/720p\b/i.test(t)) return '720p';

    // 4. Explicit 480p or 576p is definitely 480p
    if (/(?:480|576)p\b|sd\b/i.test(t)) return '480p';

    // 5. Clean string from site watermarks and qualifiers before testing standalone 4K
    var clean = t.replace(/\bds-?4k\b/gi, '')
                 .replace(/\b4k[-_ ]?hdhub[a-z0-9.]*\b/gi, '')
                 .replace(/4k[- ]?remaster(?:ed)?/gi, '')
                 .replace(/4k[- ]?sdr/gi, '')
                 .replace(/4k[- ]?hdr/gi, '');

    if (/\b(?:4k|uhd)\b/i.test(clean)) return '4K 2160p';
    if (/\b(?:hd)\b/i.test(clean)) return '720p';

    return '1080p';
}
```

#### Real-Time Dynamic Audio Tagging
```javascript
var LANGUAGE_MAP = {
    'en': { name: 'English', tag: 'ENG' },
    'hi': { name: 'Hindi', tag: 'HIN' },
    'ja': { name: 'Japanese', tag: 'JPN' },
    'ko': { name: 'Korean', tag: 'KOR' },
    'es': { name: 'Spanish', tag: 'SPA' },
    'fr': { name: 'French', tag: 'FRA' },
    'de': { name: 'German', tag: 'GER' },
    'it': { name: 'Italian', tag: 'ITA' },
    'ta': { name: 'Tamil', tag: 'TAM' },
    'te': { name: 'Telugu', tag: 'TEL' },
    'ml': { name: 'Malayalam', tag: 'MAL' },
    'kn': { name: 'Kannada', tag: 'KAN' }
};

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

    var distinct = [];
    for (var i = 0; i < langs.length; i++) {
        if (distinct.indexOf(langs[i]) === -1) distinct.push(langs[i]);
    }

    if (isMultiCue || distinct.length > 1) {
        var langJoin = distinct.length > 0 ? distinct.join(' · ') : 'MULTI';
        return {
            isMulti: true,
            primary: 'Multi',
            tag: 'MULTI',
            badge: '[MULTI] [' + langJoin + ']'
        };
    }

    if (distinct.length === 1) {
        var tag = distinct[0];
        return {
            isMulti: false,
            primary: tag,
            tag: tag,
            badge: '[' + tag + ']'
        };
    }

    return { isMulti: false, primary: 'English', tag: 'ENG', badge: '[ENG]' };
}
```

### 4.2 Parallel Fan-Out & Deduplication Pattern

When resolving multiple servers or quality options, execute them concurrently and deduplicate streams by URL and quality:

```javascript
// Query servers in parallel
var tasks = selectedReleases.map(async function(release) {
    try {
        return await resolveReleaseServers(release);
    } catch(e) {
        return [];
    }
});

var settled = await Promise.all(tasks);
var flattened = settled.flat();

var streams = [];
var seenStreamKeys = {};

for (var i = 0; i < flattened.length; i++) {
    var item = flattened[i];
    var dedupeKey = item.url + '|' + item.quality;
    if (seenStreamKeys[dedupeKey]) continue;
    seenStreamKeys[dedupeKey] = true;

    // Build MatchScorer compliant titles
    var streamTitle = isMovie
        ? meta.title + ' (' + meta.year + ') ' + item.audio.badge + ' - ' + PROVIDER_NAME + ' ' + item.serverName + ' [' + item.quality + ']'
        : meta.title + ' ' + epTag + ' ' + item.audio.badge + ' - ' + PROVIDER_NAME + ' ' + item.serverName + ' [' + item.quality + ']';

    var displayName = PROVIDER_NAME + ' | ' + item.displayName + ' • ' + item.audio.badge + ' (' + item.quality + ')';

    streams.push({
        name: displayName,
        title: streamTitle,
        url: item.url,
        quality: item.quality,
        type: item.url.indexOf('.m3u8') >= 0 ? 'm3u8' : 'mp4',
        provider: 'myprovider',
        language: item.audio.tag.toLowerCase(),
        headers: {
            'User-Agent': DEFAULT_HEADERS['User-Agent'],
            'Referer': BASE_URL + '/'
        }
    });
}

return streams;
```

### 4.3 Exporting the Plugin

Ensure the plugin exports cleanly for both CommonJS and global runtime contexts:

```javascript
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getStreams: getStreams
    };
}

if (typeof globalThis !== 'undefined') {
    globalThis.getStreams = getStreams;
}
```

---

## 5. Phase 4: Test and Verify

### 5.1 Standalone Test Script (`test_<name>.js`)

Create a live test script in `c:\Euthopiar\scratch\<name>\test_<name>.js`.

> [!IMPORTANT]
> To ensure your plugin does not accidentally use `Buffer` or `AbortSignal.timeout`, mock the QuickJS runtime strictly:

```javascript
// QuickJS Sandbox Simulation Harness
if (typeof atob === 'undefined') {
    global.atob = function(b64) { return Buffer.from(b64, 'base64').toString('binary'); };
}
if (typeof btoa === 'undefined') {
    global.btoa = function(str) { return Buffer.from(str, 'binary').toString('base64'); };
}
// Strip Node Buffer to simulate Android QuickJS
delete global.Buffer;

const provider = require('./providers/myprovider.js');

async function testTitle(name, tmdbId, type, season, episode) {
    console.log(`\nTesting: ${name} (${type})`);
    const start = Date.now();
    
    // Inject __CALL_ARGS__ as Android Kotlin does
    global.__CALL_ARGS__ = {
        title: name,
        year: '2023',
        mediaType: type,
        season: season,
        episode: episode
    };

    const streams = await provider.getStreams(tmdbId, type, season, episode);
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`Found ${streams.length} stream(s) in ${duration}s`);

    // Verify first 3 streams with HTTP Range request
    for (const stream of streams.slice(0, 3)) {
        console.log(`- [${stream.quality}] ${stream.name}`);
        console.log(`  URL: ${stream.url.substring(0, 80)}...`);
        
        try {
            const check = await fetch(stream.url, {
                method: 'GET',
                headers: Object.assign({}, stream.headers || {}, { 'Range': 'bytes=0-1024' })
            });
            console.log(`  Playback Range Check: HTTP ${check.status} (${check.headers.get('content-type')})`);
            if (check.status !== 200 && check.status !== 206) {
                console.error(`  ⚠️ Warning: Non-playable response code: ${check.status}`);
            }
        } catch (e) {
            console.error(`  ❌ Playback check failed: ${e.message}`);
        }
    }
}

(async () => {
    await testTitle('Fight Club', 550, 'movie');
    await testTitle('Breaking Bad', 1396, 'tv', 1, 1);
    await testTitle('NonExistentMoviexyz999', 99999999, 'movie');
})();
```

---

## 6. Phase 5: The Domain Config Rule (Mandatory)

When a streaming site changes its domain, updating the plugin must require **only a one-place edit** at the very top of the file:

```javascript
/* =========================================================================
   CONFIG BLOCK: If site changes domain, update ONLY the URLs in this block.
   ========================================================================= */
var BASE_URL = 'https://4khdhub.one';
var TMDB_PROXY_URL = 'https://db.wecollege.net/3';
/* ========================================================================= */
```

- **Zero hard-coded hosts elsewhere:** Never hardcode the host in regexes, inner functions, or headers. Build all headers (`Referer: BASE_URL + '/'`) and request endpoints dynamically from the config block.
- **Verification:** Run a regex search across the file for any domain occurrences outside the config block.

---

## 7. Phase 6: Update the Master Manifest

Update `manifest.json` in `c:\Euthopiar\scratch\TheARCreactorGUY-Plugins\manifest.json`.

```json
{
  "id": "4khdhub",
  "name": "4KHDHub",
  "description": "High-speed 4K UHD, 1080p, and multi-audio movie & series provider.",
  "version": "1.4.0",
  "manifestVersion": 1,
  "author": "Euthopiar Core Team",
  "supportedTypes": ["movie", "tv"],
  "filename": "providers/4khdhub.js",
  "logo": "https://4khdhub.one/favicon.ico",
  "contentLanguage": ["en", "hi", "ta", "te"],
  "formats": ["mp4", "m3u8"],
  "hasSettings": false
}
```

---

## 8. Common Mistakes to Avoid (The Trap List)

| # | Mistake | Real-World Consequence | Correct Pattern |
|---|---|---|---|
| 1 | `Buffer.from(data, 'base64')` | `ReferenceError: Buffer is not defined` inside Android QuickJS | Use standard `atob(data)` and `btoa(str)`. |
| 2 | `AbortSignal.timeout(8000)` | `TypeError: AbortSignal.timeout is not a function` inside Android QuickJS | Use `Promise.race()` with coroutine `setTimeout`. |
| 3 | Reading 5th arg `extraArgs` directly | Returns `undefined` because Kotlin calls 4 arguments | Unpack `globalThis.__CALL_ARGS__` at the start of `getStreams`. |
| 4 | Testing `/4k/i` before `1080p` | `DS4K 1080p` & `4K Remastered 1080p` get wrongly labeled as 4K | Follow strict order: explicit `2160p` $\rightarrow$ `1080p` $\rightarrow$ `720p` $\rightarrow$ `480p`, and strip watermarks before standalone `4K` check. |
| 5 | Omitting `SxxExx` in TV titles | Loses the `+0.25` episode match bonus in `MatchScorer.kt`, ranking streams below inferior competitors | Format TV titles strictly with `S01E01`. |
| 6 | Including `SxxExx` in Movie titles | `MatchScorer.kt` discards the stream as an invalid TV episode match | Format Movie titles strictly with `(Year)` and never `SxxExx`. |
| 7 | Returning cyberlockers (e.g. Buzz Server / `fuckingfast.net`) | ExoPlayer crashes with `HTTP 403 Forbidden` because Cloudflare Turnstile blocks it | Discard non-streamable cyberlockers; only return direct S3/R2 presigned or direct CDN links. |
| 8 | Hardcoding audio language | Fails on multi-audio / dual-audio releases | Dynamically scan release names with `parseAudiosFromText()`. |
| 9 | Duplicate stream entries | Clutters the source selector with identical URLs | Maintain a `seenStreamKeys` hash set of `url + '|' + quality`. |

---

## 9. Final Delivery Checklist

Before submitting your provider plugin, verify that:
- [ ] No Kotlin code was edited.
- [ ] Plugin runs cleanly without `Buffer` or `AbortSignal.timeout`.
- [ ] `globalThis.__CALL_ARGS__` is safely unpacked for metadata resolution.
- [ ] Stream `title` conforms to `MatchScorer.kt` (`SxxExx` for TV, `(Year)` for Movies).
- [ ] Video qualities are parsed accurately without the "DS4K" false positive.
- [ ] Audio tags are extracted dynamically (`[MULTI]`, `[ENG]`, `[HIN]`, etc.).
- [ ] Returned streams return `HTTP 206` on range requests (no Cloudflare challenge HTML).
- [ ] All servers run in parallel with safe individual timeouts.
- [ ] All domain hosts reside strictly within the top Config Block.
- [ ] Manifest entry is updated with accurate versions, formats, and languages.

---

## 10. Final Report Template

Conclude your task with a report formatted as follows:

1. **Executive Summary:** Overview of provider, content types supported, and architecture (HTML / API / Gateway).
2. **Server & Engine Table:**
   | Server Display Name | Direct Engine / Host | Audio Detected | Max Quality | ExoPlayer Verified |
   |---|---|---|---|---|
   | FSL R2 Server | Cloudflare R2 Presigned S3 | MULTI (HIN · ENG) | 4K 2160p | ✅ Yes (HTTP 206) |
3. **Android Sandbox Compliance:** Confirmation that `Buffer`, `AbortSignal.timeout`, and Node dependencies are absent.
4. **MatchScorer Compliance:** Example movie title and TV series title generated by the plugin.
5. **Config Block:** Code snippet of the single top-level configuration block.
6. **Live Test Results:** Execution output showing movies, TV episodes, range checks, and elapsed timings.
