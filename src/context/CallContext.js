import React, { createContext, useContext, useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import api from '../services/api';
import { RTCPeerConnection, RTCSessionDescription, mediaDevices } from 'react-native-webrtc';
import Video from 'react-native-video';
import { AuthContext } from './AuthContext';

export const CallContext = createContext();

export const useCall = () => useContext(CallContext);

export const CallProvider = ({ children }) => {
    const { userToken, userInfo } = useContext(AuthContext);
    const [socket, setSocket] = useState(null);
    
    // States
    const [incomingCall, setIncomingCall] = useState(null);
    const [activeCall, setActiveCall] = useState(null);
    const [isRinging, setIsRinging] = useState(false);

    useEffect(() => {
        if (!userToken) {
            if (socket) {
                socket.disconnect();
                setSocket(null);
            }
            return;
        }

        const defaultSocketUrl = api.defaults.baseURL.replace('/api', '');
        
        const newSocket = io(defaultSocketUrl, {
            auth: { token: userToken },
            transports: ['websocket', 'polling']
        });
        setSocket(newSocket);

        return () => {
            if (newSocket) newSocket.disconnect();
        };
    }, [userToken]);

    useEffect(() => {
        if (!socket || !userInfo || (String(userInfo.role).toUpperCase() === 'STUDENT')) return;

        const handleIncomingCall = (data) => {
            console.log("Mobile: Incoming WhatsApp Call:", data);
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

        socket.on('incoming_wa_call', handleIncomingCall);
        socket.on('whatsapp_call_answered_by_other', handleCallAnsweredByOther);
        socket.on('whatsapp_call_disconnected', handleCallDisconnected);

        if (userInfo.businessType) {
            socket.emit('agent_status', { status: 'idle', businessType: userInfo.businessType });
        }

        return () => {
            socket.off('incoming_wa_call', handleIncomingCall);
            socket.off('whatsapp_call_answered_by_other', handleCallAnsweredByOther);
            socket.off('whatsapp_call_disconnected', handleCallDisconnected);
        };
    }, [socket, activeCall, incomingCall, userInfo]);

    const stopRinging = () => {
        setIsRinging(false);
        setIncomingCall(null);
    };

    const answerCall = async (callId, offerSdp) => {
        stopRinging();
        
        try {
            const pc = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });
            
            const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
            stream.getTracks().forEach(t => pc.addTrack(t, stream));

            pc.ontrack = (event) => {
                console.log('Mobile: Remote track received from WhatsApp.');
            };

            await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: offerSdp }));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            await api.post('/admin/whatsapp-call/answer', {
                callId: callId,
                sdp: answer.sdp,
                businessType: incomingCall.businessType,
                receivingWaNumId: incomingCall.receivingWaNumId
            });

            setActiveCall({
                callId: incomingCall.callId,
                from: incomingCall.from,
                leadName: incomingCall.leadName,
                businessType: incomingCall.businessType,
                startTime: new Date(),
                peerConnection: pc,
                localStream: stream,
                isMuted: false
            });

        } catch (err) {
            console.error("Mobile: Error answering call:", err);
        }
    };

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

    const endCall = async () => {
        if (activeCall) {
            try {
                const duration = Math.floor((new Date() - activeCall.startTime) / 1000);
                await api.post('/admin/whatsapp-call/terminate', {
                    callId: activeCall.callId,
                    businessType: activeCall.businessType,
                    receivingWaNumId: activeCall.receivingWaNumId,
                    leadPhone: activeCall.from,
                    duration
                });
            } catch (err) {
                console.error("Error terminating call on backend:", err);
            }

            if (activeCall.peerConnection) activeCall.peerConnection.close();
            if (activeCall.localStream) {
                activeCall.localStream.getTracks().forEach(track => track.stop());
            }
        }
        
        setActiveCall(null);
    };

    const toggleMute = () => {
        if (activeCall && activeCall.localStream) {
            const audioTrack = activeCall.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setActiveCall(prev => ({ ...prev, isMuted: !audioTrack.enabled }));
            }
        }
    };

    const baseAudioUrl = api.defaults.baseURL.replace('/api', '');

    return (
        <CallContext.Provider value={{
            socket,
            incomingCall,
            activeCall,
            isRinging,
            answerCall,
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
