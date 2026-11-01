import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  useWindowDimensions,
  Platform,
  BackHandler,
  StatusBar,
  Linking,
  Text,
  TouchableOpacity,
} from 'react-native';
import YoutubePlayer from 'react-native-youtube-iframe';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

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
  const [playing, setPlaying] = useState(autoPlay);
  const [isReady, setIsReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const playerRef = useRef(null);

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

  const onStateChange = useCallback(
    (state) => {
      if (state === 'ended') {
        setPlaying(false);
        if (onStatusChange) onStatusChange({ status: 'ended', message: 'Ended' });
      } else if (state === 'playing') {
        setPlaying(true);
        setErrorMsg(null);
        if (onStatusChange) onStatusChange({ status: 'playing', message: 'Playing' });
      } else if (state === 'paused') {
        setPlaying(false);
        if (onStatusChange) onStatusChange({ status: 'paused', message: 'Paused' });
      } else if (state === 'buffering') {
        if (onStatusChange) onStatusChange({ status: 'buffering', message: 'Buffering' });
      } else if (state === 'unstarted') {
        if (onStatusChange) onStatusChange({ status: 'unstarted', message: 'Loading' });
      }
    },
    [onStatusChange]
  );

  const onError = useCallback(
    (err) => {
      let msg = 'This video cannot be played inside the player.';
      if (err === 'video_not_found') msg = 'Video not found or is private.';
      else if (err === 'embed_not_allowed') msg = 'Owner or YouTube disabled embedding for this video.';
      else if (err === 'HTML5_error') msg = 'HTML5 playback error.';
      setErrorMsg(msg);
      if (onStatusChange) onStatusChange({ status: 'error', message: msg, code: err });
    },
    [onStatusChange]
  );

  const onReady = useCallback(() => {
    setIsReady(true);
    if (onStatusChange) onStatusChange({ status: 'ready', message: 'Player Ready' });
  }, [onStatusChange]);

  const handleOpenExternal = () => {
    const targetUrl = videoId
      ? `https://www.youtube.com/watch?v=${videoId}`
      : listId
      ? `https://www.youtube.com/playlist?list=${listId}`
      : url || '';
    if (targetUrl) {
      Linking.openURL(targetUrl).catch((err) => {
        console.warn('[YouTubePlayer] Failed to open external URL:', err);
      });
    }
  };

  const seekDelta = async (sec) => {
    try {
      if (playerRef.current?.getCurrentTime) {
        const cur = await playerRef.current.getCurrentTime();
        playerRef.current.seekTo(Math.max(0, cur + sec), true);
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
      >
        <Text style={styles.emptyText}>No Video URL</Text>
      </View>
    );
  }

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

      <YoutubePlayer
        ref={playerRef}
        height={fullscreen ? windowHeight : defaultHeight}
        width={fullscreen ? windowWidth : '100%'}
        play={playing}
        videoId={videoId}
        playList={listId}
        onChangeState={onStateChange}
        onError={onError}
        onReady={onReady}
        initialPlayerParams={{
          controls: true,
          modestbranding: true,
          rel: false,
          playsinline: true,
          preventFullScreen: false,
        }}
        webViewProps={{
          allowsInlineMediaPlayback: true,
          mediaPlaybackRequiresUserAction: false,
          bounces: false,
          scrollEnabled: false,
          style: { backgroundColor: '#000000' },
          containerStyle: { backgroundColor: '#000000' },
        }}
      />

      {/* Floating Seek Shortcuts (-10s / +10s) */}
      <View style={styles.seekOverlay} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.seekBtn}
          onPress={() => seekDelta(-10)}
          activeOpacity={0.7}
        >
          <Icon name="rewind-10" size={18} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.seekBtn}
          onPress={() => seekDelta(10)}
          activeOpacity={0.7}
        >
          <Icon name="fast-forward-10" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Error Fallback Overlay */}
      {errorMsg && (
        <View style={styles.errorOverlay}>
          <Icon name="alert-circle-outline" size={32} color="#ef4444" />
          <Text style={styles.errorTitle}>Video Unavailable on YouTube</Text>
          <Text style={styles.errorSub}>{errorMsg}</Text>
          <TouchableOpacity style={styles.openYtBtn} onPress={handleOpenExternal}>
            <Icon name="youtube" size={18} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.openYtBtnText}>Open in YouTube App</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  emptyText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600',
  },
  seekOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    gap: 8,
    zIndex: 10,
  },
  seekBtn: {
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderRadius: 16,
    padding: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  errorOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    zIndex: 20,
  },
  errorTitle: {
    color: '#f87171',
    fontWeight: '700',
    fontSize: 14,
    marginTop: 6,
    marginBottom: 4,
    textAlign: 'center',
  },
  errorSub: {
    color: '#cbd5e1',
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 12,
    maxWidth: 260,
    lineHeight: 16,
  },
  openYtBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ef4444',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  openYtBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
});
