import 'react-native-url-polyfill/auto';
import { AppRegistry, Platform } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, AndroidCategory, EventType } from '@notifee/react-native';
import VoipPushNotification from 'react-native-voip-push-notification';
import RNCallKeep from 'react-native-callkeep';
import App from './App';
import { name as appName } from './app.json';

// 🔥 iOS Background & Killed App VoIP PushKit Handler
if (Platform.OS === 'ios') {
  try {
    if (VoipPushNotification && typeof VoipPushNotification.addEventListener === 'function') {
      VoipPushNotification.addEventListener('notification', async (notification) => {
        console.log('[VoIP Push] PushKit notification received while background/killed:', notification);
        const uuid = notification?.callId || notification?.uuid || 'call_' + Date.now();
        const callerName = notification?.leadName || notification?.callerName || 'Student';
        const callerHandle = notification?.from || notification?.handle || 'WhatsApp Call';

        try {
          if (RNCallKeep && typeof RNCallKeep.displayIncomingCall === 'function') {
            RNCallKeep.displayIncomingCall(
              uuid,
              callerHandle,
              callerName,
              'generic',
              false
            );
          }
        } catch (err) {
          console.log('[VoIP Push] Error displaying native CallKit UI:', err);
        }

        // Tell iOS completion
        try {
          VoipPushNotification.onVoipNotificationCompleted(uuid);
        } catch (compErr) {
          console.log('[VoIP Push] Completion error:', compErr);
        }
      });
    }
  } catch (err) {
    console.log('[VoIP Push] Registration error:', err);
  }
}

// 🔥 Android Background & Killed App FCM Message Handler
if (Platform.OS === 'android') {
  try {
    messaging().setBackgroundMessageHandler(async remoteMessage => {
      console.log('[Background FCM] Message Received:', remoteMessage);

      if (remoteMessage.data?.type === 'INCOMING_CALL') {
        const callerName = remoteMessage.data.leadName || remoteMessage.data.from || 'Student';
        const callerPhone = remoteMessage.data.from || '';
        const biz = remoteMessage.data.businessType || 'IMA Campus';
        const rawCallId = remoteMessage.data.callId || 'call_' + Date.now();

        // 1. Native Telecom incoming call UI via CallKeep (Self-managed)
        try {
          if (RNCallKeep && typeof RNCallKeep.displayIncomingCall === 'function') {
            RNCallKeep.displayIncomingCall(
              rawCallId,
              callerPhone,
              callerName,
              'generic',
              false
            );
          }
        } catch (callKeepErr) {
          console.log('[Background FCM] RNCallKeep displayIncomingCall error:', callKeepErr);
        }

        // 2. WhatsApp-style Heads-up banner with continuous ringtone & action buttons
        try {
          await notifee.createChannel({
            id: 'calls_channel',
            name: 'Incoming WhatsApp Calls',
            importance: AndroidImportance.HIGH,
            sound: 'default',
            vibration: true,
            vibrationPattern: [300, 500, 300, 500]
          });

          await notifee.displayNotification({
            id: 'incoming_call_' + rawCallId,
            title: `📞 WhatsApp Call: ${callerName}`,
            body: `Incoming call from ${callerPhone} (${biz}). Tap to answer!`,
            data: {
              callId: rawCallId,
              from: callerPhone,
              leadName: callerName,
              businessType: biz
            },
            android: {
              channelId: 'calls_channel',
              sound: 'default',
              loopSound: true,
              importance: AndroidImportance.HIGH,
              category: AndroidCategory.CALL,
              color: '#25D366',
              smallIcon: 'ic_launcher',
              ongoing: true,
              autoCancel: false,
              fullScreenAction: {
                id: 'default',
                launchActivity: 'default'
              },
              pressAction: {
                id: 'default',
                launchActivity: 'default'
              },
              actions: [
                {
                  title: 'Decline',
                  pressAction: {
                    id: 'decline_call'
                  }
                },
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

    // Handle background notification action taps (Answer / Decline)
    notifee.onBackgroundEvent(async ({ type, detail }) => {
      const { notification, pressAction } = detail;
      if (type === EventType.ACTION_PRESS) {
        if (pressAction?.id === 'decline_call') {
          try {
            if (RNCallKeep && typeof RNCallKeep.endCall === 'function') {
              const callId = notification?.data?.callId;
              if (callId) RNCallKeep.endCall(callId);
            }
          } catch (e) {}
          if (notification?.id) {
            await notifee.cancelNotification(notification.id);
          }
        } else if (pressAction?.id === 'answer_call') {
          if (notification?.id) {
            await notifee.cancelNotification(notification.id);
          }
        }
      }
    });
  } catch (err) {
    console.log('[Background FCM] Registration error:', err);
  }
}

AppRegistry.registerComponent('main', () => App);