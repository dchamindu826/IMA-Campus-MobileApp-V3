import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native'; // 🔥 අලුතින් Import කරා

export const ROOT_API_URL = 'https://imacampus.online/api/';
export const MOBILE_API_URL = 'https://imacampus.online/api/mobile/';
export const IMAGE_URL = 'https://imacampus.online/storage/';

const api = axios.create({
  baseURL: ROOT_API_URL, 
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('userToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (config.url.startsWith('mobile/')) {
        config.baseURL = MOBILE_API_URL;
        config.url = config.url.replace('mobile/', ''); 
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// 🔥 Auto Logout Handler 🔥
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    if (error.response && error.response.status === 401) {
        console.warn("Logged in from another device! Auto logging out...");
        
        // 1. Storage එකෙන් මකනවා
        await AsyncStorage.removeItem('userToken');
        await AsyncStorage.removeItem('userInfo');
        
        // 2. 🔥 AuthContext එකට සිග්නල් එක යවනවා Logout වෙන්න කියලා
        DeviceEventEmitter.emit('force_logout', 'Session Expired');
    }
    return Promise.reject(error);
  }
);

export const loginUser = async (username, password) => {
  try {
    const response = await api.post('/auth/login', {
      phone: username, 
      password: password
    });
    return response.data; 
  } catch (error) {
    throw error;
  }
};

// 🔥 Verify Google Student ID Token
export const verifyGoogleStudent = async (idToken) => {
  try {
    const response = await api.post('mobile/verify-student', { idToken });
    return response.data;
  } catch (error) {
    throw error;
  }
};

// 🔥 Get Secure YouTube Video Stream URL (Bypass Bot Errors)
export const getSecureVideoStream = async (videoId) => {
  try {
    const response = await api.get(`student/getVideoStream/${videoId}`);
    return response.data;
  } catch (error) {
    console.error("Error fetching secure video stream:", error);
    return null;
  }
};

export default api;