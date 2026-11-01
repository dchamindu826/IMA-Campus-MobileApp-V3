import React, { useState, useEffect, useContext, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar,
  Image, Modal, FlatList, Dimensions, RefreshControl,
  AppState, Linking, Animated, Platform
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import COLORS from '../constants/colors';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LottieView from 'lottie-react-native';

import api, { IMAGE_URL } from '../services/api';
import { AuthContext } from '../context/AuthContext';
import moment from 'moment';
import CustomAlert from '../components/CustomAlert';
import messaging from '@react-native-firebase/messaging';
import UpgradeOfferWidget from '../components/UpgradeOfferWidget';

const { width } = Dimensions.get('window');

const CARD_MARGIN = 15;
const CARD_WIDTH = width - 40;
const SNAP_INTERVAL = CARD_WIDTH + CARD_MARGIN;

const HomeScreen = ({ navigation }) => {
  const { userInfo, userToken, logout } = useContext(AuthContext);
  const insets = useSafeAreaInsets();
  const [greeting, setGreeting] = useState('');

  const [posts, setPosts] = useState([]);
  const [stats, setStats] = useState({ unlockedVideos: 0, studyMaterials: 0 });
  const [enrolledCount, setEnrolledCount] = useState(0);
  const [alerts, setAlerts] = useState([]);
  const [duePayments, setDuePayments] = useState([]);

  const [recentCourses, setRecentCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const flatListRef = useRef(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedPost, setSelectedPost] = useState(null);
  const [showChatSelection, setShowChatSelection] = useState(false);

  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', msg: '', type: 'success' });

  const [activeAnimation, setActiveAnimation] = useState('none');

  const showAlert = (title, msg, type) => {
    setAlertConfig({ title, msg, type });
    setAlertVisible(true);
  };

  const appState = useRef(AppState.currentState);
  const [appStateVisible, setAppStateVisible] = useState(appState.current);

  const checkInactivityAndLogTime = async () => {
    try {
      const lastActiveStr = await AsyncStorage.getItem('last_active_time');
      const now = Date.now();

      if (lastActiveStr) {
        const lastActive = parseInt(lastActiveStr);
        const diffHours = (now - lastActive) / (1000 * 60 * 60);

        if (diffHours > 48) {
          console.log("User inactive for more than 2 days. Logging out...");
          await AsyncStorage.removeItem('last_active_time');
          await logout();
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
          return;
        }
      }
      await AsyncStorage.setItem('last_active_time', now.toString());
    } catch (e) {
      console.log("Inactivity check error", e);
    }
  };

  useEffect(() => {
    checkInactivityAndLogTime();

    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        checkInactivityAndLogTime();
        loadData();
      }
      appState.current = nextAppState;
      setAppStateVisible(appState.current);
    });
    return () => { subscription.remove(); };
  }, []);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good Morning');
    else if (hour < 18) setGreeting('Good Afternoon');
    else setGreeting('Good Evening');

    loadData();
    loadAppEvent();
  }, [userToken]);

  const loadAppEvent = async () => {
    try {
      const res = await api.get('/mobile/app-event');
      setActiveAnimation(res.data.activeEvent || 'none');
    } catch (e) { console.log("Error loading app event", e); }
  };

  useFocusEffect(useCallback(() => { loadRecentCourses(); }, [userInfo]));

  const loadRecentCourses = async () => {
    try {
      const res = await api.get('/mobile/businesses');
      if (res.data && res.data.businesses) {
        setRecentCourses(res.data.businesses.slice(0, 3));
      }
    } catch (e) { console.log("Error loading recent courses", e); }
  };

  useEffect(() => {
    if (posts.length > 1) {
      const interval = setInterval(() => {
        let nextSlide = currentSlide + 1;
        if (nextSlide >= posts.length) nextSlide = 0;

        if (flatListRef.current) {
          flatListRef.current.scrollToOffset({ offset: nextSlide * SNAP_INTERVAL, animated: true });
          setCurrentSlide(nextSlide);
        }
      }, 4000);
      return () => clearInterval(interval);
    }
  }, [currentSlide, posts]);

  useEffect(() => {
    const subscribeToClassTopics = async () => {
      try {
        if (!userToken) return;

        const res = await api.get('/mobile/my-payments', {
          headers: { Authorization: `Bearer ${userToken}` }
        });

        if (res.data && res.data.history) {
          const payments = res.data.history;
          const businessIds = [...new Set(payments.map(p => p.businessId).filter(Boolean))];
          const batchIds = [...new Set(payments.map(p => p.batchId).filter(Boolean))];

          let courseIds = [];
          payments.forEach(p => {
            if (p.subjects) {
              try {
                const parsed = JSON.parse(p.subjects);
                if (Array.isArray(parsed)) {
                  courseIds.push(...parsed.map(id => parseInt(id)));
                }
              } catch (e) { }
            }
          });
          courseIds = [...new Set(courseIds.filter(Boolean))];

          if (Platform.OS === 'ios') {
            const apnsToken = await messaging().getAPNSToken().catch(() => null);
            if (!apnsToken) {
              console.log('Skipping FCM Topic Subscription on iOS Simulator');
              return;
            }
          }

          businessIds.forEach(id => messaging().subscribeToTopic(`business_${id}`).catch(() => {}));
          batchIds.forEach(id => messaging().subscribeToTopic(`batch_${id}`).catch(() => {}));
          courseIds.forEach(id => messaging().subscribeToTopic(`course_${id}`).catch(() => {}));

          console.log('✅ Successfully Subscribed to FCM Topics -> Businesses:', businessIds, '| Batches:', batchIds, '| Courses:', courseIds);
        }
      } catch (error) {
        console.log("FCM Topic Subscription Error:", error);
      }
    };

    subscribeToClassTopics();
  }, [userToken]);

  const loadData = async () => {
    try {
      if (!userToken) { setLoading(false); return; }
      const response = await api.get('/student/dashboard', { headers: { Authorization: `Bearer ${userToken}` } });
      const data = response.data;
      if (data) {
        if (data.posts && Array.isArray(data.posts)) setPosts(data.posts);
        if (data.stats) setStats(data.stats);
        if (data.enrolledCount) setEnrolledCount(data.enrolledCount);
        if (data.alerts) setAlerts(data.alerts);
        if (data.duePayments) setDuePayments(data.duePayments);
      }
    } catch (error) {
      console.log("❌ Error calling Dashboard API:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
    loadRecentCourses();
    loadAppEvent();
  };

  const quickActions = [
    { id: 1, name: 'My Courses', icon: 'book-education', color: '#FEF2F2', iconColor: COLORS.primary, targetTab: 'My Courses', desc: 'View learning materials' },
    { id: 3, name: 'Payments', icon: 'credit-card-outline', color: '#FEF2F2', iconColor: COLORS.primary, targetTab: 'Payments', desc: 'Manage your fees' },
    { id: 4, name: 'Lumi Chat', icon: 'headphones', color: '#F0F9FF', iconColor: '#0EA5E9', targetTab: 'SupportChat', desc: 'LUMI Chat Support' },
    { id: 5, name: 'Delivery', icon: 'truck-delivery-outline', color: '#FEF2F2', iconColor: COLORS.primary, targetTab: 'Delivery', desc: 'Track materials' },
    { id: 6, name: 'Leaderboard', icon: 'trophy-variant-outline', color: '#FFFBEB', iconColor: '#D97706', targetTab: 'Leaderboard', desc: 'Rankings & Analytics' },
    { id: 7, name: 'YT Player', icon: 'youtube', color: '#FEF2F2', iconColor: '#EF4444', targetTab: 'YTPlayerTest', desc: 'Test video player' }
  ];

  const renderTextWithLinks = (text) => {
    if (!text) return null;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);

    return (
      <Text style={styles.detailBody}>
        {parts.map((part, index) => {
          if (part.match(urlRegex)) {
            return (
              <Text
                key={index}
                style={{ color: COLORS.primary, textDecorationLine: 'underline', fontWeight: 'bold' }}
                onPress={() => Linking.openURL(part).catch(err => console.error("Couldn't load page", err))}
              >
                {part}
              </Text>
            );
          }
          return <Text key={index}>{part}</Text>;
        })}
      </Text>
    );
  };

  const AnimatedActionBanner = ({ item, index, onPress }) => {
    const scale = useRef(new Animated.Value(1)).current;
    const glow = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 400),
          Animated.timing(glow, {
            toValue: 1,
            duration: 800,
            useNativeDriver: false,
          }),
          Animated.timing(glow, {
            toValue: 0,
            duration: 800,
            useNativeDriver: false,
          })
        ])
      ).start();
    }, []);

    const borderColor = glow.interpolate({
      inputRange: [0, 1],
      outputRange: ['#FEE2E2', item.iconColor]
    });

    const shadowOpacity = glow.interpolate({
      inputRange: [0, 1],
      outputRange: [0.1, 0.4]
    });

    const handlePressIn = () => {
      Animated.spring(scale, {
        toValue: 0.92,
        useNativeDriver: false,
      }).start();
    };

    const handlePressOut = () => {
      Animated.spring(scale, {
        toValue: 1,
        friction: 3,
        tension: 40,
        useNativeDriver: false,
      }).start();
    };

    return (
      <Animated.View style={[styles.actionBanner, { transform: [{ scale }], borderColor, shadowColor: item.iconColor, shadowOpacity }]}>
        <TouchableOpacity
          style={{ width: '100%', alignItems: 'center' }}
          activeOpacity={0.8}
          onPress={onPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
        >
          <View style={[styles.iconBox, { backgroundColor: item.color }]}>
            <Icon name={item.icon} size={26} color={item.iconColor} />
          </View>
          <View style={styles.actionTextContainer}>
            <Text style={styles.actionText} numberOfLines={1}>{item.name}</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };


  const renderCarouselItem = ({ item }) => {
    let imgUri = null;
    if (item.image) {
      imgUri = item.image.startsWith('http') ? item.image : `${IMAGE_URL}posts/${item.image}`;
    }
    const description = item.caption || item.description || item.body || "";

    return (
      <TouchableOpacity
        key={item.id ? item.id.toString() : Math.random().toString()}
        style={styles.carouselCard}
        activeOpacity={0.9}
        onPress={() => { setSelectedPost(item); setModalVisible(true); }}
      >
        {imgUri ? (
          <Image source={{ uri: imgUri }} style={styles.carouselImage} resizeMode="cover" />
        ) : (
          <View style={styles.carouselIcon}><Icon name="bullhorn-variant-outline" size={24} color="#FFF" /></View>
        )}

        <View style={styles.carouselTextContainer}>
          <Text style={styles.carouselTitle} numberOfLines={1}>{item.title || "Notice"}</Text>
          <Text style={styles.carouselBody} numberOfLines={2}>{description}</Text>
          <Text style={styles.carouselTime}>{item.created_at ? moment(item.created_at).fromNow() : ''}</Text>
        </View>
        <Icon name="chevron-right" size={24} color="#CCC" />
      </TouchableOpacity>
    );
  };

  const profileImageUri = userInfo?.image && userInfo.image !== 'default.png' && userInfo.image !== 'null'
    ? `${IMAGE_URL}images/${userInfo.image}`
    : null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      <CustomAlert isVisible={alertVisible} title={alertConfig.title} message={alertConfig.msg} type={alertConfig.type} onClose={() => setAlertVisible(false)} />

      <LinearGradient colors={[COLORS.primary, '#9A0007']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <Icon name="school" size={150} color="rgba(255,255,255,0.06)" style={{ position: 'absolute', right: -30, top: -20, transform: [{ rotate: '-15deg' }] }} />
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
            {profileImageUri ? (
              <Image
                source={{ uri: profileImageUri }}
                style={{ width: 65, height: 65, borderRadius: 25, borderWidth: 2, borderColor: 'white' }}
              />
            ) : (
              <Icon name="account-circle-outline" size={50} color="white" />
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.bellButton} onPress={() => setModalVisible(true)}>
            <Icon name="bell-outline" size={28} color="white" />
            {(posts.length > 0 || alerts.length > 0) && <View style={styles.badge} />}
          </TouchableOpacity>
        </View>

        <View style={styles.logoContainer}>
          <Image source={require('../assets/logo_white.png')} style={styles.mainLogo} resizeMode="contain" />
        </View>

        {/* --- NEW BOTTOM ROW FOR WELCOME & ANIMATION --- */}
        <View style={styles.headerBottomRow}>
          <View style={styles.welcomeContainer}>
            <Text style={styles.greetingText}>{greeting},</Text>
            <Text style={styles.usernameText}>
              {userInfo?.firstName ? `${userInfo.firstName} ${userInfo.lastName || ''}` : 'Student'}
            </Text>
          </View>

          <View style={styles.animationContainer}>
            {activeAnimation && activeAnimation !== 'none' ? (
              <LottieView
                source={
                  activeAnimation === 'vesak' ? require('../assets/animations/vesak.json') :
                    activeAnimation === 'poya' ? require('../assets/animations/poya.json') :
                      activeAnimation === 'christmas' ? require('../assets/animations/christmas.json') :
                        activeAnimation === 'new_year' ? require('../assets/animations/new_year.json') : null
                }
                autoPlay
                loop
                style={{ width: 90, height: 90 }}
                resizeMode="contain"
              />
            ) : null}
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
      >
        <Text style={styles.sectionTitle}>Quick Access</Text>
        <View style={styles.gridContainer}>
          {quickActions.map((item, index) => (
            <AnimatedActionBanner
              key={item.id.toString()}
              item={item}
              index={index}
              onPress={() => {
                if (item.action === 'chat') {
                  setShowChatSelection(true);
                } else if (item.nav === 'coming_soon') {
                  showAlert('Coming Soon!', 'This feature will be available in the next update.', 'warning');
                } else if (item.targetTab === 'SupportChat') {
                  navigation.navigate('SupportChat');
                } else if (item.targetTab === 'Delivery') {
                  navigation.navigate('Delivery');
                } else if (item.targetTab === 'Leaderboard') {
                  navigation.navigate('Leaderboard');
                } else if (item.targetTab === 'YTPlayerTest') {
                  const nav = navigation.getParent ? (navigation.getParent() || navigation) : navigation;
                  nav.navigate('YTPlayerTest');
                } else if (item.targetTab === 'YTDebug') {
                  const nav = navigation.getParent ? (navigation.getParent() || navigation) : navigation;
                  nav.navigate('YTDebug');
                } else if (item.targetTab) {
                  navigation.navigate('MainTabs', { screen: item.targetTab });
                }
              }}
            />
          ))}
        </View>

        {enrolledCount > 0 && <UpgradeOfferWidget navigation={navigation} />}

        {loading ? (
          <View style={styles.carouselCard}>
            <View style={[styles.carouselImage, { backgroundColor: '#E0E0E0' }]} />
            <View style={styles.carouselTextContainer}>
              <View style={{ width: '50%', height: 16, backgroundColor: '#E0E0E0', borderRadius: 4, marginBottom: 8 }} />
              <View style={{ width: '90%', height: 12, backgroundColor: '#E0E0E0', borderRadius: 4, marginBottom: 5 }} />
              <View style={{ width: '70%', height: 12, backgroundColor: '#E0E0E0', borderRadius: 4 }} />
            </View>
          </View>
        ) : posts.length > 0 ? (
          <View>
            <FlatList
              ref={flatListRef}
              data={posts}
              renderItem={renderCarouselItem}
              keyExtractor={(item, index) => item.id ? item.id.toString() : index.toString()}
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={SNAP_INTERVAL}
              decelerationRate="fast"
              pagingEnabled={false}
              contentContainerStyle={{ paddingVertical: 15, paddingHorizontal: 20 }}
              onMomentumScrollEnd={(event) => {
                const index = Math.round(event.nativeEvent.contentOffset.x / SNAP_INTERVAL);
                setCurrentSlide(index);
              }}
            />
            <View style={styles.dotContainer}>
              {posts.map((_, index) => (
                <View key={index} style={[styles.dot, currentSlide === index ? styles.activeDot : null]} />
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.carouselCard}>
            <View style={[styles.carouselIcon, { backgroundColor: '#ccc' }]}>
              <Icon name="information-variant" size={24} color="#FFF" />
            </View>
            <View style={styles.carouselTextContainer}>
              <Text style={styles.carouselTitle}>No New Notices</Text>
              <Text style={styles.carouselBody}>Check back later for updates.</Text>
            </View>
          </View>
        )}

        <View style={{ marginTop: 10 }}>
          <Text style={styles.sectionTitle}>Recent Courses</Text>

          {recentCourses.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingLeft: 20, paddingRight: 5, paddingBottom: 30 }}
            >
              {recentCourses.map((business, idx) => {
                return (
                  <TouchableOpacity
                    key={business.id}
                    activeOpacity={0.8}
                    onPress={() => navigation.navigate('MainTabs', { screen: 'Courses' })}
                  >
                    <View style={styles.compactWhiteCard}>
                      <Image
                        source={{ uri: business.logo && business.logo !== 'default.png' ? `${IMAGE_URL}icons/${business.logo}` : 'https://ui-avatars.com/api/?name=' + business.name }}
                        style={styles.compactWhiteCardLogo}
                        resizeMode="contain"
                      />
                      <Text style={styles.compactWhiteCardName} numberOfLines={2}>{business.name}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : (
            <View style={styles.emptyRecentBox}>
              <View style={styles.emptyRecentIcon}>
                <Icon name="history" size={30} color="#9CA3AF" />
              </View>
              <Text style={styles.emptyRecentTitle}>No recent courses</Text>
              <Text style={styles.emptyRecentSub}>Your enrolled courses will appear here.</Text>
            </View>
          )}
        </View>

      </ScrollView>

      {/* MODAL CODE */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => { setModalVisible(false); setSelectedPost(null); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Notifications</Text>
              <TouchableOpacity onPress={() => { setModalVisible(false); setSelectedPost(null); }}>
                <Icon name="close-circle" size={30} color="#666" />
              </TouchableOpacity>
            </View>

            {selectedPost ? (
              <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
                {selectedPost.image ? (
                  <Image
                    source={{ uri: `${IMAGE_URL}posts/${selectedPost.image}` }}
                    style={styles.detailImage}
                    resizeMode="cover"
                  />
                ) : null}
                <Text style={styles.detailTitle}>{selectedPost.title || "Notice"}</Text>
                <Text style={styles.detailTime}>{selectedPost.created_at ? moment(selectedPost.created_at).format('MMMM Do YYYY, h:mm a') : ''}</Text>

                {renderTextWithLinks(selectedPost.caption || selectedPost.description || selectedPost.body)}

                <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedPost(null)}>
                  <Text style={{ color: 'white', fontWeight: 'bold' }}>Back to List</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : (
              <FlatList
                data={posts}
                keyExtractor={(item, index) => item.id ? item.id.toString() : index.toString()}
                contentContainerStyle={{ paddingBottom: 20 }}
                ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 50, color: '#999' }}>No notifications available.</Text>}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.notifItem} onPress={() => setSelectedPost(item)}>
                    {item.image ? (
                      <Image source={{ uri: `${IMAGE_URL}posts/${item.image}` }} style={styles.notifImage} resizeMode="cover" />
                    ) : (
                      <View style={styles.notifIconBox}><Icon name="bell-ring" size={20} color="white" /></View>
                    )}
                    <View style={{ flex: 1, paddingLeft: 12 }}>
                      <Text style={styles.notifTitle} numberOfLines={2}>{item.title || "Notice"}</Text>
                      <Text style={styles.notifBody} numberOfLines={1}>{item.caption || item.description || item.body}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                        <Icon name="clock-outline" size={12} color="#999" />
                        <Text style={styles.notifTime}> {item.created_at ? moment(item.created_at).fromNow() : ''}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* CHAT SELECTION MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showChatSelection}
        onRequestClose={() => setShowChatSelection(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { height: '50%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Community Chats</Text>
              <TouchableOpacity onPress={() => setShowChatSelection(false)}>
                <Icon name="close-circle" size={30} color="#666" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
              {recentCourses.length > 0 ? recentCourses.map(b => (
                <TouchableOpacity
                  key={b.id}
                  style={styles.notifItem}
                  onPress={() => {
                    setShowChatSelection(false);
                    navigation.navigate('CommunityChat', { businessId: b.id, businessName: b.name });
                  }}
                >
                  <View style={[styles.notifIconBox, { backgroundColor: '#E8F5E9' }]}>
                    <Icon name="chat" size={24} color="#4CAF50" />
                  </View>
                  <View style={{ flex: 1, paddingLeft: 12 }}>
                    <Text style={styles.notifTitle}>{b.name} Community</Text>
                    <Text style={styles.notifBody}>Join the conversation</Text>
                  </View>
                  <Icon name="chevron-right" size={24} color="#ccc" />
                </TouchableOpacity>
              )) : (
                <Text style={{ textAlign: 'center', marginTop: 30, color: '#999' }}>You are not enrolled in any active courses.</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FB', width: '100%' },
  header: { width: '100%', paddingBottom: 22, paddingHorizontal: 25, borderBottomLeftRadius: 35, borderBottomRightRadius: 35, borderTopLeftRadius: 0, borderTopRightRadius: 0, elevation: 10, overflow: 'hidden' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bellButton: { width: 45, height: 45, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  badge: { position: 'absolute', top: 12, right: 12, width: 8, height: 8, backgroundColor: '#FFD700', borderRadius: 4, borderWidth: 2, borderColor: COLORS.primary },
  logoContainer: { alignItems: 'center', marginTop: 10, marginBottom: 10, width: width - 50, alignSelf: 'center' },
  mainLogo: { width: '100%', height: 76 },

  /* NEW STYLES FOR HEADER BOTTOM ROW */
  headerBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8 },
  welcomeContainer: { flex: 1, alignItems: 'flex-start' },
  greetingText: { color: '#E0E0E0', fontSize: 14, fontWeight: '500' },
  usernameText: { color: 'white', fontSize: 24, fontWeight: 'bold', letterSpacing: 0.5 },
  animationContainer: { width: 90, height: 90, justifyContent: 'flex-end', alignItems: 'flex-end' },
  /* -------------------------------- */

  contentContainer: { flex: 1, paddingHorizontal: 0, marginTop: 18 },
  sectionTitle: { fontSize: 19, fontWeight: '800', color: '#1A1A1A', marginBottom: 15, paddingHorizontal: 20 },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 25, paddingHorizontal: 20 },
  actionBanner: { width: '31%', backgroundColor: 'white', borderRadius: 16, padding: 12, flexDirection: 'column', alignItems: 'center', marginBottom: 12, elevation: 3, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, borderWidth: 1, borderColor: '#FEE2E2' },
  iconBox: { width: 45, height: 45, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  actionTextContainer: { alignItems: 'center', width: '100%' },
  actionText: { fontSize: 11, fontWeight: '800', color: '#1A1A1A', textAlign: 'center' },
  carouselCard: { width: CARD_WIDTH, marginRight: CARD_MARGIN, backgroundColor: 'white', borderRadius: 20, padding: 15, flexDirection: 'row', alignItems: 'center', marginBottom: 0, elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3.84 },
  carouselIcon: { width: 55, height: 55, borderRadius: 12, backgroundColor: '#FF9100', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  carouselImage: { width: 60, height: 60, borderRadius: 12, marginRight: 15, backgroundColor: '#eee' },
  carouselTextContainer: { flex: 1, paddingRight: 10 },
  carouselTitle: { fontWeight: 'bold', color: '#333', fontSize: 16, marginBottom: 4 },
  carouselBody: { color: '#666', fontSize: 13, marginBottom: 4 },
  carouselTime: { color: COLORS.primary, fontSize: 11, fontWeight: '600' },
  dotContainer: { flexDirection: 'row', justifyContent: 'center', marginBottom: 25, marginTop: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#DDD', marginHorizontal: 4 },
  activeDot: { backgroundColor: COLORS.primary, width: 20 },

  compactWhiteCard: { width: 120, height: 140, backgroundColor: 'white', borderRadius: 18, marginRight: 15, padding: 12, alignItems: 'center', justifyContent: 'center', elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, borderWidth: 1, borderColor: '#f0f0f0' },
  compactWhiteCardLogo: { width: 80, height: 65, marginBottom: 12 },
  compactWhiteCardName: { color: '#333', fontSize: 12, fontWeight: '800', textAlign: 'center', lineHeight: 16 },

  emptyRecentBox: { backgroundColor: '#FFFFFF', marginHorizontal: 20, padding: 25, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E5E7EB', borderStyle: 'dashed', marginBottom: 30 },
  emptyRecentIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  emptyRecentTitle: { color: '#374151', fontSize: 16, fontWeight: 'bold' },
  emptyRecentSub: { color: '#9CA3AF', fontSize: 13, marginTop: 4, textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#F0F0F0', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20, height: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#ddd' },
  modalTitle: { fontSize: 22, fontWeight: 'bold', color: '#333' },
  notifItem: { flexDirection: 'row', backgroundColor: 'white', padding: 12, borderRadius: 15, marginBottom: 12, alignItems: 'center', elevation: 2 },
  notifImage: { width: 70, height: 50, borderRadius: 8, backgroundColor: '#eee' },
  notifIconBox: { width: 50, height: 50, borderRadius: 8, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  notifTitle: { fontWeight: 'bold', color: '#333', fontSize: 14, marginBottom: 2 },
  notifBody: { color: '#666', fontSize: 12 },
  notifTime: { color: '#888', fontSize: 11 },
  detailImage: { width: '100%', height: 200, borderRadius: 15, marginBottom: 15 },
  detailTitle: { fontSize: 20, fontWeight: 'bold', color: '#333', marginBottom: 8 },
  detailTime: { fontSize: 12, color: '#888', marginBottom: 15 },
  detailBody: { fontSize: 15, color: '#444', lineHeight: 22 },
  backBtn: { marginTop: 30, backgroundColor: COLORS.primary, padding: 12, borderRadius: 10, alignItems: 'center' }
});

export default HomeScreen;