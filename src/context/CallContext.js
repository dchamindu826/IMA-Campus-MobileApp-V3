import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { io } from 'socket.io-client';
import api from '../services/api';
import { RTCPeerConnection, RTCSessionDescription, mediaDevices } from 'react-native-webrtc';
import Video from 'react-native-video';
import messaging from '@react-native-firebase/messaging';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthContext } from './AuthContext';

export const CallContext = createContext();

export const useCall = () => useContext(CallContext);

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
        const key = `@wa_call_history_${cleanPhone}`;
        const existing = await AsyncStorage.getItem(key);
        const list = existing ? JSON.parse(existing) : [];
        const fullEntry = {
            id: 'call_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            type: 'CALL_EVENT',
            phone: cleanPhone,
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
    const [activeCall, setActiveCall] = useState(null); // { callId, from, leadName, businessType, status, isOutbound, isMuted, peerConnection, localStream, startTime }
    const [isRinging, setIsRinging] = useState(false);
    const [agentStatus, setAgentStatus] = useState('OFFLINE');

    const pcRef = useRef(null);
    const localStreamRef = useRef(null);
    const outboundRingingTimeoutRef = useRef(null);
    const activeCallRef = useRef(null);
    const incomingCallRef = useRef(null);

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

    // Register FCM Token for Background / Killed Incoming Call notifications
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
        };

        registerDeviceToken();
        const unsubscribe = messaging().onTokenRefresh(async (newToken) => {
            try {
                await api.post('/mobile/staff/fcm-token', { fcmToken: newToken }).catch(() => {});
            } catch (e) {}
        });

        return () => unsubscribe();
    }, [userToken, userInfo]);

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

        setSocket(newSocket);

        return () => {
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
            }
        };

        const handleCallAnsweredByOther = (data) => {
            if (incomingCall && incomingCall.callId === data.callId) {
                stopRinging();
            }
        };

        const handleCallDisconnected = (data) => {
            console.log("Mobile: Call disconnected socket event received:", data);
            const currentIncoming = incomingCallRef.current || incomingCall;
            if (currentIncoming) {
                saveCallLog({
                    phone: currentIncoming.from,
                    leadName: currentIncoming.leadName,
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
            if (pcRef.current && pcRef.current.signalingState !== 'closed' && data?.sdp) {
                try {
                    await pcRef.current.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: data.sdp }));
                    setActiveCall(prev => prev ? { ...prev, status: prev.status === 'CONNECTED' ? 'CONNECTED' : 'RINGING' } : null);
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
        setIsRinging(false);
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

        // Stop ringtone audio immediately, but DO NOT clear incomingCall to null yet!
        setIsRinging(false);

        // Immediately transition UI into active CONNECTING state so popup modal NEVER disappears
        setActiveCall({
            callId: targetCallId,
            from: currentIncoming?.from || '',
            leadName: currentIncoming?.leadName || 'Student',
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
                if (event.track) {
                    event.track.onended = () => {
                        console.log('Mobile: Remote audio track ended (incoming call), ending call.');
                        endCall();
                    };
                }
            };

            pc.onconnectionstatechange = () => {
                console.log('Mobile: Inbound WebRTC connectionState:', pc.connectionState);
                if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
                    console.log('Mobile: Remote peer disconnected WebRTC, ending call.');
                    endCall();
                }
            };
            pc.oniceconnectionstatechange = () => {
                console.log('Mobile: Inbound WebRTC iceConnectionState:', pc.iceConnectionState);
                if (['disconnected', 'failed', 'closed'].includes(pc.iceConnectionState)) {
                    console.log('Mobile: ICE disconnected/failed, ending call.');
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
                if (event.track) {
                    event.track.onended = () => {
                        console.log("Mobile: Remote audio track ended (outbound call), ending call.");
                        endCall();
                    };
                }
            };

            pc.onconnectionstatechange = () => {
                console.log("Mobile: Outbound WebRTC connectionState:", pc.connectionState);
                if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
                    console.log("Mobile: Remote peer disconnected WebRTC, ending call.");
                    endCall();
                }
            };
            pc.oniceconnectionstatechange = () => {
                console.log("Mobile: Outbound WebRTC iceConnectionState:", pc.iceConnectionState);
                if (['disconnected', 'failed', 'closed'].includes(pc.iceConnectionState)) {
                    console.log("Mobile: ICE disconnected/failed, ending call.");
                    endCall();
                }
            };

            const callObj = {
                callId: null,
                from: lead.phone,
                leadName: lead.name || lead.phone,
                businessType: campaignType || 'FREE_SEMINAR',
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
                isOutbound: false,
                status: 'REJECTED',
                duration: 0,
                createdAt: new Date().toISOString()
            });
        }
        stopRinging();

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
        stopRinging();
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

    const baseAudioUrl = api.defaults.baseURL.replace('/api/', '').replace('/api', '');

    return (
        <CallContext.Provider value={{
            socket,
            incomingCall,
            activeCall,
            isRinging,
            agentStatus,
            changeStatus,
            answerCall,
            startOutboundCall,
            rejectCall,
            endCall,
            toggleMute
        }}>
            {children}
            {isRinging && incomingCall?.ringtoneUrl && (
                <Video
                    source={{ uri: `${baseAudioUrl}${incomingCall.ringtoneUrl}` }}
                    audioOnly={true}
                    repeat={true}
                    playInBackground={true}
                    ignoreSilentSwitch="ignore"
                    style={{ width: 0, height: 0, position: 'absolute' }}
                />
            )}
        </CallContext.Provider>
    );
};
