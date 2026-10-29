import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Dimensions } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useCall } from '../context/CallContext';

const { width, height } = Dimensions.get('window');

const GlobalCallPopup = () => {
    const { isRinging, incomingCall, activeCall, answerCall, rejectCall, endCall, toggleMute } = useCall();
    const [callDuration, setCallDuration] = useState(0);

    useEffect(() => {
        let interval;
        if (activeCall) {
            setCallDuration(0);
            interval = setInterval(() => {
                setCallDuration(prev => prev + 1);
            }, 1000);
        } else {
            setCallDuration(0);
        }
        return () => clearInterval(interval);
    }, [activeCall]);

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
    };

    if (!isRinging && !activeCall) return null;

    const callData = activeCall || incomingCall;

    return (
        <Modal transparent={true} visible={isRinging || !!activeCall} animationType="fade">
            <View style={styles.overlay}>
                <View style={styles.popupContainer}>
                    
                    <View style={styles.iconContainer}>
                        {isRinging && <View style={styles.rippleEffect} />}
                        <View style={[styles.iconBackground, activeCall && styles.activeIconBackground]}>
                            <Icon name={activeCall ? "phone-in-talk" : "phone-ring"} size={40} color="white" />
                        </View>
                    </View>

                    <Text style={styles.titleText}>{activeCall ? "Active Call" : "Incoming Call"}</Text>
                    <Text style={styles.nameText}>{callData?.leadName}</Text>
                    <Text style={styles.phoneText}>{callData?.from}</Text>
                    
                    {activeCall && (
                        <Text style={styles.timerText}>{formatTime(callDuration)}</Text>
                    )}

                    <View style={[styles.actionContainer, { marginTop: activeCall ? 10 : 30 }]}>
                        {activeCall ? (
                            <>
                                <TouchableOpacity 
                                    style={[styles.actionButton, activeCall.isMuted ? styles.mutedButton : styles.activeButton]} 
                                    onPress={toggleMute}
                                >
                                    <Icon name={activeCall.isMuted ? "microphone-off" : "microphone"} size={30} color="white" />
                                    <Text style={styles.actionText}>{activeCall.isMuted ? "Unmute" : "Mute"}</Text>
                                </TouchableOpacity>

                                <TouchableOpacity 
                                    style={[styles.actionButton, styles.rejectButton]} 
                                    onPress={endCall}
                                >
                                    <Icon name="phone-hangup" size={30} color="white" />
                                    <Text style={styles.actionText}>End Call</Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                <TouchableOpacity 
                                    style={[styles.actionButton, styles.rejectButton]} 
                                    onPress={() => rejectCall(incomingCall.callId)}
                                >
                                    <Icon name="phone-hangup" size={30} color="white" />
                                    <Text style={styles.actionText}>Reject</Text>
                                </TouchableOpacity>

                                <TouchableOpacity 
                                    style={[styles.actionButton, styles.answerButton]} 
                                    onPress={() => answerCall(incomingCall.callId, incomingCall.sdp)}
                                >
                                    <Icon name="phone" size={30} color="white" />
                                    <Text style={styles.actionText}>Answer</Text>
                                </TouchableOpacity>
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
        backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20
    },
    popupContainer: {
        width: '100%',
        backgroundColor: '#1E293B',
        borderRadius: 24,
        padding: 40,
        alignItems: 'center',
        elevation: 10,
        shadowColor: '#000',
        shadowOpacity: 0.5,
        shadowRadius: 15,
        borderWidth: 1,
        borderColor: '#334155'
    },
    iconContainer: {
        position: 'relative',
        marginBottom: 20,
        justifyContent: 'center',
        alignItems: 'center'
    },
    rippleEffect: {
        position: 'absolute',
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: 'rgba(16, 185, 129, 0.4)',
    },
    iconBackground: {
        width: 80,
        height: 80,
        backgroundColor: '#10B981',
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 5
    },
    activeIconBackground: {
        backgroundColor: '#3B82F6'
    },
    titleText: {
        fontSize: 22,
        fontWeight: 'bold',
        color: 'white',
        marginBottom: 5,
        textTransform: 'uppercase',
        letterSpacing: 1
    },
    nameText: {
        fontSize: 26,
        fontWeight: '800',
        color: '#34D399',
        marginBottom: 5,
        textAlign: 'center'
    },
    phoneText: {
        fontSize: 16,
        color: '#94A3B8',
        marginBottom: 10,
        fontFamily: 'monospace'
    },
    timerText: {
        fontSize: 32,
        fontWeight: '300',
        color: 'white',
        marginBottom: 30,
        fontFamily: 'monospace'
    },
    actionContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        width: '100%',
    },
    actionButton: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 75,
        height: 75,
        borderRadius: 37.5,
        elevation: 5
    },
    rejectButton: {
        backgroundColor: '#EF4444'
    },
    answerButton: {
        backgroundColor: '#10B981'
    },
    activeButton: {
        backgroundColor: '#475569'
    },
    mutedButton: {
        backgroundColor: '#F59E0B'
    },
    actionText: {
        color: 'white',
        fontSize: 12,
        fontWeight: 'bold',
        position: 'absolute',
        bottom: -25,
        textAlign: 'center',
        width: 100
    }
});

export default GlobalCallPopup;
