import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Dimensions, Animated } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useCall } from '../context/CallContext';

const { width } = Dimensions.get('window');

const GlobalCallPopup = () => {
    const { isRinging, incomingCall, activeCall, answerCall, rejectCall, endCall, toggleMute } = useCall();
    const [callDuration, setCallDuration] = useState(0);
    const pulseAnim = useState(new Animated.Value(1))[0];

    useEffect(() => {
        let interval;
        if (activeCall && activeCall.status === 'CONNECTED') {
            interval = setInterval(() => {
                setCallDuration(prev => prev + 1);
            }, 1000);
        } else {
            setCallDuration(0);
        }
        return () => clearInterval(interval);
    }, [activeCall?.status]);

    useEffect(() => {
        if (isRinging || (activeCall && activeCall.status !== 'CONNECTED')) {
            const loop = Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1.25, duration: 800, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true })
                ])
            );
            loop.start();
            return () => loop.stop();
        }
    }, [isRinging, activeCall?.status]);

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    };

    if (!isRinging && !activeCall) return null;

    const callData = activeCall || incomingCall;
    const isOutbound = Boolean(activeCall?.isOutbound);
    const isConnected = activeCall?.status === 'CONNECTED';
    const isDialing = isOutbound && activeCall?.status === 'DIALING';
    const isRemoteRinging = isOutbound && activeCall?.status === 'RINGING';

    const getStatusText = () => {
        if (isRinging) return "Incoming WhatsApp Call...";
        if (isDialing) return "Calling via WhatsApp...";
        if (isRemoteRinging) return "Ringing... 🔔";
        if (isConnected) return "WhatsApp Call in Progress";
        return "Connecting Call...";
    };

    return (
        <Modal transparent={true} visible={isRinging || !!activeCall} animationType="fade">
            <View style={styles.overlay}>
                <View style={styles.popupContainer}>
                    
                    {/* Pulsing Avatar Icon */}
                    <View style={styles.iconContainer}>
                        {(isRinging || isDialing || isRemoteRinging) && (
                            <Animated.View style={[styles.rippleEffect, { transform: [{ scale: pulseAnim }] }]} />
                        )}
                        <View style={[styles.iconBackground, isConnected && styles.activeIconBackground]}>
                            <Icon 
                                name={isConnected ? "phone-in-talk" : isOutbound ? "phone-outgoing" : "phone-incoming"} 
                                size={40} 
                                color="white" 
                            />
                        </View>
                    </View>

                    {/* Status Label */}
                    <View style={styles.statusBadge}>
                        <Icon name="whatsapp" size={16} color="#25D366" style={{ marginRight: 6 }} />
                        <Text style={styles.statusBadgeText}>{getStatusText()}</Text>
                    </View>

                    {/* Caller / Lead Info */}
                    <Text style={styles.nameText} numberOfLines={1}>{callData?.leadName || 'Student'}</Text>
                    <Text style={styles.phoneText}>{callData?.from || ''}</Text>

                    {callData?.businessType && (
                        <View style={styles.businessBadge}>
                            <Text style={styles.businessBadgeText}>{callData.businessType}</Text>
                        </View>
                    )}
                    
                    {/* Duration Timer */}
                    {isConnected ? (
                        <Text style={styles.timerText}>{formatTime(callDuration)}</Text>
                    ) : (
                        <View style={{ height: 25 }} />
                    )}

                    {/* Action Buttons */}
                    <View style={styles.actionContainer}>
                        {activeCall ? (
                            <>
                                <View style={styles.actionBtnWrapper}>
                                    <TouchableOpacity 
                                        style={[styles.actionButton, activeCall.isMuted ? styles.mutedButton : styles.activeButton]} 
                                        onPress={toggleMute}
                                    >
                                        <Icon name={activeCall.isMuted ? "microphone-off" : "microphone"} size={28} color="white" />
                                    </TouchableOpacity>
                                    <Text style={styles.actionText}>{activeCall.isMuted ? "Unmute" : "Mute"}</Text>
                                </View>

                                <View style={styles.actionBtnWrapper}>
                                    <TouchableOpacity 
                                        style={[styles.actionButton, styles.rejectButton]} 
                                        onPress={endCall}
                                    >
                                        <Icon name="phone-hangup" size={30} color="white" />
                                    </TouchableOpacity>
                                    <Text style={styles.actionText}>End Call</Text>
                                </View>
                            </>
                        ) : (
                            <>
                                <View style={styles.actionBtnWrapper}>
                                    <TouchableOpacity 
                                        style={[styles.actionButton, styles.rejectButton]} 
                                        onPress={() => rejectCall(incomingCall?.callId)}
                                    >
                                        <Icon name="phone-hangup" size={30} color="white" />
                                    </TouchableOpacity>
                                    <Text style={styles.actionText}>Decline</Text>
                                </View>

                                <View style={styles.actionBtnWrapper}>
                                    <TouchableOpacity 
                                        style={[styles.actionButton, styles.answerButton]} 
                                        onPress={() => answerCall(incomingCall?.callId, incomingCall?.sdp)}
                                    >
                                        <Icon name="phone" size={30} color="white" />
                                    </TouchableOpacity>
                                    <Text style={styles.actionText}>Answer</Text>
                                </View>
                            </>
                        )}
                    </View>
                    
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(7, 13, 20, 0.88)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20
    },
    popupContainer: {
        width: Math.min(width - 40, 380),
        backgroundColor: '#111b21',
        borderRadius: 28,
        paddingVertical: 35,
        paddingHorizontal: 25,
        alignItems: 'center',
        elevation: 15,
        shadowColor: '#000',
        shadowOpacity: 0.6,
        shadowRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)'
    },
    iconContainer: {
        position: 'relative',
        marginBottom: 16,
        justifyContent: 'center',
        alignItems: 'center'
    },
    rippleEffect: {
        position: 'absolute',
        width: 110,
        height: 110,
        borderRadius: 55,
        backgroundColor: 'rgba(37, 211, 102, 0.25)',
    },
    iconBackground: {
        width: 76,
        height: 76,
        backgroundColor: '#25D366',
        borderRadius: 38,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 6
    },
    activeIconBackground: {
        backgroundColor: '#00a884'
    },
    statusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(37, 211, 102, 0.12)',
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 16,
        marginBottom: 10
    },
    statusBadgeText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#25D366',
        letterSpacing: 0.3
    },
    nameText: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#e9edef',
        marginBottom: 4,
        textAlign: 'center'
    },
    phoneText: {
        fontSize: 15,
        color: '#8696a0',
        marginBottom: 8,
        fontWeight: '500'
    },
    businessBadge: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 10,
        marginBottom: 12
    },
    businessBadgeText: {
        fontSize: 11,
        color: '#aebac1',
        fontWeight: '600',
        textTransform: 'uppercase'
    },
    timerText: {
        fontSize: 28,
        fontWeight: '600',
        color: '#25D366',
        marginVertical: 10,
        fontFamily: 'monospace'
    },
    actionContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        width: '100%',
        marginTop: 15
    },
    actionBtnWrapper: {
        alignItems: 'center',
        justifyContent: 'center'
    },
    actionButton: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 66,
        height: 66,
        borderRadius: 33,
        elevation: 6
    },
    rejectButton: {
        backgroundColor: '#EF4444'
    },
    answerButton: {
        backgroundColor: '#25D366'
    },
    activeButton: {
        backgroundColor: '#374151'
    },
    mutedButton: {
        backgroundColor: '#F59E0B'
    },
    actionText: {
        color: '#e9edef',
        fontSize: 12,
        fontWeight: '600',
        marginTop: 8
    }
});

export default GlobalCallPopup;
