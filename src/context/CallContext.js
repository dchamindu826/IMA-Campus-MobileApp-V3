import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
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
    }, [userToken, userInfo?.id]);

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
    }, [userToken]);

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
            if (incomingCall && incomingCall.callId === data.callId) {
                stopRinging();
            } else if (activeCall && activeCall.callId === data.callId) {
                endCall();
            }
        };

        // Outbound call status events
        const handleOutboundStatus = (data) => {
            console.log("Mobile: Outbound Call Status:", data);
            if (!data?.status) return;
            const status = String(data.status).toUpperCase();

            if (status === 'RINGING') {
                setActiveCall(prev => prev ? { ...prev, status: prev.status === 'CONNECTED' ? 'CONNECTED' : 'RINGING' } : null);
            } else if (status === 'REJECTED' || status === 'FAILED') {
                if (outboundRingingTimeoutRef.current) clearTimeout(outboundRingingTimeoutRef.current);
                endCall();
            } else if (status === 'TERMINATED') {
                if (outboundRingingTimeoutRef.current) clearTimeout(outboundRingingTimeoutRef.current);
                endCall();
            } else if (status === 'ACCEPTED' || status === 'IN_PROGRESS' || status === 'CONNECTED') {
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
        socket.on('whatsapp_call_status', handleOutboundStatus);
        socket.on('whatsapp_outbound_answer', handleOutboundAnswer);
        socket.on('whatsapp_call_end', handleCallDisconnected);

        return () => {
            socket.off('incoming_wa_call', handleIncomingCall);
            socket.off('whatsapp_call_answered_by_other', handleCallAnsweredByOther);
            socket.off('whatsapp_call_disconnected', handleCallDisconnected);
            socket.off('whatsapp_call_status', handleOutboundStatus);
            socket.off('whatsapp_outbound_answer', handleOutboundAnswer);
            socket.off('whatsapp_call_end', handleCallDisconnected);
        };
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
        stopRinging();
        
        try {
            const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
            pcRef.current = pc;
            
            const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
            localStreamRef.current = stream;
            stream.getTracks().forEach(t => pc.addTrack(t, stream));

            pc.ontrack = (event) => {
                console.log('Mobile: Remote track received from WhatsApp incoming call.');
            };

            await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: offerSdp }));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            await api.post('/admin/whatsapp-call/answer', {
                callId: callId,
                sdp: answer.sdp,
                businessType: incomingCall?.businessType,
                receivingWaNumId: incomingCall?.receivingWaNumId
            });

            setActiveCall({
                callId: incomingCall.callId,
                from: incomingCall.from,
                leadName: incomingCall.leadName,
                businessType: incomingCall.businessType,
                startTime: new Date(),
                peerConnection: pc,
                localStream: stream,
                isMuted: false,
                isOutbound: false,
                status: 'CONNECTED'
            });

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
        stopRinging();
        try {
            await api.post('/admin/whatsapp-call/reject', { 
                callId, 
                businessType: incomingCall?.businessType, 
                receivingWaNumId: incomingCall?.receivingWaNumId,
                leadPhone: incomingCall?.from
            });
        } catch (err) {
            console.error("Mobile: Error rejecting call:", err);
        }
    };

    // End / Hangup Active Call
    const endCall = async () => {
        if (outboundRingingTimeoutRef.current) {
            clearTimeout(outboundRingingTimeoutRef.current);
            outboundRingingTimeoutRef.current = null;
        }

        if (activeCall) {
            try {
                const duration = activeCall.startTime ? Math.floor((new Date() - activeCall.startTime) / 1000) : 0;
                await api.post('/admin/whatsapp-call/terminate', {
                    callId: activeCall.callId,
                    businessType: activeCall.businessType,
                    receivingWaNumId: activeCall.receivingWaNumId,
                    leadPhone: activeCall.from,
                    duration
                }).catch(() => {});
            } catch (err) {
                console.error("Mobile: Error terminating call on backend:", err);
            }

            if (activeCall.peerConnection) {
                try { activeCall.peerConnection.close(); } catch (e) {}
            }
            if (activeCall.localStream) {
                try {
                    activeCall.localStream.getTracks().forEach(track => track.stop());
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
