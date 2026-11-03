import 'react-native-url-polyfill/auto';
import { AppRegistry, Platform } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from '@notifee/react-native';
import VoipPushNotification from 'react-native-voip-push-notification';
import RNCallKeep from 'react-native-callkeep';
import App from './App';
import { name as appName } from './app.json';

// 🔥 iOS Background & Killed App VoIP PushKit Handler
if (Platform.OS === 'ios') {
  VoipPushNotification.addEventListener('notification', async (notification) => {
    console.log('[VoIP Push] PushKit notification received while background/killed:', notification);
    const uuid = notification.callId || notification.uuid || 'call_' + Date.now();
    const callerName = notification.leadName || notification.callerName || 'Student';
    const callerHandle = notification.from || notification.handle || 'WhatsApp Call';

    try {
      RNCallKeep.displayIncomingCall(
        uuid,
        callerHandle,
        callerName,
        'generic',
        false
      );
    } catch (err) {
      console.log('[VoIP Push] Error displaying native CallKit UI:', err);
    }

    // Tell iOS completion
    VoipPushNotification.onVoipNotificationCompleted(uuid);
  });
}

// 🔥 Android Background & Killed App FCM Message Handler
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