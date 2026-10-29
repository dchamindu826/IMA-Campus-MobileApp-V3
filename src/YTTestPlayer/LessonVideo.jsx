// components/LessonVideo.jsx  (Expo / React Native)
// Web LMS eke EmbedPage eka WebView ekaka load karanawa.
//
// Install:  npx expo install react-native-webview expo-screen-orientation
//
// Usage:
//   <LessonVideo url="https://youtu.be/xxxx" onFullscreenChange={setFull} />
//
// NOTE: Fullscreen weddi meka parent View eka purama pirenawa (position: absolute).
//       E nisa screen eke root View eke kelinma danna (ScrollView ekak athule danna epa).

import { useEffect, useState } from "react";
import {
  View, StyleSheet, BackHandler, StatusBar,
  ActivityIndicator, Text, useWindowDimensions,
} from "react-native";
import { WebView } from "react-native-webview";
let ScreenOrientation = null;
try {
  ScreenOrientation = require("expo-screen-orientation");
} catch (_) {}

// Oyage web LMS eka thiyena thana.
//   Local test:  "http://192.168.1.5:5173"  (npm run dev -- --host eke Network link eka)
//   Live:        "https://your-lms.vercel.app"
export const PLAYER_BASE = "http://192.168.1.5:5173";

const PORTRAIT_UP = ScreenOrientation?.OrientationLock?.PORTRAIT_UP || 1;
const LANDSCAPE = ScreenOrientation?.OrientationLock?.LANDSCAPE || 2;

export default function LessonVideo({ url, onStatus, onFullscreenChange }) {
  const [full, setFull] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(null);
  const { width, height } = useWindowDimensions();

  const src = `${PLAYER_BASE}/?v=${encodeURIComponent(url)}`;

  const setFullscreen = (on) => {
    setFull(on);
    onFullscreenChange && onFullscreenChange(on);
    ScreenOrientation.lockAsync(on ? LANDSCAPE : PORTRAIT_UP).catch(() => {});
  };

  // Android back button -> fullscreen eken eliyata
  useEffect(() => {
    if (!full) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setFullscreen(false);
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full]);

  // Screen eken yanakota ayeth portrait
  useEffect(() => () => { ScreenOrientation.lockAsync(PORTRAIT_UP).catch(() => {}); }, []);

  const onMessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (msg.type === "fullscreen") setFullscreen(!full);
    if (msg.type === "status") onStatus && onStatus(msg.status, msg.message);
  };

  // Oyage page eken pitata (YouTube ekata) yanna denne naha
  const onShouldStart = (req) => {
    if (req.isTopFrame === false) return true; // iOS: YouTube iframe eka load wenna ona
    return req.url.startsWith(PLAYER_BASE) || req.url === "about:blank";
  };

  return (
    <View style={full ? [styles.full, { width, height }] : styles.box}>
      <StatusBar hidden={full} />
      <WebView
        source={{ uri: src }}
        style={styles.web}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo={false}
        setSupportMultipleWindows={false}
        allowsLinkPreview={false}
        allowsBackForwardNavigationGestures={false}
        bounces={false}
        scrollEnabled={false}
        overScrollMode="never"
        onShouldStartLoadWithRequest={onShouldStart}
        onMessage={onMessage}
        onLoadEnd={() => setLoading(false)}
        onError={(e) => setFailed(e.nativeEvent.description || "Load une naha")}
        onHttpError={(e) => setFailed(`HTTP ${e.nativeEvent.statusCode}`)}
      />
      {(loading || failed) && (
        <View style={styles.overlay} pointerEvents="none">
          {failed
            ? <Text style={styles.err}>Video eka load une naha ({failed}).{"\n"}PLAYER_BASE eka saha WiFi eka check karanna.</Text>
            : <ActivityIndicator color="#fff" />}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000" },
  full: { position: "absolute", top: 0, left: 0, zIndex: 999, elevation: 999, backgroundColor: "#000" },
  web: { flex: 1, backgroundColor: "#000" },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: 16 },
  err: { color: "#ff8a80", textAlign: "center", lineHeight: 20 },
});
