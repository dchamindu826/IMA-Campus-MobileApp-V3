import React, { useState } from 'react';
import { View, StyleSheet, useWindowDimensions, ActivityIndicator } from 'react-native';
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

export default function YouTubePlayer({
  url,
  videoId: propVideoId,
  listId: propListId,
  autoPlay = true,
  style,
}) {
  const { width: windowWidth } = useWindowDimensions();
  const [loading, setLoading] = useState(true);

  const parsed = parseYouTube(url);
  const videoId = propVideoId || parsed?.videoId || null;
  const listId = propListId || parsed?.listId || null;

  const playerWidth = windowWidth;
  const playerHeight = Math.round((playerWidth * 9) / 16);

  if (!videoId && !listId) {
    return null;
  }

  const embedSrc = listId
    ? `https://www.youtube-nocookie.com/embed?listType=playlist&list=${listId}&autoplay=${autoPlay ? 1 : 0}&playsinline=1&rel=0&modestbranding=1`
    : `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=${autoPlay ? 1 : 0}&playsinline=1&rel=0&modestbranding=1`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background-color: #000000; overflow: hidden; }
    iframe { width: 100%; height: 100%; border: 0; display: block; }
  </style>
</head>
<body>
  <iframe
    src="${embedSrc}"
    allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
    allowfullscreen>
  </iframe>
</body>
</html>`;

  return (
    <View style={[styles.container, { width: playerWidth, height: playerHeight }, style]}>
      <WebView
        source={{ html, baseUrl: 'https://www.youtube-nocookie.com' }}
        style={styles.web}
        containerStyle={styles.container}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo={true}
        originWhitelist={['*']}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        opaque={false}
        onLoadEnd={() => setLoading(false)}
      />
      {loading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color="#EF4444" />
        </View>
      )}
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
    backgroundColor: 'transparent',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
});
