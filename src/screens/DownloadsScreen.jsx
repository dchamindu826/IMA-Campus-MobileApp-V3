import React, { useState, useCallback } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, Dimensions, ActivityIndicator, Platform, StatusBar, DeviceEventEmitter
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons'; 
import Video from 'react-native-video'; 
import LinearGradient from 'react-native-linear-gradient'; 
import COLORS from '../constants/colors';
import CustomAlert from '../components/CustomAlert';
import GlobalDownloadWidget from '../components/GlobalDownloadWidget';

const { width, height } = Dimensions.get('window');

// 🔥 කලින් CourseContentScreen එකේ දුන්න Secure Path එක මෙතනටත් දාගන්නවා 🔥
const secureStoragePath = Platform.OS === 'ios' ? RNFS.LibraryDirectoryPath : RNFS.DocumentDirectoryPath;

const DownloadsScreen = ({ navigation }) => { 
  const [recordings, setRecordings] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [totalStorageUsed, setTotalStorageUsed] = useState(0);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', msg: '', type: 'success' });
  const [itemToDelete, setItemToDelete] = useState(null);
  const [loading, setLoading] = useState(true);
  const insets = useSafeAreaInsets();

  // 🔥 10GB = 10240 MB 🔥
  const STORAGE_LIMIT_MB = 10240; 

  useFocusEffect(useCallback(() => { loadDownloads(); }, []));

  // 🔥 මෙතන Path එක Update කළා 🔥
  const getSecurePath = (itemId) => `${secureStoragePath}/f_${itemId}.mp4`;

  const loadDownloads = async () => {
    try {
      setLoading(true);
      const res = await AsyncStorage.getItem('my_downloads');
      const items = res ? JSON.parse(res) : [];
      let totalSize = 0;
      const validItems = [];
      
      for (let item of items) {
        // අලුත් path එක හරි පරණ (storage එකේ සේව් වෙලා තියෙන) path එක හරි ගන්නවා
        const securePath = item.localPath || getSecurePath(item.id); 
        
        if (await RNFS.exists(securePath)) {
          const stats = await RNFS.stat(securePath);
          const sizeMB = parseInt(stats.size) / (1024 * 1024);
          // Only treat as valid downloaded video if size > 1MB
          if (sizeMB > 1) {
            totalSize += sizeMB;
            validItems.push({
              ...item,
              localPath: securePath,
              size: sizeMB.toFixed(1),
              quality: item.quality || item.resolution || null
            });
          }
        }
      }
      
      if (validItems.length !== items.length) await AsyncStorage.setItem('my_downloads', JSON.stringify(validItems));
      setRecordings(validItems.reverse());
      setTotalStorageUsed(totalSize);
    } catch (e) {} finally { setLoading(false); }
  };

  const confirmDelete = (item) => {
    setItemToDelete(item);
    setAlertConfig({ title: 'Delete Video', msg: 'Are you sure you want to delete this downloaded video?', type: 'error' });
    setAlertVisible(true);
  };

  const handleDelete = async () => {
    if (!itemToDelete) return;
    try {
      if (await RNFS.exists(itemToDelete.localPath)) await RNFS.unlink(itemToDelete.localPath);
      const res = await AsyncStorage.getItem('my_downloads');
      const items = res ? JSON.parse(res) : [];
      await AsyncStorage.setItem('my_downloads', JSON.stringify(items.filter(i => String(i.id) !== String(itemToDelete.id))));
      
      // 🔥 Signal other screens that this video has been deleted
      DeviceEventEmitter.emit('DOWNLOAD_DELETED', { itemId: itemToDelete.id });

      setAlertVisible(false); setItemToDelete(null); loadDownloads();
    } catch (e) { 
        setAlertConfig({ title: 'Error', msg: 'Deletion failed.', type: 'error' }); 
        setAlertVisible(true); 
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={true} />
      <CustomAlert isVisible={alertVisible} title={alertConfig.title} message={alertConfig.msg} type={alertConfig.type} onClose={itemToDelete ? handleDelete : () => setAlertVisible(false)} />
      
      <LinearGradient colors={[COLORS.primary, '#9B1B1B']} style={[styles.redHeader, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Icon name="arrow-left" size={24} color="white" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>My Downloads</Text>
            <Text style={styles.subHeaderText}>Watch your encrypted recordings offline</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.storageBox}>
        <View style={styles.storageHeader}>
            <View style={{flexDirection: 'row', alignItems: 'center'}}>
                <View style={styles.storageIconBox}>
                    <Icon name="database-check" size={20} color={COLORS.primary} />
                </View>
                <Text style={styles.storageLabel}>App Storage Usage</Text>
            </View>
            <Text style={styles.storageValue}>
              {totalStorageUsed.toFixed(1)} MB / {(STORAGE_LIMIT_MB / 1024).toFixed(0)} GB
            </Text>
        </View>
        <View style={styles.progressBarContainer}>
            <View style={[styles.progressBar, { width: `${Math.min((totalStorageUsed / STORAGE_LIMIT_MB) * 100, 100)}%` }]} />
        </View>
        <Text style={styles.storageFooterText}>Videos are securely stored and cannot be shared externally.</Text>
      </View>

      {loading ? <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 50 }} /> : (
        <FlatList 
          data={recordings} 
          keyExtractor={(item) => item.id.toString()} 
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
                <View style={styles.emptyIconBox}>
                    <Icon name="cloud-download-outline" size={60} color="#D1D5DB" />
                </View>
                <Text style={styles.emptyTitle}>No Downloads</Text>
                <Text style={styles.emptyText}>You haven't downloaded any videos yet. Go to a course to save videos offline.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.itemCard}>
              <TouchableOpacity activeOpacity={0.8} onPress={() => setSelectedVideo(item.localPath)}>
                  <LinearGradient colors={[COLORS.primary, '#E65100']} style={styles.playBox}>
                      <Icon name="play" size={32} color="white" />
                  </LinearGradient>
              </TouchableOpacity>
              
              <View style={styles.itemDetails}>
                <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
                <View style={styles.metaRow}>
                    {item.quality && (
                        <View style={[
                            styles.metaBadge,
                            {
                                backgroundColor: item.quality === '1080p' ? '#EFF6FF' : item.quality === '720p' ? '#ECFDF5' : '#FEF3C7',
                                borderWidth: 1,
                                borderColor: item.quality === '1080p' ? '#BFDBFE' : item.quality === '720p' ? '#A7F3D0' : '#FDE68A'
                            }
                        ]}>
                            <Icon
                                name={item.quality === '1080p' ? 'star-circle-outline' : item.quality === '720p' ? 'high-definition' : 'video-outline'}
                                size={12}
                                color={item.quality === '1080p' ? '#2563EB' : item.quality === '720p' ? '#059669' : '#D97706'}
                                style={{ marginRight: 3 }}
                            />
                            <Text style={[
                                styles.metaBadgeText,
                                { color: item.quality === '1080p' ? '#1D4ED8' : item.quality === '720p' ? '#047857' : '#B45309' }
                            ]}>
                                {item.quality}
                            </Text>
                        </View>
                    )}
                    <View style={styles.metaBadge}>
                        <Icon name="folder-zip-outline" size={12} color="#4B5563" style={{marginRight: 4}} />
                        <Text style={styles.metaBadgeText}>{item.size} MB</Text>
                    </View>
                    {item.date && (
                        <View style={styles.metaDateBox}>
                            <Icon name="calendar-month-outline" size={12} color="#9CA3AF" style={{marginRight: 4}}/>
                            <Text style={styles.metaText}>{item.date}</Text>
                        </View>
                    )}
                </View>
              </View>
              
              <TouchableOpacity onPress={() => confirmDelete(item)} style={styles.deleteBtn}>
                <Icon name="trash-can-outline" size={24} color="#EF4444" />
              </TouchableOpacity>
            </View>
          )} 
        />
      )}

      <Modal visible={!!selectedVideo} animationType="slide" onRequestClose={() => setSelectedVideo(null)}>
        <View style={styles.playerWrapper}>
            <View style={[styles.playerHeader, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
                <TouchableOpacity style={styles.closePlayerBtn} onPress={() => setSelectedVideo(null)}>
                    <Icon name="chevron-down" size={30} color="white" />
                </TouchableOpacity>
                <Text style={styles.playerHeaderText}>Offline Player</Text>
            </View>
            
            {selectedVideo && (
                <Video
                    source={{ uri: Platform.OS === 'ios' ? selectedVideo : `file://${selectedVideo}` }}
                    style={styles.fullScreenVideo}
                    controls={true}        
                    resizeMode="contain"    
                    paused={false}          
                    onEnd={() => setSelectedVideo(null)}  
                />
            )}
        </View>
      </Modal>
      <GlobalDownloadWidget />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  
  redHeader: { paddingHorizontal: 25, paddingBottom: 40, borderBottomLeftRadius: 35, borderBottomRightRadius: 35, elevation: 10, shadowColor: COLORS.primary, shadowOffset: {width: 0, height: 6}, shadowOpacity: 0.4, shadowRadius: 12, zIndex: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  backBtn: { marginRight: 15, padding: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12 }, 
  headerTitle: { fontSize: 26, fontWeight: '900', color: 'white', letterSpacing: 0.5 },
  subHeaderText: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 4, fontWeight: '600' },
  
  storageBox: { backgroundColor: 'white', padding: 22, marginHorizontal: 20, marginTop: -25, borderRadius: 24, elevation: 6, shadowColor: '#000', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.1, shadowRadius: 8, zIndex: 20, marginBottom: 25, borderWidth: 1, borderColor: '#F3F4F6' },
  storageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  storageIconBox: { backgroundColor: '#FEF2F2', padding: 6, borderRadius: 10, marginRight: 10 },
  storageLabel: { fontSize: 15, fontWeight: '900', color: '#1F2937' },
  storageValue: { fontSize: 12, fontWeight: '900', color: COLORS.primary, backgroundColor: '#FEF2F2', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, overflow: 'hidden' },
  progressBarContainer: { height: 12, backgroundColor: '#E5E7EB', borderRadius: 6, overflow: 'hidden' },
  progressBar: { height: '100%', backgroundColor: COLORS.primary, borderRadius: 6 },
  storageFooterText: { fontSize: 10, color: '#9CA3AF', marginTop: 12, fontWeight: '600', textAlign: 'center' },
  
  itemCard: { flexDirection: 'row', backgroundColor: 'white', padding: 16, marginBottom: 15, borderRadius: 24, alignItems: 'center', elevation: 3, shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.05, shadowRadius: 5, borderWidth: 1, borderColor: '#F9FAFB' },
  playBox: { width: 65, height: 65, borderRadius: 18, justifyContent: 'center', alignItems: 'center', shadowColor: COLORS.primary, shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.3, shadowRadius: 6, elevation: 5 },
  itemDetails: { flex: 1, marginLeft: 16, marginRight: 10 },
  itemTitle: { fontSize: 16, fontWeight: '800', color: '#111827', marginBottom: 8, lineHeight: 22 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  metaBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  metaBadgeText: { fontSize: 11, fontWeight: '800', color: '#4B5563' },
  metaDateBox: { flexDirection: 'row', alignItems: 'center' },
  metaText: { fontSize: 12, color: '#6B7280', fontWeight: '700' },
  deleteBtn: { padding: 12, backgroundColor: '#FEF2F2', borderRadius: 16, borderWidth: 1, borderColor: '#FEE2E2' },
  
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyIconBox: { width: 110, height: 110, borderRadius: 55, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center', marginBottom: 20, elevation: 2, shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.05, shadowRadius: 5 },
  emptyTitle: { fontSize: 22, fontWeight: '900', color: '#1F2937', marginBottom: 10 }, 
  emptyText: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22, fontWeight: '600', paddingHorizontal: 30 },

  playerWrapper: { flex: 1, backgroundColor: 'black' },
  playerHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  closePlayerBtn: { backgroundColor: 'rgba(255,255,255,0.2)', padding: 6, borderRadius: 14, marginRight: 15 },
  playerHeaderText: { color: 'white', fontSize: 18, fontWeight: '900', letterSpacing: 0.5 },
  fullScreenVideo: { flex: 1, width: width }
});

export default DownloadsScreen;