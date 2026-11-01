import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  useWindowDimensions,
  Platform,
  BackHandler,
  StatusBar,
} from 'react-native';
import { WebView } from 'react-native-webview';

export function parseYouTube(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (/^[\w-]{11}$/.test(s)) return { videoId: s, listId: null };
  if (/^(PL|UU|OL|FL|RD)[\w-]{10,}$/.test(s)) return { videoId: null, listId: s };
  try {
    const raw = s.startsWith('http') ? s : `https://${s}`;
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\.|^m\.|^music\./, '');
    let videoId = null;
    const listId = u.searchParams.get('list') || null;
    if (host === 'youtu.be') {
      videoId = u.pathname.slice(1, 12) || null;
    } else if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      const v = u.searchParams.get('v');
      if (v) videoId = v.slice(0, 11);
      else {
        const m = u.pathname.match(/\/(embed|shorts|live|v)\/([\w-]{11})/);
        if (m) videoId = m[2];
      }
    }
    if (videoId || listId) return { videoId, listId };
  } catch (_) {}
  return null;
}

export const parseYouTubeUrl = parseYouTube;

export function generatePlayerHtml(videoId, listId, autoPlay = true) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <meta name="referrer" content="strict-origin-when-cross-origin" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; background: #000; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; user-select: none; -webkit-user-select: none; }
    .player-wrap { position: relative; width: 100%; height: 100%; background: #000; overflow: hidden; }
    .yt-frame { position: absolute; left: 0; right: 0; top: -60px; height: calc(100% + 120px); pointer-events: none; overflow: hidden; }
    .yt-frame iframe { width: 100%; height: 100%; border: 0; }
    .shield { position: absolute; inset: 0; z-index: 5; cursor: pointer; }
    .cover { position: absolute; inset: 0; z-index: 4; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.55); pointer-events: none; transition: opacity .25s ease; }
    .cover.hidden { opacity: 0; pointer-events: none; }
    .big-btn { width: 68px; height: 68px; border-radius: 50%; background: rgba(239,68,68,0.95); display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 24px rgba(0,0,0,0.6); }
    .big-btn svg { width: 36px; height: 36px; fill: #fff; margin-left: 4px; }
    .flash { position: absolute; top: 0; bottom: 0; z-index: 8; width: 38%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(255,255,255,0.18); pointer-events: none; color: #fff; font-weight: 700; font-size: 15px; opacity: 0; transition: opacity .2s; }
    .flash.active { opacity: 1; }
    .flash-left { left: 0; border-radius: 0 50% 50% 0; }
    .flash-right { right: 0; border-radius: 50% 0 0 50%; }
    .controls { position: absolute; left: 0; right: 0; bottom: 0; z-index: 10; padding: 22px 12px 10px; background: linear-gradient(transparent, rgba(0,0,0,0.88)); transition: opacity .25s ease; }
    .controls.idle { opacity: 0; pointer-events: none; }
    .progress-bar { position: relative; height: 26px; display: flex; align-items: center; cursor: pointer; touch-action: none; margin-bottom: 4px; padding: 4px 0; -webkit-tap-highlight-color: transparent; }
    .track { position: relative; width: 100%; height: 5px; background: rgba(255,255,255,0.25); border-radius: 3px; pointer-events: none; }
    .buf { position: absolute; left: 0; top: 0; bottom: 0; background: rgba(255,255,255,0.45); border-radius: 3px; width: 0%; pointer-events: none; }
    .fill { position: absolute; left: 0; top: 0; bottom: 0; background: #ef4444; border-radius: 3px; width: 0%; pointer-events: none; }
    .knob { position: absolute; top: 50%; width: 14px; height: 14px; border-radius: 50%; background: #ef4444; transform: translate(-50%, -50%); box-shadow: 0 0 6px rgba(0,0,0,0.7); pointer-events: none; }
    .row { display: flex; align-items: center; gap: 6px; color: #fff; }
    .btn { background: transparent; border: 0; color: #fff; width: 36px; height: 36px; display: inline-flex; align-items: center; justify-content: center; border-radius: 6px; cursor: pointer; }
    .btn svg { width: 22px; height: 22px; fill: currentColor; }
    .btn-play svg { width: 26px; height: 26px; }
    .time { font-size: 12px; font-variant-numeric: tabular-nums; margin-left: 6px; color: #e5e7eb; font-weight: 500; }
    .spacer { flex: 1; }
    .menu { position: absolute; right: 12px; bottom: 68px; z-index: 15; background: rgba(24,24,27,0.95); border: 1px solid #3f3f46; border-radius: 12px; padding: 12px; min-width: 190px; box-shadow: 0 10px 25px rgba(0,0,0,0.7); display: none; }
    .menu.open { display: block; }
    .menu-h { font-size: 11px; text-transform: uppercase; color: #9ca3af; margin-bottom: 6px; font-weight: 700; letter-spacing: 0.5px; }
    .chips { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px; }
    .chip { padding: 4px 8px; background: #27272a; color: #e5e7eb; border: 0; border-radius: 6px; font-size: 12px; cursor: pointer; }
    .chip.active { background: #ef4444; color: #fff; font-weight: 700; }
    .badge { font-size: 9px; background: #ef4444; color: #fff; padding: 1px 3px; border-radius: 3px; margin-left: 2px; }
  </style>
</head>
<body>
  <div class="player-wrap" id="wrap">
    <div class="yt-frame"><div id="player"></div></div>
    <div class="cover" id="cover">
      <div class="big-btn"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
    </div>
    <div class="shield" id="shield"></div>
    <div class="flash flash-left" id="flashL"><span>−10s</span></div>
    <div class="flash flash-right" id="flashR"><span>+10s</span></div>

    <div class="menu" id="menu">
      <div class="menu-h">Playback Speed</div>
      <div class="chips" id="rateChips">
        <button class="chip" data-rate="0.5">0.5x</button>
        <button class="chip" data-rate="0.75">0.75x</button>
        <button class="chip active" data-rate="1">1x</button>
        <button class="chip" data-rate="1.25">1.25x</button>
        <button class="chip" data-rate="1.5">1.5x</button>
        <button class="chip" data-rate="2">2x</button>
      </div>
      <div class="menu-h">Quality Hint</div>
      <div class="chips" id="qualChips">
        <button class="chip active" data-qual="auto">Auto</button>
        <button class="chip" data-qual="hd">1080p</button>
        <button class="chip" data-qual="q720">720p</button>
        <button class="chip" data-qual="saver">360p</button>
      </div>
    </div>

    <div class="controls" id="controls">
      <div class="progress-bar" id="pBar">
        <div class="track">
          <div class="buf" id="pBuf"></div>
          <div class="fill" id="pFill"></div>
          <div class="knob" id="pKnob"></div>
        </div>
      </div>
      <div class="row">
        <button class="btn" id="btnBack" aria-label="Rewind 10s"><svg viewBox="0 0 24 24"><path d="M12 5V2L7 6l5 4V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/><text x="12" y="16.5" font-size="7" font-weight="bold" text-anchor="middle" fill="currentColor">10</text></svg></button>
        <button class="btn btn-play" id="btnPlay" aria-label="Play or Pause"><svg id="playIcon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>
        <button class="btn" id="btnFwd" aria-label="Forward 10s"><svg viewBox="0 0 24 24"><path d="M12 5V2l5 4-5 4V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8z"/><text x="12" y="16.5" font-size="7" font-weight="bold" text-anchor="middle" fill="currentColor">10</text></svg></button>
        <span class="time" id="timeTxt">00:00 / 00:00</span>
        <span class="spacer"></span>
        <button class="btn" id="btnMute" aria-label="Mute or Unmute"><svg id="muteIcon" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4z"/></svg></button>
        <button class="btn" id="btnGear" aria-label="Settings"><svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84a.47.47 0 0 0-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 8.87a.47.47 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.48.48 0 0 0-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z"/></svg><span class="badge" id="rateBadge" style="display:none">1x</span></button>
        <button class="btn" id="btnFs" aria-label="Toggle Fullscreen"><svg viewBox="0 0 24 24"><path d="M5 5h5v2H7v3H5zm9 0h5v5h-2V7h-3zM5 14h2v3h3v2H5zm12 0h2v5h-5v-2h3z"/></svg></button>
      </div>
    </div>
  </div>

  <script src="https://www.youtube.com/iframe_api"></script>
  <script>
    function post(data) {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(data));
    }

    var player = null, isReady = false, isPlaying = false, isDragging = false;
    var dur = 0, cur = 0, idleTimer = null, tapTimer = null, lastTap = 0, lastSide = '';

    function fmt(s) {
      s = Math.max(0, Math.floor(s || 0));
      var m = Math.floor(s / 60), sec = String(s % 60).padStart(2, '0');
      return m + ':' + sec;
    }

    function wake() {
      var c = document.getElementById('controls');
      c.classList.remove('idle');
      clearTimeout(idleTimer);
      if (isPlaying) idleTimer = setTimeout(function() { c.classList.add('idle'); }, 2800);
    }

    function onYouTubeIframeAPIReady() {
      var pVars = {
        enablejsapi: 1,
        origin: 'https://imacampus.lk',
        controls: 0,
        disablekb: 1,
        rel: 0,
        modestbranding: 1,
        iv_load_policy: 3,
        fs: 0,
        playsinline: 1,
        autoplay: ${autoPlay ? 1 : 0}
      };
      ${listId ? `pVars.listType = 'playlist'; pVars.list = '${listId}';` : ''}
      player = new YT.Player('player', {
        ${videoId ? `videoId: '${videoId}',` : ''}
        host: 'https://www.youtube.com',
        playerVars: pVars,
        events: {
          onReady: function(e) {
            isReady = true;
            if (player && player.getDuration) dur = player.getDuration() || 0;
            post({ type: 'status', status: 'ready', message: 'Player ready' });
            ${autoPlay ? 'player.playVideo();' : ''}
          },
          onStateChange: function(e) {
            var S = YT.PlayerState;
            isPlaying = (e.data === S.PLAYING);
            if (player && player.getDuration) {
              var d = player.getDuration();
              if (d > 0) dur = d;
            }
            document.getElementById('cover').classList.toggle('hidden', isPlaying);
            document.getElementById('playIcon').innerHTML = isPlaying
              ? '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>'
              : '<path d="M8 5v14l11-7z"/>';
            if (e.data === S.PLAYING) { post({ type: 'status', status: 'playing', message: 'Playing' }); wake(); }
            else if (e.data === S.PAUSED) post({ type: 'status', status: 'paused', message: 'Paused' });
            else if (e.data === S.BUFFERING) post({ type: 'status', status: 'buffering', message: 'Buffering' });
            else if (e.data === S.ENDED) post({ type: 'status', status: 'ended', message: 'Ended' });
          },
          onError: function(e) {
            var errMap = { 2: 'Invalid Video ID', 5: 'HTML5 Error', 100: 'Video not found/private', 101: 'Embedding disabled by owner', 150: 'Embedding disabled by owner' };
            var msg = errMap[e.data] || ('YouTube Error ' + e.data);
            post({ type: 'status', status: 'error', message: msg, code: e.data });
          }
        }
      });
    }

    setInterval(function() {
      if (!isReady || !player || !player.getCurrentTime) return;
      if (!isDragging) {
        cur = player.getCurrentTime() || 0;
        dur = player.getDuration() || dur || 0;
        var pct = dur > 0 ? (cur / dur) * 100 : 0;
        document.getElementById('pFill').style.width = pct + '%';
        document.getElementById('pKnob').style.left = pct + '%';
        document.getElementById('timeTxt').innerText = fmt(cur) + ' / ' + fmt(dur);
        if (player.getVideoLoadedFraction) {
          document.getElementById('pBuf').style.width = (player.getVideoLoadedFraction() * 100) + '%';
        }
      }
    }, 300);

    function togglePlay() {
      if (!isReady || !player) return;
      if (isPlaying) player.pauseVideo();
      else player.playVideo();
    }

    function seekDelta(sec) {
      if (!isReady || !player || !player.seekTo) return;
      var cTime = (player.getCurrentTime && player.getCurrentTime()) || cur || 0;
      var dTime = (player.getDuration && player.getDuration()) || dur || 0;
      var t = Math.max(0, Math.min(cTime + sec, dTime > 0 ? dTime - 1 : cTime + sec));
      t = Math.floor(t);
      player.seekTo(t, true);
      cur = t;
      var el = document.getElementById(sec < 0 ? 'flashL' : 'flashR');
      if (el) {
        el.classList.add('active');
        setTimeout(function() { el.classList.remove('active'); }, 600);
      }
      wake();
    }

    function getEventClientX(e) {
      if (e.touches && e.touches.length > 0) return e.touches[0].clientX;
      if (e.changedTouches && e.changedTouches.length > 0) return e.changedTouches[0].clientX;
      if (typeof e.clientX === 'number') return e.clientX;
      return null;
    }

    document.getElementById('shield').onclick = function(e) {
      var r = document.getElementById('wrap').getBoundingClientRect();
      var x = getEventClientX(e);
      if (x === null) { togglePlay(); return; }
      var relX = x - r.left;
      var now = Date.now();
      if (relX < r.width * 0.35) {
        if (lastSide === 'left' && (now - lastTap) < 350) {
          clearTimeout(tapTimer);
          seekDelta(-10);
          lastTap = 0;
          return;
        }
        lastSide = 'left';
        lastTap = now;
        tapTimer = setTimeout(function() { togglePlay(); }, 250);
      } else if (relX > r.width * 0.65) {
        if (lastSide === 'right' && (now - lastTap) < 350) {
          clearTimeout(tapTimer);
          seekDelta(10);
          lastTap = 0;
          return;
        }
        lastSide = 'right';
        lastTap = now;
        tapTimer = setTimeout(function() { togglePlay(); }, 250);
      } else {
        togglePlay();
      }
    };

    document.getElementById('btnPlay').onclick = function() { togglePlay(); wake(); };
    document.getElementById('btnBack').onclick = function() { seekDelta(-10); };
    document.getElementById('btnFwd').onclick = function() { seekDelta(10); };
    document.getElementById('btnFs').onclick = function() { post({ type: 'fullscreen' }); };

    document.getElementById('btnMute').onclick = function() {
      if (!player) return;
      var m = player.isMuted();
      if (m) { player.unMute(); document.getElementById('muteIcon').innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4z"/>'; }
      else { player.mute(); document.getElementById('muteIcon').innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4z"/>'; }
    };

    var menu = document.getElementById('menu');
    document.getElementById('btnGear').onclick = function() { menu.classList.toggle('open'); wake(); };
    document.getElementById('rateChips').onclick = function(e) {
      if (!e.target.dataset.rate) return;
      var r = parseFloat(e.target.dataset.rate);
      player && player.setPlaybackRate && player.setPlaybackRate(r);
      document.querySelectorAll('#rateChips .chip').forEach(function(b) { b.classList.remove('active'); });
      e.target.classList.add('active');
      var b = document.getElementById('rateBadge');
      if (r !== 1) { b.innerText = r + 'x'; b.style.display = 'inline-block'; }
      else b.style.display = 'none';
      menu.classList.remove('open');
    };

    var pBar = document.getElementById('pBar');

    function getRatio(e) {
      var r = pBar.getBoundingClientRect();
      var x = getEventClientX(e);
      if (x === null || !r.width) return null;
      return Math.max(0, Math.min(1, (x - r.left) / r.width));
    }

    function renderScrubProgress(ratio, total) {
      var t = ratio * total;
      document.getElementById('pFill').style.width = (ratio * 100) + '%';
      document.getElementById('pKnob').style.left = (ratio * 100) + '%';
      document.getElementById('timeTxt').innerText = fmt(t) + ' / ' + fmt(total);
      return t;
    }

    function commitSeek(ratio) {
      var total = (player && player.getDuration && player.getDuration()) || dur || 0;
      if (total <= 0) return;
      var t = Math.max(0, Math.min(ratio * total, total - 0.5));
      t = Math.floor(t);
      if (player && player.seekTo) {
        player.seekTo(t, true);
        cur = t;
      }
      renderScrubProgress(ratio, total);
      wake();
    }

    pBar.addEventListener('touchstart', function(e) {
      isDragging = true;
      var ratio = getRatio(e);
      var total = (player && player.getDuration && player.getDuration()) || dur || 0;
      if (ratio !== null && total > 0) renderScrubProgress(ratio, total);
    }, { passive: true });

    window.addEventListener('touchmove', function(e) {
      if (!isDragging) return;
      var ratio = getRatio(e);
      var total = (player && player.getDuration && player.getDuration()) || dur || 0;
      if (ratio !== null && total > 0) renderScrubProgress(ratio, total);
    }, { passive: true });

    window.addEventListener('touchend', function(e) {
      if (!isDragging) return;
      isDragging = false;
      var ratio = getRatio(e);
      if (ratio !== null) commitSeek(ratio);
    });

    window.addEventListener('touchcancel', function() {
      isDragging = false;
    });

    pBar.addEventListener('mousedown', function(e) {
      isDragging = true;
      var ratio = getRatio(e);
      var total = (player && player.getDuration && player.getDuration()) || dur || 0;
      if (ratio !== null && total > 0) renderScrubProgress(ratio, total);
    });

    window.addEventListener('mousemove', function(e) {
      if (!isDragging) return;
      var ratio = getRatio(e);
      var total = (player && player.getDuration && player.getDuration()) || dur || 0;
      if (ratio !== null && total > 0) renderScrubProgress(ratio, total);
    });

    window.addEventListener('mouseup', function(e) {
      if (!isDragging) return;
      isDragging = false;
      var ratio = getRatio(e);
      if (ratio !== null) commitSeek(ratio);
    });

    pBar.addEventListener('click', function(e) {
      var ratio = getRatio(e);
      if (ratio !== null) commitSeek(ratio);
    });

    document.body.addEventListener('touchstart', wake);
  </script>
</body>
</html>`;
}

export default function YouTubePlayer({
  url,
  videoId: propVideoId,
  listId: propListId,
  autoPlay = true,
  onStatusChange,
  onFullscreenChange,
  style,
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const webViewRef = useRef(null);

  const parsed = parseYouTube(url);
  const videoId = propVideoId || parsed?.videoId || null;
  const listId = propListId || parsed?.listId || null;

  const defaultHeight = Math.round((windowWidth * 9) / 16);

  const toggleFullscreen = () => {
    const next = !fullscreen;
    setFullscreen(next);
    if (onFullscreenChange) onFullscreenChange(next);
  };

  useEffect(() => {
    if (!fullscreen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      toggleFullscreen();
      return true;
    });
    return () => sub.remove();
  }, [fullscreen]);

  const onMessage = (e) => {
    try {
      const data = JSON.parse(e.nativeEvent.data);
      if (data.type === 'fullscreen') {
        toggleFullscreen();
      } else if (data.type === 'status') {
        if (onStatusChange) onStatusChange(data);
      }
    } catch (_) {}
  };

  if (!videoId && !listId) {
    return (
      <View
        style={[
          styles.container,
          { width: windowWidth, height: defaultHeight },
          style,
        ]}
      />
    );
  }

  const embedUrl = listId
    ? `https://www.youtube.com/embed?listType=playlist&list=${listId}&autoplay=1&playsinline=1`
    : `https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1`;

  return (
    <View
      style={[
        fullscreen
          ? StyleSheet.absoluteFillObject
          : [
              {
                width: '100%',
                height: defaultHeight,
                backgroundColor: '#000000',
                overflow: 'hidden',
              },
              style,
            ],
      ]}
    >
      <StatusBar hidden={fullscreen} />
      <WebView
        ref={webViewRef}
        source={{
          uri: embedUrl,
          headers: { Referer: 'https://imacampus.lk' },
        }}
        style={styles.web}
        containerStyle={styles.webContainer}
        originWhitelist={['*']}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo={true}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        opaque={false}
        onLoadStart={() => console.log('[YT WebView] loadStart')}
        onLoadEnd={() => console.log('[YT WebView] loadEnd')}
        onError={(e) => console.warn('[YT WebView error]', e.nativeEvent)}
        onHttpError={(e) => console.warn('[YT WebView httpError]', e.nativeEvent)}
        onMessage={onMessage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  web: {
    flex: 1,
    backgroundColor: '#000000',
  },
  webContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
