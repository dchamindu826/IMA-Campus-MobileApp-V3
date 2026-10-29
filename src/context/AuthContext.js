import React, { createContext, useState, useEffect } from 'react';
import { AppState, Alert } from 'react-native'; // 🔥 AppState සහ Alert අලුතින් import කළා
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api'; 

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  
  const [userToken, setUserToken] = useState(null);
  const [userInfo, setUserInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStoredData();
  }, []);

  // 🔥 AUTO LOGOUT LOGIC
  useEffect(() => {
    const handleAppStateChange = async (nextAppState) => {
      if (nextAppState === 'active') {
        const lastActiveTime = await AsyncStorage.getItem('lastActiveTime');
        const currentTime = new Date().getTime();

        if (lastActiveTime) {
          const timeDiff = currentTime - parseInt(lastActiveTime);
          const daysDiff = timeDiff / (1000 * 60 * 60 * 24);

          // දින 5 ට වඩා වැඩිනම්
          if (daysDiff > 5) { 
            await logout(); 
            Alert.alert("Session Expired", "ඔබගේ ආරක්ෂාව සඳහා කරුණාකර නැවත Login වන්න.");
          }
        }
        // අලුත් වෙලාව Save කරගන්නවා
        await AsyncStorage.setItem('lastActiveTime', currentTime.toString());
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => { subscription.remove(); };
  }, []);

  useEffect(() => {
    const interceptor = api.interceptors.request.use(
      async (config) => {
        if (userToken) {
          config.headers.Authorization = `Bearer ${userToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );
    return () => api.interceptors.request.eject(interceptor);
  }, [userToken]);

  const loadStoredData = async () => {
    try {
      setIsLoading(true);
      const token = await AsyncStorage.getItem('userToken');
      const user = await AsyncStorage.getItem('userInfo');
      if (token && user) {
        setUserToken(token);
        setUserInfo(JSON.parse(user));
      }
    } catch (e) {
      console.log("Storage load error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (token, user) => {
    setUserToken(token);
    setUserInfo(user);
    await AsyncStorage.setItem('userToken', token);
    await AsyncStorage.setItem('userInfo', JSON.stringify(user));
    await AsyncStorage.setItem('lastActiveTime', new Date().getTime().toString()); // Login වෙද්දිත් වෙලාව සේව් කරනවා
  };

  const logout = async () => {
    setUserToken(null);
    setUserInfo(null);
    await AsyncStorage.removeItem('userToken');
    await AsyncStorage.removeItem('userInfo');
    await AsyncStorage.removeItem('lastActiveTime'); // Logout වෙද්දි වෙලාව මකනවා
  };

  const updateUserInfo = async (newUserMap) => {
    const updatedUser = { ...userInfo, ...newUserMap };
    setUserInfo(updatedUser);
    await AsyncStorage.setItem('userInfo', JSON.stringify(updatedUser));
  };

  return (
    <AuthContext.Provider value={{ login, logout, updateUserInfo, userToken, userInfo, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};