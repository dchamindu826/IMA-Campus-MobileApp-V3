import React, { useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { WebView } from 'react-native-webview';
import YouTubePlayer from '../components/YouTubePlayer';

export default function YTDebugScreen({ navigation }) {
  const [logs, setLogs] = useState([]);
  const add = (m) =>
    setLogs((l) => [`${new Date().toLocaleTimeString()}  ${m}`, ...l].slice(0, 40));

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.body}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <TouchableOpacity
          onPress={() => navigation && navigation.goBack && navigation.goBack()}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#222', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}
        >
          <Icon name="arrow-left" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>YT Diagnostic Lab</Text>
      </View>

      <Text style={s.h}>1. Red box (RN layout)</Text>
      <View style={{ height: 40, backgroundColor: 'red' }} />

      <Text style={s.h}>2. Simple WebView</Text>
      <View style={{ height: 80 }}>
        <WebView
          originWhitelist={['*']}
          source={{ html: '<body style="margin:0;background:#0a0;color:#fff;font:28px -apple-system">WebView OK</body>' }}
          onLoadEnd={() => add('test webview: loaded')}
          onError={(e) => add('test webview error: ' + e.nativeEvent.description)}
        />
      </View>

      <Text style={s.h}>3. YouTube player</Text>
      <YouTubePlayer
        url="https://www.youtube.com/watch?v=UloSAi-MgPY"
        onDebug={(m) => add('player: ' + m)}
        onStatus={(st, d) => add('YT: ' + st + ' ' + (d?.message || ''))}
      />

      <Text style={s.h}>Logs</Text>
      {logs.length === 0 && <Text style={s.log}>(thama log naha)</Text>}
      {logs.map((l, i) => <Text key={i} style={s.log}>{l}</Text>)}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#111' },
  body: { padding: 16, paddingTop: 60, gap: 10 },
  h: { color: '#fff', fontWeight: '800', fontSize: 14 },
  log: { color: '#9f9', fontSize: 11, fontFamily: 'Menlo' },
});
