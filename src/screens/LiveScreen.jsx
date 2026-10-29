import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Animated, Alert, Linking, StatusBar, Image, ActivityIndicator } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import notifee, { TriggerType, AndroidImportance, AndroidStyle } from '@notifee/react-native';
import ReactNativeBlobUtil from 'react-native-blob-util';
import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api, { IMAGE_URL } from '../services/api';
import COLORS from '../constants/colors';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);

const parseDateTime = (dateStr, timeStr) => {
  if (!dateStr || !timeStr) return NaN;
  const cleanDate = dateStr.split('T')[0];
  const [year, month, day] = cleanDate.split('-').map(Number);

  let hours = 0, minutes = 0;
  const timeMatch = timeStr.trim().match(/(\d+):(\d+)\s*(AM|PM)?/i);

  if (timeMatch) {
    hours = parseInt(timeMatch[1], 10);
    minutes = parseInt(timeMatch[2], 10);
    const ampm = timeMatch[3]?.toUpperCase();

    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
  }
  return new Date(year, month - 1, day, hours, minutes, 0).getTime();
};

const BlinkingButton = ({ onPress, disabled, isPending }) => {
  const scaleValue = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let animation;
    if (!disabled && !isPending) {
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(scaleValue, { toValue: 1.05, duration: 800, useNativeDriver: true }),
          Animated.timing(scaleValue, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      );
      animation.start();
    } else {
      scaleValue.setValue(1);
    }
    return () => animation && animation.stop();
  }, [disabled, isPending]);

  return (
    <AnimatedTouchableOpacity
      style={[
        styles.joinBtn,
        (disabled || isPending) && styles.disabledBtn,
        { transform: [{ scale: scaleValue }] }
      ]}
      onPress={() => {
        if (isPending) {
          Alert.alert("Payment Pending", "ඔබගේ ගෙවීම තවමත් තහවුරු කර නොමැත. කරුණාකර රැඳී සිටින්න.");
        } else if (!disabled) {
          onPress();
        }
      }}
      activeOpacity={0.8}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {!disabled && !isPending && <Icon name="video" size={24} color="white" style={{ marginRight: 8 }} />}
        {(disabled || isPending) && <Icon name="lock-outline" size={20} color="#9CA3AF" style={{ marginRight: 8 }} />}
        <Text style={(disabled || isPending) ? styles.disabledBtnText : styles.joinBtnText}>
          {isPending ? "PAYMENT PENDING" : disabled ? "NOT STARTED YET" : "JOIN LIVE NOW"}
        </Text>
      </View>
    </AnimatedTouchableOpacity>
  );
};

const CountdownTimer = ({ dateStr, startStr, endStr, onStatusChange }) => {
  const [timeLeft, setTimeLeft] = useState("");
  const lastStatus = useRef("");

  useEffect(() => {
    const calculateTime = () => {
      const now = Date.now();
      const start = parseDateTime(dateStr, startStr);
      const end = parseDateTime(dateStr, endStr);

      if (isNaN(start) || isNaN(end)) {
        setTimeLeft("Invalid Time");
        return;
      }

      let currentStatus = "NOT_STARTED";

      if (now >= start && now <= end) {
        currentStatus = "LIVE";
        setTimeLeft("LIVE");
      } else if (now > end) {
        currentStatus = "ENDED";
        setTimeLeft("ENDED");
      } else {
        currentStatus = "NOT_STARTED";
        const diff = start - now;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      }

      if (lastStatus.current !== currentStatus) {
        lastStatus.current = currentStatus;
        onStatusChange(currentStatus);
      }
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [dateStr, startStr, endStr]);

  if (timeLeft === "LIVE") {
    return (
      <View style={styles.liveBadgeContainer}>
        <Icon name="access-point" size={22} color="#FFFFFF" />
        <Text style={styles.liveTextAnim}>HAPPENING NOW</Text>
      </View>
    );
  }

  if (timeLeft === "ENDED") {
    return (
      <View style={styles.endedBadgeContainer}>
        <Icon name="close-circle-outline" size={20} color="#9CA3AF" />
        <Text style={styles.endedText}>Class Ended</Text>
      </View>
    );
  }

  return (
    <View style={styles.timerContainer}>
      <Icon name="timer-outline" size={24} color="#DC2626" />
      <Text style={styles.timerLabel}>Starts in:</Text>
      <View style={styles.timeValueBox}>
        <Text style={styles.timerValue}>{timeLeft}</Text>
      </View>
    </View>
  );
};

const LiveClassCard = ({ item, openLink }) => {
  const [classStatus, setClassStatus] = useState("NOT_STARTED");
  const isPending = item.paidStatus == -1 || item.status == -1 || item.paymentStatus == -1;

  // 🔥 Auto-erase ended classes 🔥
  if (classStatus === "ENDED") return null;

  // 🔥 THUMBNAIL LOGIC (API LINK FIX) 🔥
  let imgUri = null;

  if (item.image && item.image !== 'default.png' && item.image !== 'null' && item.image !== '') {
    imgUri = item.image.startsWith('http') ? item.image : `https://imacampus.online/api/storage/documents/${item.image}`;
  }

  return (
    <View style={styles.card}>
      {/* 🔥 LANDSCAPE THUMBNAIL WITH LOGO FALLBACK 🔥 */}
      {imgUri ? (
        <Image source={{ uri: imgUri }} style={styles.landscapeImage} resizeMode="cover" />
      ) : (
        <View style={[styles.landscapeImage, { backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' }]}>
          <Image source={{ uri: 'https://imacampus.online/logo.png' }} style={{ width: 100, height: 100, opacity: 0.15 }} resizeMode="contain" />
        </View>
      )}

      <View style={{ padding: 24 }}>
        <View style={styles.headerRow}>
          <Text style={styles.courseName}>{item.courseName || "Class"}</Text>
          <View style={styles.dateBadge}>
            <Text style={styles.dateText}>{item.date}</Text>
          </View>
        </View>

        <Text style={styles.title}>{item.title}</Text>

        <View style={styles.timeRangeContainer}>
          <Icon name="clock-outline" size={16} color="#6B7280" />
          <Text style={styles.timeRange}>{item.startTime} - {item.endTime}</Text>
        </View>

        <CountdownTimer
          dateStr={item.date}
          startStr={item.startTime}
          endStr={item.endTime}
          onStatusChange={(status) => setClassStatus(status)}
        />

        <View style={styles.actionRowContainer}>
          <View style={{ flex: 1 }}>
            {classStatus === "LIVE" && (
              <BlinkingButton onPress={() => openLink(item.link)} disabled={false} isPending={isPending} />
            )}

            {classStatus === "NOT_STARTED" && (
              <BlinkingButton onPress={() => { }} disabled={true} isPending={isPending} />
            )}

            {/* 🔥 DOWNLOAD BUTTON එක සහ WATCH RECORDING BUTTON එක සම්පූර්ණයෙන්ම අයින් කළා. ENDED වුණාම මුකුත් පේන්නේ නෑ 🔥 */}
          </View>
        </View>
      </View>
    </View>
  );
};

const LiveScreen = () => {
  const [lives, setLives] = useState([]);
  const [loading, setLoading] = useState(true);
  const insets = useSafeAreaInsets();

  useFocusEffect(useCallback(() => { fetchLives(); }, []));


  const scheduleNotifications = async (classes) => {
    try {
      await notifee.requestPermission();
      await notifee.createChannel({ id: 'live_reminders', name: 'Live Class Reminders', importance: AndroidImportance.HIGH, sound: 'default' });

      const scheduledIds = await notifee.getTriggerNotificationIds();
      const now = Date.now();

      for (const item of classes) {
        const classDateTime = parseDateTime(item.date, item.startTime);
        if (isNaN(classDateTime)) continue;

        const notifyTime = classDateTime - (15 * 60 * 1000); // 15 mins before

        if (notifyTime > now) {
          const notifId = `live_${item.id}`;
          if (!scheduledIds.includes(notifId)) {
            await notifee.createTriggerNotification(
              {
                id: notifId,
                title: 'Live Class Starting Soon! 🔴',
                body: `${item.title || item.name || 'Your class'} will start in 15 minutes. Get ready!`,
                android: { channelId: 'live_reminders', pressAction: { id: 'default' } }
              },
              { type: TriggerType.TIMESTAMP, timestamp: notifyTime }
            );
          }
        }
      }
    } catch (error) { console.error("Notification Error:", error); }
  };

  const fetchLives = async () => {
    try {
      setLoading(true);
      const res = await api.get('mobile/classroom/lives').catch(() => ({ data: { liveClasses: [] } }));
      const fetchedLives = res.data.liveClasses || [];
      setLives(fetchedLives);
      if (fetchedLives.length > 0) {
        scheduleNotifications(fetchedLives);
      }
    } catch (error) {
      console.log("Fetch Lives Error:", error);
    } finally {
      setLoading(false);
    }
  };



  const openLink = async (link) => {
    if (!link) { Alert.alert("Please Wait", "The link has not been updated yet."); return; }
    try {
      let formattedLink = link.trim();
      if (!formattedLink.startsWith('http://') && !formattedLink.startsWith('https://')) formattedLink = 'https://' + formattedLink;
      await Linking.openURL(formattedLink);
    } catch (error) { Alert.alert("Error", "Could not open the link."); }
  };

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="transparent" barStyle="light-content" translucent={true} />

      <LinearGradient colors={['#9A0007', '#E53935']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.topHeader, { paddingTop: insets.top + 20, borderBottomLeftRadius: 35, borderBottomRightRadius: 35 }]}>
        <Text style={styles.headerTitle}>Upcoming Lives</Text>
        <Text style={styles.subHeader}>Your schedule for this week</Text>
      </LinearGradient>

      <FlatList
        data={lives.filter(item => {
          const end = parseDateTime(item.date, item.endTime);
          return isNaN(end) || Date.now() <= end;
        })}
        keyExtractor={(item, index) => item.id ? item.id.toString() : index.toString()}
        renderItem={({ item }) => <LiveClassCard item={item} openLink={openLink} />}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 50 }}
        refreshing={loading}
        onRefresh={fetchLives}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          !loading &&
          <View style={styles.emptyView}>
            <Icon name="calendar-blank-outline" size={70} color="#D1D5DB" />
            <Text style={styles.emptyText}>No upcoming classes</Text>
            <Text style={styles.emptySubText}>Check back later to see new schedules.</Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  topHeader: { paddingBottom: 30, paddingHorizontal: 20, backgroundColor: COLORS.primary, borderBottomLeftRadius: 35, borderBottomRightRadius: 35, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 15, elevation: 8, marginBottom: 20 },
  headerTitle: { fontSize: 28, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.5 },
  subHeader: { fontSize: 14, color: '#FECACA', marginTop: 5, fontWeight: '500' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 24, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 5, overflow: 'hidden' },
  landscapeImage: { width: '100%', height: 160, backgroundColor: '#F9FAFB' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  courseName: { fontSize: 14, color: COLORS.primary, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, flex: 1 },
  dateBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  dateText: { fontSize: 12, fontWeight: '800', color: '#B91C1C' },
  title: { fontSize: 15, fontWeight: '700', color: '#1F2937', marginBottom: 10, lineHeight: 30 },
  timeRangeContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  timeRange: { fontSize: 15, color: '#4B5563', fontWeight: '600', marginLeft: 8 },
  timerContainer: { flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', marginBottom: 25 },
  timerLabel: { color: '#6B7280', fontWeight: '700', marginLeft: 8, marginRight: 12, fontSize: 16 },
  timeValueBox: { backgroundColor: '#F3F4F6', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 10 },
  timerValue: { color: '#111827', fontWeight: '900', fontSize: 20, letterSpacing: 1 },
  liveBadgeContainer: { backgroundColor: COLORS.primary, paddingVertical: 12, borderRadius: 14, marginBottom: 20, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 3 },
  liveTextAnim: { color: '#FFFFFF', fontWeight: '900', fontSize: 16, marginLeft: 8, letterSpacing: 1 },
  endedBadgeContainer: { backgroundColor: '#F3F4F6', paddingVertical: 12, borderRadius: 14, marginBottom: 20, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  endedText: { color: '#9CA3AF', fontWeight: '800', fontSize: 15, marginLeft: 6 },
  actionRowContainer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  joinBtn: { backgroundColor: '#111827', paddingVertical: 18, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flex: 1 },
  disabledBtn: { backgroundColor: '#E5E7EB', shadowOpacity: 0, elevation: 0 },
  joinBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16, letterSpacing: 1 },
  disabledBtnText: { color: '#9CA3AF', fontWeight: '800', fontSize: 16 },
  fullDownloadBtn: { backgroundColor: '#FEF2F2', paddingVertical: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', borderWidth: 1, borderColor: '#FECACA' },
  fullDownloadBtnText: { color: COLORS.primary, fontWeight: '900', fontSize: 15, marginLeft: 10, letterSpacing: 0.5 },
  emptyView: { alignItems: 'center', marginTop: 80 },
  emptyText: { color: '#374151', fontSize: 22, fontWeight: '800', marginTop: 20 },
  emptySubText: { color: '#6B7280', fontSize: 16, marginTop: 10, textAlign: 'center' }
});

export default LiveScreen;