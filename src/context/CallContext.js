import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { DeviceEventEmitter, Platform, NativeModules, AppState } from 'react-native';
import { io } from 'socket.io-client';
import api from '../services/api';
import { RTCPeerConnection, RTCSessionDescription, mediaDevices } from 'react-native-webrtc';
import Video from 'react-native-video';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, AndroidCategory, EventType } from '@notifee/react-native';
import VoipPushNotification from 'react-native-voip-push-notification';
import RNCallKeep from 'react-native-callkeep';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CryptoJS from 'crypto-js';
import { AuthContext } from './AuthContext';

export const CallContext = createContext();

export const useCall = () => useContext(CallContext);

export const toCallKitUUID = (rawString) => {
    if (!rawString || typeof rawString !== 'string') {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(rawString)) {
        return rawString.toLowerCase();
    }
    const hash = CryptoJS.SHA256(rawString).toString(CryptoJS.enc.Hex);
    const part1 = hash.substring(0, 8);
    const part2 = hash.substring(8, 12);
    const part3 = '4' + hash.substring(13, 16);
    const part4 = ((parseInt(hash.substring(16, 17), 16) & 0x3) | 0x8).toString(16) + hash.substring(17, 20);
    const part5 = hash.substring(20, 32);
    return `${part1}-${part2}-${part3}-${part4}-${part5}`.toLowerCase();
};

const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
];

export const saveCallLog = async (logEntry) => {
    try {
        const phone = logEntry?.phone || logEntry?.from;
        const cleanPhone = String(phone || '').replace(/[^0-9]/g, '');
        if (!cleanPhone) return;

        // Scope by businessId / businessType so each business has isolated call history
        const bizKey = String(logEntry?.businessId || logEntry?.businessType || 'general').trim().toLowerCase();
        const key = `@wa_call_history_${bizKey}_${cleanPhone}`;

        const existing = await AsyncStorage.getItem(key);
        const list = existing ? JSON.parse(existing) : [];
        const fullEntry = {
            id: 'call_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            type: 'CALL_EVENT',
            phone: cleanPhone,
            businessId: logEntry.businessId,
            businessType: logEntry.businessType,
            leadName: logEntry.leadName || 'Student',
            direction: logEntry.direction || (logEntry.isOutbound ? 'OUTBOUND' : 'INBOUND'),
            status: logEntry.status || 'COMPLETED',
            duration: logEntry.duration || 0,
            createdAt: logEntry.createdAt || new Date().toISOString()
        };
        list.unshift(fullEntry);
        await AsyncStorage.setItem(key, JSON.stringify(list.slice(0, 60)));
        DeviceEventEmitter.emit('new_call_history_event', fullEntry);
        return fullEntry;
    } catch (e) {
        console.log("Error saving call history:", e?.message);
    }
};

export const CallProvider = ({ children }) => {
    const { userToken, userInfo, updateUserInfo } = useContext(AuthContext);
    const [socket, setSocket] = useState(null);
    
    // Call States
    const [incomingCall, setIncomingCall] = useState(null);
    const [activeCall, setActiveCall] = useState(null); // { callId, from, leadName, businessId, businessType, status, isOutbound, isMuted, peerConnection, localStream, startTime }
    const [isRinging, setIsRinging] = useState(false);
    const [agentStatus, setAgentStatus] = useState('OFFLINE');
    const [isOnHold, setIsOnHold] = useState(false);
    const [isSpeakerOn, setIsSpeakerOn] = useState(false);
    const [isCallMinimized, setIsCallMinimized] = useState(false);

    const pcRef = useRef(null);
    const localStreamRef = useRef(null);
    const outboundRingingTimeoutRef = useRef(null);
    const incomingRingingTimeoutRef = useRef(null);
    const activeCallRef = useRef(null);
    const incomingCallRef = useRef(null);
    const callIdMapRef = useRef(new Map());
    const handleIncomingCallRef = useRef(null);

    const ensureCallNotificationChannel = async () => {
        if (Platform.OS !== 'android') return;
        try {
            await notifee.createChannel({
                id: 'calls_channel_v3',
                name: 'Incoming WhatsApp Calls',
                importance: AndroidImportance.HIGH,
                sound: 'ringtone',
                vibration: true,
                vibrationPattern: [300, 1000, 300, 1000, 300, 1000],
                bypassDnd: true,
            });
        } catch (e) {
            console.log('Mobile: Error creating call notification channel:', e?.message);
        }
    };

    const showIncomingCallNotification = async (data) => {
        if (Platform.OS !== 'android') return;
        try {
            await ensureCallNotificationChannel();
            const rawCallId = data?.callId || 'call_' + Date.now();
            const callerName = data?.leadName || data?.from || 'Student';
            const callerPhone = data?.from || '';
            const biz = data?.businessType || 'IMA Campus';

            await notifee.displayNotification({
                id: 'incoming_call_' + rawCallId,
                title: `📞 WhatsApp Call: ${callerName}`,
                body: `Incoming call from ${callerPhone} (${biz})`,
                data: {
                    callId: rawCallId,
                    from: callerPhone,
                    leadName: callerName,
                    businessType: biz,
                    sdp: data?.sdp || data?.offerSdp || ''
                },
                android: {
                    channelId: 'calls_channel_v3',
                    sound: 'ringtone',
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
            console.log('Mobile: Incoming call Notifee notification posted with looping ringtone.');
        } catch (err) {
            console.log('Mobile: Error displaying Notifee call notification:', err);
        }
    };

    const dismissCallNotification = async (rawCallId) => {
        if (Platform.OS !== 'android') return;
        try {
            if (rawCallId) {
                await notifee.cancelNotification('incoming_call_' + rawCallId).catch(() => {});
            }
            await notifee.cancelDisplayedNotifications().catch(() => {});
        } catch (e) {
            console.log('Mobile: Error canceling Notifee call notification:', e?.message);
        }
    };

    const registerCallKitMapping = (rawId) => {
        if (!rawId) return null;
        const callKitUuid = toCallKitUUID(rawId);
        callIdMapRef.current.set(callKitUuid.toLowerCase(), rawId);
        callIdMapRef.current.set(String(rawId).toLowerCase(), callKitUuid);
        return callKitUuid;
    };

    const getRealCallId = (uuidOrId) => {
        if (!uuidOrId) return uuidOrId;
        return callIdMapRef.current.get(String(uuidOrId).toLowerCase()) || uuidOrId;
    };

    useEffect(() => {
        activeCallRef.current = activeCall;
    }, [activeCall]);

    useEffect(() => {
        incomingCallRef.current = incomingCall;
    }, [incomingCall]);

    // Sync agent status from userInfo on mount
    useEffect(() => {
        if (userInfo?.agentStatus) {
            setAgentStatus(userInfo.agentStatus);
        }
    }, [userInfo?.agentStatus]);

    // Register FCM & Apple VoIP Tokens for Background / Killed Incoming Call notifications
    useEffect(() => {
        if (!userToken || !userInfo) return;
        const roleUpper = String(userInfo.role || '').toUpperCase();
        if (roleUpper === 'STUDENT' || roleUpper === 'USER') return;

        const registerDeviceToken = async () => {
            try {
                const fcmToken = await messaging().getToken();
                if (fcmToken) {
                    await api.post('/mobile/staff/fcm-token', { fcmToken }).catch(() => {});
                    console.log('Mobile: Staff FCM Token synced successfully with server.');
                }
            } catch (err) {
                console.log('Mobile: Error syncing FCM token:', err?.message);
            }

            // Register Apple VoIP Token on iOS
            if (Platform.OS === 'ios') {
                try {
                    const onVoipRegister = async (token) => {
                        console.log('Mobile: Staff iOS VoIP Push Token registered:', token);
                        if (token) {
                            await api.post('/mobile/staff/voip-token', { voipToken: token }).catch(() => {});
                        }
                    };
                    if (VoipPushNotification && typeof VoipPushNotification.addEventListener === 'function') {
                        VoipPushNotification.addEventListener('register', onVoipRegister);
                        if (typeof VoipPushNotification.registerVoipToken === 'function') {
                            VoipPushNotification.registerVoipToken();
                        }
                    }
                } catch (voipErr) {
                    console.log('Mobile: Error registering VoIP Push:', voipErr?.message);
                }
            }
        };

        const requestNotificationPermission = async () => {
            try {
                if (Platform.OS === 'android') {
                    await notifee.requestPermission().catch(() => {});
                    if (Platform.Version >= 33) {
                        const { PermissionsAndroid } = require('react-native');
                        await PermissionsAndroid.request(
                            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
                        ).catch(() => {});
                    }
                }
            } catch (e) {
                console.log('Mobile: Error requesting notification permission:', e?.message);
            }
        };
        requestNotificationPermission();

        registerDeviceToken();
        let unsubscribe = null;
        let unsubscribeMessage = null;
        try {
            unsubscribe = messaging().onTokenRefresh(async (newToken) => {
                try {
                    await api.post('/mobile/staff/fcm-token', { fcmToken: newToken }).catch(() => {});
                } catch (e) {}
            });
        } catch (tokErr) {
            console.log('Mobile: FCM onTokenRefresh registration skipped:', tokErr?.message);
        }

        try {
            unsubscribeMessage = messaging().onMessage(async (remoteMessage) => {
                console.log('Mobile: FCM message received while app active/recents:', remoteMessage);
                const type = String(remoteMessage.data?.type || '').toUpperCase();
                const hasCallData = type.includes('CALL') || !!remoteMessage.data?.callId || !!remoteMessage.data?.sdp || !!remoteMessage.data?.offerSdp;
                if (hasCallData) {
                    if (handleIncomingCallRef.current) {
                        const callData = {
                            callId: remoteMessage.data.callId || 'call_' + Date.now(),
                            from: remoteMessage.data.from || remoteMessage.data.phone || '',
                            leadName: remoteMessage.data.leadName || remoteMessage.data.callerName || remoteMessage.data.from || 'Student',
                            businessType: remoteMessage.data.businessType || 'IMA Campus',
                            businessId: remoteMessage.data.businessId,
                            receivingWaNumId: remoteMessage.data.receivingWaNumId,
                            sdp: remoteMessage.data.sdp || remoteMessage.data.offerSdp || ''
                        };
                        handleIncomingCallRef.current(callData);
                    }
                }
            });
        } catch (msgErr) {
            console.log('Mobile: FCM onMessage registration skipped:', msgErr?.message);
        }

        return () => {
            if (typeof unsubscribe === 'function') {
                try {
                    unsubscribe();
                } catch (e) {}
            }
            if (typeof unsubscribeMessage === 'function') {
                try {
                    unsubscribeMessage();
                } catch (e) {}
            }
            try {
                if (VoipPushNotification && typeof VoipPushNotification.removeEventListener === 'function') {
                    VoipPushNotification.removeEventListener('register');
                }
            } catch (e) {}
        };
    }, [userToken, userInfo]);

    // Setup CallKit (iOS) and ConnectionService (Android) via RNCallKeep
    useEffect(() => {
        const setupCallKeep = async () => {
            try {
                await RNCallKeep.setup({
                    ios: {
                        appName: 'IMA Campus',
                        imageName: 'ic_launcher',
                        supportsVideo: false,
                        maximumCallGroups: '1',
                        maximumCallsPerCallGroup: '1',
                        audioSession: {
                            mode: 'VoiceChat'
                        }
                    },
                    android: {
                        alertTitle: 'Permissions required',
                        alertDescription: 'This application needs to access your phone accounts',
                        cancelButton: 'Cancel',
                        okButton: 'OK',
                        imageName: 'ic_launcher',
                        additionalPermissions: [],
                        selfManaged: true
                    }
                });
                RNCallKeep.setAvailable(true);
            } catch (err) {
                console.log('Mobile: RNCallKeep setup error:', err?.message || err);
            }
        };

        setupCallKeep();

        const onAnswer = ({ callUUID }) => {
            console.log('Mobile: CallKeep native answerCall event for callUUID:', callUUID);
            const realCallId = getRealCallId(callUUID);
            const callKitUuid = registerCallKitMapping(realCallId);
            try {
                RNCallKeep.setCurrentCallActive(callKitUuid);
            } catch (e) {}
            if (activeCallRef.current && activeCallRef.current.callId === realCallId) {
                return;
            }
            const currentIncoming = incomingCallRef.current;
            answerCall(realCallId, currentIncoming?.sdp || currentIncoming?.offerSdp);
        };

        const onEnd = ({ callUUID }) => {
            console.log('Mobile: CallKeep native endCall event for callUUID:', callUUID);
            if (callUUID) {
                const realCallId = getRealCallId(callUUID);
                const curr = activeCallRef.current || incomingCallRef.current;
                if (curr && curr.callId && realCallId && String(curr.callId) !== String(realCallId)) {
                    console.log(`Mobile: Ignoring CallKeep endCall for non-matching callUUID: ${callUUID} (Current: ${curr.callId})`);
                    return;
                }
            }
            endCall();
        };

        const onMute = () => {
            toggleMute();
        };

        const onHold = ({ hold, callUUID }) => {
            console.log('Mobile: CallKeep native didToggleHoldAction event:', hold, callUUID);
            const curr = activeCallRef.current;
            if (curr) {
                const nextHold = Boolean(hold);
                setIsOnHold(nextHold);
                if (curr.localStream) {
                    try {
                        const tracks = curr.localStream.getAudioTracks();
                        tracks.forEach(t => { t.enabled = !nextHold; });
                    } catch (err) {}
                }
                if (socket && socket.connected && curr.callId) {
                    const holdPayload = {
                        callId: curr.callId,
                        onHold: nextHold,
                        businessType: curr.businessType,
                        receivingWaNumId: curr.receivingWaNumId,
                        leadPhone: curr.from
                    };
                    socket.emit('hold_wa_call', holdPayload);
                    socket.emit('whatsapp_call_hold', holdPayload);
                }
            }
        };

        const onActivateAudioSession = () => {
            console.log('Mobile: CallKeep native didActivateAudioSession event');
            try {
                if (NativeModules.WebRTCModule && typeof NativeModules.WebRTCModule.audioSessionDidActivate === 'function') {
                    NativeModules.WebRTCModule.audioSessionDidActivate();
                }
            } catch (e) {}
        };

        const onDeactivateAudioSession = () => {
            console.log('Mobile: CallKeep native didDeactivateAudioSession event');
            try {
                if (NativeModules.WebRTCModule && typeof NativeModules.WebRTCModule.audioSessionDidDeactivate === 'function') {
                    NativeModules.WebRTCModule.audioSessionDidDeactivate();
                }
            } catch (e) {}
        };

        const subAnswer = RNCallKeep.addEventListener('answerCall', onAnswer);
        const subEnd = RNCallKeep.addEventListener('endCall', onEnd);
        const subMute = RNCallKeep.addEventListener('didPerformSetMutedCallAction', onMute);
        const subHold = RNCallKeep.addEventListener('didToggleHoldCallAction', onHold);
        const subActivate = RNCallKeep.addEventListener('didActivateAudioSession', onActivateAudioSession);
        const subDeactivate = RNCallKeep.addEventListener('didDeactivateAudioSession', onDeactivateAudioSession);

        return () => {
            if (subAnswer && typeof subAnswer.remove === 'function') {
                try { subAnswer.remove(); } catch (e) {}
            } else {
                try { RNCallKeep.removeEventListener('answerCall'); } catch (e) {}
            }
            if (subEnd && typeof subEnd.remove === 'function') {
                try { subEnd.remove(); } catch (e) {}
            } else {
                try { RNCallKeep.removeEventListener('endCall'); } catch (e) {}
            }
            if (subMute && typeof subMute.remove === 'function') {
                try { subMute.remove(); } catch (e) {}
            } else {
                try { RNCallKeep.removeEventListener('didPerformSetMutedCallAction'); } catch (e) {}
            }
            if (subHold && typeof subHold.remove === 'function') {
                try { subHold.remove(); } catch (e) {}
            } else {
                try { RNCallKeep.removeEventListener('didToggleHoldCallAction'); } catch (e) {}
            }
            if (subActivate && typeof subActivate.remove === 'function') {
                try { subActivate.remove(); } catch (e) {}
            } else {
                try { RNCallKeep.removeEventListener('didActivateAudioSession'); } catch (e) {}
            }
            if (subDeactivate && typeof subDeactivate.remove === 'function') {
                try { subDeactivate.remove(); } catch (e) {}
            } else {
                try { RNCallKeep.removeEventListener('didDeactivateAudioSession'); } catch (e) {}
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Socket Initialization
    useEffect(() => {
        if (!userToken) {
            if (socket) {
                socket.disconnect();
                setSocket(null);
            }
            return;
        }

        const defaultSocketUrl = api.defaults.baseURL.replace('/api/', '').replace('/api', '');
        
        const newSocket = io(defaultSocketUrl, {
            auth: { token: userToken },
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1500
        });

        const syncPoolJoin = () => {
            if (!userInfo) return;
            const roleUpper = String(userInfo.role || '').toUpperCase();
            if (roleUpper === 'STUDENT' || roleUpper === 'USER') return;

            const currentStatus = agentStatus || userInfo.agentStatus || 'ACTIVE';
            if (currentStatus !== 'OFFLINE') {
                newSocket.emit('join_wa_agent_pool', { status: currentStatus });
                console.log(`Mobile: Socket emitted join_wa_agent_pool with status: ${currentStatus}`);
            }
        };

        newSocket.on('connect', () => {
            console.log('Mobile: Socket connected:', newSocket.id);
            syncPoolJoin();
        });

        newSocket.on('reconnect', () => {
            console.log('Mobile: Socket reconnected');
            syncPoolJoin();
        });

        const appStateSub = AppState.addEventListener('change', (nextState) => {
            if (nextState === 'active') {
                if (!newSocket.connected) {
                    console.log('Mobile: App resumed to active, reconnecting socket...');
                    newSocket.connect();
                } else {
                    syncPoolJoin();
                }
            }
        });

        setSocket(newSocket);

        return () => {
            appStateSub.remove();
            if (newSocket) newSocket.disconnect();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userToken, userInfo, agentStatus]);

    // Socket WhatsApp Call Event Listeners
    useEffect(() => {
        if (!socket || !userInfo) return;
        const roleUpper = String(userInfo.role || '').toUpperCase();
        if (roleUpper === 'STUDENT' || roleUpper === 'USER') return;

        const handleIncomingCall = (data) => {
            console.log("Mobile: Incoming WhatsApp Call:", data);
            
            // Check current agent status
            const currentStatus = String(agentStatus || userInfo.agentStatus || 'OFFLINE').trim().toUpperCase();
            if (currentStatus !== 'ACTIVE') {
                console.log(`Mobile: Suppressing call - agent status is '${currentStatus}' (NOT ACTIVE)`);
                return;
            }

            // Check business match if specific business is designated
            if (data?.businessType && String(data.businessType).trim().toUpperCase() !== 'ALL') {
                const userBiz = (userInfo.businessType || '').trim();
                const userBizList = userBiz.split(',').map(b => b.trim().toLowerCase()).filter(Boolean);
                const incomingBiz = String(data.businessType).trim().toLowerCase();

                const handlesAll = userBizList.length === 0 || userBizList.some(b => b === 'all');
                if (!handlesAll) {
                    const matches = userBizList.some(b => b === incomingBiz || incomingBiz.includes(b) || b.includes(incomingBiz));
                    if (!matches) {
                        console.log(`Mobile: Suppressing call for '${data.businessType}' - User only handles [${userBiz}]`);
                        return;
                    }
                }
            }

            if (!activeCall) {
                setIncomingCall(data);
                setIsRinging(true);

                if (incomingRingingTimeoutRef.current) clearTimeout(incomingRingingTimeoutRef.current);
                incomingRingingTimeoutRef.current = setTimeout(() => {
                    console.log("Mobile: Inbound call ringing timed out after 45s");
                    stopRinging();
                }, 45000);

                const rawCallId = data?.callId || 'call_' + Date.now();
                const callerName = data?.leadName || 'Student';
                const callerPhone = data?.from || 'WhatsApp Call';

                // Show Native iOS CallKit only (avoid Android TelecomManager crash/mute)
                if (Platform.OS === 'ios') {
                    const callKitUuid = registerCallKitMapping(rawCallId);
                    try {
                        RNCallKeep.displayIncomingCall(callKitUuid, callerPhone, callerName, 'generic', false);
                    } catch (e) {
                        console.log('Mobile: RNCallKeep displayIncomingCall error:', e);
                    }
                }

                // Show Android notification bar heads-up alert with continuous ringtone & Answer/Decline buttons
                if (Platform.OS === 'android') {
                    showIncomingCallNotification({
                        ...data,
                        callId: rawCallId,
                        leadName: callerName,
                        from: callerPhone
                    });
                }
            }
        };
        handleIncomingCallRef.current = handleIncomingCall;

        const handleCallAnsweredByOther = (data) => {
            if (incomingCall && incomingCall.callId === data.callId) {
                stopRinging();
            }
        };

        const handleCallDisconnected = (data) => {
            console.log("Mobile: Call disconnected socket event received:", data);
            const currActive = activeCallRef.current;
            const currentIncoming = incomingCallRef.current || incomingCall;

            if (!currActive && !currentIncoming) {
                return;
            }

            const currentCallId = currActive?.callId || currentIncoming?.callId;
            const currentPhone = currActive?.from || currentIncoming?.from;

            // Only terminate if the event matches this active/incoming call
            if (data?.callId && currentCallId && String(data.callId) !== String(currentCallId)) {
                console.log(`Mobile: Disconnect event callId ${data.callId} does not match current ${currentCallId}, ignoring.`);
                return;
            }
            if (data?.phone && currentPhone) {
                const p1 = String(data.phone).replace(/[^0-9]/g, '');
                const p2 = String(currentPhone).replace(/[^0-9]/g, '');
                if (p1 && p2 && !p1.endsWith(p2) && !p2.endsWith(p1)) {
                    console.log(`Mobile: Disconnect event phone ${data.phone} does not match current ${currentPhone}, ignoring.`);
                    return;
                }
            }

            // If an active call is already CONNECTED and audio is flowing, do NOT end on ambiguous event without identifier
            if (currActive && currActive.status === 'CONNECTED' && !data?.callId && !data?.phone) {
                console.log("Mobile: Ignoring ambiguous disconnect event without callId or phone for active connected call.");
                return;
            }

            if (currentIncoming) {
                saveCallLog({
                    phone: currentIncoming.from,
                    leadName: currentIncoming.leadName,
                    businessId: currentIncoming.businessId,
                    businessType: currentIncoming.businessType,
                    isOutbound: false,
                    status: 'MISSED',
                    duration: 0,
                    createdAt: new Date().toISOString()
                });
                stopRinging();
            }
            endCall();
        };

        // Outbound call status events from Meta
        const handleOutboundStatus = (data) => {
            console.log("Mobile: WhatsApp Call Status Event:", data);
            if (!data?.status) return;
            const currActive = activeCallRef.current;
            if (!currActive || !currActive.isOutbound) return;

            if (data?.callId && currActive?.callId && String(data.callId) !== String(currActive.callId)) {
                return;
            }
            if (data?.phone && currActive?.from) {
                const p1 = String(data.phone).replace(/[^0-9]/g, '');
                const p2 = String(currActive.from).replace(/[^0-9]/g, '');
                if (p1 && p2 && !p1.endsWith(p2) && !p2.endsWith(p1)) return;
            }
            if (!data?.callId && !data?.phone && currActive.status === 'CONNECTED') {
                return;
            }

            const status = String(data.status).toUpperCase();

            if (status === 'RINGING') {
                setActiveCall(prev => prev ? { ...prev, status: prev.status === 'CONNECTED' ? 'CONNECTED' : 'RINGING' } : null);
            } else if (['REJECTED', 'FAILED', 'TERMINATED', 'DISCONNECTED', 'ENDED', 'CANCELLED', 'HANGUP', 'BUSY', 'COMPLETED'].includes(status)) {
                console.log(`Mobile: WhatsApp call reached terminal status '${status}'. Ending call immediately.`);
                if (outboundRingingTimeoutRef.current) clearTimeout(outboundRingingTimeoutRef.current);
                endCall();
            } else if (['ACCEPTED', 'IN_PROGRESS', 'CONNECTED'].includes(status)) {
                if (outboundRingingTimeoutRef.current) clearTimeout(outboundRingingTimeoutRef.current);
                setActiveCall(prev => prev ? { ...prev, status: 'CONNECTED' } : null);
            }
        };

        const handleOutboundAnswer = async (data) => {
            console.log("Mobile: Outbound Answer received from Meta:", data?.callId);
            if (outboundRingingTimeoutRef.current) {
                clearTimeout(outboundRingingTimeoutRef.current);
                outboundRingingTimeoutRef.current = null;
            }
            if (pcRef.current && pcRef.current.signalingState !== 'closed' && data?.sdp) {
                try {
                    await pcRef.current.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: data.sdp }));
                    setActiveCall(prev => prev ? { ...prev, callId: data?.callId || prev.callId, status: 'CONNECTED' } : null);
                } catch (e) {
                    console.error("Mobile: SDP Answer error:", e);
                }
            }
        };

        socket.on('incoming_wa_call', handleIncomingCall);
        socket.on('whatsapp_call_answered_by_other', handleCallAnsweredByOther);
        socket.on('whatsapp_call_disconnected', handleCallDisconnected);
        socket.on('whatsapp_call_end', handleCallDisconnected);
        socket.on('whatsapp_call_ended', handleCallDisconnected);
        socket.on('whatsapp_call_terminated', handleCallDisconnected);
        socket.on('whatsapp_call_hangup', handleCallDisconnected);
        socket.on('whatsapp_call_completed', handleCallDisconnected);
        socket.on('whatsapp_call_rejected', handleCallDisconnected);
        socket.on('call_ended', handleCallDisconnected);
        socket.on('call_disconnected', handleCallDisconnected);
        socket.on('call_terminated', handleCallDisconnected);
        socket.on('call_completed', handleCallDisconnected);
        socket.on('call_hangup', handleCallDisconnected);
        socket.on('whatsapp_call_status', handleOutboundStatus);
        socket.on('call_status', handleOutboundStatus);
        socket.on('whatsapp_outbound_answer', handleOutboundAnswer);

        return () => {
            socket.off('incoming_wa_call', handleIncomingCall);
            socket.off('whatsapp_call_answered_by_other', handleCallAnsweredByOther);
            socket.off('whatsapp_call_disconnected', handleCallDisconnected);
            socket.off('whatsapp_call_end', handleCallDisconnected);
            socket.off('whatsapp_call_ended', handleCallDisconnected);
            socket.off('whatsapp_call_terminated', handleCallDisconnected);
            socket.off('whatsapp_call_hangup', handleCallDisconnected);
            socket.off('whatsapp_call_completed', handleCallDisconnected);
            socket.off('whatsapp_call_rejected', handleCallDisconnected);
            socket.off('call_ended', handleCallDisconnected);
            socket.off('call_disconnected', handleCallDisconnected);
            socket.off('call_terminated', handleCallDisconnected);
            socket.off('call_completed', handleCallDisconnected);
            socket.off('call_hangup', handleCallDisconnected);
            socket.off('whatsapp_call_status', handleOutboundStatus);
            socket.off('call_status', handleOutboundStatus);
            socket.off('whatsapp_outbound_answer', handleOutboundAnswer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [socket, activeCall, incomingCall, userInfo, agentStatus]);

    const stopRinging = () => {
        if (incomingRingingTimeoutRef.current) {
            clearTimeout(incomingRingingTimeoutRef.current);
            incomingRingingTimeoutRef.current = null;
        }
        setIsRinging(false);
        const currId = incomingCallRef.current?.callId || incomingCall?.callId;
        dismissCallNotification(currId);
        setIncomingCall(null);
    };

    // Change Agent Status (ACTIVE, LUNCH, AWAY, OFFLINE)
    const changeStatus = async (newStatus) => {
        const clean = String(newStatus).toUpperCase().trim();
        setAgentStatus(clean);
        if (updateUserInfo) updateUserInfo({ agentStatus: clean });
        await AsyncStorage.setItem('agentStatus', clean).catch(() => {});

        if (socket) {
            if (clean === 'OFFLINE') {
                socket.emit('leave_wa_agent_pool');
            } else {
                socket.emit('join_wa_agent_pool', { status: clean });
            }
        }

        try {
            await api.post('/mobile/staff/agent-status', { status: clean });
        } catch (e) {
            console.log("Error updating agent status via API:", e?.message);
        }
    };

    // Answer Inbound Call
    const answerCall = async (callId, offerSdp) => {
        const currentIncoming = incomingCallRef.current || incomingCall;
        const targetCallId = callId || currentIncoming?.callId;
        const targetOfferSdp = offerSdp || currentIncoming?.sdp || currentIncoming?.offerSdp || currentIncoming?.offer?.sdp;

        if (!targetCallId || !targetOfferSdp) {
            console.error("Mobile: Cannot answer call - missing callId or offer SDP", { targetCallId, hasSdp: Boolean(targetOfferSdp) });
            return;
        }

        // Avoid re-answering if already connecting/connected
        if (activeCallRef.current && activeCallRef.current.callId === targetCallId && ['CONNECTING', 'CONNECTED'].includes(activeCallRef.current.status)) {
            console.log('Mobile: Call is already active/connecting, skipping duplicate answerCall');
            return;
        }

        // Stop ringtone audio & notification immediately
        if (incomingRingingTimeoutRef.current) {
            clearTimeout(incomingRingingTimeoutRef.current);
            incomingRingingTimeoutRef.current = null;
        }
        setIsRinging(false);
        dismissCallNotification(targetCallId);

        // Tell CallKit immediately so top banner stops ringing and answers
        try {
            const callKitUuid = registerCallKitMapping(targetCallId);
            if (Platform.OS === 'ios') {
                RNCallKeep.answerIncomingCall(callKitUuid);
            }
            RNCallKeep.setCurrentCallActive(callKitUuid);
        } catch (e) {
            console.log('Mobile: CallKit answer sync error:', e);
        }

        // Immediately transition UI into active CONNECTING state so popup modal NEVER disappears
        setActiveCall({
            callId: targetCallId,
            from: currentIncoming?.from || '',
            leadName: currentIncoming?.leadName || 'Student',
            businessId: currentIncoming?.businessId,
            businessType: currentIncoming?.businessType || 'IMA Campus',
            receivingWaNumId: currentIncoming?.receivingWaNumId,
            startTime: new Date(),
            peerConnection: null,
            localStream: null,
            isMuted: false,
            isOutbound: false,
            status: 'CONNECTING'
        });

        try {
            const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
            pcRef.current = pc;
            
            const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
            localStreamRef.current = stream;
            stream.getTracks().forEach(t => pc.addTrack(t, stream));

            pc.ontrack = (event) => {
                console.log('Mobile: Remote track received from WhatsApp incoming call.');
            };

            let disconnectTimer = null;
            pc.onconnectionstatechange = () => {
                console.log('Mobile: Inbound WebRTC connectionState:', pc.connectionState);
                if (pc.connectionState === 'connected') {
                    if (disconnectTimer) { clearTimeout(disconnectTimer); disconnectTimer = null; }
                } else if (['failed', 'closed'].includes(pc.connectionState)) {
                    console.log('Mobile: Remote peer failed/closed WebRTC, ending call.');
                    if (disconnectTimer) clearTimeout(disconnectTimer);
                    endCall();
                } else if (pc.connectionState === 'disconnected') {
                    console.log('Mobile: Inbound WebRTC temporarily disconnected, waiting 6s for reconnect...');
                    if (!disconnectTimer) {
                        disconnectTimer = setTimeout(() => {
                            if (pcRef.current && pcRef.current.connectionState === 'disconnected') {
                                console.log('Mobile: Inbound WebRTC disconnected for >6s, ending call.');
                                endCall();
                            }
                        }, 6000);
                    }
                }
            };
            pc.oniceconnectionstatechange = () => {
                console.log('Mobile: Inbound WebRTC iceConnectionState:', pc.iceConnectionState);
                if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
                    if (disconnectTimer) { clearTimeout(disconnectTimer); disconnectTimer = null; }
                } else if (pc.iceConnectionState === 'failed') {
                    console.log('Mobile: ICE failed, ending call.');
                    if (disconnectTimer) clearTimeout(disconnectTimer);
                    endCall();
                }
            };

            await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: targetOfferSdp }));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            // Give ICE candidates a brief window (up to 800ms) to gather
            await new Promise(resolve => {
                if (pc.iceGatheringState === 'complete') return resolve();
                const timeout = setTimeout(resolve, 800);
                pc.onicegatheringstatechange = () => {
                    if (pc.iceGatheringState === 'complete') {
                        clearTimeout(timeout);
                        resolve();
                    }
                };
            });

            const finalAnswerSdp = pc.localDescription?.sdp || answer.sdp;

            // 1. Emit answer over Socket.io (instant real-time signaling, immune to HTTP network errors)
            if (socket && socket.connected) {
                const answerPayload = {
                    callId: targetCallId,
                    sdp: finalAnswerSdp,
                    businessType: currentIncoming?.businessType,
                    receivingWaNumId: currentIncoming?.receivingWaNumId
                };
                socket.emit('answer_wa_call', answerPayload);
                socket.emit('whatsapp_call_answer', answerPayload);
                console.log('Mobile: Emitted socket answer_wa_call successfully for callId:', targetCallId);
            }

            // 2. HTTP POST endpoint (dual-channel delivery)
            try {
                await api.post('/admin/whatsapp-call/answer', {
                    callId: targetCallId,
                    sdp: finalAnswerSdp,
                    businessType: currentIncoming?.businessType,
                    receivingWaNumId: currentIncoming?.receivingWaNumId
                }, { timeout: 10000 });
                console.log('Mobile: HTTP POST answer succeeded for callId:', targetCallId);
            } catch (httpErr) {
                console.warn("Mobile: HTTP answer endpoint warning (socket fallback active):", httpErr?.message || httpErr);
            }

            // Successfully connected - update active call state
            setActiveCall(prev => prev ? {
                ...prev,
                peerConnection: pc,
                localStream: stream,
                status: 'CONNECTED'
            } : null);

            try {
                const callKitUuid = registerCallKitMapping(targetCallId);
                RNCallKeep.setCurrentCallActive(callKitUuid);
            } catch (e) {}

            setIncomingCall(null);

        } catch (err) {
            console.error("Mobile: Error answering call:", err);
            endCall();
        }
    };

    // Start Outbound Call to Lead/Student
    const startOutboundCall = async ({ lead, businessId, campaignType }) => {
        if (!lead || !lead.phone) {
            console.warn("Mobile: Missing phone number for outbound call");
            return;
        }

        if (activeCall || incomingCall) {
            console.warn("Mobile: A call is already active or ringing");
            return;
        }

        try {
            const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
            pcRef.current = pc;

            const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
            localStreamRef.current = stream;
            stream.getTracks().forEach(t => pc.addTrack(t, stream));

            pc.ontrack = (event) => {
                console.log("Mobile: Remote track received for outbound call.");
            };

            const rawOutboundId = 'out_' + Date.now();
            const callKitUuid = registerCallKitMapping(rawOutboundId);
            try {
                if (Platform.OS === 'ios') {
                    RNCallKeep.startCall(callKitUuid, lead.phone, lead.name || lead.phone, 'generic', false);
                }
            } catch (e) {}

            let outboundDisconnectTimer = null;
            pc.onconnectionstatechange = () => {
                console.log("Mobile: Outbound WebRTC connectionState:", pc.connectionState);
                if (pc.connectionState === 'connected') {
                    if (outboundDisconnectTimer) { clearTimeout(outboundDisconnectTimer); outboundDisconnectTimer = null; }
                    if (outboundRingingTimeoutRef.current) {
                        clearTimeout(outboundRingingTimeoutRef.current);
                        outboundRingingTimeoutRef.current = null;
                    }
                    try {
                        RNCallKeep.setCurrentCallActive(callKitUuid);
                    } catch (e) {}
                    setActiveCall(prev => prev ? { ...prev, status: 'CONNECTED' } : null);
                } else if (['failed', 'closed'].includes(pc.connectionState)) {
                    console.log("Mobile: Outbound WebRTC failed/closed, ending call.");
                    if (outboundDisconnectTimer) clearTimeout(outboundDisconnectTimer);
                    endCall();
                } else if (pc.connectionState === 'disconnected') {
                    console.log("Mobile: Outbound WebRTC disconnected temporarily, waiting 6s for reconnect...");
                    if (!outboundDisconnectTimer) {
                        outboundDisconnectTimer = setTimeout(() => {
                            if (pcRef.current && pcRef.current.connectionState === 'disconnected') {
                                console.log("Mobile: Outbound WebRTC disconnected for >6s, ending call.");
                                endCall();
                            }
                        }, 6000);
                    }
                }
            };
            pc.oniceconnectionstatechange = () => {
                console.log("Mobile: Outbound WebRTC iceConnectionState:", pc.iceConnectionState);
                if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
                    if (outboundDisconnectTimer) { clearTimeout(outboundDisconnectTimer); outboundDisconnectTimer = null; }
                    if (outboundRingingTimeoutRef.current) {
                        clearTimeout(outboundRingingTimeoutRef.current);
                        outboundRingingTimeoutRef.current = null;
                    }
                    try {
                        RNCallKeep.setCurrentCallActive(callKitUuid);
                    } catch (e) {}
                    setActiveCall(prev => prev ? { ...prev, status: 'CONNECTED' } : null);
                } else if (pc.iceConnectionState === 'failed') {
                    console.log("Mobile: Outbound ICE failed, ending call.");
                    if (outboundDisconnectTimer) clearTimeout(outboundDisconnectTimer);
                    endCall();
                }
            };

            const callObj = {
                callId: rawOutboundId,
                from: lead.phone,
                leadName: lead.name || lead.phone,
                businessId: businessId || lead.businessId,
                businessType: campaignType || lead.campaignType || 'FREE_SEMINAR',
                startTime: new Date(),
                peerConnection: pc,
                localStream: stream,
                isMuted: false,
                isOutbound: true,
                status: 'DIALING'
            };
            setActiveCall(callObj);

            // Ringing timeout (40s)
            if (outboundRingingTimeoutRef.current) clearTimeout(outboundRingingTimeoutRef.current);
            outboundRingingTimeoutRef.current = setTimeout(() => {
                console.log("Mobile: Outbound call ringing timed out.");
                endCall();
            }, 40000);

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            const sendOffer = async (sdp) => {
                try {
                    const res = await api.post('/admin/whatsapp-call/initiate', {
                        to: lead.phone,
                        sdp: sdp,
                        businessId: businessId || lead.businessId,
                        campaignType: campaignType || lead.campaignType || 'FREE_SEMINAR'
                    });

                    if (res.data?.success) {
                        const callId = res.data.callId;
                        registerCallKitMapping(callId);
                        callIdMapRef.current.set(String(callId).toLowerCase(), callKitUuid);
                        callIdMapRef.current.set(callKitUuid.toLowerCase(), callId);
                        setActiveCall(prev => prev ? { ...prev, callId, status: prev.status === 'CONNECTED' ? 'CONNECTED' : 'RINGING' } : null);
                    }
                } catch (err) {
                    console.error("Mobile: Error initiating outbound call:", err);
                    endCall();
                }
            };

            let sent = false;
            const trigger = () => {
                if (!sent && pc.localDescription?.sdp) {
                    sent = true;
                    sendOffer(pc.localDescription.sdp);
                }
            };

            if (pc.iceGatheringState === 'complete') {
                trigger();
            } else {
                pc.onicegatheringstatechange = () => {
                    if (pc.iceGatheringState === 'complete') trigger();
                };
                setTimeout(trigger, 1200);
            }

        } catch (err) {
            console.error("Mobile: Outbound call setup error:", err);
            endCall();
        }
    };

    // Reject Inbound Call
    const rejectCall = async (callId) => {
        const currentIncoming = incomingCallRef.current || incomingCall;
        const targetCallId = callId || currentIncoming?.callId;

        if (currentIncoming) {
            saveCallLog({
                phone: currentIncoming.from,
                leadName: currentIncoming.leadName,
                businessId: currentIncoming.businessId,
                businessType: currentIncoming.businessType,
                isOutbound: false,
                status: 'REJECTED',
                duration: 0,
                createdAt: new Date().toISOString()
            });
        }
        stopRinging();

        if (targetCallId) {
            try {
                const callKitUuid = registerCallKitMapping(targetCallId);
                RNCallKeep.endCall(callKitUuid);
            } catch (e) {}
        }

        if (socket && socket.connected && targetCallId) {
            const rejectPayload = {
                callId: targetCallId,
                businessType: currentIncoming?.businessType,
                receivingWaNumId: currentIncoming?.receivingWaNumId,
                leadPhone: currentIncoming?.from
            };
            socket.emit('reject_wa_call', rejectPayload);
            socket.emit('whatsapp_call_reject', rejectPayload);
        }

        try {
            await api.post('/admin/whatsapp-call/reject', { 
                callId: targetCallId, 
                businessType: currentIncoming?.businessType, 
                receivingWaNumId: currentIncoming?.receivingWaNumId,
                leadPhone: currentIncoming?.from
            }, { timeout: 8000 });
        } catch (err) {
            console.error("Mobile: Error rejecting call:", err?.message || err);
        }
    };

    // End / Hangup Active Call
    const endCall = async () => {
        if (outboundRingingTimeoutRef.current) {
            clearTimeout(outboundRingingTimeoutRef.current);
            outboundRingingTimeoutRef.current = null;
        }

        const currActive = activeCallRef.current || activeCall;
        if (currActive) {
            const duration = currActive.startTime ? Math.floor((new Date() - currActive.startTime) / 1000) : 0;
            saveCallLog({
                phone: currActive.from,
                leadName: currActive.leadName,
                businessId: currActive.businessId,
                businessType: currActive.businessType,
                isOutbound: Boolean(currActive.isOutbound),
                status: currActive.status === 'CONNECTED' ? 'COMPLETED' : 'MISSED',
                duration,
                createdAt: currActive.startTime ? new Date(currActive.startTime).toISOString() : new Date().toISOString()
            });

            if (socket && socket.connected && currActive.callId) {
                const termPayload = {
                    callId: currActive.callId,
                    businessType: currActive.businessType,
                    receivingWaNumId: currActive.receivingWaNumId,
                    leadPhone: currActive.from,
                    duration
                };
                socket.emit('end_wa_call', termPayload);
                socket.emit('whatsapp_call_terminate', termPayload);
            }

            if (currActive.callId) {
                try {
                    const callKitUuid = registerCallKitMapping(currActive.callId);
                    RNCallKeep.endCall(callKitUuid);
                } catch (e) {}
            }

            try {
                await api.post('/admin/whatsapp-call/terminate', {
                    callId: currActive.callId,
                    businessType: currActive.businessType,
                    receivingWaNumId: currActive.receivingWaNumId,
                    leadPhone: currActive.from,
                    duration
                }, { timeout: 8000 }).catch(() => {});
            } catch (err) {
                console.error("Mobile: Error terminating call on backend:", err?.message || err);
            }

            if (currActive.peerConnection) {
                try { currActive.peerConnection.close(); } catch (e) {}
            }
            if (currActive.localStream) {
                try {
                    currActive.localStream.getTracks().forEach(track => track.stop());
                } catch (e) {}
            }
        }

        if (pcRef.current) {
            try { pcRef.current.close(); } catch (e) {}
            pcRef.current = null;
        }
        if (localStreamRef.current) {
            try {
                localStreamRef.current.getTracks().forEach(track => track.stop());
            } catch (e) {}
            localStreamRef.current = null;
        }
        
        activeCallRef.current = null;
        setActiveCall(null);
        setIsOnHold(false);
        setIsSpeakerOn(false);
        setIsCallMinimized(false);
        stopRinging();
    };

    // Toggle Loudspeaker / Earpiece
    const toggleSpeaker = async () => {
        const nextSpeaker = !isSpeakerOn;
        setIsSpeakerOn(nextSpeaker);
        const curr = activeCallRef.current || activeCall;
        const callKitUuid = curr?.callId ? registerCallKitMapping(curr.callId) : null;

        try {
            if (Platform.OS === 'ios') {
                try {
                    const routes = await RNCallKeep.getAudioRoutes();
                    console.log('Mobile: Available audio routes:', routes);
                } catch (e) {}

                const targetRoute = nextSpeaker ? 'Speaker' : 'Phone';
                await RNCallKeep.setAudioRoute(callKitUuid || '', targetRoute);
                console.log('Mobile: iOS audio route set to:', targetRoute);
            } else {
                RNCallKeep.toggleAudioRouteSpeaker(callKitUuid || '', nextSpeaker);
                try {
                    await RNCallKeep.setAudioRoute(callKitUuid || '', nextSpeaker ? 'SPEAKER' : 'EARPIECE');
                } catch (e) {}
                console.log('Mobile: Android audio route toggled to speaker:', nextSpeaker);
            }
        } catch (err) {
            console.log('Mobile: Audio route toggle error:', err?.message || err);
        }
    };

    // Toggle Mic Mute
    const toggleMute = () => {
        if (activeCall && activeCall.localStream) {
            const audioTrack = activeCall.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setActiveCall(prev => ({ ...prev, isMuted: !audioTrack.enabled }));
            }
        }
    };

    // Toggle Hold State & Play Hold Music
    const toggleHold = async () => {
        const curr = activeCallRef.current || activeCall;
        if (!curr) return;
        const nextHold = !isOnHold;
        setIsOnHold(nextHold);

        // When on hold, mute microphone so the remote customer hears hold music rather than staff
        if (curr.localStream) {
            try {
                const audioTracks = curr.localStream.getAudioTracks();
                if (audioTracks && audioTracks.length > 0) {
                    audioTracks.forEach(track => {
                        track.enabled = !nextHold;
                    });
                }
            } catch (err) {
                console.log('Mobile: localStream audioTracks mute error:', err);
            }
        }

        // Notify socket listeners
        if (socket && socket.connected && curr.callId) {
            const holdPayload = {
                callId: curr.callId,
                onHold: nextHold,
                businessType: curr.businessType,
                receivingWaNumId: curr.receivingWaNumId,
                leadPhone: curr.from
            };
            socket.emit('hold_wa_call', holdPayload);
            socket.emit('whatsapp_call_hold', holdPayload);
        }

        // Notify backend API
        try {
            await api.post('/admin/whatsapp-call/hold', {
                callId: curr.callId,
                onHold: nextHold,
                businessType: curr.businessType,
                receivingWaNumId: curr.receivingWaNumId,
                leadPhone: curr.from
            }, { timeout: 6000 }).catch(() => {});
        } catch (e) {}

        // Update CallKit hold state safely
        if (curr.callId) {
            try {
                const callKitUuid = registerCallKitMapping(curr.callId);
                RNCallKeep.setOnHold(callKitUuid, nextHold);
            } catch (e) {
                console.log('Mobile: RNCallKeep setOnHold error:', e);
            }
        }
    };

    // Toggle In-Call Minimization (Allows staff to navigate and use app during call)
    const toggleMinimize = (val) => {
        setIsCallMinimized(prev => typeof val === 'boolean' ? val : !prev);
    };

    // Listen to Notifee notification bar button taps (Answer / Decline)
    useEffect(() => {
        if (Platform.OS !== 'android') return;

        const unsubscribe = notifee.onForegroundEvent(async ({ type, detail }) => {
            const { notification, pressAction } = detail;
            if (type === EventType.ACTION_PRESS) {
                const notifCallId = notification?.data?.callId;
                const notifSdp = notification?.data?.sdp;

                if (pressAction?.id === 'decline_call') {
                    console.log('Mobile: Notification bar Decline action tapped');
                    if (notification?.id) {
                        await notifee.cancelNotification(notification.id).catch(() => {});
                    }
                    await rejectCall(notifCallId);
                } else if (pressAction?.id === 'answer_call') {
                    console.log('Mobile: Notification bar Answer action tapped');
                    if (notification?.id) {
                        await notifee.cancelNotification(notification.id).catch(() => {});
                    }
                    await answerCall(notifCallId, notifSdp);
                }
            }
        });

        // Also check if app was opened with a pending answer action from background
        const checkPendingAnswer = async () => {
            try {
                const pending = await AsyncStorage.getItem('@pending_answer_call');
                if (pending) {
                    await AsyncStorage.removeItem('@pending_answer_call');
                    const parsed = JSON.parse(pending);
                    if (parsed?.callId) {
                        console.log('Mobile: Processing pending answer from background notification:', parsed.callId);
                        setTimeout(() => {
                            answerCall(parsed.callId, parsed.sdp);
                        }, 600);
                    }
                }
            } catch (e) {}
        };
        checkPendingAnswer();

        return () => {
            if (typeof unsubscribe === 'function') unsubscribe();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [socket, incomingCall, activeCall]);

    const baseAudioUrl = api.defaults.baseURL.replace('/api/', '').replace('/api', '');

    return (
        <CallContext.Provider value={{
            socket,
            incomingCall,
            activeCall,
            isRinging,
            agentStatus,
            isOnHold,
            isSpeakerOn,
            isCallMinimized,
            changeStatus,
            answerCall,
            startOutboundCall,
            rejectCall,
            endCall,
            toggleMute,
            toggleHold,
            toggleSpeaker,
            toggleMinimize
        }}>
            {children}
            {/* Incoming Ringtone */}
            {isRinging && (
                <Video
                    source={{
                        uri: incomingCall?.ringtoneUrl
                            ? `${baseAudioUrl}${incomingCall.ringtoneUrl}`
                            : 'https://assets.mixkit.co/active_storage/sfx/2874/2874-preview.mp3'
                    }}
                    audioOnly={true}
                    repeat={true}
                    playInBackground={true}
                    ignoreSilentSwitch="ignore"
                    mixWithOthers="mix"
                    style={{ width: 0, height: 0, position: 'absolute' }}
                    onError={(err) => console.log('Mobile: Ringtone audio error (handled):', err?.error || err)}
                />
            )}
            {/* On-Hold Music */}
            {activeCall && isOnHold && (
                <Video
                    source={{
                        uri: (activeCall?.holdMusicUrl || incomingCall?.holdMusicUrl)
                            ? `${baseAudioUrl}${activeCall?.holdMusicUrl || incomingCall?.holdMusicUrl}`
                            : 'https://assets.mixkit.co/music/preview/mixkit-serene-view-443.mp3'
                    }}
                    audioOnly={true}
                    repeat={true}
                    paused={false}
                    playInBackground={true}
                    playWhenInactive={true}
                    mixWithOthers="mix"
                    ignoreSilentSwitch="ignore"
                    style={{ width: 0, height: 0, position: 'absolute' }}
                    onError={(err) => console.log('Mobile: Hold music audio error (handled):', err?.error || err)}
                />
            )}
        </CallContext.Provider>
    );
};
