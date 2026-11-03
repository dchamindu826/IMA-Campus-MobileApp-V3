import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Dimensions, Animated } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useCall } from '../context/CallContext';

const { width } = Dimensions.get('window');

const GlobalCallPopup = () => {
    const {
        isRinging,
        incomingCall,
        activeCall,
        answerCall,
        rejectCall,
        endCall,
        toggleMute,
        isOnHold,
        toggleHold,
        isSpeakerOn,
        toggleSpeaker,
        isCallMinimized,
        toggleMinimize
    } = useCall();

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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeCall?.status]);

    useEffect(() => {
        if (isRinging || (activeCall && activeCall.status !== 'CONNECTED') || isOnHold) {
            const loop = Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1.25, duration: 800, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true })
                ])
            );
            loop.start();
            return () => loop.stop();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isRinging, activeCall?.status, isOnHold, pulseAnim]);

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
        if (isOnHold) return "Call on Hold ⏸️ (Music Playing)";
        if (activeCall?.isMuted) return "Microphone Muted 🔇";
        if (isConnected) return "WhatsApp Call in Progress";
        return "Connecting Call...";
    };

    return (
        <>
            {/* 1. FLOATING IN-CALL MINI BAR (Shown when staff minimizes call to control app in background) */}
            {activeCall && isCallMinimized && (
                <View style={styles.floatingContainer} pointerEvents="box-none">
                    <TouchableOpacity
                        style={[styles.floatingPill, isOnHold && styles.floatingPillHold]}
                        activeOpacity={0.9}
                        onPress={() => toggleMinimize(false)}
                    >
                        {/* Indicator Icon */}
                        <View style={[styles.floatingDot, isOnHold ? styles.floatingDotHold : styles.floatingDotActive]}>
                            <Icon name={isOnHold ? "pause" : "phone"} size={13} color="#FFFFFF" />
                        </View>

                        {/* Caller Info & Duration */}
                        <View style={styles.floatingInfo}>
                            <Text style={styles.floatingTitle} numberOfLines={1}>
                                {callData?.leadName || 'Student'}
                            </Text>
                            <Text style={[styles.floatingSub, isOnHold && styles.floatingSubHold]}>
                                {isOnHold ? "⏸️ On Hold • Music Playing" : `${formatTime(callDuration)} • In Progress`}
                            </Text>
                        </View>

                        {/* Quick Action Controls */}
                        <View style={styles.floatingActions}>
                            {/* Hold / Resume */}
                            <TouchableOpacity
                                style={[styles.miniBtn, isOnHold ? styles.miniBtnHoldActive : styles.miniBtnHold]}
                                onPress={toggleHold}
                                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                            >
                                <Icon name={isOnHold ? "play" : "pause"} size={16} color={isOnHold ? "#F59E0B" : "#E2E8F0"} />
                            </TouchableOpacity>

                            {/* Mute */}
                            <TouchableOpacity
                                style={[styles.miniBtn, activeCall.isMuted && styles.miniBtnMuted]}
                                onPress={toggleMute}
                                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                            >
                                <Icon name={activeCall.isMuted ? "microphone-off" : "microphone"} size={16} color={activeCall.isMuted ? "#EF4444" : "#E2E8F0"} />
                            </TouchableOpacity>

                            {/* Speaker */}
                            <TouchableOpacity
                                style={[styles.miniBtn, isSpeakerOn && styles.miniBtnSpeakerActive]}
                                onPress={toggleSpeaker}
                                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                            >
                                <Icon name={isSpeakerOn ? "volume-high" : "volume-medium"} size={16} color={isSpeakerOn ? "#10B981" : "#E2E8F0"} />
                            </TouchableOpacity>

                            {/* End Call */}
                            <TouchableOpacity
                                style={[styles.miniBtn, styles.miniBtnEnd]}
                                onPress={endCall}
                                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                            >
                                <Icon name="phone-hangup" size={16} color="#FFFFFF" />
                            </TouchableOpacity>

                            {/* Expand icon */}
                            <TouchableOpacity
                                style={styles.miniExpandBtn}
                                onPress={() => toggleMinimize(false)}
                                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                            >
                                <Icon name="arrow-expand" size={15} color="#94A3B8" />
                            </TouchableOpacity>
                        </View>
                    </TouchableOpacity>
                </View>
            )}

            {/* 2. FULL SCREEN CALL MODAL (Shown when incoming call rings or maximized) */}
            <Modal transparent={true} visible={(isRinging || !!activeCall) && !isCallMinimized} animationType="fade">
                <View style={styles.overlay}>
                    <View style={styles.popupContainer}>

                        {/* Top Header with Minimize shortcut for multitasking */}
                        <View style={styles.headerRow}>
                            <View style={styles.headerBadge}>
                                <Icon name="whatsapp" size={15} color="#25D366" style={{ marginRight: 5 }} />
                                <Text style={styles.headerBadgeText}>WhatsApp Audio Call</Text>
                            </View>

                            {activeCall && (
                                <TouchableOpacity
                                    style={styles.headerMinimizeBtn}
                                    onPress={() => toggleMinimize(true)}
                                    activeOpacity={0.7}
                                >
                                    <Icon name="arrow-collapse" size={16} color="#94A3B8" style={{ marginRight: 4 }} />
                                    <Text style={styles.headerMinimizeText}>Minimize</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* Pulsing Avatar Icon */}
                        <View style={styles.iconContainer}>
                            {(isRinging || isDialing || isRemoteRinging || isOnHold) && (
                                <Animated.View
                                    style={[
                                        styles.rippleEffect,
                                        isOnHold && styles.rippleHold,
                                        { transform: [{ scale: pulseAnim }] }
                                    ]}
                                />
                            )}
                            <View
                                style={[
                                    styles.iconBackground,
                                    isOnHold ? styles.holdIconBackground : isConnected ? styles.activeIconBackground : null
                                ]}
                            >
                                <Icon
                                    name={isOnHold ? "phone-paused" : isConnected ? "phone-in-talk" : isOutbound ? "phone-outgoing" : "phone-incoming"}
                                    size={38}
                                    color="white"
                                />
                            </View>
                        </View>

                        {/* Status Label */}
                        <View style={[styles.statusBadge, isOnHold && styles.statusBadgeHold]}>
                            <Icon
                                name={isOnHold ? "pause-circle" : "whatsapp"}
                                size={15}
                                color={isOnHold ? "#F59E0B" : "#25D366"}
                                style={{ marginRight: 6 }}
                            />
                            <Text style={[styles.statusBadgeText, isOnHold && styles.statusBadgeTextHold]}>
                                {getStatusText()}
                            </Text>
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
                            <Text style={[styles.timerText, isOnHold && styles.timerTextHold]}>
                                {formatTime(callDuration)}
                            </Text>
                        ) : (
                            <View style={{ height: 25 }} />
                        )}

                        {/* Action Buttons */}
                        <View style={styles.actionContainer}>
                            {activeCall ? (
                                <>
                                    {/* Mute Button */}
                                    <View style={styles.actionBtnWrapper}>
                                        <TouchableOpacity
                                            style={[styles.actionButton, activeCall.isMuted ? styles.mutedButton : styles.activeButton]}
                                            onPress={toggleMute}
                                        >
                                            <Icon name={activeCall.isMuted ? "microphone-off" : "microphone"} size={26} color="white" />
                                        </TouchableOpacity>
                                        <Text style={styles.actionText}>{activeCall.isMuted ? "Unmute" : "Mute"}</Text>
                                    </View>

                                    {/* Speaker Button */}
                                    <View style={styles.actionBtnWrapper}>
                                        <TouchableOpacity
                                            style={[styles.actionButton, isSpeakerOn ? styles.speakerActiveButton : styles.activeButton]}
                                            onPress={toggleSpeaker}
                                        >
                                            <Icon name={isSpeakerOn ? "volume-high" : "volume-medium"} size={26} color="white" />
                                        </TouchableOpacity>
                                        <Text style={[styles.actionText, isSpeakerOn && styles.actionTextSpeaker]}>
                                            {isSpeakerOn ? "Speaker" : "Speaker"}
                                        </Text>
                                    </View>

                                    {/* Hold Call Button (Plays music for caller) */}
                                    <View style={styles.actionBtnWrapper}>
                                        <TouchableOpacity
                                            style={[styles.actionButton, isOnHold ? styles.holdActiveButton : styles.activeButton]}
                                            onPress={toggleHold}
                                        >
                                            <Icon name={isOnHold ? "play" : "pause"} size={26} color="white" />
                                        </TouchableOpacity>
                                        <Text style={[styles.actionText, isOnHold && styles.actionTextHold]}>
                                            {isOnHold ? "Resume" : "Hold"}
                                        </Text>
                                    </View>

                                    {/* Minimize / Multitask in App Button */}
                                    <View style={styles.actionBtnWrapper}>
                                        <TouchableOpacity
                                            style={[styles.actionButton, styles.activeButton]}
                                            onPress={() => toggleMinimize(true)}
                                        >
                                            <Icon name="arrow-collapse" size={26} color="white" />
                                        </TouchableOpacity>
                                        <Text style={styles.actionText}>Use App</Text>
                                    </View>

                                    {/* End Call Button */}
                                    <View style={styles.actionBtnWrapper}>
                                        <TouchableOpacity
                                            style={[styles.actionButton, styles.rejectButton]}
                                            onPress={endCall}
                                        >
                                            <Icon name="phone-hangup" size={28} color="white" />
                                        </TouchableOpacity>
                                        <Text style={styles.actionText}>End</Text>
                                    </View>
                                </>
                            ) : (
                                <>
                                    {/* Decline */}
                                    <View style={styles.actionBtnWrapper}>
                                        <TouchableOpacity
                                            style={[styles.actionButton, styles.rejectButton]}
                                            onPress={() => rejectCall(incomingCall?.callId)}
                                        >
                                            <Icon name="phone-hangup" size={30} color="white" />
                                        </TouchableOpacity>
                                        <Text style={styles.actionText}>Decline</Text>
                                    </View>

                                    {/* Answer */}
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
        </>
    );
};

const styles = StyleSheet.create({
    // Floating Pill Container
    floatingContainer: {
        position: 'absolute',
        top: 50,
        left: 12,
        right: 12,
        zIndex: 999999,
        elevation: 25
    },
    floatingPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#111b21',
        borderRadius: 22,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderWidth: 1.5,
        borderColor: '#25D366',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.5,
        shadowRadius: 10,
        elevation: 12
    },
    floatingPillHold: {
        borderColor: '#F59E0B',
        backgroundColor: '#1A1D1A'
    },
    floatingDot: {
        width: 28,
        height: 28,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10
    },
    floatingDotActive: {
        backgroundColor: '#25D366'
    },
    floatingDotHold: {
        backgroundColor: '#F59E0B'
    },
    floatingInfo: {
        flex: 1,
        justifyContent: 'center'
    },
    floatingTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#FFFFFF'
    },
    floatingSub: {
        fontSize: 11,
        color: '#25D366',
        fontWeight: '600',
        marginTop: 1
    },
    floatingSubHold: {
        color: '#F59E0B'
    },
    floatingActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6
    },
    miniBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.12)'
    },
    miniBtnHold: {
        backgroundColor: 'rgba(245, 158, 11, 0.2)'
    },
    miniBtnHoldActive: {
        backgroundColor: 'rgba(245, 158, 11, 0.35)',
        borderWidth: 1,
        borderColor: '#F59E0B'
    },
    miniBtnMuted: {
        backgroundColor: 'rgba(239, 68, 68, 0.25)'
    },
    miniBtnEnd: {
        backgroundColor: '#EF4444'
    },
    miniExpandBtn: {
        width: 26,
        height: 26,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 2
    },

    // Full Screen Modal Overlay
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(7, 13, 20, 0.90)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20
    },
    popupContainer: {
        width: Math.min(width - 32, 390),
        backgroundColor: '#111b21',
        borderRadius: 28,
        paddingVertical: 26,
        paddingHorizontal: 22,
        alignItems: 'center',
        elevation: 15,
        shadowColor: '#000',
        shadowOpacity: 0.6,
        shadowRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)'
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        marginBottom: 16
    },
    headerBadge: {
        flexDirection: 'row',
        alignItems: 'center'
    },
    headerBadgeText: {
        fontSize: 12,
        color: '#8696a0',
        fontWeight: '600'
    },
    headerMinimizeBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 14
    },
    headerMinimizeText: {
        fontSize: 11,
        color: '#CBD5E1',
        fontWeight: '600'
    },
    iconContainer: {
        position: 'relative',
        marginBottom: 14,
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
    rippleHold: {
        backgroundColor: 'rgba(245, 158, 11, 0.25)',
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
    holdIconBackground: {
        backgroundColor: '#D97706'
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
    statusBadgeHold: {
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
    },
    statusBadgeText: {
        fontSize: 13,
        fontWeight: '700',
        color: '#25D366',
        letterSpacing: 0.3
    },
    statusBadgeTextHold: {
        color: '#F59E0B'
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
        marginVertical: 8,
        fontFamily: 'monospace'
    },
    timerTextHold: {
        color: '#F59E0B'
    },
    actionContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        width: '100%',
        marginTop: 15
    },
    actionBtnWrapper: {
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1
    },
    actionButton: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 58,
        height: 58,
        borderRadius: 29,
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
    holdActiveButton: {
        backgroundColor: '#D97706',
        borderWidth: 2,
        borderColor: '#FDE68A'
    },
    speakerActiveButton: {
        backgroundColor: '#00a884',
        borderWidth: 2,
        borderColor: '#25D366'
    },
    miniBtnSpeakerActive: {
        backgroundColor: 'rgba(0, 168, 132, 0.35)',
        borderColor: '#25D366',
        borderWidth: 1
    },
    actionText: {
        color: '#e9edef',
        fontSize: 11,
        fontWeight: '600',
        marginTop: 7,
        textAlign: 'center'
    },
    actionTextHold: {
        color: '#F59E0B'
    },
    actionTextSpeaker: {
        color: '#25D366'
    }
});

export default GlobalCallPopup;
