// SecureYouTubePlayer.jsx
// LMS eka athule YouTube video / playlist play karanna - YouTube ekata click/link yanne nathuwa.
// Usage: <SecureYouTubePlayer url="https://youtu.be/xxxxxxxxxxx" />
//
// IMPORTANT:
// 1. index.html eke <head> ekata me meta eka danna (nathnam Error 153 / bot error enawa):
//    <meta name="referrer" content="strict-origin-when-cross-origin" />
// 2. https site ekaka hari localhost eke run karanna. file:// walin wada karanne naha.
//
// Controls:
//   Click / tap (meda)         -> play / pause
//   Double-tap wam / dakuna    -> -10s / +10s  (digatama tap karoth thawa thawa skip wenawa)
//   Seek bar click / drag      -> e thanata yanawa
//   Keyboard: Space/K play, ←/J -10s, →/L +10s, M mute, F fullscreen
//   ⚙ menu                     -> Speed + Quality

import { useEffect, useRef, useState, useCallback } from "react";
import "./SecureYouTubePlayer.css";

const SKIP = 10; // seconds

// ---------- URL -> { videoId, listId } ----------
export function parseYouTube(input) {
  if (!input) return null;
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return { videoId: s, listId: null };
  if (/^(PL|UU|OL|FL|RD)[\w-]{10,}$/.test(s)) return { videoId: null, listId: s };

  try {
    const u = new URL(s.startsWith("http") ? s : "https://" + s);
    const host = u.hostname.replace(/^www\.|^m\.|^music\./, "");
    let videoId = null;
    const listId = u.searchParams.get("list") || null;

    if (host === "youtu.be") {
      videoId = u.pathname.slice(1, 12) || null;
    } else if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      const v = u.searchParams.get("v");
      if (v) videoId = v.slice(0, 11);
      else {
        const m = u.pathname.match(/\/(embed|shorts|live|v)\/([\w-]{11})/);
        if (m) videoId = m[2];
      }
    } else {
      return null;
    }
    if (videoId || listId) return { videoId, listId };
  } catch (_) {}
  return null;
}

export function getYouTubeId(input) {
  const r = parseYouTube(input);
  return r ? r.videoId : null;
}

// ---------- YouTube IFrame API eka ekaparak witharak load karanawa ----------
let apiPromise = null;
function loadYouTubeAPI() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev && prev(); resolve(window.YT); };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.onerror = () => { apiPromise = null; reject(new Error("YouTube API load une naha (network / adblock check karanna)")); };
    document.head.appendChild(tag);
  });
  return apiPromise;
}

function fmt(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

const ERRORS = {
  2: "Video ID eka waradi.",
  5: "HTML5 player error ekak.",
  100: "Video eka nathi wela hari private karala.",
  101: "Video owner embed karanna allow karala naha (Allow embedding off).",
  150: "Video owner embed karanna allow karala naha (Allow embedding off).",
  153: "Referrer naha - <meta name=\"referrer\" content=\"strict-origin-when-cross-origin\"> danna.",
};

// Quality:
// YouTube API eken quality eka kelinma set karanna dan ba (setPlaybackQuality eka YouTube off karala).
// YouTube quality eka thoranne player eke size eka saha internet speed eka balala.
// E nisa api iframe eka athulen loku / podi karala (pennana size eka wenas nokara) YouTube ekata hint ekak denawa.
const QUALITY = {
  auto:  { label: "Auto", px: null },
  hd:    { label: "1080p HD", px: 1920 },
  q720:  { label: "720p", px: 1280 },
  q480:  { label: "480p", px: 854 },
  saver: { label: "360p (Data saver)", px: 640 },
};

const DEFAULT_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

function readQuality() {
  try { const q = localStorage.getItem("syp-quality"); return QUALITY[q] ? q : "auto"; } catch (_) { return "auto"; }
}

// ---------- Icons ----------
const I = {
  play: <path d="M8 5v14l11-7z" />,
  pause: <path d="M6 5h4v14H6zM14 5h4v14h-4z" />,
  prev: <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />,
  next: <path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z" />,
  vol: <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z" />,
  mute: <path d="M3 9v6h4l5 5V4L7 9H3zm13.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4z" />,
  fs: <path d="M5 5h5v2H7v3H5zm9 0h5v5h-2V7h-3zM5 14h2v3h3v2H5zm12 0h2v5h-5v-2h3z" />,
  gear: <path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7 7 0 0 0-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84a.47.47 0 0 0-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 8.87a.47.47 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.48.48 0 0 0-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z" />,
};
const Icon = ({ name }) => <svg viewBox="0 0 24 24" aria-hidden="true">{I[name]}</svg>;
const SkipIcon = ({ dir, n }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d={dir < 0
      ? "M12 5V2L7 6l5 4V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"
      : "M12 5V2l5 4-5 4V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8z"} />
    <text x="12" y="16.2" textAnchor="middle" fontSize="6.5" fontWeight="700" fill="currentColor">{n}</text>
  </svg>
);

// onFullscreen: dunnoth fullscreen button eka eka call karanawa. true return kaloth browser fullscreen karanne naha
// (React Native WebView eka athule app ekata kiyanna use karanawa).
export default function SecureYouTubePlayer({ url, videoId: videoIdProp, listId: listIdProp, onStatus, onFullscreen, skip = SKIP }) {
  const parsed = parseYouTube(url) || {};
  const videoId = videoIdProp || parsed.videoId || null;
  const listId = listIdProp || parsed.listId || null;
  const id = videoId || listId;

  const boxRef = useRef(null);
  const mountRef = useRef(null);
  const barRef = useRef(null);
  const playerRef = useRef(null);
  const draggingRef = useRef(false);
  const tapRef = useRef(null);
  const idleTimer = useRef(null);
  const flashTimer = useRef(null);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [rates, setRates] = useState(DEFAULT_RATES);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [error, setError] = useState(null);
  const [index, setIndex] = useState(0);
  const [total, setTotal] = useState(0);
  const [quality, setQuality] = useState(readQuality);
  const [boxW, setBoxW] = useState(0);
  const [menu, setMenu] = useState(false);
  const [idle, setIdle] = useState(false);
  const [hover, setHover] = useState(null);   // { x, t }
  const [flash, setFlash] = useState(null);   // { side, amount, key }

  const report = useCallback((type, msg) => onStatus && onStatus(type, msg), [onStatus]);

  // ---------- Player create / destroy ----------
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setReady(false); setPlaying(false); setEnded(false); setError(null);
    setCur(0); setDur(0); setBuffered(0); setIndex(0); setTotal(0);

    loadYouTubeAPI()
      .then((YT) => {
        if (cancelled || !mountRef.current) return;
        const el = document.createElement("div");
        mountRef.current.innerHTML = "";
        mountRef.current.appendChild(el);

        const playerVars = {
          controls: 0, disablekb: 1, rel: 0, modestbranding: 1,
          iv_load_policy: 3, fs: 0, playsinline: 1,
          origin: window.location.origin,
        };
        if (listId) { playerVars.listType = "playlist"; playerVars.list = listId; }

        const opts = {
          host: "https://www.youtube-nocookie.com",
          playerVars,
          events: {
            onReady: (e) => {
              setReady(true);
              setDur(e.target.getDuration());
              const r = e.target.getAvailablePlaybackRates && e.target.getAvailablePlaybackRates();
              if (r && r.length) setRates(r);
              report("ready", listId ? "Playlist ready. Play obanna." : "Player ready. Play obanna.");
            },
            onStateChange: (e) => {
              const S = YT.PlayerState;
              const p = e.target;
              setPlaying(e.data === S.PLAYING);
              setEnded(e.data === S.ENDED);
              if (listId && p.getPlaylist) {
                const pl = p.getPlaylist();
                if (pl) setTotal(pl.length);
                setIndex(p.getPlaylistIndex() || 0);
              }
              if (e.data === S.PLAYING) report("playing", "Video eka play wenawa ✔");
              if (e.data === S.BUFFERING) report("buffering", "Buffering...");
            },
            onError: (e) => {
              const msg = ERRORS[e.data] || `YouTube error ${e.data}`;
              setError(msg);
              report("error", msg);
            },
          },
        };
        if (videoId) opts.videoId = videoId;
        playerRef.current = new YT.Player(el, opts);
      })
      .catch((err) => { setError(err.message); report("error", err.message); });

    return () => {
      cancelled = true;
      try { playerRef.current && playerRef.current.destroy(); } catch (_) {}
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, listId]);

  // ---------- Time + buffer update ----------
  useEffect(() => {
    if (!ready) return;
    const t = setInterval(() => {
      const p = playerRef.current;
      if (!p || !p.getCurrentTime) return;
      if (!draggingRef.current) setCur(p.getCurrentTime());
      const d = p.getDuration();
      if (d) setDur(d);
      if (p.getVideoLoadedFraction) setBuffered(p.getVideoLoadedFraction() || 0);
    }, 250);
    return () => clearInterval(t);
  }, [ready]);

  // ---------- Box width (quality hint ekata) ----------
  useEffect(() => {
    const el = boxRef.current;
    if (!el || !window.ResizeObserver) return;
    const ro = new ResizeObserver(([entry]) => setBoxW(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [id]);

  useEffect(() => () => { clearTimeout(idleTimer.current); clearTimeout(flashTimer.current); clearTimeout(tapRef.current?.timer); }, []);

  // ---------- Actions ----------
  const isPlaying = () => {
    const p = playerRef.current;
    return p && p.getPlayerState && p.getPlayerState() === 1;
  };

  const toggle = () => {
    const p = playerRef.current;
    if (!p || !ready) return;
    isPlaying() ? p.pauseVideo() : p.playVideo();
  };

  const showFlash = (delta) => {
    const side = delta < 0 ? "left" : "right";
    setFlash((f) => ({
      side,
      amount: f && f.side === side ? f.amount + Math.abs(delta) : Math.abs(delta),
      key: Date.now(),
    }));
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 700);
  };

  const seekBy = (delta) => {
    const p = playerRef.current;
    if (!p || !ready) return;
    const d = p.getDuration() || dur;
    const t = Math.min(Math.max(0, p.getCurrentTime() + delta), Math.max(0, d - 0.5));
    p.seekTo(t, true);
    setCur(t);
    showFlash(delta);
  };

  const prev = () => playerRef.current && playerRef.current.previousVideo();
  const next = () => playerRef.current && playerRef.current.nextVideo();

  const toggleMute = () => {
    const p = playerRef.current;
    if (!p) return;
    if (p.isMuted()) { p.unMute(); setMuted(false); } else { p.mute(); setMuted(true); }
  };

  const changeRate = (r) => {
    setRate(r);
    playerRef.current && playerRef.current.setPlaybackRate(r);
  };

  const changeQuality = (q) => {
    setQuality(q);
    try { localStorage.setItem("syp-quality", q); } catch (_) {}
    report("quality", `Quality: ${QUALITY[q].label}`);
  };

  const toggleFullscreen = () => {
    if (onFullscreen && onFullscreen() === true) return;
    const box = boxRef.current;
    if (!box) return;
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      } else {
        const req = box.requestFullscreen || box.webkitRequestFullscreen;
        const r = req && req.call(box);
        if (r && r.catch) r.catch(() => {});
      }
    } catch (_) {}
  };

  // Controls auto-hide
  const wake = () => {
    setIdle(false);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), 2500);
  };

  // ---------- Tap / double-tap on video ----------
  const onShieldClick = (e) => {
    boxRef.current && boxRef.current.focus({ preventScroll: true });
    if (menu) { setMenu(false); return; }

    const rect = boxRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const side = x < rect.width * 0.35 ? "left" : x > rect.width * 0.65 ? "right" : "center";
    const now = Date.now();
    const last = tapRef.current;

    // Double-tap (hari double-tap ekata passe digatama tap) -> skip
    if (side !== "center" && last && last.side === side && now - last.t < (last.seeking ? 700 : 300)) {
      clearTimeout(last.timer);
      seekBy(side === "left" ? -skip : skip);
      tapRef.current = { t: now, side, timer: null, seeking: true };
      return;
    }

    // Single tap -> play/pause (wam/dakuna nam double-tap ekak da kiyala podi welawak balanawa)
    clearTimeout(last && last.timer);
    const timer = setTimeout(() => { toggle(); }, side === "center" ? 0 : 250);
    tapRef.current = { t: now, side, timer, seeking: false };
  };

  // ---------- Seek bar ----------
  const timeFromX = (clientX) => {
    const r = barRef.current.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientX - r.left) / r.width, 0), 1);
    return { t: ratio * (dur || 0), x: ratio * r.width };
  };

  const onBarDown = (e) => {
    if (!ready || !dur) return;
    e.preventDefault();
    draggingRef.current = true;
    barRef.current.setPointerCapture && barRef.current.setPointerCapture(e.pointerId);
    const { t, x } = timeFromX(e.clientX);
    setCur(t);
    setHover({ x, t });
  };

  const onBarMove = (e) => {
    if (!dur) return;
    const { t, x } = timeFromX(e.clientX);
    setHover({ x, t });
    if (draggingRef.current) setCur(t);
  };

  const onBarUp = (e) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const { t } = timeFromX(e.clientX);
    playerRef.current && playerRef.current.seekTo(t, true);
    setCur(t);
    if (e.pointerType !== "mouse") setHover(null);
  };

  // ---------- Keyboard ----------
  const onKeyDown = (e) => {
    const k = e.key.toLowerCase();
    if (k === " " || k === "k") { e.preventDefault(); toggle(); }
    else if (k === "arrowleft" || k === "j") { e.preventDefault(); seekBy(-skip); }
    else if (k === "arrowright" || k === "l") { e.preventDefault(); seekBy(skip); }
    else if (k === "m") toggleMute();
    else if (k === "f") toggleFullscreen();
    else if (k === "escape") setMenu(false);
    wake();
  };

  // ---------- Quality hint: iframe eka athulen scale karanawa ----------
  const dpr = window.devicePixelRatio || 1;
  const target = QUALITY[quality].px;
  const f = target && boxW ? target / dpr / boxW : 1;
  const crop = Math.round(60 * Math.max(1, 1 / f)); // title bar eka hangana pramanaya
  const ytStyle = { top: -crop, height: `calc(100% + ${crop * 2}px)` };
  const scaleStyle = f === 1 ? undefined : {
    width: `${f * 100}%`, height: `${f * 100}%`,
    transform: `scale(${1 / f})`, transformOrigin: "0 0",
  };

  if (!id) return <div className="syp syp--empty">Valid YouTube link ekak denna.</div>;

  const pct = dur ? (cur / dur) * 100 : 0;
  const hideUi = playing && idle && !menu;

  return (
    <div
      ref={boxRef}
      className={`syp${playing ? " is-playing" : ""}${hideUi ? " is-idle" : ""}`}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerMove={wake}
      onPointerDown={wake}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="syp__yt" style={ytStyle}>
        <div className="syp__scale" ref={mountRef} style={scaleStyle} />
      </div>

      <div className="syp__cover">
        {error ? <span className="syp__err">{error}</span>
          : !ready ? <span className="syp__loading">Loading…</span>
          : <span className="syp__big"><Icon name={ended ? "prev" : "play"} /></span>}
      </div>

      <div className="syp__shield" onClick={onShieldClick} />

      {flash && (
        <div key={flash.key} className={`syp__flash syp__flash--${flash.side}`}>
          <SkipIcon dir={flash.side === "left" ? -1 : 1} n="" />
          <span>{flash.side === "left" ? "−" : "+"}{flash.amount}s</span>
        </div>
      )}

      {menu && (
        <div className="syp__menu" onClick={(e) => e.stopPropagation()}>
          <div className="syp__menu-h">Speed</div>
          <div className="syp__chips">
            {rates.map((r) => (
              <button key={r} className={r === rate ? "on" : ""} onClick={() => changeRate(r)}>
                {r === 1 ? "Normal" : `${r}x`}
              </button>
            ))}
          </div>
          <div className="syp__menu-h">Quality</div>
          <div className="syp__list">
            {Object.entries(QUALITY).map(([k, q]) => (
              <button key={k} className={k === quality ? "on" : ""} onClick={() => changeQuality(k)}>
                {q.label}
              </button>
            ))}
          </div>
          <p className="syp__note">Internet eka slow nam YouTube eka quality eka auto adu karanawa.</p>
        </div>
      )}

      <div className="syp__bar">
        <div
          ref={barRef}
          className="syp__progress"
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.floor(dur)}
          aria-valuenow={Math.floor(cur)}
          onPointerDown={onBarDown}
          onPointerMove={onBarMove}
          onPointerUp={onBarUp}
          onPointerCancel={onBarUp}
          onPointerLeave={() => !draggingRef.current && setHover(null)}
        >
          <div className="syp__track">
            <div className="syp__buf" style={{ width: `${buffered * 100}%` }} />
            <div className="syp__fill" style={{ width: `${pct}%` }} />
            <div className="syp__knob" style={{ left: `${pct}%` }} />
          </div>
          {hover && (
            <div className="syp__tip" style={{ left: `clamp(24px, ${hover.x}px, calc(100% - 24px))` }}>
              {fmt(hover.t)}
            </div>
          )}
        </div>

        <div className="syp__row">
          {listId && <button onClick={prev} disabled={!ready || index === 0} aria-label="Previous"><Icon name="prev" /></button>}
          <button onClick={() => seekBy(-skip)} disabled={!ready} aria-label={`Back ${skip}s`}><SkipIcon dir={-1} n={skip} /></button>
          <button className="syp__play" onClick={toggle} disabled={!ready} aria-label={playing ? "Pause" : "Play"}>
            <Icon name={playing ? "pause" : "play"} />
          </button>
          <button onClick={() => seekBy(skip)} disabled={!ready} aria-label={`Forward ${skip}s`}><SkipIcon dir={1} n={skip} /></button>
          {listId && <button onClick={next} disabled={!ready || (total > 0 && index >= total - 1)} aria-label="Next"><Icon name="next" /></button>}

          <span className="syp__time">
            {fmt(cur)} / {fmt(dur)}
            {listId && total > 0 && <em> · {index + 1}/{total}</em>}
          </span>

          <span className="syp__spacer" />

          <button onClick={toggleMute} disabled={!ready} aria-label="Mute"><Icon name={muted ? "mute" : "vol"} /></button>
          <button className={menu ? "on" : ""} onClick={() => setMenu((m) => !m)} disabled={!ready} aria-label="Settings">
            <Icon name="gear" />
            {quality !== "auto" && <i className="syp__badge">{quality === "hd" ? "HD" : quality === "saver" ? "360" : QUALITY[quality].label.replace("p", "")}</i>}
          </button>
          <button onClick={toggleFullscreen} aria-label="Fullscreen"><Icon name="fs" /></button>
        </div>
      </div>
    </div>
  );
}
