// EmbedPage.jsx
// Mobile app eke WebView eken load karana page eka. Player eka witharai, screen eka purama.
// URL: https://your-lms.com/?v=<YouTube video hari playlist link eka (encodeURIComponent karala)>

import { useEffect } from "react";
import SecureYouTubePlayer from "./SecureYouTubePlayer";

// App ekata message yawanawa (React Native WebView athule nam)
function send(msg) {
  const data = JSON.stringify(msg);
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(data);
  else if (window.parent !== window) window.parent.postMessage(data, "*");
}

export default function EmbedPage() {
  const url = new URLSearchParams(window.location.search).get("v") || "";

  useEffect(() => {
    document.body.classList.add("syp-embed-body");
    return () => document.body.classList.remove("syp-embed-body");
  }, []);

  return (
    <div className="syp-embed">
      <SecureYouTubePlayer
        url={url}
        onStatus={(status, message) => send({ type: "status", status, message })}
        onFullscreen={() => {
          // App eka athule nam app ekata kiyanawa (screen eka rotate karanne app eka)
          if (window.ReactNativeWebView) { send({ type: "fullscreen" }); return true; }
          return false; // normal browser -> browser fullscreen
        }}
      />
    </div>
  );
}
