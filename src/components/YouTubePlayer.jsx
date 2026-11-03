// src/components/YouTubePlayer.jsx
//
// YouTube video / playlist eka app eka athule play karanawa.
// Modern Sleek UI + True Fullscreen (Landscape auto-rotate + status bar hide).
//
// Wada karana widiha:
//   - WebView eken YouTube embed page eka (https://www.youtube.com/embed/ID) KELINMA load karanawa,
//     "Referer: https://imacampus.online/" header ekka. Ethakota YouTube Error 152/153 / bot check enne naha.
//   - Modern SVG controls (seek bar, -10/+10, double-tap, speed, mute, fullscreen) injected JS eken page eka udin danawa,
//     YouTube eke #movie_player API eka kelinma call karanawa.
//   - YouTube title, logo, "Watch on YouTube", "More videos" okkoma hangala, link click karanna ba.
//
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, BackHandler, StatusBar, TouchableOpacity, useWindowDimensions,
} from 'react-native';
import { WebView } from 'react-native-webview';

let ScreenOrientation = null;
try {
  ScreenOrientation = require('expo-screen-orientation');
} catch (_) { }

// Oyage domain eka. YouTube ekata yawana Referer eka meka.
const REFERER = 'https://imacampus.online/';
const ORIGIN = 'https://imacampus.online';

// Mekata thappara gana athule player eka ready wune naththam "Retry" button eka pennanawa
const READY_TIMEOUT_MS = 15000;

// ---------- YouTube link -> { videoId, listId } ----------
export function parseYouTube(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (/^[\w-]{11}$/.test(s)) return { videoId: s, listId: null };
  if (/^(PL|UU|OL|FL|RD)[\w-]{10,}$/.test(s)) return { videoId: null, listId: s };
  if (!/(^|\/\/|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(s)) return null;

  const v =
    s.match(/[?&]v=([\w-]{11})/) ||
    s.match(/youtu\.be\/([\w-]{11})/) ||
    s.match(/\/(?:embed|shorts|live|v)\/([\w-]{11})/);
  const l = s.match(/[?&]list=([\w-]+)/);
  const videoId = v ? v[1] : null;
  const listId = l ? l[1] : null;
  return videoId || listId ? { videoId, listId } : null;
}
export const parseYouTubeUrl = parseYouTube;

function buildEmbedUrl(videoId, listId) {
  const params = [
    'playsinline=1', 'controls=0', 'rel=0', 'modestbranding=1', 'iv_load_policy=3',
    'fs=0', 'disablekb=1', 'enablejsapi=1', 'autoplay=0', 'cc_load_policy=0',
    'origin=' + encodeURIComponent(ORIGIN),
    'widget_referrer=' + encodeURIComponent(REFERER),
  ];
  if (listId) params.push('list=' + encodeURIComponent(listId), 'listType=playlist');
  const path = videoId ? videoId : 'videoseries';
  return `https://www.youtube.com/embed/${path}?${params.join('&')}`;
}

// ---------- YouTube embed page ekata inject karana JS (controls + YouTube UI hide) ----------
const INJECTED_JS = `
(function () {
  if (window.__imaPlayer) return true;
  window.__imaPlayer = true;
  try {
  var CFG = __CFG__;
  var SKIP = CFG.skip || 10;
  var RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  var STATE_NAMES = { "-1": "unstarted", "0": "ended", "1": "playing", "2": "paused", "3": "buffering", "5": "cued" };
  var ready = false, playing = false, cur = 0, dur = 0, dragging = false, lastState = null, errSent = false;
  var idleT, flashT, flash = null, lastTap = null, isFullscreen = false;

  function send(o) { try { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } catch (e) {} }
  function P() {
    var p = document.getElementById("movie_player");
    return p && typeof p.playVideo === "function" ? p : null;
  }
  function fmt(s) {
    s = Math.max(0, Math.floor(s || 0));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ":" + (m < 10 ? "0" : "") + m : m) + ":" + (x < 10 ? "0" : "") + x;
  }

  // ---- CSS: YouTube UI hide + modern sleek player controls ----
  var css = document.createElement("style");
  css.textContent = [
    "html,body{background:#000!important;margin:0!important;padding:0!important;width:100%!important;height:100%!important;overflow:hidden!important;-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important;-webkit-tap-highlight-color:transparent}",
    "#movie_player .ytp-chrome-top,.html5-video-player .ytp-chrome-top,.ytp-chrome-top,.ytp-chrome-top *,.ytp-gradient-top,.ytp-gradient-bottom,.ytp-chrome-bottom,.ytp-cairo-refresh-header,.ytp-cairo-refresh-header *,.ytp-pause-overlay,.ytp-watermark,.ytp-youtube-button,.ytp-ce-element,.ytp-endscreen-content,.ytp-show-cards-title,.ytp-cards-button,.ytp-cards-teaser,.ytp-paid-content-overlay,.ytp-impression-link,.ytp-large-play-button,.ytp-title,.ytp-title-channel,.ytp-title-link,.ytp-title-text,.ytp-title-subtext,.ytp-header,.ytp-spinner,.ytp-spinner-container,.ytp-spinner-rotator,.ytp-spinner-left,.ytp-spinner-right,.ytm-custom-header,.ytp-contextmenu,.ytp-share-button,.ytp-overflow-button,.ytp-watch-later-button,.ytp-copylink-button,.ytp-suggested-action,.ytp-featured-product,.ytp-autonav-endscreen,.iv-branding,.annotation,.ytp-tooltip{display:none!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important}",
    "#ima-root{position:fixed;inset:0;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',Roboto,sans-serif;color:#fff;overflow:hidden}",
    "#ima-shield{position:absolute;inset:0;cursor:pointer}",
    "#ima-center{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.35);pointer-events:none;transition:opacity .25s ease;z-index:10}",
    "#ima-root.playing:not(.buffering) #ima-center{opacity:0;pointer-events:none}",
    "#ima-center-btn{width:64px;height:64px;border-radius:50%;background:rgba(15,23,42,0.85);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1.5px solid rgba(255,255,255,0.3);box-shadow:0 8px 24px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;color:#fff;pointer-events:auto;cursor:pointer;transition:transform .15s ease}",
    "#ima-center-btn:active{transform:scale(0.92)}",
    "#ima-spin{position:absolute;width:50px;height:50px;border:4px solid rgba(255,255,255,0.22);border-top-color:#ef4444;border-radius:50%;animation:ima-spin 0.8s linear infinite;display:none;pointer-events:none;box-sizing:border-box}",
    "#ima-root.buffering #ima-center-btn{display:none!important}",
    "#ima-root.buffering #ima-spin{display:block!important}",
    "@keyframes ima-spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}",
    "#ima-flash{position:absolute;top:0;bottom:0;width:36%;display:none;align-items:center;justify-content:center;pointer-events:none;z-index:15}",
    "#ima-flash.show{display:flex}",
    "#ima-flash.left{left:0;background:radial-gradient(circle at left center,rgba(255,255,255,0.2) 0%,transparent 70%);border-radius:0 100px 100px 0}",
    "#ima-flash.right{right:0;background:radial-gradient(circle at right center,rgba(255,255,255,0.2) 0%,transparent 70%);border-radius:100px 0 0 100px}",
    "#ima-flash span{background:rgba(15,23,42,0.88);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.2);color:#fff;font-size:13px;font-weight:700;padding:8px 16px;border-radius:20px;box-shadow:0 4px 16px rgba(0,0,0,0.4)}",
    "#ima-bar{position:absolute;left:0;right:0;bottom:0;padding:26px 14px 10px;background:linear-gradient(to top,rgba(0,0,0,0.92) 0%,rgba(0,0,0,0.55) 60%,transparent 100%);transition:opacity .25s ease,transform .25s ease;z-index:20}",
    "#ima-root.idle.playing #ima-bar{opacity:0;transform:translateY(6px);pointer-events:none}",
    "#ima-prog{height:28px;display:flex;align-items:center;touch-action:none;cursor:pointer;margin-bottom:4px;position:relative;box-sizing:border-box}",
    "#ima-track{position:relative;width:100%;height:4px;background:rgba(255,255,255,0.25);border-radius:2px;box-sizing:border-box;transition:height .15s ease}",
    "#ima-prog:hover #ima-track,#ima-prog.dragging #ima-track{height:6px}",
    "#ima-buf,#ima-fill{position:absolute;left:0;top:0;bottom:0;border-radius:2px;box-sizing:border-box}",
    "#ima-buf{background:rgba(255,255,255,0.38)}",
    "#ima-fill{background:#ef4444}",
    "#ima-knob{position:absolute;top:50%;transform:translate(-50%,-50%);width:14px;height:14px;border-radius:50%;background:#fff;border:2.5px solid #ef4444;box-shadow:0 0 6px rgba(0,0,0,0.5);pointer-events:none;box-sizing:border-box;transition:transform .1s ease}",
    "#ima-prog.dragging #ima-knob{transform:translate(-50%,-50%) scale(1.35)}",
    "#ima-tip{position:absolute;bottom:30px;transform:translateX(-50%);background:rgba(15,23,42,0.95);border:1px solid rgba(255,255,255,0.2);padding:4px 8px;border-radius:6px;font-size:11px;font-weight:600;color:#fff;display:none;white-space:nowrap;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,0.5)}",
    "#ima-row{display:flex;align-items:center;gap:6px}",
    "#ima-row button{min-width:36px;height:36px;border:0;background:none;color:#fff;border-radius:50%;padding:0;display:flex;align-items:center;justify-content:center;cursor:pointer;outline:none;transition:background .15s,transform .1s}",
    "#ima-row button:active{background:rgba(255,255,255,0.2);transform:scale(0.92)}",
    "#ima-row button.pill-btn{min-width:auto;height:26px;border-radius:13px;padding:0 8px;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.18);font-size:11px;font-weight:700;letter-spacing:0.2px}",
    "#ima-time{font-size:12px;font-weight:500;color:#e2e8f0;margin-left:6px;font-variant-numeric:tabular-nums;white-space:nowrap;user-select:none}",
    "#ima-time .dur{color:#94a3b8}",
    "#ima-sp{flex:1}",
    "#ima-spd{min-width:auto;height:26px;border-radius:13px;padding:0 9px;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.18);font-size:11px;font-weight:700;letter-spacing:0.3px}",
    "#ima-spd:active{background:rgba(255,255,255,0.25)}",
    "#ima-menu{position:absolute;right:12px;bottom:68px;background:rgba(15,23,42,0.95);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.16);border-radius:12px;padding:6px;display:none;flex-direction:column;gap:2px;min-width:120px;box-shadow:0 12px 32px rgba(0,0,0,0.7);z-index:30}",
    "#ima-menu.open{display:flex}",
    "#ima-menu button{background:transparent;color:#e2e8f0;border:0;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:600;text-align:left;display:flex;align-items:center;justify-content:space-between;cursor:pointer;transition:background .15s}",
    "#ima-menu button:active{background:rgba(255,255,255,0.12)}",
    "#ima-menu button.on{background:#ef4444;color:#fff;font-weight:700}"
  ].join("\\n");
  document.head.appendChild(css);

  // ---- SVG icon paths ----
  var PATHS = {
    play: "M8 5v14l11-7z",
    pause: "M6 19h4V5H6v14zm8-14v14h4V5h-4z",
    replay: "M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z",
    vol: "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z",
    mute: "M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z",
    fsEnter: "M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z",
    fsExit: "M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z",
    prev: "M6 6h2v12H6zm3.5 6l8.5 6V6z",
    next: "M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"
  };

  function svg(pathD, size) {
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("width", String(size || 22));
    s.setAttribute("height", String(size || 22));
    s.setAttribute("fill", "currentColor");
    s.style.display = "block";
    s.style.pointerEvents = "none";
    var p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", pathD);
    s.appendChild(p);
    return s;
  }
  function setSvg(btn, pathD, size) {
    while (btn.firstChild) btn.removeChild(btn.firstChild);
    btn.appendChild(svg(pathD, size));
  }

  function el(tag, id, parent) {
    var e = document.createElement(tag);
    if (id) e.id = "ima-" + id;
    if (parent) parent.appendChild(e);
    return e;
  }

  var root = el("div", "root", null);
  el("div", "shield", root);
  var center = el("div", "center", root);
  var centerBtn = el("div", "center-btn", center);
  setSvg(centerBtn, PATHS.play, 32);
  centerBtn.onclick = function (e) {
    e.stopPropagation();
    toggle();
    wake();
  };

  el("div", "spin", center);

  var flashEl = el("div", "flash", root);
  var flashSpan = document.createElement("span");
  flashEl.appendChild(flashSpan);

  el("div", "menu", root);
  el("div", "tip", root);

  var bar = el("div", "bar", root);
  var prog = el("div", "prog", bar);
  var track = el("div", "track", prog);
  el("div", "buf", track);
  el("div", "fill", track);
  el("div", "knob", track);

  var row = el("div", "row", bar);
  var prevBtn = el("button", "prev", row);
  setSvg(prevBtn, PATHS.prev, 18);
  prevBtn.style.display = "none";

  var backBtn = el("button", "back", row);
  backBtn.className = "pill-btn";
  backBtn.textContent = "-" + SKIP + "s";

  var playBtn = el("button", "play", row);
  setSvg(playBtn, PATHS.play, 24);

  var fwdBtn = el("button", "fwd", row);
  fwdBtn.className = "pill-btn";
  fwdBtn.textContent = "+" + SKIP + "s";

  var nextBtn = el("button", "next", row);
  setSvg(nextBtn, PATHS.next, 18);
  nextBtn.style.display = "none";

  var timeSpan = el("span", "time", row);
  timeSpan.textContent = "0:00 / 0:00";

  el("span", "sp", row);

  var spdBtn = el("button", "spd", row);
  spdBtn.textContent = "1.0x";

  var muteBtn = el("button", "mute", row);
  setSvg(muteBtn, PATHS.vol, 20);

  var fsBtn = el("button", "fs", row);
  setSvg(fsBtn, PATHS.fsEnter, 20);

  (document.body || document.documentElement).appendChild(root);
  function $(id) { return document.getElementById("ima-" + id); }

  window.__imaSetFullscreen = function (on) {
    isFullscreen = !!on;
    setSvg($("fs"), isFullscreen ? PATHS.fsExit : PATHS.fsEnter, 20);
  };

  // ---- Player ready wenakan balanawa ----
  var waitT = setInterval(function () {
    var p = P();
    if (!p || typeof p.getPlayerState !== "function") return;
    clearInterval(waitT);
    ready = true;
    if (CFG.listId) { $("prev").style.display = ""; $("next").style.display = ""; }
    send({ type: "status", status: "ready" });
    if (CFG.autoPlay) { try { p.playVideo(); } catch (e) {} }
    setInterval(tick, 250);
  }, 300);

  function checkError() {
    if (errSent) return;
    var elErr = document.querySelector(".ytp-error");
    if (!elErr || !elErr.offsetParent) return;
    var r = elErr.querySelector(".ytp-error-content-wrap-reason") || elErr;
    var msg = (r.textContent || "YouTube error").replace(/\\s+/g, " ").trim();
    errSent = true;
    send({ type: "status", status: "error", message: msg });
  }

  function tick() {
    var p = P();
    checkError();
    if (!p) return;
    var st = p.getPlayerState();
    if (st !== lastState) {
      lastState = st;
      playing = st === 1;
      root.classList.toggle("playing", playing);
      root.classList.toggle("buffering", st === 3);
      setSvg($("play"), playing ? PATHS.pause : PATHS.play, 24);
      setSvg(centerBtn, st === 0 ? PATHS.replay : PATHS.play, 32);
      send({ type: "status", status: STATE_NAMES[String(st)] || String(st), time: cur });
      wake();
    }
    if (!dragging) cur = p.getCurrentTime() || 0;
    dur = p.getDuration() || dur;
    var pct = dur ? (cur / dur) * 100 : 0;
    $("fill").style.width = pct + "%";
    $("knob").style.left = pct + "%";
    $("buf").style.width = ((p.getVideoLoadedFraction && p.getVideoLoadedFraction()) || 0) * 100 + "%";
    $("time").textContent = fmt(cur) + " / " + fmt(dur) +
      (CFG.listId && p.getPlaylist && p.getPlaylist() ? "  •  " + ((p.getPlaylistIndex() || 0) + 1) + "/" + p.getPlaylist().length : "");
  }

  function toggle() {
    var p = P(); if (!p) return;
    if (p.getPlayerState() === 1) p.pauseVideo(); else p.playVideo();
  }

  function seekBy(d) {
    var p = P(); if (!p) return;
    var t = Math.min(Math.max(0, p.getCurrentTime() + d), Math.max(0, (p.getDuration() || 0) - 0.5));
    p.seekTo(t, true);
    cur = t;
    var side = d < 0 ? "left" : "right";
    flash = flash && flash.side === side ? { side: side, n: flash.n + Math.abs(d) } : { side: side, n: Math.abs(d) };
    var f = $("flash");
    f.className = "show " + side;
    flashSpan.textContent = (d < 0 ? "« " : "") + flash.n + "s" + (d > 0 ? " »" : "");
    clearTimeout(flashT);
    flashT = setTimeout(function () { f.className = ""; flash = null; }, 650);
  }

  function wake() {
    root.classList.remove("idle");
    clearTimeout(idleT);
    idleT = setTimeout(function () {
      if (playing && !$("menu").classList.contains("open") && !dragging) {
        root.classList.add("idle");
      }
    }, 3200);
  }
  root.addEventListener("pointerdown", wake, true);

  // Video eka udin tap: meda = play/pause, wam/dakuna double-tap = -SKIP/+SKIP
  $("shield").addEventListener("click", function (e) {
    if ($("menu").classList.contains("open")) { $("menu").classList.remove("open"); return; }
    var w = window.innerWidth;
    var side = e.clientX < w * 0.35 ? "left" : e.clientX > w * 0.65 ? "right" : "center";
    var now = Date.now();
    if (side !== "center" && lastTap && lastTap.side === side && now - lastTap.t < (lastTap.seeking ? 700 : 300)) {
      clearTimeout(lastTap.timer);
      seekBy(side === "left" ? -SKIP : SKIP);
      lastTap = { t: now, side: side, seeking: true };
      return;
    }
    if (lastTap) clearTimeout(lastTap.timer);
    lastTap = {
      t: now,
      side: side,
      seeking: false,
      timer: setTimeout(function () {
        if (root.classList.contains("idle")) {
          wake();
        } else if (side === "center") {
          toggle();
        } else {
          wake();
        }
      }, side === "center" ? 0 : 250)
    };
  });

  // Seek bar: tap / drag
  function timeAt(x) {
    var r = $("prog").getBoundingClientRect();
    var p = Math.min(Math.max((x - r.left) / r.width, 0), 1);
    return { t: p * dur, x: r.left + p * r.width };
  }
  function showTip(a) {
    var tip = $("tip");
    tip.style.display = "block";
    tip.style.left = Math.min(Math.max(a.x, 28), window.innerWidth - 28) + "px";
    tip.textContent = fmt(a.t);
  }
  $("prog").addEventListener("pointerdown", function (e) {
    if (!ready || !dur) return;
    dragging = true;
    $("prog").classList.add("dragging");
    try { this.setPointerCapture(e.pointerId); } catch (x) {}
    var a = timeAt(e.clientX); cur = a.t; showTip(a);
  });
  $("prog").addEventListener("pointermove", function (e) {
    if (!dragging) return;
    var a = timeAt(e.clientX); cur = a.t; showTip(a);
  });
  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    $("prog").classList.remove("dragging");
    var a = timeAt(e.clientX);
    var p = P(); if (p) p.seekTo(a.t, true);
    cur = a.t;
    $("tip").style.display = "none";
    wake();
  }
  $("prog").addEventListener("pointerup", endDrag);
  $("prog").addEventListener("pointercancel", endDrag);

  // Buttons
  $("play").onclick = function (e) { e.stopPropagation(); toggle(); wake(); };
  $("back").onclick = function (e) { e.stopPropagation(); seekBy(-SKIP); wake(); };
  $("fwd").onclick = function (e) { e.stopPropagation(); seekBy(SKIP); wake(); };
  $("prev").onclick = function (e) { e.stopPropagation(); var p = P(); if (p) p.previousVideo(); wake(); };
  $("next").onclick = function (e) { e.stopPropagation(); var p = P(); if (p) p.nextVideo(); wake(); };
  $("mute").onclick = function (e) {
    e.stopPropagation();
    var p = P(); if (!p) return;
    if (p.isMuted()) {
      p.unMute();
      setSvg(this, PATHS.vol, 20);
    } else {
      p.mute();
      setSvg(this, PATHS.mute, 20);
    }
    wake();
  };
  $("fs").onclick = function (e) {
    e.stopPropagation();
    send({ type: "fullscreen" });
  };
  $("spd").onclick = function (e) {
    e.stopPropagation();
    var m = $("menu");
    if (m.classList.contains("open")) { m.classList.remove("open"); return; }
    var p = P();
    var cr = p ? p.getPlaybackRate() : 1;
    while (m.firstChild) m.removeChild(m.firstChild);
    RATES.forEach(function (r) {
      var b = document.createElement("button");
      b.textContent = r === 1 ? "1.0x (Normal)" : r + "x";
      if (r === cr) b.className = "on";
      b.onclick = function (ev) {
        ev.stopPropagation();
        var q = P(); if (q) q.setPlaybackRate(r);
        $("spd").textContent = r === 1 ? "1.0x" : r + "x";
        m.classList.remove("open");
        wake();
      };
      m.appendChild(b);
    });
    m.classList.add("open");
    wake();
  };

  document.addEventListener("contextmenu", function (e) { e.preventDefault(); }, true);
  // YouTube links click karama yanna denne naha
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (a) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  send({ type: "debug", message: "modern controls injected" });
  } catch (err) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: "debug", message: "inject failed: " + (err && err.message) })); } catch (e) {}
  }
  return true;
})();
`;

// Page eka load wenna kalinma YouTube UI hangana CSS eka (Watch on YouTube / share / title pennanne naha)
const EARLY_CSS_JS = `
(function () {
  try {
    var s = document.createElement("style");
    s.textContent = "html,body{background:#000!important}#movie_player .ytp-chrome-top,.html5-video-player .ytp-chrome-top,.ytp-chrome-top,.ytp-chrome-top *,.ytp-gradient-top,.ytp-gradient-bottom,.ytp-chrome-bottom,.ytp-cairo-refresh-header,.ytp-cairo-refresh-header *,.ytp-pause-overlay,.ytp-watermark,.ytp-youtube-button,.ytp-ce-element,.ytp-endscreen-content,.ytp-large-play-button,.ytp-title,.ytp-title-channel,.ytp-title-link,.ytp-title-text,.ytp-title-subtext,.ytp-header,.ytp-share-button,.ytp-overflow-button,.ytp-watch-later-button,.ytp-impression-link,.ytp-spinner,.ytp-spinner-container,.ytp-spinner-rotator,.ytp-spinner-left,.ytp-spinner-right,.ytm-custom-header{display:none!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important}a[href]{pointer-events:none!important}";
    (document.head || document.documentElement).appendChild(s);
  } catch (e) {}
  return true;
})();
`;

export default function YouTubePlayer({
  url, videoId, listId, autoPlay = false, skip = 10,
  onStatus, onStatusChange, onFullscreenChange, onDebug,
  showDebug = false, style, debug = __DEV__,
}) {
  const [full, setFull] = useState(false);
  const [ready, setReady] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [lines, setLines] = useState([]);
  const webViewRef = useRef(null);

  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  // url eken hari videoId/listId eken
  const fromUrl = parseYouTube(url) || {};
  const vid = videoId || fromUrl.videoId || null;
  const lid = listId || fromUrl.listId || null;
  const cfgKey = `${vid}|${lid}|${skip}|${autoPlay}`;

  const embedUrl = useMemo(() => (vid || lid ? buildEmbedUrl(vid, lid) : null), [vid, lid]);
  const injected = useMemo(
    () => INJECTED_JS.replace('__CFG__', JSON.stringify({ videoId: vid, listId: lid, skip, autoPlay })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cfgKey]
  );

  const log = (m) => {
    if (debug) console.log('[YT]', m);
    if (onDebug) onDebug(m);
    if (showDebug) setLines((l) => [m, ...l].slice(0, 5));
  };

  // Ready wune naththam Retry pennanawa
  useEffect(() => {
    setReady(false);
    setStuck(false);
    setErrorMsg(null);
    const t = setTimeout(() => setStuck(true), READY_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [cfgKey, reloadKey]);

  const setFullscreen = async (on) => {
    setFull(on);
    StatusBar.setHidden(on, 'fade');
    if (ScreenOrientation) {
      try {
        if (on) {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT);
        } else {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
          setTimeout(() => {
            if (ScreenOrientation && ScreenOrientation.unlockAsync) {
              ScreenOrientation.unlockAsync().catch(() => { });
            }
          }, 350);
        }
      } catch (err) {
        log('ScreenOrientation error: ' + (err && err.message));
      }
    }
    onFullscreenChange && onFullscreenChange(on);
  };

  const isPlayerFullscreen = full && isLandscape;

  useEffect(() => {
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`window.__imaSetFullscreen && window.__imaSetFullscreen(${isPlayerFullscreen ? 'true' : 'false'}); true;`);
    }
  }, [isPlayerFullscreen]);

  // Screen eken eliyata yanakota ayeth portrait + status bar visible karanawa
  useEffect(() => {
    if (ScreenOrientation && ScreenOrientation.unlockAsync) {
      ScreenOrientation.unlockAsync().catch(() => { });
    }
    return () => {
      StatusBar.setHidden(false, 'fade');
      if (ScreenOrientation && ScreenOrientation.lockAsync) {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => { });
      }
    };
  }, []);

  // Phone eka horizontal (landscape) karakawaddi auto fullscreen, portrait karaddi auto normal
  useEffect(() => {
    if (!ScreenOrientation || !ScreenOrientation.addOrientationChangeListener) return;
    const sub = ScreenOrientation.addOrientationChangeListener((evt) => {
      const o = evt && evt.orientationInfo && evt.orientationInfo.orientation;
      const deviceIsLandscape =
        o === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
        o === ScreenOrientation.Orientation.LANDSCAPE_RIGHT;
      const deviceIsPortrait =
        o === ScreenOrientation.Orientation.PORTRAIT_UP ||
        o === ScreenOrientation.Orientation.PORTRAIT_DOWN;

      if (deviceIsLandscape && !full) {
        setFullscreen(true);
      } else if (deviceIsPortrait && full) {
        setFullscreen(false);
      }
    });
    return () => {
      if (ScreenOrientation.removeOrientationChangeListener) {
        ScreenOrientation.removeOrientationChangeListener(sub);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full]);

  // Android back button -> fullscreen eken eliyata
  useEffect(() => {
    if (!full) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setFullscreen(false);
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full]);

  const onMessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (msg.type === 'fullscreen') setFullscreen(!full);
    if (msg.type === 'debug') log(msg.message);
    if (msg.type === 'status') {
      if (msg.status === 'ready') { setReady(true); setStuck(false); }
      if (msg.status === 'error') setErrorMsg(msg.message || 'YouTube error');
      if (msg.status === 'playing') setErrorMsg(null);
      log(`status: ${msg.status}${msg.message ? ' - ' + msg.message : ''}`);
      onStatus && onStatus(msg.status, msg);
      onStatusChange && onStatusChange({ status: msg.status, message: msg.message || msg.status });
    }
  };

  // Main page eka YouTube embed page eke witharai thiyenna ona. Watch page / Google login wage thanakata yanna denne naha.
  const onShouldStart = (req) => {
    const u = req.url || '';
    if (req.isTopFrame === false) return true;
    if (!/^https?:/i.test(u)) return true;
    if (/^https:\/\/(www\.)?youtube(-nocookie)?\.com\/embed\//i.test(u)) return true;
    log('blocked: ' + u);
    return false;
  };

  const retry = () => { log('retry'); setReloadKey((k) => k + 1); };

  if (!embedUrl) {
    return (
      <View style={[styles.box, styles.center, style]}>
        <Text style={styles.err}>YouTube link eka waradi</Text>
      </View>
    );
  }

  return (
    <View
      style={isPlayerFullscreen ? styles.fullscreenOverlay : [styles.box, style]}
      onLayout={(e) => log(`size: ${Math.round(e.nativeEvent.layout.width)} x ${Math.round(e.nativeEvent.layout.height)}`)}
    >
      <StatusBar hidden={isPlayerFullscreen} />
      <WebView
        ref={webViewRef}
        key={`${cfgKey}-${reloadKey}`}
        source={{ uri: embedUrl, headers: { Referer: REFERER } }}
        injectedJavaScriptBeforeContentLoaded={EARLY_CSS_JS}
        injectedJavaScript={injected}
        style={styles.web}
        containerStyle={styles.web}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo={false}
        setSupportMultipleWindows={false}
        allowsLinkPreview={false}
        allowsBackForwardNavigationGestures={false}
        bounces={false}
        scrollEnabled={false}
        overScrollMode="never"
        webviewDebuggingEnabled={debug}
        onShouldStartLoadWithRequest={onShouldStart}
        onMessage={onMessage}
        onLoadStart={() => log('webview: load start')}
        onLoadEnd={() => {
          log('webview: load end');
          if (isPlayerFullscreen && webViewRef.current) {
            webViewRef.current.injectJavaScript('window.__imaSetFullscreen && window.__imaSetFullscreen(true); true;');
          }
        }}
        onError={(e) => log('webview error: ' + e.nativeEvent.description)}
        onHttpError={(e) => log(`http error: ${e.nativeEvent.statusCode}`)}
        onContentProcessDidTerminate={() => { log('webview crashed - reload'); retry(); }}
        onRenderProcessGone={() => { log('webview crashed - reload'); retry(); }}
      />

      {(errorMsg || (stuck && !ready)) && (
        <View style={styles.overlay}>
          <Text style={styles.overlayTitle}>{errorMsg ? 'Video play error....' : 'Video is not available right now'}</Text>
          <Text style={styles.overlayText}>{errorMsg || 'Internet eka check karala ayeth try karanna.'}</Text>
          <View style={styles.vpnNoticeBox}>
            <Text style={styles.vpnNoticeText}>
              ⚠️ Turn off your VPN if you are using any kind of VPN
            </Text>
            <Text style={styles.vpnNoticeSub}>
              (VPN එකක් On කර ඇත්නම් කරුණාකර එය Off කර Retry කරන්න)
            </Text>
          </View>
          <TouchableOpacity onPress={retry} style={styles.retryBtn} activeOpacity={0.8}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {showDebug && lines.length > 0 && (
        <View pointerEvents="none" style={styles.debug}>
          {lines.map((l, i) => <Text key={i} style={styles.debugText} numberOfLines={1}>{l}</Text>)}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', borderRadius: 8, overflow: 'hidden' },
  fullscreenOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    zIndex: 999999,
    elevation: 999999,
    backgroundColor: '#000',
  },
  web: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center' },
  err: { color: '#ff8a80' },
  overlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,.88)',
    alignItems: 'center', justifyContent: 'center', padding: 20, gap: 10,
  },
  overlayTitle: { color: '#fff', fontWeight: '800', fontSize: 15 },
  overlayText: { color: '#d1d5db', textAlign: 'center', lineHeight: 20, fontSize: 13 },
  vpnNoticeBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 4,
    marginBottom: 4,
    alignItems: 'center',
    maxWidth: '92%',
  },
  vpnNoticeText: {
    color: '#fca5a5',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  vpnNoticeSub: {
    color: '#f87171',
    fontSize: 10,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 2,
  },
  retryBtn: { backgroundColor: '#DC2626', paddingHorizontal: 22, paddingVertical: 10, borderRadius: 10, marginTop: 4 },
  retryText: { color: '#fff', fontWeight: '800' },
  debug: { position: 'absolute', left: 4, top: 4, right: 4, backgroundColor: 'rgba(0,0,0,.6)', padding: 4, borderRadius: 4 },
  debugText: { color: '#0f0', fontSize: 10 },
});
