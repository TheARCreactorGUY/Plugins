/**
 * Freekz (freekz.to / Vidstuck) Provider Plugin for Euthopiar / Universal Streaming Architecture
 *
 * Implements high-speed multi-server streaming across 5 distinct CDN architectures:
 *  - Atlas: Dual-stream HLS VOD (1080p, 720p) via Cloudflare Edge Workers [Proven Working]
 *  - Daedalus: Adaptive Multi-Quality HLS (1080p, 720p, 480p) via AWS CloudFront CDN
 *  - Andromeda: High-speed DASH streaming (1080p)
 *  - Orion: Multi-Audio & Dubs with DASH MPEG-DASH manifests (1080p)
 *  - Ursa: High-speed HLS stream (1080p)
 *
 * Features:
 *  - Intelligent batching & staggering to completely eliminate HTTP 429 rate limits.
 *  - Real-time token handshake via /backend/vidstuck with deobfuscated payload mapping.
 *  - AES-256-CBC cipher decryption using embedded zero-dependency CryptoJS engine (No Node Buffer).
 *  - Direct subtitle integration across 19+ languages via /backend/subtitle (No token consumed).
 *  - Media3 container extension injection (&ext=master.m3u8 / &ext=manifest.mpd) for instant player dispatch.
 *  - In-memory 5-minute stream cache for instant replays and rapid server switching.
 *  - Full MatchScorer.kt title compliance (SxxExx for TV shows, clean (Year) for movies).
 */

/* =========================================================================
   CONFIG BLOCK: If site changes domain, update ONLY the URLs in this block.
   ========================================================================= */
var BASE_URL = 'https://freekz.to';
var BACKEND_URL = 'https://vidstuck.cc';
var TMDB_PROXY_URL = 'https://db.wecollege.net/3';
/* ========================================================================= */

var PROVIDER_ID = 'freekz';
var PROVIDER_NAME = 'Freekz';

// Deobfuscated parameter keys
var KEY_TMDB = "a7f39c821d604e5b9c1e547b";
var KEY_TS = "61d9a5274c8e3b29f38c291e6";
var KEY_TOKEN = "c492f7a183d601e436c538a716d";
var KEY_TITLE = "5e28c9147a306d1e29f3674b392a1";
var KEY_YEAR = "b731e6c94f08675f8341c306e";
var KEY_SEASON = "d8427b59c38a2f957c3613e85b";
var KEY_EPISODE = "91c6e4a753d1f785c92346b713d";
var KEY_SERVER = "6b491e7258d392e7561a9384c";
var KEY_TYPE = "c281b306d28147a35632e816b";
var KEY_DATE = "e1649321a39e5814b3027";
var KEY_LATEST_DATE = "e92543416ad739e5814b3027";
var KEY_IMDB = "f35a8c19d674b3265e871c4933a725f";

var AES_PASSPHRASE = "7f4c9e2a81d63b05c4f7a9e8126d3b50e1a8c7f23d9465ab0c6e9f1d4a7b832c";

var DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Referer': BACKEND_URL + '/',
    'Origin': BACKEND_URL,
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/json'
};

// Priority-ordered servers (HLS direct-stream first for maximum device compatibility)
var SERVERS = [
    { id: "atlas", name: "Atlas", desc: "HLS CDN", format: "m3u8", defaultRes: "1080p", audioTag: "ENG", audioBadge: "[ENG]" },
    { id: "daedalus", name: "Daedalus", desc: "Adaptive HLS", format: "m3u8", defaultRes: "1080p", audioTag: "ENG", audioBadge: "[ENG]" },
    { id: "andromeda", name: "Andromeda", desc: "Fast DASH", format: "mpd", defaultRes: "1080p", audioTag: "ENG", audioBadge: "[ENG]" },
    { id: "orion", name: "Orion", desc: "Multi Audio DASH", format: "mpd", defaultRes: "1080p", audioTag: "MULTI", audioBadge: "[MULTI] [DUAL-AUDIO]" },
    { id: "ursa", name: "Ursa", desc: "Dual Audio HLS", format: "m3u8", defaultRes: "1080p", audioTag: "MULTI", audioBadge: "[MULTI] [DUAL-AUDIO]" }
];

// In-memory cache to prevent 429 rate limit when user selects or replays streams
var STREAM_CACHE = {};
var CACHE_TTL_MS = 5 * 60 * 1000;

/* --- Standalone Mini CryptoJS Engine for QuickJS --- */
var MiniAes = (function() {
    var window = undefined;
    var MiniAes=(()=>{var Y=(m=>typeof require<"u"?require:typeof Proxy<"u"?new Proxy(m,{get:(c,H)=>(typeof require<"u"?require:c)[H]}):m)(function(m){if(typeof require<"u")return require.apply(this,arguments);throw Error('Dynamic require of "'+m+'" is not supported')});var I=(m,c)=>()=>{try{return c||m((c={exports:{}}).exports,c),c.exports}catch(H){throw c=0,H}};var Z=I(()=>{});var N=I((O,X)=>{(function(m,c){typeof O=="object"?X.exports=O=c():typeof define=="function"&&define.amd?define([],c):m.CryptoJS=c()})(O,function(){var m=m||(function(c,H){var S;if(typeof window<"u"&&window.crypto&&(S=window.crypto),typeof self<"u"&&self.crypto&&(S=self.crypto),typeof globalThis<"u"&&globalThis.crypto&&(S=globalThis.crypto),!S&&typeof window<"u"&&window.msCrypto&&(S=window.msCrypto),!S&&typeof global<"u"&&global.crypto&&(S=global.crypto),!S&&typeof Y=="function")try{S=Z()}catch{}var K=function(){if(S){if(typeof S.getRandomValues=="function")try{return S.getRandomValues(new Uint32Array(1))[0]}catch{}if(typeof S.randomBytes=="function")try{return S.randomBytes(4).readInt32LE()}catch{}}throw new Error("Native crypto module could not be used to get secure random number.")},A=Object.create||(function(){function e(){}return function(r){var d;return e.prototype=r,d=new e,e.prototype=null,d}})(),q={},n=q.lib={},C=n.Base=(function(){return{extend:function(e){var r=A(this);return e&&r.mixIn(e),(!r.hasOwnProperty("init")||this.init===r.init)&&(r.init=function(){r.$super.init.apply(this,arguments)}),r.init.prototype=r,r.$super=this,r},create:function(){var e=this.extend();return e.init.apply(e,arguments),e},init:function(){},mixIn:function(e){for(var r in e)e.hasOwnProperty(r)&&(this[r]=e[r]);e.hasOwnProperty("toString")&&(this.toString=e.toString)},clone:function(){return this.init.prototype.extend(this)}}})(),_=n.WordArray=C.extend({init:function(e,r){e=this.words=e||[],r!=H?this.sigBytes=r:this.sigBytes=e.length*4},toString:function(e){return(e||x).stringify(this)},concat:function(e){var r=this.words,d=e.words,u=this.sigBytes,b=e.sigBytes;if(this.clamp(),u%4)for(var z=0;z<b;z++){var F=d[z>>>2]>>>24-z%4*8&255;r[u+z>>>2]|=F<<24-(u+z)%4*8}else for(var B=0;B<b;B+=4)r[u+B>>>2]=d[B>>>2];return this.sigBytes+=b,this},clamp:function(){var e=this.words,r=this.sigBytes;e[r>>>2]&=4294967295<<32-r%4*8,e.length=c.ceil(r/4)},clone:function(){var e=C.clone.call(this);return e.words=this.words.slice(0),e},random:function(e){for(var r=[],d=0;d<e;d+=4)r.push(K());return new _.init(r,e)}}),h=q.enc={},x=h.Hex={stringify:function(e){for(var r=e.words,d=e.sigBytes,u=[],b=0;b<d;b++){var z=r[b>>>2]>>>24-b%4*8&255;u.push((z>>>4).toString(16)),u.push((z&15).toString(16))}return u.join("")},parse:function(e){for(var r=e.length,d=[],u=0;u<r;u+=2)d[u>>>3]|=parseInt(e.substr(u,2),16)<<24-u%8*4;return new _.init(d,r/2)}},l=h.Latin1={stringify:function(e){for(var r=e.words,d=e.sigBytes,u=[],b=0;b<d;b++){var z=r[b>>>2]>>>24-b%4*8&255;u.push(String.fromCharCode(z))}return u.join("")},parse:function(e){for(var r=e.length,d=[],u=0;u<r;u++)d[u>>>2]|=(e.charCodeAt(u)&255)<<24-u%4*8;return new _.init(d,r)}},p=h.Utf8={stringify:function(e){try{return decodeURIComponent(escape(l.stringify(e)))}catch{throw new Error("Malformed UTF-8 data")}},parse:function(e){return l.parse(unescape(encodeURIComponent(e)))}},y=n.BufferedBlockAlgorithm=C.extend({reset:function(){this._data=new _.init,this._nDataBytes=0},_append:function(e){typeof e=="string"&&(e=p.parse(e)),this._data.concat(e),this._nDataBytes+=e.sigBytes},_process:function(e){var r,d=this._data,u=d.words,b=d.sigBytes,z=this.blockSize,F=z*4,B=b/F;e?B=c.ceil(B):B=c.max((B|0)-this._minBufferSize,0);var W=B*z,P=c.min(W*4,b);if(W){for(var t=0;t<W;t+=z)this._doProcessBlock(u,t);r=u.splice(0,W),d.sigBytes-=P}return new _.init(r,P)},clone:function(){var e=C.clone.call(this);return e._data=this._data.clone(),e},_minBufferSize:0}),E=n.Hasher=y.extend({cfg:C.extend(),init:function(e){this.cfg=this.cfg.extend(e),this.reset()},reset:function(){y.reset.call(this),this._doReset()},update:function(e){return this._append(e),this._process(),this},finalize:function(e){e&&this._append(e);var r=this._doFinalize();return r},blockSize:512/32,_createHelper:function(e){return function(r,d){return new e.init(d).finalize(r)}},_createHmacHelper:function(e){return function(r,d){return new k.HMAC.init(e,d).finalize(r)}}}),k=q.algo={};return q})(Math);return m})});var re=I((T,ee)=>{(function(m,c){typeof T=="object"?ee.exports=T=c(N()):typeof define=="function"&&define.amd?define(["./core"],c):c(m.CryptoJS)})(T,function(m){return(function(){var c=m,H=c.lib,S=H.WordArray,K=c.enc,A=K.Base64={stringify:function(n){var C=n.words,_=n.sigBytes,h=this._map;n.clamp();for(var x=[],l=0;l<_;l+=3)for(var p=C[l>>>2]>>>24-l%4*8&255,y=C[l+1>>>2]>>>24-(l+1)%4*8&255,E=C[l+2>>>2]>>>24-(l+2)%4*8&255,k=p<<16|y<<8|E,e=0;e<4&&l+e*.75<_;e++)x.push(h.charAt(k>>>6*(3-e)&63));var r=h.charAt(64);if(r)for(;x.length%4;)x.push(r);return x.join("")},parse:function(n){var C=n.length,_=this._map,h=this._reverseMap;if(!h){h=this._reverseMap=[];for(var x=0;x<_.length;x++)h[_.charCodeAt(x)]=x}var l=_.charAt(64);if(l){var p=n.indexOf(l);p!==-1&&(C=p)}return q(n,C,h)},_map:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="};function q(n,C,_){for(var h=[],x=0,l=0;l<C;l++)if(l%4){var p=_[n.charCodeAt(l-1)]<<l%4*2,y=_[n.charCodeAt(l)]>>>6-l%4*2,E=p|y;h[x>>>2]|=E<<24-x%4*8,x++}return S.create(h,x)}})(),m.enc.Base64})});var ne=I((V,te)=>{(function(m,c){typeof V=="object"?te.exports=V=c(N()):typeof define=="function"&&define.amd?define(["./core"],c):c(m.CryptoJS)})(V,function(m){return(function(c){var H=m,S=H.lib,K=S.WordArray,A=S.Hasher,q=H.algo,n=[];(function(){for(var p=0;p<64;p++)n[p]=c.abs(c.sin(p+1))*4294967296|0})();var C=q.MD5=A.extend({_doReset:function(){this._hash=new K.init([1732584193,4023233417,2562383102,271733878])},_doProcessBlock:function(p,y){for(var E=0;E<16;E++){var k=y+E,e=p[k];p[k]=(e<<8|e>>>24)&16711935|(e<<24|e>>>8)&4278255360}var r=this._hash.words,d=p[y+0],u=p[y+1],b=p[y+2],z=p[y+3],F=p[y+4],B=p[y+5],W=p[y+6],P=p[y+7],t=p[y+8],v=p[y+9],g=p[y+10],a=p[y+11],w=p[y+12],D=p[y+13],L=p[y+14],R=p[y+15],i=r[0],o=r[1],s=r[2],f=r[3];i=_(i,o,s,f,d,7,n[0]),f=_(f,i,o,s,u,12,n[1]),s=_(s,f,i,o,b,17,n[2]),o=_(o,s,f,i,z,22,n[3]),i=_(i,o,s,f,F,7,n[4]),f=_(f,i,o,s,B,12,n[5]),s=_(s,f,i,o,W,17,n[6]),o=_(o,s,f,i,P,22,n[7]),i=_(i,o,s,f,t,7,n[8]),f=_(f,i,o,s,v,12,n[9]),s=_(s,f,i,o,g,17,n[10]),o=_(o,s,f,i,a,22,n[11]),i=_(i,o,s,f,w,7,n[12]),f=_(f,i,o,s,D,12,n[13]),s=_(s,f,i,o,L,17,n[14]),o=_(o,s,f,i,R,22,n[15]),i=h(i,o,s,f,u,5,n[16]),f=h(f,i,o,s,W,9,n[17]),s=h(s,f,i,o,a,14,n[18]),o=h(o,s,f,i,d,20,n[19]),i=h(i,o,s,f,B,5,n[20]),f=h(f,i,o,s,g,9,n[21]),s=h(s,f,i,o,R,14,n[22]),o=h(o,s,f,i,F,20,n[23]),i=h(i,o,s,f,v,5,n[24]),f=h(f,i,o,s,L,9,n[25]),s=h(s,f,i,o,z,14,n[26]),o=h(o,s,f,i,t,20,n[27]),i=h(i,o,s,f,D,5,n[28]),f=h(f,i,o,s,b,9,n[29]),s=h(s,f,i,o,P,14,n[30]),o=h(o,s,f,i,w,20,n[31]),i=x(i,o,s,f,B,4,n[32]),f=x(f,i,o,s,t,11,n[33]),s=x(s,f,i,o,a,16,n[34]),o=x(o,s,f,i,L,23,n[35]),i=x(i,o,s,f,u,4,n[36]),f=x(f,i,o,s,F,11,n[37]),s=x(s,f,i,o,P,16,n[38]),o=x(o,s,f,i,g,23,n[39]),i=x(i,o,s,f,D,4,n[40]),f=x(f,i,o,s,d,11,n[41]),s=x(s,f,i,o,z,16,n[42]),o=x(o,s,f,i,W,23,n[43]),i=x(i,o,s,f,v,4,n[44]),f=x(f,i,o,s,w,11,n[45]),s=x(s,f,i,o,R,16,n[46]),o=x(o,s,f,i,b,23,n[47]),i=l(i,o,s,f,d,6,n[48]),f=l(f,i,o,s,P,10,n[49]),s=l(s,f,i,o,L,15,n[50]),o=l(o,s,f,i,B,21,n[51]),i=l(i,o,s,f,w,6,n[52]),f=l(f,i,o,s,z,10,n[53]),s=l(s,f,i,o,g,15,n[54]),o=l(o,s,f,i,u,21,n[55]),i=l(i,o,s,f,t,6,n[56]),f=l(f,i,o,s,R,10,n[57]),s=l(s,f,i,o,W,15,n[58]),o=l(o,s,f,i,D,21,n[59]),i=l(i,o,s,f,F,6,n[60]),f=l(f,i,o,s,a,10,n[61]),s=l(s,f,i,o,b,15,n[62]),o=l(o,s,f,i,v,21,n[63]),r[0]=r[0]+i|0,r[1]=r[1]+o|0,r[2]=r[2]+s|0,r[3]=r[3]+f|0},_doFinalize:function(){var p=this._data,y=p.words,E=this._nDataBytes*8,k=p.sigBytes*8;y[k>>>5]|=128<<24-k%32;var e=c.floor(E/4294967296),r=E;y[(k+64>>>9<<4)+15]=(e<<8|e>>>24)&16711935|(e<<24|e>>>8)&4278255360,y[(k+64>>>9<<4)+14]=(r<<8|r>>>24)&16711935|(r<<24|r>>>8)&4278255360,p.sigBytes=(y.length+1)*4,this._process();for(var d=this._hash,u=d.words,b=0;b<4;b++){var z=u[b];u[b]=(z<<8|z>>>24)&16711935|(z<<24|z>>>8)&4278255360}return d},clone:function(){var p=A.clone.call(this);return p._hash=this._hash.clone(),p}});function _(p,y,E,k,e,r,d){var u=p+(y&E|~y&k)+e+d;return(u<<r|u>>>32-r)+y}function h(p,y,E,k,e,r,d){var u=p+(y&k|E&~k)+e+d;return(u<<r|u>>>32-r)+y}function x(p,y,E,k,e,r,d){var u=p+(y^E^k)+e+d;return(u<<r|u>>>32-r)+y}function l(p,y,E,k,e,r,d){var u=p+(E^(y|~k))+e+d;return(u<<r|u>>>32-r)+y}H.MD5=A._createHelper(C),H.HmacMD5=A._createHmacHelper(C)})(Math),m.MD5})});var ae=I((U,ie)=>{(function(m,c){typeof U=="object"?ie.exports=U=c(N()):typeof define=="function"&&define.amd?define(["./core"],c):c(m.CryptoJS)})(U,function(m){return(function(){var c=m,H=c.lib,S=H.WordArray,K=H.Hasher,A=c.algo,q=[],n=A.SHA1=K.extend({_doReset:function(){this._hash=new S.init([1732584193,4023233417,2562383102,271733878,3285377520])},_doProcessBlock:function(C,_){for(var h=this._hash.words,x=h[0],l=h[1],p=h[2],y=h[3],E=h[4],k=0;k<80;k++){if(k<16)q[k]=C[_+k]|0;else{var e=q[k-3]^q[k-8]^q[k-14]^q[k-16];q[k]=e<<1|e>>>31}var r=(x<<5|x>>>27)+E+q[k];k<20?r+=(l&p|~l&y)+1518500249:k<40?r+=(l^p^y)+1859775393:k<60?r+=(l&p|l&y|p&y)-1894007588:r+=(l^p^y)-899497514,E=y,y=p,p=l<<30|l>>>2,l=x,x=r}h[0]=h[0]+x|0,h[1]=h[1]+l|0,h[2]=h[2]+p|0,h[3]=h[3]+y|0,h[4]=h[4]+E|0},_doFinalize:function(){var C=this._data,_=C.words,h=this._nDataBytes*8,x=C.sigBytes*8;return _[x>>>5]|=128<<24-x%32,_[(x+64>>>9<<4)+14]=Math.floor(h/4294967296),_[(x+64>>>9<<4)+15]=h,C.sigBytes=_.length*4,this._process(),this._hash},clone:function(){var C=K.clone.call(this);return C._hash=this._hash.clone(),C}});c.SHA1=K._createHelper(n),c.HmacSHA1=K._createHmacHelper(n)})(),m.SHA1})});var se=I((M,oe)=>{(function(m,c){typeof M=="object"?oe.exports=M=c(N()):typeof define=="function"&&define.amd?define(["./core"],c):c(m.CryptoJS)})(M,function(m){(function(){var c=m,H=c.lib,S=H.Base,K=c.enc,A=K.Utf8,q=c.algo,n=q.HMAC=S.extend({init:function(C,_){C=this._hasher=new C.init,typeof _=="string"&&(_=A.parse(_));var h=C.blockSize,x=h*4;_.sigBytes>x&&(_=C.finalize(_)),_.clamp();for(var l=this._oKey=_.clone(),p=this._iKey=_.clone(),y=l.words,E=p.words,k=0;k<h;k++)y[k]^=1549556828,E[k]^=909522486;l.sigBytes=p.sigBytes=x,this.reset()},reset:function(){var C=this._hasher;C.reset(),C.update(this._iKey)},update:function(C){return this._hasher.update(C),this},finalize:function(C){var _=this._hasher,h=_.finalize(C);_.reset();var x=_.finalize(this._oKey.clone().concat(h));return x}})})()})});var Q=I((j,fe)=>{(function(m,c,H){typeof j=="object"?fe.exports=j=c(N(),ae(),se()):typeof define=="function"&&define.amd?define(["./core","./sha1","./hmac"],c):c(m.CryptoJS)})(j,function(m){return(function(){var c=m,H=c.lib,S=H.Base,K=H.WordArray,A=c.algo,q=A.MD5,n=A.EvpKDF=S.extend({cfg:S.extend({keySize:128/32,hasher:q,iterations:1}),init:function(C){this.cfg=this.cfg.extend(C)},compute:function(C,_){for(var h,x=this.cfg,l=x.hasher.create(),p=K.create(),y=p.words,E=x.keySize,k=x.iterations;y.length<E;){h&&l.update(h),h=l.update(C).finalize(_),l.reset();for(var e=1;e<k;e++)h=l.finalize(h),l.reset();p.concat(h)}return p.sigBytes=E*4,p}});c.EvpKDF=function(C,_,h){return n.create(h).compute(C,_)}})(),m.EvpKDF})});var ve=I((J,ce)=>{(function(m,c,H){typeof J=="object"?ce.exports=J=c(N(),Q()):typeof define=="function"&&define.amd?define(["./core","./evpkdf"],c):c(m.CryptoJS)})(J,function(m){m.lib.Cipher||(function(c){var H=m,S=H.lib,K=S.Base,A=S.WordArray,q=S.BufferedBlockAlgorithm,n=H.enc,C=n.Utf8,_=n.Base64,h=H.algo,x=h.EvpKDF,l=S.Cipher=q.extend({cfg:K.extend(),createEncryptor:function(t,v){return this.create(this._ENC_XFORM_MODE,t,v)},createDecryptor:function(t,v){return this.create(this._DEC_XFORM_MODE,t,v)},init:function(t,v,g){this.cfg=this.cfg.extend(g),this._xformMode=t,this._key=v,this.reset()},reset:function(){q.reset.call(this),this._doReset()},process:function(t){return this._append(t),this._process()},finalize:function(t){t&&this._append(t);var v=this._doFinalize();return v},keySize:128/32,ivSize:128/32,_ENC_XFORM_MODE:1,_DEC_XFORM_MODE:2,_createHelper:(function(){function t(v){return typeof v=="string"?P:F}return function(v){return{encrypt:function(g,a,w){return t(a).encrypt(v,g,a,w)},decrypt:function(g,a,w){return t(a).decrypt(v,g,a,w)}}}})()}),p=S.StreamCipher=l.extend({_doFinalize:function(){var t=this._process(!0);return t},blockSize:1}),y=H.mode={},E=S.BlockCipherMode=K.extend({createEncryptor:function(t,v){return this.Encryptor.create(t,v)},createDecryptor:function(t,v){return this.Decryptor.create(t,v)},init:function(t,v){this._cipher=t,this._iv=v}}),k=y.CBC=(function(){var t=E.extend();t.Encryptor=t.extend({processBlock:function(g,a){var w=this._cipher,D=w.blockSize;v.call(this,g,a,D),w.encryptBlock(g,a),this._prevBlock=g.slice(a,a+D)}}),t.Decryptor=t.extend({processBlock:function(g,a){var w=this._cipher,D=w.blockSize,L=g.slice(a,a+D);w.decryptBlock(g,a),v.call(this,g,a,D),this._prevBlock=L}});function v(g,a,w){var D,L=this._iv;L?(D=L,this._iv=c):D=this._prevBlock;for(var R=0;R<w;R++)g[a+R]^=D[R]}return t})(),e=H.pad={},r=e.Pkcs7={pad:function(t,v){for(var g=v*4,a=g-t.sigBytes%g,w=a<<24|a<<16|a<<8|a,D=[],L=0;L<a;L+=4)D.push(w);var R=A.create(D,a);t.concat(R)},unpad:function(t){var v=t.words[t.sigBytes-1>>>2]&255;t.sigBytes-=v}},d=S.BlockCipher=l.extend({cfg:l.cfg.extend({mode:k,padding:r}),reset:function(){var t;l.reset.call(this);var v=this.cfg,g=v.iv,a=v.mode;this._xformMode==this._ENC_XFORM_MODE?t=a.createEncryptor:(t=a.createDecryptor,this._minBufferSize=1),this._mode&&this._mode.__creator==t?this._mode.init(this,g&&g.words):(this._mode=t.call(a,this,g&&g.words),this._mode.__creator=t)},_doProcessBlock:function(t,v){this._mode.processBlock(t,v)},_doFinalize:function(){var t,v=this.cfg.padding;return this._xformMode==this._ENC_XFORM_MODE?(v.pad(this._data,this.blockSize),t=this._process(!0)):(t=this._process(!0),v.unpad(t)),t},blockSize:128/32}),u=S.CipherParams=K.extend({init:function(t){this.mixIn(t)},toString:function(t){return(t||this.formatter).stringify(this)}}),b=H.format={},z=b.OpenSSL={stringify:function(t){var v,g=t.ciphertext,a=t.salt;return a?v=A.create([1398893684,1701076831]).concat(a).concat(g):v=g,v.toString(_)},parse:function(t){var v,g=_.parse(t),a=g.words;return a[0]==1398893684&&a[1]==1701076831&&(v=A.create(a.slice(2,4)),a.splice(0,4),g.sigBytes-=16),u.create({ciphertext:g,salt:v})}},F=S.SerializableCipher=K.extend({cfg:K.extend({format:z}),encrypt:function(t,v,g,a){a=this.cfg.extend(a);var w=t.createEncryptor(g,a),D=w.finalize(v),L=w.cfg;return u.create({ciphertext:D,key:g,iv:L.iv,algorithm:t,mode:L.mode,padding:L.padding,blockSize:t.blockSize,formatter:a.format})},decrypt:function(t,v,g,a){a=this.cfg.extend(a),v=this._parse(v,a.format);var w=t.createDecryptor(g,a).finalize(v.ciphertext);return w},_parse:function(t,v){return typeof t=="string"?v.parse(t,this):t}}),B=H.kdf={},W=B.OpenSSL={execute:function(t,v,g,a,w){if(a||(a=A.random(64/8)),w)var D=x.create({keySize:v+g,hasher:w}).compute(t,a);else var D=x.create({keySize:v+g}).compute(t,a);var L=A.create(D.words.slice(v),g*4);return D.sigBytes=v*4,u.create({key:D,iv:L,salt:a})}},P=S.PasswordBasedCipher=F.extend({cfg:F.cfg.extend({kdf:W}),encrypt:function(t,v,g,a){a=this.cfg.extend(a);var w=a.kdf.execute(g,t.keySize,t.ivSize,a.salt,a.hasher);a.iv=w.iv;var D=F.encrypt.call(this,t,v,w.key,a);return D.mixIn(w),D},decrypt:function(t,v,g,a){a=this.cfg.extend(a),v=this._parse(v,a.format);var w=a.kdf.execute(g,t.keySize,t.ivSize,v.salt,a.hasher);a.iv=w.iv;var D=F.decrypt.call(this,t,v,w.key,a);return D}})})()})});var ue=I((G,de)=>{(function(m,c,H){typeof G=="object"?de.exports=G=c(N(),re(),ne(),Q(),ve()):typeof define=="function"&&define.amd?define(["./core","./enc-base64","./md5","./evpkdf","./cipher-core"],c):c(m.CryptoJS)})(G,function(m){return(function(){var c=m,H=c.lib,S=H.BlockCipher,K=c.algo,A=[],q=[],n=[],C=[],_=[],h=[],x=[],l=[],p=[],y=[];(function(){for(var e=[],r=0;r<256;r++)r<128?e[r]=r<<1:e[r]=r<<1^283;for(var d=0,u=0,r=0;r<256;r++){var b=u^u<<1^u<<2^u<<3^u<<4;b=b>>>8^b&255^99,A[d]=b,q[b]=d;var z=e[d],F=e[z],B=e[F],W=e[b]*257^b*16843008;n[d]=W<<24|W>>>8,C[d]=W<<16|W>>>16,_[d]=W<<8|W>>>24,h[d]=W;var W=B*16843009^F*65537^z*257^d*16843008;x[b]=W<<24|W>>>8,l[b]=W<<16|W>>>16,p[b]=W<<8|W>>>24,y[b]=W,d?(d=z^e[e[e[B^z]]],u^=e[e[u]]):d=u=1}})();var E=[0,1,2,4,8,16,32,64,128,27,54],k=K.AES=S.extend({_doReset:function(){var e;if(!(this._nRounds&&this._keyPriorReset===this._key)){for(var r=this._keyPriorReset=this._key,d=r.words,u=r.sigBytes/4,b=this._nRounds=u+6,z=(b+1)*4,F=this._keySchedule=[],B=0;B<z;B++)B<u?F[B]=d[B]:(e=F[B-1],B%u?u>6&&B%u==4&&(e=A[e>>>24]<<24|A[e>>>16&255]<<16|A[e>>>8&255]<<8|A[e&255]):(e=e<<8|e>>>24,e=A[e>>>24]<<24|A[e>>>16&255]<<16|A[e>>>8&255]<<8|A[e&255],e^=E[B/u|0]<<24),F[B]=F[B-u]^e);for(var W=this._invKeySchedule=[],P=0;P<z;P++){var B=z-P;if(P%4)var e=F[B];else var e=F[B-4];P<4||B<=4?W[P]=e:W[P]=x[A[e>>>24]]^l[A[e>>>16&255]]^p[A[e>>>8&255]]^y[A[e&255]]}}},encryptBlock:function(e,r){this._doCryptBlock(e,r,this._keySchedule,n,C,_,h,A)},decryptBlock:function(e,r){var d=e[r+1];e[r+1]=e[r+3],e[r+3]=d,this._doCryptBlock(e,r,this._invKeySchedule,x,l,p,y,q);var d=e[r+1];e[r+1]=e[r+3],e[r+3]=d},_doCryptBlock:function(e,r,d,u,b,z,F,B){for(var W=this._nRounds,P=e[r]^d[0],t=e[r+1]^d[1],v=e[r+2]^d[2],g=e[r+3]^d[3],a=4,w=1;w<W;w++){var D=u[P>>>24]^b[t>>>16&255]^z[v>>>8&255]^F[g&255]^d[a++],L=u[t>>>24]^b[v>>>16&255]^z[g>>>8&255]^F[P&255]^d[a++],R=u[v>>>24]^b[g>>>16&255]^z[P>>>8&255]^F[t&255]^d[a++],i=u[g>>>24]^b[P>>>16&255]^z[t>>>8&255]^F[v&255]^d[a++];P=D,t=L,v=R,g=i}var D=(B[P>>>24]<<24|B[t>>>16&255]<<16|B[v>>>8&255]<<8|B[g&255])^d[a++],L=(B[t>>>24]<<24|B[v>>>16&255]<<16|B[g>>>8&255]<<8|B[P&255])^d[a++],R=(B[v>>>24]<<24|B[g>>>16&255]<<16|B[P>>>8&255]<<8|B[t&255])^d[a++],i=(B[g>>>24]<<24|B[P>>>16&255]<<16|B[t>>>8&255]<<8|B[v&255])^d[a++];e[r]=D,e[r+1]=L,e[r+2]=R,e[r+3]=i},keySize:256/32});c.AES=S._createHelper(k)})(),m.AES})});var le=I(($,he)=>{(function(m,c){typeof $=="object"?he.exports=$=c(N()):typeof define=="function"&&define.amd?define(["./core"],c):c(m.CryptoJS)})($,function(m){return m.enc.Utf8})});var xe=I((be,pe)=>{var _e=ue(),ye=le();pe.exports={decrypt:function(m,c){return _e.decrypt(m,c).toString(ye)}}});return xe();})();
    return MiniAes;
})();



function decryptLink(ciphertext) {
    if (!ciphertext || typeof ciphertext !== 'string') return '';
    try {
        var dec = MiniAes.decrypt(ciphertext, AES_PASSPHRASE);
        return dec ? dec.trim() : '';
    } catch (e) {
        return '';
    }
}

/* --- Safe Timeout Fetch (No AbortSignal.timeout) --- */
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

/* --- Safe Delay Helper --- */
function sleep(ms) {
    return new Promise(function(resolve) {
        setTimeout(resolve, ms);
    });
}

/* --- Direct Subtitle Fetcher (No Token Needed) --- */
async function fetchSubtitles(tmdbId, mediaType, season, episode, title, year, date) {
    try {
        var params = new URLSearchParams({
            [KEY_TMDB]: String(tmdbId),
            [KEY_TYPE]: mediaType,
            [KEY_TITLE]: title,
            [KEY_YEAR]: year,
            [KEY_DATE]: date
        });
        if (mediaType === 'tv') {
            params.set(KEY_SEASON, String(season));
            params.set(KEY_EPISODE, String(episode));
        }

        var subRes = await fetchWithTimeout(BACKEND_URL + '/backend/subtitle?' + params.toString(), {
            headers: DEFAULT_HEADERS
        }, 5000);

        if (!subRes.ok) return [];
        var subData = await subRes.json();
        var captions = (subData && subData.captions) || [];

        return captions.map(function(c) {
            return {
                url: c.file,
                lang: c.display || 'Unknown',
                name: c.display || 'Unknown'
            };
        });
    } catch (e) {
        return [];
    }
}

/* --- Fetch Server Stream Data with Handshake --- */
async function fetchServerStream(serverId, tmdbId, mediaType, season, episode, title, year, date, imdbId) {
    try {
        var tokenPayload = {
            [KEY_TMDB]: String(tmdbId),
            [KEY_TYPE]: mediaType,
            [KEY_SERVER]: serverId
        };
        if (mediaType === 'tv') {
            tokenPayload[KEY_SEASON] = Number(season);
            tokenPayload[KEY_EPISODE] = Number(episode);
        }

        var tokenRes = await fetchWithTimeout(BACKEND_URL + '/backend/vidstuck', {
            method: 'POST',
            headers: DEFAULT_HEADERS,
            body: JSON.stringify(tokenPayload)
        }, 5000);

        if (!tokenRes.ok) return null;
        var tokenData = await tokenRes.json();
        if (!tokenData || !tokenData.token || !tokenData.ts) return null;

        var params = new URLSearchParams({
            [KEY_TMDB]: String(tmdbId),
            [KEY_SERVER]: serverId,
            [KEY_TYPE]: mediaType,
            [KEY_TS]: String(tokenData.ts),
            [KEY_TOKEN]: tokenData.token,
            [KEY_TITLE]: title,
            [KEY_YEAR]: year,
            [KEY_DATE]: date
        });
        if (mediaType === 'tv') {
            params.set(KEY_SEASON, String(season));
            params.set(KEY_EPISODE, String(episode));
        }
        if (imdbId) {
            params.set(KEY_IMDB, imdbId);
        }

        var srvRes = await fetchWithTimeout(BACKEND_URL + '/backend/servers/' + serverId + '?' + params.toString(), {
            headers: DEFAULT_HEADERS
        }, 6000);

        if (!srvRes.ok) return null;
        return await srvRes.json();
    } catch (e) {
        return null;
    }
}

/* --- Main getStreams Entry Point --- */
async function getStreams(tmdbId, mediaType, season, episode, extraArgs) {
    try {
        var callArgs = (typeof globalThis !== 'undefined' && globalThis.__CALL_ARGS__) || {};
        extraArgs = Object.assign({}, callArgs, extraArgs || {});

        var isMovie = mediaType === 'movie';
        var sNum = Number(season) || 1;
        var eNum = Number(episode) || 1;
        var epTag = 'S' + (sNum < 10 ? '0' : '') + sNum + 'E' + (eNum < 10 ? '0' : '') + eNum;

        // Check memory cache first
        var cacheKey = String(tmdbId) + ':' + mediaType + ':' + sNum + ':' + eNum;
        var cached = STREAM_CACHE[cacheKey];
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
            return cached.streams;
        }

        var mediaTitle = extraArgs.title || extraArgs.name || '';
        var releaseYear = extraArgs.year || (extraArgs.releaseDate ? extraArgs.releaseDate.substring(0, 4) : '');
        var releaseDate = extraArgs.releaseDate || '';
        var imdbId = extraArgs.imdbId || '';

        // Resolve metadata if missing
        if (!mediaTitle || !releaseYear || !releaseDate) {
            try {
                var detailsRes = await fetchWithTimeout(BACKEND_URL + '/backend/tmdb/details/' + mediaType + '/' + tmdbId + '?language=en-US', {
                    headers: DEFAULT_HEADERS
                }, 4000);
                if (detailsRes.ok) {
                    var details = await detailsRes.json();
                    if (details) {
                        mediaTitle = mediaTitle || details.title || details.name || 'Title';
                        var dStr = details.release_date || details.first_air_date || '';
                        releaseDate = releaseDate || dStr || '2024-01-01';
                        releaseYear = releaseYear || (dStr ? dStr.substring(0, 4) : '2024');
                        imdbId = imdbId || details.imdb_id || '';
                    }
                }
            } catch (e) {}
        }

        mediaTitle = mediaTitle || 'Media';
        releaseYear = releaseYear || '2024';
        releaseDate = releaseDate || releaseYear + '-01-01';

        // 1. Fetch subtitles concurrently (no token needed)
        var subtitlesPromise = fetchSubtitles(tmdbId, mediaType, sNum, eNum, mediaTitle, releaseYear, releaseDate);

        // 2. Batched Server Queries (Staggered to prevent HTTP 429 rate limiting)
        // Batch 1: Primary HLS CDN servers (Atlas, Daedalus)
        var batch1 = await Promise.all([
            fetchServerStream('atlas', tmdbId, mediaType, sNum, eNum, mediaTitle, releaseYear, releaseDate, imdbId),
            fetchServerStream('daedalus', tmdbId, mediaType, sNum, eNum, mediaTitle, releaseYear, releaseDate, imdbId)
        ]);

        // Stagger 60ms between server batches to respect rate limits
        await sleep(60);

        // Batch 2: Secondary servers (Andromeda, Orion, Ursa)
        var batch2 = await Promise.all([
            fetchServerStream('andromeda', tmdbId, mediaType, sNum, eNum, mediaTitle, releaseYear, releaseDate, imdbId),
            fetchServerStream('orion', tmdbId, mediaType, sNum, eNum, mediaTitle, releaseYear, releaseDate, imdbId),
            fetchServerStream('ursa', tmdbId, mediaType, sNum, eNum, mediaTitle, releaseYear, releaseDate, imdbId)
        ]);

        var serverResults = [
            batch1[0], // atlas
            batch1[1], // daedalus
            batch2[0], // andromeda
            batch2[1], // orion
            batch2[2]  // ursa
        ];

        var allSubtitles = await subtitlesPromise;
        var collectedItems = [];

        for (var i = 0; i < SERVERS.length; i++) {
            var server = SERVERS[i];
            var data = serverResults[i];
            if (!data || !data.links || data.links.length === 0) continue;

            for (var j = 0; j < data.links.length; j++) {
                var linkObj = data.links[j];
                var rawDecrypted = decryptLink(linkObj.link);
                if (!rawDecrypted) continue;

                var finalUrl = rawDecrypted.startsWith('/') ? BACKEND_URL + rawDecrypted : rawDecrypted;

                // Determine container type & inject extension for ExoPlayer dispatch
                var formatType = server.format;
                if (formatType === 'mpd') {
                    // MPEG-DASH manifest
                    if (finalUrl.indexOf('.mpd') < 0) {
                        finalUrl = finalUrl + (finalUrl.indexOf('?') >= 0 ? '&' : '?') + 'ext=manifest.mpd';
                    }
                } else if (formatType === 'm3u8') {
                    // Only append dummy extension if URL doesn't already have .m3u8
                    // (Never alter AWS CloudFront signed URLs like Daedalus which break signature)
                    if (finalUrl.indexOf('.m3u8') < 0) {
                        finalUrl = finalUrl + (finalUrl.indexOf('?') >= 0 ? '&' : '?') + 'ext=master.m3u8';
                    }
                }

                // Determine quality label
                var quality = server.defaultRes || '1080p';
                if (linkObj.resolution && Number(linkObj.resolution) > 0) {
                    quality = linkObj.resolution + 'p';
                } else if (data.links.length > 1) {
                    quality = j === 0 ? '1080p' : (j === 1 ? '720p' : '480p');
                }

                var serverDisplayName = server.name;
                if (data.links.length > 1 && !linkObj.resolution) {
                    serverDisplayName = server.name + ' (' + quality + ')';
                }

                collectedItems.push({
                    serverId: server.id,
                    serverName: serverDisplayName,
                    url: finalUrl,
                    quality: quality,
                    type: formatType,
                    format: formatType === 'mpd' ? 'dash' : 'hls',
                    audioTag: server.audioTag,
                    audioBadge: server.audioBadge
                });
            }
        }

        // Deduplicate and format output streams matching MatchScorer.kt rules
        var streams = [];
        var seenUrls = {};

        for (var idx = 0; idx < collectedItems.length; idx++) {
            var item = collectedItems[idx];
            if (seenUrls[item.url]) continue;
            seenUrls[item.url] = true;

            var streamTitle = isMovie
                ? mediaTitle + ' (' + releaseYear + ') ' + item.audioBadge + ' - ' + PROVIDER_NAME + ' ' + item.serverName + ' [' + item.quality + ']'
                : mediaTitle + ' ' + epTag + ' ' + item.audioBadge + ' - ' + PROVIDER_NAME + ' ' + item.serverName + ' [' + item.quality + ']';

            var displayName = PROVIDER_NAME + ' | ' + item.serverName + ' • ' + item.audioBadge + ' (' + item.quality + ')';

            streams.push({
                name: displayName,
                title: streamTitle,
                url: item.url,
                quality: item.quality,
                size: isMovie ? '2.0 GB' : '750 MB',
                type: item.type,
                format: item.format,
                provider: PROVIDER_ID,
                language: item.audioTag === 'MULTI' ? 'multi' : 'en',
                headers: {
                    'User-Agent': DEFAULT_HEADERS['User-Agent'],
                    'Referer': BACKEND_URL + '/',
                    'Origin': BACKEND_URL
                },
                subtitles: allSubtitles
            });
        }

        // Cache results
        STREAM_CACHE[cacheKey] = {
            timestamp: Date.now(),
            streams: streams
        };

        return streams;
    } catch (fatal) {
        console.error('FATAL ERROR IN getStreams:', fatal);
        return [];
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getStreams: getStreams,
        MiniAes: MiniAes
    };
}

if (typeof globalThis !== 'undefined') {
    globalThis.getStreams = getStreams;
}
