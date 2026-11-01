import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  FlatList,
  Alert,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import YouTubePlayer, { parseYouTube as parseYouTubeUrl } from '../components/YouTubePlayer';
import COLORS from '../constants/colors';

const SAMPLE_VIDEOS = [
  { id: '1', title: 'IMA Media Lesson', url: 'https://youtube.com/live/UloSAi-MgPY', desc: 'Real IMA Campus Recording' },
  { id: '2', title: 'Biology Lecture', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', desc: 'Standard 1080p stream' },
  { id: '3', title: 'Activity 04', url: 'https://www.youtube.com/watch?v=T-o4OdAdueA', desc: 'LMS Recording Video' },
];

export default function YTPlayerTestScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [inputUrl, setInputUrl] = useState('https://youtube.com/live/UloSAi-MgPY');
  const [activeUrl, setActiveUrl] = useState('https://youtube.com/live/UloSAi-MgPY');
  const [logs, setLogs] = useState([]);
  const [currentStatus, setCurrentStatus] = useState('Idle');

  const parsed = parseYouTubeUrl(activeUrl);

  const addLog = (type, message) => {
    const time = new Date().toLocaleTimeString();
    setCurrentStatus(type.toUpperCase());
    setLogs((prev) => [{ id: String(Date.now() + Math.random()), time, type, message }, ...prev.slice(0, 19)]);
  };

  const handleLoad = () => {
    if (!inputUrl.trim()) {
      Alert.alert('URL Missing', 'Please paste a YouTube URL or Video ID');
      return;
    }
    const check = parseYouTubeUrl(inputUrl.trim());
    if (!check) {
      Alert.alert('Invalid Link', 'Not a valid YouTube URL or Video ID. Please check the link.');
      return;
    }
    setActiveUrl(inputUrl.trim());
    addLog('load', `Loaded: ${inputUrl.trim()}`);
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Icon name="arrow-left" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.headerTitle}>YouTube Player Lab</Text>
          <Text style={styles.headerSub}>Test YouTube Links inside App Player</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: getStatusColor(currentStatus) }]}>
          <Text style={styles.statusPillText}>{currentStatus}</Text>
        </View>
      </View>

      {/* Pinned Video Player Card at the Top */}
      <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
        <View style={styles.playerCard}>
          <YouTubePlayer
            url={activeUrl}
            autoPlay={true}
            onStatus={(status, data) => addLog(status, typeof data === 'object' ? (data.message || status) : String(data))}
            onStatusChange={(data) => addLog(data.status, data.message)}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Top Status & Recent Logs */}
        <View style={[styles.card, { padding: 10, marginBottom: 12 }]}>
          <Text style={{ color: '#94a3b8', fontSize: 11, fontWeight: '700' }}>
            STATUS: {currentStatus} | LOGS ({logs.length}): {logs[0] ? `${logs[0].type}: ${logs[0].message}` : 'None'}
          </Text>
        </View>

        {/* URL Input Box */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>YouTube Video / Playlist Link</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Paste YouTube Link or Video ID..."
              placeholderTextColor="#64748b"
              value={inputUrl}
              onChangeText={setInputUrl}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {inputUrl.length > 0 && (
              <TouchableOpacity onPress={() => setInputUrl('')} style={styles.clearBtn}>
                <Icon name="close-circle" size={20} color="#94a3b8" />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity onPress={handleLoad} style={styles.loadBtn}>
            <LinearGradient colors={['#ef4444', '#dc2626']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.loadGradient}>
              <Icon name="play-circle-outline" size={22} color="#fff" />
              <Text style={styles.loadBtnText}>TEST & PLAY VIDEO</Text>
            </LinearGradient>
          </TouchableOpacity>

          {parsed && (
            <View style={styles.detectedRow}>
              <Icon name="check-decagram" size={16} color="#10b981" />
              <Text style={styles.detectedText}>
                {parsed.videoId ? `Video ID: ${parsed.videoId}` : ''}
                {parsed.listId ? `  •  Playlist ID: ${parsed.listId}` : ''}
              </Text>
            </View>
          )}
        </View>

        {/* Sample Links */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Quick Test Presets (1-Tap)</Text>
          <View style={styles.sampleChips}>
            {SAMPLE_VIDEOS.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.chip, activeUrl === item.url && styles.chipActive]}
                onPress={() => {
                  setInputUrl(item.url);
                  setActiveUrl(item.url);
                  addLog('select', `Preset: ${item.title}`);
                }}
              >
                <Icon name="youtube" size={16} color={activeUrl === item.url ? '#fff' : '#ef4444'} />
                <Text style={[styles.chipText, activeUrl === item.url && styles.chipTextActive]}>
                  {item.title}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Controls Guide */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Player Features In App</Text>
          <View style={styles.featureItem}>
            <Icon name="gesture-double-tap" size={20} color="#38bdf8" />
            <Text style={styles.featureText}>Double-tap Left / Right for -10s / +10s seeking</Text>
          </View>
          <View style={styles.featureItem}>
            <Icon name="shield-lock-outline" size={20} color="#10b981" />
            <Text style={styles.featureText}>Secure Shield: Blocks external YouTube brand clicks</Text>
          </View>
          <View style={styles.featureItem}>
            <Icon name="play-speed" size={20} color="#f59e0b" />
            <Text style={styles.featureText}>Speed (0.5x - 2x) & Quality selection in Settings gear</Text>
          </View>
        </View>

        {/* Live Event Log */}
        <View style={[styles.card, { marginBottom: 40 }]}>
          <Text style={styles.sectionTitle}>Real-time Player Events</Text>
          {logs.length === 0 ? (
            <Text style={styles.emptyLog}>Play the video to see event stream...</Text>
          ) : (
            logs.map((log) => (
              <View key={log.id} style={styles.logRow}>
                <Text style={styles.logTime}>{log.time}</Text>
                <View style={[styles.logTypeTag, { backgroundColor: getLogColor(log.type) }]}>
                  <Text style={styles.logTypeTagText}>{log.type}</Text>
                </View>
                <Text style={styles.logMsg} numberOfLines={1}>{log.message}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function getStatusColor(status) {
  switch (String(status).toLowerCase()) {
    case 'playing': return '#10b981';
    case 'buffering': return '#f59e0b';
    case 'ready': return '#3b82f6';
    case 'error': return '#ef4444';
    default: return '#64748b';
  }
}

function getLogColor(type) {
  switch (String(type).toLowerCase()) {
    case 'playing': return '#10b981';
    case 'ready': return '#3b82f6';
    case 'buffering': return '#f59e0b';
    case 'error': return '#ef4444';
    case 'load':
    case 'select': return '#8b5cf6';
    default: return '#475569';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#090d16',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  headerSub: {
    color: '#94a3b8',
    fontSize: 12,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusPillText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  scrollContent: {
    padding: 16,
  },
  playerCard: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 16,
    backgroundColor: '#000',
    elevation: 8,
  },
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    height: 48,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
  },
  clearBtn: {
    padding: 4,
  },
  loadBtn: {
    marginTop: 12,
    borderRadius: 10,
    overflow: 'hidden',
  },
  loadGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    gap: 8,
  },
  loadBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  detectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  detectedText: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: '600',
  },
  sampleChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#1e293b',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  chipActive: {
    backgroundColor: '#ef4444',
    borderColor: '#ef4444',
  },
  chipText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#fff',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  featureText: {
    color: '#94a3b8',
    fontSize: 13,
    flex: 1,
  },
  emptyLog: {
    color: '#64748b',
    fontSize: 12,
    fontStyle: 'italic',
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  logTime: {
    color: '#64748b',
    fontSize: 11,
    fontFamily: 'Courier',
  },
  logTypeTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  logTypeTagText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  logMsg: {
    color: '#cbd5e1',
    fontSize: 12,
    flex: 1,
  },
});
