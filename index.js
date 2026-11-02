import 'react-native-url-polyfill/auto';
import { AppRegistry } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from '@notifee/react-native';
import App from './App';
import { name as appName } from './app.json';

// 🔥 Background & Killed App Message Handler
messaging().setBackgroundMessageHandler(async remoteMessage => {
  console.log('[Background FCM] Message Received:', remoteMessage);

  if (remoteMessage.data?.type === 'INCOMING_CALL') {
    const callerName = remoteMessage.data.leadName || remoteMessage.data.from || 'Student';
    const callerPhone = remoteMessage.data.from || '';
    const biz = remoteMessage.data.businessType || 'IMA Campus';

    try {
      await notifee.createChannel({
        id: 'calls_channel',
        name: 'Incoming WhatsApp Calls',
        importance: AndroidImportance.HIGH,
        sound: 'default',
        vibration: true
      });

      await notifee.displayNotification({
        title: `📞 WhatsApp Call: ${callerName}`,
        body: `Incoming call from ${callerPhone} (${biz}). Tap to answer!`,
        android: {
          channelId: 'calls_channel',
          sound: 'default',
          importance: AndroidImportance.HIGH,
          color: '#25D366',
          smallIcon: 'ic_launcher',
          pressAction: {
            id: 'default',
            launchActivity: 'default'
          },
          actions: [
            {
              title: 'Answer',
              pressAction: {
                id: 'answer_call',
                launchActivity: 'default'
              }
            }
          ]
        }
      });
    } catch (err) {
      console.log('[Background FCM] Error displaying call notification:', err);
    }
  }
});

AppRegistry.registerComponent('main', () => App);