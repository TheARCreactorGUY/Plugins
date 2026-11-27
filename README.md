# Euthopiar Universal Streaming Plugins (QuickJS Architecture)

A centralized collection of standalone, QuickJS-compliant streaming plugins powering the **Euthopiar Media** ecosystem (Mobile, Android TV, and Desktop). Each provider returns normalized direct CDN links (`mp4` / `mkv`) or playlists (`m3u8`) complete with Server/Subserver labels, Adaptive HLS vs Single-Quality metadata, HDR/codec/audio tags, and WebVTT subtitles.

## Available Providers (`v3.1.0`)

| ID | Provider Name | Primary Domain | Supported Types | Version | Key Streaming Features |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `movy` | **Movy** | `movy.sx` | Movie, TV, Anime | `1.4.0` | 14 parallel CDN nodes, IMDB fallback, Adaptive/Direct HLS, cross-server subtitles |
| `bingr` | **Bingr** | `bingr.one` | Movie, TV, Anime | `1.4.0` | Vidbolt (Orion/Callisto/Vega/Zephyr) + Cinezo/Punkflix HLS, multi-audio & VTT subtitles |
| `4khdhub` | **4KHDHub** | `4khdhub.one` | Movie, TV, Anime | `1.5.0` | FSL R2, Pixel Cloud, ZipDisk, Pixeldrain; HDR/HEVC/Atmos tags, multi-audio |
| `net77` | **NetMirror (Net77)** | `net77.cc` | Movie, TV, Anime | `1.1.0` | Netflix, Prime Video, Hotstar adaptive master `.m3u8` + multi-audio & 30+ VTT subtitles |
| `uhdmovies` | **UHDMovies** | `uhdmovies.ceo` | Movie, TV | `1.2.0` | 4K 2160p HDR, 10-bit HEVC & 1080p Google Cloud CDN links with parallel gateway traversal |
| `freekz` | **Freekz** | `freekz.to` | Movie, TV | `2.3.0` | StreamHub direct MP4 CDN + Vidstuck mirrors, split Original/Dubbed TV matching |
| `vegamovies` | **VegaMovies** | `vegamovies19.co.in` | Movie, TV, Anime | `1.3.0` | Bollywood/Hollywood/Regional dual-audio direct MKV/MP4 CDNs |
| `7movies` | **7Movies** | `7movies.ws` | Movie, TV, Anime | `1.0.0` | Direct Google CDN files (REMUX/BluRay/HEVC/Atmos) + Vidbolt & Cinezo HLS + subtitles |
| `fmovies` | **FMovies** | `ww7-fmovies.com` | Movie, TV | `1.0.0` | WebCrypto AES-GCM Vidnest & Vidrock backends, disguised-HLS checks & VTT subtitles |
| `hdhub4u` | **HDHub4u** | `new17.hdhub4u.cl` | Movie, TV | `1.1.0` | Parallel Pingora/Typesense search + Pixel Cloud / ZipDisk / Pixeldrain direct streams |

## Quick Testing & Validation

```bash
# Run full suite across all 10 active providers (Movie & TV playback probes)
node --use-system-ca test_all_providers.js

# Or launch the local browser harness UI
node server.js
```

> **QuickJS Compatibility:** All plugins avoid Node.js-only built-ins (`Buffer`, `fs`, `crypto`, `AbortSignal.timeout`) and rely purely on `fetch()`, standard ES2020/WebCrypto (`crypto.subtle`), and `globalThis.__CALL_ARGS__` marshaling.
