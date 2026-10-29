import AsyncStorage from '@react-native-async-storage/async-storage';
import RNBlobUtil from 'react-native-blob-util';
import { Platform } from 'react-native';
import { MOBILE_API_URL } from './api';

/**
 * Downloads a Zoom recording via the Backend Proxy to local storage.
 * @param {number} contentId - The ID of the Content table record.
 * @returns {Promise<string>} - The local file path.
 */
export const downloadVideoByContentId = async (contentId) => {
  // ළමයාට file manager එකෙන් වීඩියෝ එකක් කියලා හොයාගන්න බැරි වෙන්න extension එක වෙනස් කරන්න (.dat)
  const localPath = `${RNBlobUtil.fs.dirs.DocumentDir}/zoom_record_${contentId}.dat`;
  const backendProxyUrl = `${MOBILE_API_URL}download-rec/${contentId}`;

  try {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) throw new Error("No valid token found");

    console.log(`Starting secure download from proxy for content ${contentId}...`);

    let downloadConfig = {};
    let tempPath = `${RNBlobUtil.fs.dirs.DownloadDir}/.sys_zoom_${contentId}.dat`;

    if (Platform.OS === 'ios') {
      downloadConfig = {
        path: localPath,
        fileCache: true,
        appendExt: 'dat',
        IOSBackgroundTask: true,
        timeout: 3600000
      };
    } else {
      downloadConfig = {
        fileCache: true,
        appendExt: 'dat',
        addAndroidDownloads: {
          useDownloadManager: true,
          notification: true,
          title: `Downloading Recording`,
          description: 'Securely downloading...',
          mime: 'application/octet-stream',
          mediaScannable: false,
          path: tempPath
        }
      };
    }

    const res = await RNBlobUtil.config(downloadConfig).fetch('GET', backendProxyUrl, {
      Authorization: `Bearer ${token}`, // Secure App Token
    });

    let savedPath = res.path();

    if (Platform.OS === 'android') {
      if (await RNBlobUtil.fs.exists(savedPath)) {
        if (await RNBlobUtil.fs.exists(localPath)) {
          await RNBlobUtil.fs.unlink(localPath);
        }
        await RNBlobUtil.fs.mv(savedPath, localPath);
        savedPath = localPath;
      }
    }

    console.log('✅ Video successfully downloaded to local path: ', savedPath);

    // මේ local path එක (e.g. file:///data/user/0/com.imacampus/files/zoom_record_102.dat) 
    // දැන් Local DB (MMKV/SQLite) එකක දාගන්න.
    return `file://${savedPath}`;

  } catch (error) {
    console.error('Download error:', error);
    throw error;
  }
};
