import { useState } from "react";
import SecureYouTubePlayer, { parseYouTube } from "./SecureYouTubePlayer";
import "./SecureYouTubePlayer.css";

const SAMPLES = [
  { label: "Sample Lesson 1", url: "https://www.youtube.com/watch?v=kYJ_t7b4w_U" },
  { label: "Sample Playlist", url: "https://www.youtube.com/playlist?list=PLOfumqay9m8j57AKqVnDdTDuQzknco1kQ" },
  { label: "Shorts Video", url: "https://www.youtube.com/shorts/dQw4w9WgXcQ" },
];

export default function VideoTestPage() {
  const [inputUrl, setInputUrl] = useState("https://www.youtube.com/watch?v=kYJ_t7b4w_U");
  const [activeUrl, setActiveUrl] = useState("https://www.youtube.com/watch?v=kYJ_t7b4w_U");
  const [logs, setLogs] = useState([]);

  const parsed = parseYouTube(activeUrl);

  const addLog = (type, msg) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [{ time, type, msg }, ...prev.slice(0, 19)]);
  };

  const handleTest = (e) => {
    e && e.preventDefault();
    if (!inputUrl.trim()) return;
    setActiveUrl(inputUrl.trim());
    addLog("load", `Loaded URL: ${inputUrl.trim()}`);
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>🎬 YouTube Player Test Page</h1>
        <p style={styles.subtitle}>
          LMS එක සඳහා YouTube වීඩියෝවක් හෝ Playlist එකක් Player එක ඇතුලේ ටෙස්ට් කර බලන්න.
        </p>
      </header>

      {/* Input section */}
      <form onSubmit={handleTest} style={styles.inputCard}>
        <div style={styles.inputRow}>
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="Paste YouTube Video URL or Playlist link here..."
            style={styles.input}
          />
          <button type="submit" style={styles.playBtn}>
            Test & Play
          </button>
        </div>

        {/* Preset sample chips */}
        <div style={styles.samplesRow}>
          <span style={styles.sampleLabel}>Sample links:</span>
          {SAMPLES.map((s, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setInputUrl(s.url);
                setActiveUrl(s.url);
                addLog("sample", `Selected sample: ${s.label}`);
              }}
              style={styles.sampleChip}
            >
              {s.label}
            </button>
          ))}
        </div>

        {parsed ? (
          <div style={styles.parsedInfo}>
            {parsed.videoId && <span style={styles.badge}>Video ID: {parsed.videoId}</span>}
            {parsed.listId && <span style={styles.badge}>Playlist ID: {parsed.listId}</span>}
          </div>
        ) : (
          <div style={styles.errorInfo}>Invalid YouTube URL format.</div>
        )}
      </form>

      {/* Player Section */}
      <div style={styles.playerWrapper}>
        <SecureYouTubePlayer
          url={activeUrl}
          onStatus={(type, msg) => addLog(type, msg)}
        />
      </div>

      {/* Logs console */}
      <div style={styles.logCard}>
        <h3 style={styles.logTitle}>Player Event Log</h3>
        <div style={styles.logList}>
          {logs.length === 0 ? (
            <p style={{ color: "#777", fontSize: "13px" }}>No events yet. Play the video to see events.</p>
          ) : (
            logs.map((log, idx) => (
              <div key={idx} style={styles.logItem}>
                <span style={styles.logTime}>{log.time}</span>
                <span style={{ ...styles.logType, backgroundColor: getLogColor(log.type) }}>
                  {log.type}
                </span>
                <span style={styles.logMsg}>{log.msg}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function getLogColor(type) {
  switch (type) {
    case "ready": return "#059669";
    case "playing": return "#2563eb";
    case "buffering": return "#d97706";
    case "error": return "#dc2626";
    default: return "#4b5563";
  }
}

const styles = {
  container: {
    maxWidth: "960px",
    margin: "0 auto",
    padding: "24px 16px 60px",
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    color: "#fff",
  },
  header: {
    textAlign: "center",
    marginBottom: "24px",
  },
  title: {
    fontSize: "26px",
    fontWeight: "800",
    color: "#fff",
    margin: "0 0 8px",
  },
  subtitle: {
    fontSize: "14px",
    color: "#9ca3af",
    margin: 0,
  },
  inputCard: {
    background: "#18181b",
    border: "1px solid #27272a",
    borderRadius: "14px",
    padding: "16px",
    marginBottom: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  inputRow: {
    display: "flex",
    gap: "10px",
  },
  input: {
    flex: 1,
    padding: "12px 16px",
    borderRadius: "10px",
    border: "1px solid #3f3f46",
    background: "#09090b",
    color: "#fff",
    fontSize: "14px",
    outline: "none",
  },
  playBtn: {
    padding: "12px 24px",
    background: "#ef4444",
    color: "#fff",
    border: "none",
    borderRadius: "10px",
    fontWeight: "700",
    fontSize: "14px",
    cursor: "pointer",
  },
  samplesRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "8px",
  },
  sampleLabel: {
    fontSize: "12px",
    color: "#a1a1aa",
    fontWeight: "600",
  },
  sampleChip: {
    padding: "6px 12px",
    background: "#27272a",
    border: "1px solid #3f3f46",
    borderRadius: "20px",
    color: "#e4e4e7",
    fontSize: "12px",
    cursor: "pointer",
  },
  parsedInfo: {
    display: "flex",
    gap: "8px",
  },
  badge: {
    display: "inline-block",
    padding: "4px 10px",
    background: "#05966922",
    border: "1px solid #059669",
    borderRadius: "6px",
    color: "#34d399",
    fontSize: "12px",
    fontWeight: "600",
  },
  errorInfo: {
    color: "#f87171",
    fontSize: "12px",
  },
  playerWrapper: {
    width: "100%",
    marginBottom: "24px",
  },
  logCard: {
    background: "#18181b",
    border: "1px solid #27272a",
    borderRadius: "14px",
    padding: "16px",
  },
  logTitle: {
    margin: "0 0 12px",
    fontSize: "15px",
    color: "#e4e4e7",
  },
  logList: {
    maxHeight: "180px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    fontFamily: "monospace",
  },
  logItem: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    fontSize: "12px",
  },
  logTime: {
    color: "#71717a",
  },
  logType: {
    padding: "2px 6px",
    borderRadius: "4px",
    color: "#fff",
    fontSize: "11px",
    textTransform: "uppercase",
  },
  logMsg: {
    color: "#d4d4d8",
  },
};
