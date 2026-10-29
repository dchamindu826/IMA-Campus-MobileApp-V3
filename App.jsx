import React, { useEffect, useContext, useState } from 'react';
import { StatusBar, ActivityIndicator, View, PermissionsAndroid, Platform, DeviceEventEmitter, Modal, Text, TouchableOpacity } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, AndroidStyle } from '@notifee/react-native'; 
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CourseProvider } from './src/context/CourseContext'; 
import { AuthProvider, AuthContext } from './src/context/AuthContext'; 
import { CallProvider } from './src/context/CallContext';
import GlobalCallPopup from './src/components/GlobalCallPopup';
import COLORS from './src/constants/colors';
import api from './src/services/api'; 

// Screens
import HomeScreen from './src/screens/HomeScreen';
import CoursesScreen from './src/screens/CoursesScreen';
import CourseDetailsScreen from './src/screens/CourseDetailsScreen';
import PaymentScreen from './src/screens/PaymentScreen'; 
import MyCoursesScreen from './src/screens/MyCoursesScreen';
import ProfileScreen from './src/screens/ProfileScreen'; 
import DownloadsScreen from './src/screens/DownloadsScreen';
import CourseContentScreen from './src/screens/CourseContentScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import LiveScreen from './src/screens/LiveScreen';
import PaymentMethodScreen from './src/screens/PaymentMethodScreen'; 
import StaffDashboardScreen from './src/screens/StaffDashboardScreen';
import CommunityChatScreen from './src/screens/CommunityChatScreen'; 
import SupportChatScreen from './src/screens/SupportChatScreen';
import DeliveryScreen from './src/screens/DeliveryScreen';
import MCQPaperScreen from './src/screens/MCQPaperScreen';
import LeaderboardScreen from './src/screens/LeaderboardScreen';
import YTPlayerTestScreen from './src/screens/YTPlayerTestScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function BottomTabNavigator() {
  const [hasMonthlyPayment, setHasMonthlyPayment] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('update_monthly_payment_badge', (hasPayment) => {
        setHasMonthlyPayment(hasPayment);
    });
    return () => sub.remove();
  }, []);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: '#6B7280', // Darker gray for better visibility
        tabBarShowLabel: true,
        tabBarStyle: { height: (Platform.OS === 'ios' ? 85 : 65) + Math.max(insets.bottom, 10), paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 25 : Math.max(insets.bottom, 10), backgroundColor: 'white', elevation: 20 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '800', marginBottom: 4 },
        tabBarIcon: ({ color, focused }) => {
          let iconName;
          let iconSize = focused ? 30 : 26;

          if (route.name === 'Home') iconName = 'home-variant';
          else if (route.name === 'Courses') iconName = 'book-open-page-variant';
          else if (route.name === 'Live') iconName = 'video-wireless';
          else if (route.name === 'My Courses') iconName = 'play-box-multiple';
          else if (route.name === 'Payments') iconName = 'wallet';

          return (
            <View>
              <Icon name={iconName} color={color} size={iconSize} />
              {route.name === 'Payments' && hasMonthlyPayment && (
                <View style={{ position: 'absolute', top: -2, right: -4, width: 12, height: 12, backgroundColor: '#EF4444', borderRadius: 6, borderWidth: 2, borderColor: 'white' }} />
              )}
            </View>
          );
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Courses" component={CoursesScreen} />
      <Tab.Screen name="Live" component={LiveScreen} />
      <Tab.Screen name="My Courses" component={MyCoursesScreen} />
      <Tab.Screen name="Payments" component={PaymentScreen} /> 
    </Tab.Navigator>
  );
}

const AppNavigation = () => {
  const { userToken, userInfo, isLoading, setUserToken, setUserInfo, logout } = useContext(AuthContext);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // 🔥 AUTO LOGOUT & POLLING LOGIC 🔥
  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener('force_logout', () => {
        setShowLogoutModal(true); 
    });

    let interval;
    if (userToken) {
        interval = setInterval(async () => {
            try {
                await api.get('mobile/dashboard'); 
            } catch (error) {
                // Interceptor eken handle wei
            }
        }, 5000); 
    }

    return () => {
        subscription.remove();
        if (interval) clearInterval(interval);
    };
  }, [userToken]);

  const handleForceLogout = async () => {
      setShowLogoutModal(false);
      
      try {
          if (logout) {
              await logout(); // AuthContext එකේ logout function එක තියෙනවා නම් ඒක වැඩ කරයි
          } else {
              // Logout function එක නැත්නම්, මේකෙන් ඔක්කොම මකලා දානවා
              await AsyncStorage.multiRemove(['userToken', 'userInfo', 'last_active_time']);
              if (setUserToken) setUserToken(null); 
              if (setUserInfo) setUserInfo(null);
          }
      } catch (e) {
          console.log("Error during force logout: ", e);
      }
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'white' }}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {userToken == null ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
            <Stack.Screen name="YTPlayerTest" component={YTPlayerTestScreen} options={{ headerShown: false }} />
          </>
        ) : (
          <>
            {userInfo && userInfo.role && String(userInfo.role).toUpperCase() !== 'STUDENT' && String(userInfo.role).toUpperCase() !== 'USER' ? (
                <Stack.Screen 
                    name="StaffDashboard" 
                    component={StaffDashboardScreen} 
                    options={{ headerShown: false }} 
                />
            ) : (
                <Stack.Screen 
                    name="MainTabs" 
                    component={BottomTabNavigator} 
                    options={{ headerShown: false, animation: 'none' }} 
                />
            )}
            <Stack.Screen name="CommunityChat" component={CommunityChatScreen} options={{ headerShown: false }} />
            <Stack.Screen name="SupportChat" component={SupportChatScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Downloads" component={DownloadsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: true, title: 'Profile' }} />
            <Stack.Screen name="CourseDetails" component={CourseDetailsScreen} options={{ headerShown: true, title: 'Enroll Course' }} />
            <Stack.Screen name="PaymentScreen" component={PaymentScreen} />
            <Stack.Screen name="CourseContent" component={CourseContentScreen} />
            <Stack.Screen name="PaymentMethod" component={PaymentMethodScreen} options={{ title: 'Select Payment Method' }} />
            <Stack.Screen name="Delivery" component={DeliveryScreen} options={{ headerShown: false }} />
            <Stack.Screen name="MCQPaper" component={MCQPaperScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Leaderboard" component={LeaderboardScreen} options={{ headerShown: false }} />
            <Stack.Screen name="YTPlayerTest" component={YTPlayerTestScreen} options={{ headerShown: false }} />
          </>
        )}
      </Stack.Navigator>

      {/* 🔥 සිංහල + English ලස්සන POPUP එක 🔥 */}
      <Modal visible={showLogoutModal} transparent={true} animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <View style={{ backgroundColor: 'white', borderRadius: 20, width: '100%', overflow: 'hidden', elevation: 10 }}>
                <View style={{ backgroundColor: COLORS.primary, padding: 20, alignItems: 'center' }}>
                    <Icon name="shield-alert-outline" size={50} color="white" />
                    <Text style={{ color: 'white', fontSize: 20, fontWeight: 'bold', marginTop: 10, textAlign: 'center' }}>Session Expired</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '600', marginTop: 2, textAlign: 'center' }}>සැසිය අවසන් විය</Text>
                </View>
                <View style={{ padding: 24, alignItems: 'center' }}>
                    <Text style={{ fontSize: 16, color: '#333', textAlign: 'center', marginBottom: 5, fontWeight: '700' }}>
                        You have logged in from another device.
                    </Text>
                    <Text style={{ fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 25, lineHeight: 22 }}>
                        ඔබ වෙනත් උපාංගයකින් හෝ බ්‍රව්සරයකින් ගිණුමට ඇතුළු වී ඇත. කරුණාකර නැවත ලොග් වන්න.
                    </Text>
                    
                    <TouchableOpacity
                        onPress={handleForceLogout}
                        style={{ backgroundColor: COLORS.primary, paddingVertical: 14, paddingHorizontal: 30, borderRadius: 12, width: '100%', alignItems: 'center', elevation: 2 }}
                    >
                        <Text style={{ color: 'white', fontWeight: '900', fontSize: 15, letterSpacing: 0.5 }}>LOGIN AGAIN</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
      </Modal>
    </>
  );
};

export default function App() {
  useEffect(() => {
    // 🔥 IN-APP UPDATES CHECK (Android Only) 🔥
    if (Platform.OS === 'android') {
      try {
        const SpInAppUpdates = require('sp-react-native-in-app-updates').default;
        const { IAUUpdateKind } = require('sp-react-native-in-app-updates');
        const inAppUpdates = new SpInAppUpdates(false);
        inAppUpdates.checkNeedsUpdate().then((result) => {
          if (result && result.shouldUpdate) {
            inAppUpdates.startUpdate({
              updateType: IAUUpdateKind.IMMEDIATE,
            });
          }
        }).catch(err => console.log("In-App Update Check Failed:", err));
      } catch (err) {
        console.log("In-app updates module not loaded:", err);
      }
    }

    const setupNotifications = async () => {
      try {
        if (Platform.OS === 'android' && Platform.Version >= 33) {
          await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        }

        const authStatus = await messaging().requestPermission();
        const enabled =
          authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
          authStatus === messaging.AuthorizationStatus.PROVISIONAL;

        if (enabled) {
          console.log('Authorization status:', authStatus);
        }

        await notifee.createChannel({
          id: 'default', 
          name: 'General Updates',
          importance: AndroidImportance.HIGH, 
          sound: 'default',
        });

        await messaging().subscribeToTopic('ima_updates');
        console.log('Subscribed to ima_updates topic');
      } catch (error) {
        console.log('Notification Setup Error:', error);
      }
    };

    const timerId = setTimeout(() => {
      setupNotifications();
    }, 1000);

    const unsubscribe = messaging().onMessage(async remoteMessage => {
      console.log('Foreground Message Full:', JSON.stringify(remoteMessage, null, 2));

      const notifImage = remoteMessage.notification?.android?.imageUrl;
      const dataImage = remoteMessage.data?.image_url;
      const imageUrl = notifImage || dataImage;
      
      const fullBody = remoteMessage.notification?.body || 'New Notification';
      const truncatedBody = fullBody.length > 40 
          ? fullBody.substring(0, 40) + '... (Pull down 👇)' 
          : fullBody;

      let notificationConfig = {
        title: remoteMessage.notification?.title || 'IMA Campus',
        body: imageUrl ? truncatedBody : fullBody,
        android: {
          channelId: 'default',
          smallIcon: 'ic_launcher', 
          largeIcon: 'ic_launcher', 
          color: COLORS.primary,
          pressAction: {
            id: 'default',
          },
        },
      };

      if (imageUrl) {
        notificationConfig.android.largeIcon = imageUrl;
        notificationConfig.android.style = {
          type: AndroidStyle.BIGPICTURE,
          picture: imageUrl,
          summary: fullBody,
        };
      } else {
        notificationConfig.android.style = {
            type: AndroidStyle.BIGTEXT,
            text: fullBody
        };
      }

      await notifee.displayNotification(notificationConfig);
    });

    return () => {
      clearTimeout(timerId); 
      unsubscribe();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <CallProvider>
          <CourseProvider>
            <NavigationContainer>
              <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
              <AppNavigation />
              <GlobalCallPopup />
            </NavigationContainer>
          </CourseProvider>
        </CallProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}