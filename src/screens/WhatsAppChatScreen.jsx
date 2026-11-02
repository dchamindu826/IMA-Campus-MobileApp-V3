import React, { useState, useEffect, useRef, useContext, useMemo, useCallback } from 'react';
import {
    View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
    ImageBackground, Image, ActivityIndicator, Modal, KeyboardAvoidingView,
    Platform, Dimensions, Alert, StatusBar, DeviceEventEmitter, ScrollView
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Video from 'react-native-video';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../services/api';
import { useCall } from '../context/CallContext';
import { AuthContext } from '../context/AuthContext';

const { width } = Dimensions.get('window');

export default function WhatsAppChatScreen({ route, navigation }) {
    const insets = useSafeAreaInsets();
    const { socket, startOutboundCall } = useCall();
    const { userInfo } = useContext(AuthContext);

    const {
        lead,
        businessId,
        businessName = 'IMA Campus',
        crmType = 'FREE_SEMINAR',
        isDarkMode: initialDark = true
    } = route.params || {};

    const [isDarkMode, setIsDarkMode] = useState(initialDark);
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [inputText, setInputText] = useState('');
    const [sending, setSending] = useState(false);

    // Audio Playback State
    const [playingAudioId, setPlayingAudioId] = useState(null);
    const [audioUrl, setAudioUrl] = useState(null);

    // Modals
    const [showQuickReplies, setShowQuickReplies] = useState(false);
    const [quickReplies, setQuickReplies] = useState([]);
    const [showLeadDetails, setShowLeadDetails] = useState(false);
    const [callLogs, setCallLogs] = useState([]);
    const [showCallHistoryModal, setShowCallHistoryModal] = useState(false);

    const flatListRef = useRef(null);

    const theme = useMemo(() => isDarkMode ? {
        headerBg: '#881337',
        bg: '#0F172A',
        bubbleIn: '#1E293B',
        bubbleOut: '#005c4b',
        textIn: '#F8FAFC',
        textOut: '#F8FAFC',
        timeIn: '#94A3B8',
        timeOut: '#94A3B8',
        inputBarBg: '#1E293B',
        inputBoxBg: '#334155',
        inputText: '#F8FAFC',
        iconColor: '#94A3B8',
        sendBtn: '#EF4444',
        dateChipBg: 'rgba(15, 23, 42, 0.92)',
        dateChipText: '#94A3B8',
        doodleImg: require('../assets/whatsapp-bg-dark.png')
    } : {
        headerBg: '#D32F2F',
        bg: '#F8FAFC',
        bubbleIn: '#FFFFFF',
        bubbleOut: '#d9fdd3',
        textIn: '#0F172A',
        textOut: '#0F172A',
        timeIn: '#64748B',
        timeOut: '#64748B',
        inputBarBg: '#F1F5F9',
        inputBoxBg: '#FFFFFF',
        inputText: '#0F172A',
        iconColor: '#64748B',
        sendBtn: '#D32F2F',
        dateChipBg: 'rgba(255, 255, 255, 0.95)',
        dateChipText: '#64748B',
        doodleImg: require('../assets/whatsapp-bg-light.png')
    }, [isDarkMode]);

    const leadId = lead?.id;
    const leadName = lead?.name ? lead.name.trim() : lead?.phone || 'Lead';
    const leadPhone = lead?.phone || '';

    // Fetch Messages
    const fetchMessages = useCallback(async () => {
        if (!leadId) return;
        try {
            const endpoint = crmType === 'FREE_SEMINAR'
                ? `/coordinator-crm/messages/${leadId}`
                : `/after-seminar-crm/messages/${leadId}`;
            
            const res = await api.get(endpoint);
            const msgList = Array.isArray(res.data) ? res.data : [];
            setMessages(msgList);
        } catch (e) {
            console.log("Mobile: Error fetching chat messages:", e?.message);
        } finally {
            setLoading(false);
        }
    }, [leadId, crmType]);

    // Fetch Quick Replies
    const fetchQuickReplies = async () => {
        try {
            const res = await api.get('/coordinator-crm/quick-replies');
            if (Array.isArray(res.data)) {
                setQuickReplies(res.data);
            }
        } catch (e) {}
    };

    useEffect(() => {
        fetchMessages();
        fetchQuickReplies();
    }, [leadId, fetchMessages]);

    // Socket real-time incoming messages
    useEffect(() => {
        if (!socket || !leadId) return;

        const handleNewMessage = (data) => {
            if (data?.leadId === leadId || String(data?.leadId) === String(leadId)) {
                console.log("Mobile: New message received for this lead, refreshing chat thread...");
                fetchMessages();
            }
        };

        socket.on('new_inbound_message', handleNewMessage);
        return () => {
            socket.off('new_inbound_message', handleNewMessage);
        };
    }, [socket, leadId, fetchMessages]);

    // Load Call History from local storage & sync
    const fetchCallHistory = useCallback(async () => {
        const cleanPhone = String(leadPhone || '').replace(/[^0-9]/g, '');
        if (!cleanPhone) return;
        try {
            const key = `@wa_call_history_${cleanPhone}`;
            const localData = await AsyncStorage.getItem(key);
            const localList = localData ? JSON.parse(localData) : [];
            setCallLogs(localList);
        } catch (e) {
            console.log("Mobile: Error loading call history:", e?.message);
        }
    }, [leadPhone]);

    useEffect(() => {
        fetchCallHistory();

        const sub = DeviceEventEmitter.addListener('new_call_history_event', (event) => {
            const cleanLead = String(leadPhone || '').replace(/[^0-9]/g, '');
            const eventPhone = String(event?.phone || '').replace(/[^0-9]/g, '');
            if (cleanLead && eventPhone && (cleanLead.endsWith(eventPhone) || eventPhone.endsWith(cleanLead))) {
                setCallLogs(prev => [event, ...prev.filter(c => c.id !== event.id)]);
            }
        });

        return () => sub.remove();
    }, [leadPhone, fetchCallHistory]);

    // Unified Feed (Messages + Voice Calls) sorted chronologically
    const mergedFeed = useMemo(() => {
        const allItems = [
            ...messages.map(m => ({ ...m, feedType: 'MESSAGE' })),
            ...callLogs.map(c => ({ ...c, feedType: 'CALL_EVENT', isCall: true }))
        ];
        return allItems.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    }, [messages, callLogs]);

    // Robust Outbound vs Inbound detector
    const checkIsOutbound = useCallback((item) => {
        if (item.isPending || item.isOutbound === true || item.is_outbound === true || item.fromMe === true) return true;
        
        const dir = String(item.direction || '').trim().toLowerCase();
        if (dir === 'outbound' || dir === 'out') return true;
        if (dir === 'inbound' || dir === 'in') return false;

        const senderType = String(item.senderType || item.sender_type || item.senderRole || item.sender || '').trim().toUpperCase();
        if (['COORDINATOR', 'STAFF', 'ADMIN', 'SYSTEM', 'BOT', 'BUSINESS', 'AGENT'].includes(senderType)) return true;
        if (['STUDENT', 'LEAD', 'USER', 'CUSTOMER', 'CLIENT'].includes(senderType)) return false;

        const cleanLead = String(leadPhone || '').replace(/[^0-9]/g, '');
        if (item.to && cleanLead) {
            const cleanTo = String(item.to).replace(/[^0-9]/g, '');
            if (cleanTo && (cleanTo.endsWith(cleanLead) || cleanLead.endsWith(cleanTo))) return true;
        }
        if (item.from && cleanLead) {
            const cleanFrom = String(item.from).replace(/[^0-9]/g, '');
            if (cleanFrom && (cleanFrom.endsWith(cleanLead) || cleanLead.endsWith(cleanFrom))) return false;
        }

        if (item.senderName && (item.senderName === userInfo?.firstName || item.senderName === 'Staff')) {
            return true;
        }

        return false;
    }, [leadPhone, userInfo?.firstName]);

    // Send Message
    const handleSendMessage = async (textToSend) => {
        const text = textToSend || inputText;
        if (!text || !text.trim() || sending) return;

        setSending(true);
        setInputText('');

        try {
            const endpoint = crmType === 'FREE_SEMINAR'
                ? '/coordinator-crm/messages'
                : '/after-seminar-crm/messages';

            // Optimistic local update
            const tempMsg = {
                id: Date.now(),
                leadId,
                message: text.trim(),
                direction: 'OUTBOUND',
                senderType: 'COORDINATOR',
                createdAt: new Date().toISOString(),
                isPending: true
            };
            setMessages(prev => [...prev, tempMsg]);

            const res = await api.post(endpoint, {
                leadId,
                message: text.trim(),
                senderName: userInfo?.firstName || 'Staff'
            });

            if (res.data?.success || res.data?.message) {
                fetchMessages();
            }
        } catch (e) {
            console.log("Mobile: Error sending message:", e?.message);
            Alert.alert("Send Failed", e.response?.data?.error || "Could not send WhatsApp message.");
            fetchMessages();
        } finally {
            setSending(false);
        }
    };

    // Outbound Call
    const handleStartCall = () => {
        startOutboundCall({
            lead: {
                phone: leadPhone,
                name: leadName,
                businessId: businessId,
                campaignType: crmType
            },
            businessId,
            campaignType: crmType
        });
    };

    const togglePlayAudio = (msg) => {
        if (playingAudioId === msg.id) {
            setPlayingAudioId(null);
            setAudioUrl(null);
        } else {
            const raw = msg.mediaUrl || '';
            const fullUrl = raw.startsWith('http') 
                ? raw 
                : `${api.defaults.baseURL.replace('/api/', '').replace('/api', '')}${raw}`;
            setAudioUrl(fullUrl);
            setPlayingAudioId(msg.id);
        }
    };

    const formatDateLabel = (dateStr) => {
        const d = new Date(dateStr);
        const now = new Date();
        if (d.toDateString() === now.toDateString()) return 'TODAY';
        const yest = new Date(now);
        yest.setDate(yest.getDate() - 1);
        if (d.toDateString() === yest.toDateString()) return 'YESTERDAY';
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();
    };

    const renderMessageBubble = ({ item, index }) => {
        // Date separator
        const prevMsg = index > 0 ? mergedFeed[index - 1] : null;
        const showDate = !prevMsg || new Date(prevMsg.createdAt).toDateString() !== new Date(item.createdAt).toDateString();
        const timeStr = new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Call event bubble in chat stream
        if (item.feedType === 'CALL_EVENT' || item.isCall) {
            const isCallOutbound = item.direction === 'OUTBOUND';
            const isMissed = item.status === 'MISSED' || item.status === 'REJECTED';
            const callDurationStr = item.duration > 0 
                ? `${Math.floor(item.duration / 60)}m ${item.duration % 60}s` 
                : isMissed ? 'Missed Call' : 'Cancelled';

            return (
                <View key={item.id || index}>
                    {showDate && (
                        <View style={styles.dateSeparator}>
                            <View style={[styles.dateChip, { backgroundColor: theme.dateChipBg }]}>
                                <Text style={[styles.dateChipText, { color: theme.dateChipText }]}>
                                    {formatDateLabel(item.createdAt)}
                                </Text>
                            </View>
                        </View>
                    )}

                    <View style={styles.callEventRow}>
                        <View style={[styles.callEventBubble, { backgroundColor: isDarkMode ? '#1f2c34' : '#FFFFFF', borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E5E7EB' }]}>
                            <View style={[styles.callIconWrap, { backgroundColor: isMissed ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)' }]}>
                                <Icon 
                                    name={isMissed ? "phone-missed" : isCallOutbound ? "phone-outgoing" : "phone-incoming"} 
                                    size={18} 
                                    color={isMissed ? "#EF4444" : "#10B981"} 
                                />
                            </View>
                            <View style={{ flex: 1, marginLeft: 10 }}>
                                <Text style={[styles.callTitleText, { color: isDarkMode ? '#FFFFFF' : '#111827' }]}>
                                    {isMissed ? 'Missed WhatsApp Call' : isCallOutbound ? 'Outgoing WhatsApp Call' : 'Incoming WhatsApp Call'}
                                </Text>
                                <Text style={[styles.callSubText, { color: isMissed ? '#EF4444' : (isDarkMode ? '#8696a0' : '#6B7280') }]}>
                                    {callDurationStr} • {timeStr}
                                </Text>
                            </View>
                            <TouchableOpacity 
                                style={[styles.callBackBtn, { backgroundColor: isDarkMode ? 'rgba(37,211,102,0.15)' : '#E8F5E9' }]}
                                onPress={handleStartCall}
                                activeOpacity={0.8}
                            >
                                <Icon name="phone" size={14} color="#25D366" />
                                <Text style={styles.callBackText}>Call</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            );
        }

        const isOutbound = checkIsOutbound(item);
        const isAudio = Boolean(item.mediaType && item.mediaType.includes('audio')) || Boolean(item.mediaUrl && item.mediaUrl.match(/\.(mp3|ogg|wav|m4a)$/i));
        const isImage = Boolean(item.mediaType && item.mediaType.includes('image')) || Boolean(item.mediaUrl && item.mediaUrl.match(/\.(jpg|jpeg|png|webp|gif)$/i));
        const isDoc = Boolean(item.mediaUrl && !isAudio && !isImage);

        return (
            <View key={item.id || index}>
                {showDate && (
                    <View style={styles.dateSeparator}>
                        <View style={[styles.dateChip, { backgroundColor: theme.dateChipBg }]}>
                            <Text style={[styles.dateChipText, { color: theme.dateChipText }]}>
                                {formatDateLabel(item.createdAt)}
                            </Text>
                        </View>
                    </View>
                )}

                <View style={[styles.bubbleRow, isOutbound ? styles.bubbleRowOut : styles.bubbleRowIn]}>
                    <View style={[
                        styles.bubble, 
                        isOutbound 
                            ? { backgroundColor: theme.bubbleOut, borderTopRightRadius: 2, borderBottomRightRadius: 10, borderBottomLeftRadius: 10, borderTopLeftRadius: 10 } 
                            : { backgroundColor: theme.bubbleIn, borderTopLeftRadius: 2, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, borderTopRightRadius: 10 }
                    ]}>
                        
                        {/* Audio Voice Note Player */}
                        {isAudio && (
                            <View style={styles.audioBubbleContent}>
                                <TouchableOpacity 
                                    style={[styles.audioPlayBtn, { backgroundColor: isOutbound ? '#00a884' : '#25D366' }]}
                                    onPress={() => togglePlayAudio(item)}
                                    activeOpacity={0.8}
                                >
                                    <Icon 
                                        name={playingAudioId === item.id ? "pause" : "play"} 
                                        size={22} 
                                        color="#FFFFFF" 
                                    />
                                </TouchableOpacity>
                                <View style={styles.audioWaveform}>
                                    <View style={[styles.audioBar, { width: playingAudioId === item.id ? '70%' : '30%' }]} />
                                    <Text style={[styles.audioLabel, { color: isOutbound ? theme.timeOut : theme.timeIn }]}>
                                        {playingAudioId === item.id ? 'Playing Voice Note...' : 'Voice Note'}
                                    </Text>
                                </View>
                            </View>
                        )}

                        {/* Image Attachment */}
                        {isImage && (
                            <View style={styles.imageWrap}>
                                <Image 
                                    source={{ uri: item.mediaUrl.startsWith('http') ? item.mediaUrl : `${api.defaults.baseURL.replace('/api/', '').replace('/api', '')}${item.mediaUrl}` }}
                                    style={styles.attachedImage}
                                    resizeMode="cover"
                                />
                            </View>
                        )}

                        {/* Document Attachment */}
                        {isDoc && (
                            <View style={styles.docWrap}>
                                <Icon name="file-document-outline" size={26} color={isOutbound ? '#aebac1' : '#3B82F6'} />
                                <Text style={[styles.docName, { color: isOutbound ? theme.textOut : theme.textIn }]} numberOfLines={1}>
                                    {item.mediaUrl.split('/').pop()}
                                </Text>
                            </View>
                        )}

                        {/* Text Message */}
                        {item.message && item.message.trim().length > 0 && (
                            <Text style={[styles.messageText, { color: isOutbound ? theme.textOut : theme.textIn }]}>
                                {item.message}
                            </Text>
                        )}

                        {/* Timestamp & WhatsApp Double Check ticks */}
                        <View style={styles.metaRow}>
                            <Text style={[styles.timeText, { color: isOutbound ? theme.timeOut : theme.timeIn }]}>
                                {timeStr}
                            </Text>
                            {isOutbound && (
                                <Icon 
                                    name={item.isPending ? "clock-outline" : "check-all"} 
                                    size={15} 
                                    color={item.isPending ? "#8696a0" : "#53bdeb"} 
                                    style={{ marginLeft: 4 }} 
                                />
                            )}
                        </View>
                    </View>
                </View>
            </View>
        );
    };

    return (
        <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
            style={[styles.container, { backgroundColor: theme.bg }]}
        >
            <StatusBar barStyle="light-content" backgroundColor={theme.headerBg} />

            {/* Hidden Video element for playing audio voice notes */}
            {audioUrl && playingAudioId && (
                <Video 
                    source={{ uri: audioUrl }}
                    audioOnly
                    paused={false}
                    onEnd={() => { setPlayingAudioId(null); setAudioUrl(null); }}
                    onError={() => { setPlayingAudioId(null); setAudioUrl(null); }}
                    style={{ width: 0, height: 0, position: 'absolute' }}
                />
            )}

            {/* WhatsApp Header */}
            <View style={[styles.header, { backgroundColor: theme.headerBg, paddingTop: Math.max(insets.top, 14) + 6 }]}>
                <TouchableOpacity 
                    onPress={() => navigation.goBack()}
                    style={styles.backBtn}
                    activeOpacity={0.8}
                >
                    <Icon name="arrow-left" size={24} color="#FFFFFF" />
                </TouchableOpacity>

                <TouchableOpacity 
                    style={styles.headerProfileRow}
                    activeOpacity={0.85}
                    onPress={() => setShowLeadDetails(true)}
                >
                    <View style={styles.avatarWrap}>
                        <Text style={styles.avatarText}>
                            {(leadName || 'L').slice(0, 2).toUpperCase()}
                        </Text>
                    </View>
                    <View style={styles.headerInfo}>
                        <Text style={styles.headerName} numberOfLines={1}>{leadName}</Text>
                        <Text style={styles.headerPhone} numberOfLines={1}>{leadPhone}</Text>
                    </View>
                </TouchableOpacity>

                <View style={styles.headerActions}>
                    {/* Call History Button */}
                    <TouchableOpacity 
                        onPress={() => setShowCallHistoryModal(true)}
                        style={styles.headerIconBtn}
                        activeOpacity={0.8}
                    >
                        <Icon name="phone-log" size={21} color="#FFFFFF" />
                        {callLogs.length > 0 && (
                            <View style={styles.headerBadge}>
                                <Text style={styles.headerBadgeText}>{callLogs.length}</Text>
                            </View>
                        )}
                    </TouchableOpacity>

                    {/* Outbound WhatsApp Call Button */}
                    <TouchableOpacity 
                        onPress={handleStartCall}
                        style={styles.headerIconBtn}
                        activeOpacity={0.8}
                    >
                        <Icon name="phone" size={22} color="#FFFFFF" />
                    </TouchableOpacity>

                    {/* Details Info Button */}
                    <TouchableOpacity 
                        onPress={() => setShowLeadDetails(true)}
                        style={styles.headerIconBtn}
                        activeOpacity={0.8}
                    >
                        <Icon name="information-outline" size={22} color="#FFFFFF" />
                    </TouchableOpacity>

                    {/* Theme Toggle Button */}
                    <TouchableOpacity 
                        onPress={() => setIsDarkMode(!isDarkMode)}
                        style={styles.headerIconBtn}
                        activeOpacity={0.8}
                    >
                        <Icon name={isDarkMode ? "white-balance-sunny" : "moon-waning-crescent"} size={20} color="#FFFFFF" />
                    </TouchableOpacity>
                </View>
            </View>

            {/* WhatsApp Chat Area with Doodle Wallpaper */}
            <ImageBackground 
                source={theme.doodleImg}
                style={styles.chatBackground}
                resizeMode="repeat"
                imageStyle={{ opacity: isDarkMode ? 0.12 : 0.18 }}
            >
                {loading ? (
                    <View style={styles.centerContainer}>
                        <ActivityIndicator size="large" color="#25D366" />
                    </View>
                ) : (
                    <FlatList 
                        ref={flatListRef}
                        data={mergedFeed}
                        keyExtractor={(item, idx) => String(item.id || item._id || idx)}
                        renderItem={renderMessageBubble}
                        contentContainerStyle={styles.messagesList}
                        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                        onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
                    />
                )}

                {/* Bottom WhatsApp Message Input Bar */}
                <View style={[styles.inputBar, { backgroundColor: theme.inputBarBg, paddingBottom: Math.max(insets.bottom, 8) }]}>
                    {/* Plus / Quick Reply Button */}
                    <TouchableOpacity 
                        style={styles.attachBtn}
                        onPress={() => setShowQuickReplies(true)}
                        activeOpacity={0.8}
                    >
                        <Icon name="lightning-bolt" size={22} color="#F59E0B" />
                    </TouchableOpacity>

                    {/* Input Pill */}
                    <View style={[styles.inputWrapper, { backgroundColor: theme.inputBoxBg }]}>
                        <TextInput 
                            placeholder="Message"
                            placeholderTextColor={theme.iconColor}
                            style={[styles.textInput, { color: theme.inputText }]}
                            value={inputText}
                            onChangeText={setInputText}
                            multiline
                            maxHeight={100}
                        />
                    </View>

                    {/* Send Button */}
                    <TouchableOpacity 
                        style={[styles.sendBtn, { backgroundColor: theme.sendBtn }]}
                        onPress={() => handleSendMessage()}
                        disabled={sending}
                        activeOpacity={0.85}
                    >
                        {sending ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                            <Icon name="send" size={20} color="#FFFFFF" />
                        )}
                    </TouchableOpacity>
                </View>
            </ImageBackground>

            {/* Quick Replies Picker Modal */}
            <Modal visible={showQuickReplies} transparent animationType="slide">
                <TouchableOpacity 
                    style={styles.modalBackdrop}
                    activeOpacity={1}
                    onPress={() => setShowQuickReplies(false)}
                >
                    <View style={[styles.bottomSheet, { backgroundColor: isDarkMode ? '#1f2c34' : '#FFFFFF' }]}>
                        <View style={styles.sheetHeader}>
                            <Icon name="lightning-bolt" size={22} color="#F59E0B" style={{ marginRight: 8 }} />
                            <Text style={[styles.sheetTitle, { color: isDarkMode ? '#FFFFFF' : '#111827' }]}>
                                Quick Replies & Templates
                            </Text>
                            <TouchableOpacity onPress={() => setShowQuickReplies(false)} style={{ marginLeft: 'auto' }}>
                                <Icon name="close" size={22} color={isDarkMode ? '#8696a0' : '#6B7280'} />
                            </TouchableOpacity>
                        </View>

                        {quickReplies.length === 0 ? (
                            <View style={{ padding: 25, alignItems: 'center' }}>
                                <Text style={{ color: isDarkMode ? '#8696a0' : '#6B7280' }}>No Quick Replies configured yet.</Text>
                            </View>
                        ) : (
                            <FlatList 
                                data={quickReplies}
                                keyExtractor={(item) => String(item.id)}
                                renderItem={({ item }) => (
                                    <TouchableOpacity 
                                        style={[styles.qrItem, { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#E5E7EB' }]}
                                        onPress={() => {
                                            setShowQuickReplies(false);
                                            handleSendMessage(item.message);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[styles.qrTitle, { color: isDarkMode ? '#25D366' : '#008069' }]}>
                                            /{item.title || item.shortcut || 'Reply'}
                                        </Text>
                                        <Text style={[styles.qrMsg, { color: isDarkMode ? '#e9edef' : '#374151' }]} numberOfLines={2}>
                                            {item.message}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            />
                        )}
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* Lead Details Modal */}
            <Modal visible={showLeadDetails} transparent animationType="fade">
                <TouchableOpacity 
                    style={styles.modalBackdrop}
                    activeOpacity={1}
                    onPress={() => setShowLeadDetails(false)}
                >
                    <View style={[styles.detailsCard, { backgroundColor: isDarkMode ? '#1f2c34' : '#FFFFFF' }]}>
                        <View style={styles.detailsHeader}>
                            <View style={styles.avatarWrapLarge}>
                                <Text style={styles.avatarTextLarge}>{(leadName || 'L').slice(0, 2).toUpperCase()}</Text>
                            </View>
                            <Text style={[styles.detailsName, { color: isDarkMode ? '#FFFFFF' : '#111827' }]}>{leadName}</Text>
                            <Text style={[styles.detailsPhone, { color: isDarkMode ? '#8696a0' : '#6B7280' }]}>{leadPhone}</Text>
                        </View>

                        <View style={styles.detailsBody}>
                            <View style={styles.detailRow}>
                                <Text style={[styles.detailKey, { color: isDarkMode ? '#8696a0' : '#6B7280' }]}>Business:</Text>
                                <Text style={[styles.detailVal, { color: isDarkMode ? '#e9edef' : '#111827' }]}>{businessName}</Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={[styles.detailKey, { color: isDarkMode ? '#8696a0' : '#6B7280' }]}>CRM Type:</Text>
                                <Text style={[styles.detailVal, { color: '#25D366' }]}>{crmType === 'FREE_SEMINAR' ? 'Free Seminar' : 'After Seminar'}</Text>
                            </View>
                            {lead?.batch?.name && (
                                <View style={styles.detailRow}>
                                    <Text style={[styles.detailKey, { color: isDarkMode ? '#8696a0' : '#6B7280' }]}>Batch:</Text>
                                    <Text style={[styles.detailVal, { color: isDarkMode ? '#e9edef' : '#111827' }]}>{lead.batch.name}</Text>
                                </View>
                            )}
                            {lead?.status && (
                                <View style={styles.detailRow}>
                                    <Text style={[styles.detailKey, { color: isDarkMode ? '#8696a0' : '#6B7280' }]}>Status:</Text>
                                    <Text style={[styles.detailVal, { color: isDarkMode ? '#e9edef' : '#111827' }]}>{lead.status}</Text>
                                </View>
                            )}
                        </View>

                        <TouchableOpacity 
                            style={styles.closeBtn}
                            onPress={() => setShowLeadDetails(false)}
                            activeOpacity={0.8}
                        >
                            <Text style={styles.closeBtnText}>CLOSE</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* Call History Modal with Date Breakdown */}
            <Modal
                visible={showCallHistoryModal}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setShowCallHistoryModal(false)}
            >
                <TouchableOpacity 
                    style={styles.modalBackdrop} 
                    activeOpacity={1} 
                    onPress={() => setShowCallHistoryModal(false)}
                >
                    <View style={[styles.callHistorySheet, { backgroundColor: isDarkMode ? '#1f2c34' : '#FFFFFF' }]} onStartShouldSetResponder={() => true}>
                        <View style={styles.sheetHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Icon name="phone-log" size={22} color="#25D366" style={{ marginRight: 8 }} />
                                <Text style={[styles.sheetTitle, { color: isDarkMode ? '#FFFFFF' : '#111827' }]}>
                                    Call History ({callLogs.length})
                                </Text>
                            </View>
                            <TouchableOpacity onPress={() => setShowCallHistoryModal(false)} style={{ marginLeft: 'auto' }}>
                                <Icon name="close" size={22} color={isDarkMode ? '#8696a0' : '#6B7280'} />
                            </TouchableOpacity>
                        </View>

                        {callLogs.length === 0 ? (
                            <View style={{ padding: 40, alignItems: 'center' }}>
                                <Icon name="phone-missed" size={44} color={isDarkMode ? '#8696a0' : '#9CA3AF'} style={{ opacity: 0.5, marginBottom: 10 }} />
                                <Text style={{ color: isDarkMode ? '#8696a0' : '#6B7280', fontSize: 15, fontWeight: '600' }}>No call records yet for this lead</Text>
                                <Text style={{ color: isDarkMode ? '#8696a0' : '#9CA3AF', fontSize: 13, marginTop: 4, textAlign: 'center' }}>WhatsApp voice calls will automatically appear here with duration and timestamps.</Text>
                            </View>
                        ) : (
                            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                                {callLogs.map((c, i) => {
                                    const isOut = c.direction === 'OUTBOUND';
                                    const isMissed = c.status === 'MISSED' || c.status === 'REJECTED';
                                    const dur = c.duration > 0 ? `${Math.floor(c.duration / 60)}m ${c.duration % 60}s` : isMissed ? 'Missed' : 'No answer';
                                    const dateHeader = formatDateLabel(c.createdAt);
                                    const prevDate = i > 0 ? formatDateLabel(callLogs[i - 1].createdAt) : null;
                                    const showHeader = prevDate !== dateHeader;

                                    return (
                                        <View key={c.id || i}>
                                            {showHeader && (
                                                <View style={[styles.historyDateChip, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F3F4F6' }]}>
                                                    <Text style={[styles.historyDateText, { color: isDarkMode ? '#8696a0' : '#6B7280' }]}>{dateHeader}</Text>
                                                </View>
                                            )}
                                            <View style={[styles.historyItemRow, { borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.05)' : '#F3F4F6' }]}>
                                                <View style={[styles.historyIcon, { backgroundColor: isMissed ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)' }]}>
                                                    <Icon 
                                                        name={isMissed ? "phone-missed" : isOut ? "phone-outgoing" : "phone-incoming"} 
                                                        size={18} 
                                                        color={isMissed ? "#EF4444" : "#10B981"} 
                                                    />
                                                </View>
                                                <View style={{ flex: 1, marginLeft: 12 }}>
                                                    <Text style={[styles.historyItemTitle, { color: isDarkMode ? '#FFFFFF' : '#111827' }]}>
                                                        {isMissed ? 'Missed WhatsApp Call' : isOut ? 'Outgoing WhatsApp Call' : 'Incoming WhatsApp Call'}
                                                    </Text>
                                                    <Text style={[styles.historyItemSub, { color: isMissed ? '#EF4444' : (isDarkMode ? '#8696a0' : '#6B7280') }]}>
                                                        {dur} • {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </Text>
                                                </View>
                                                <TouchableOpacity 
                                                    style={[styles.historyCallBtn, { backgroundColor: isDarkMode ? 'rgba(37,211,102,0.15)' : '#E8F5E9' }]}
                                                    onPress={() => {
                                                        setShowCallHistoryModal(false);
                                                        handleStartCall();
                                                    }}
                                                >
                                                    <Icon name="phone" size={16} color="#25D366" />
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    );
                                })}
                            </ScrollView>
                        )}
                    </View>
                </TouchableOpacity>
            </Modal>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingBottom: 10,
        elevation: 6
    },
    backBtn: {
        padding: 6,
        marginRight: 4
    },
    headerProfileRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1
    },
    avatarWrap: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: 'rgba(255, 255, 255, 0.25)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10
    },
    avatarText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: 'bold'
    },
    headerInfo: {
        flex: 1
    },
    headerName: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold'
    },
    headerPhone: {
        color: 'rgba(255, 255, 255, 0.75)',
        fontSize: 11,
        marginTop: 1
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6
    },
    headerIconBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center'
    },
    chatBackground: {
        flex: 1
    },
    messagesList: {
        paddingHorizontal: 12,
        paddingVertical: 12
    },
    dateSeparator: {
        alignItems: 'center',
        marginVertical: 12
    },
    dateChip: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 8,
        elevation: 1
    },
    dateChipText: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.4
    },
    bubbleRow: {
        flexDirection: 'row',
        marginVertical: 3
    },
    bubbleRowOut: {
        justifyContent: 'flex-end'
    },
    bubbleRowIn: {
        justifyContent: 'flex-start'
    },
    bubble: {
        maxWidth: width * 0.78,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        elevation: 1
    },
    messageText: {
        fontSize: 15,
        lineHeight: 20
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-end',
        marginTop: 3
    },
    timeText: {
        fontSize: 11
    },
    audioBubbleContent: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
        marginBottom: 4
    },
    audioPlayBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10
    },
    audioWaveform: {
        flex: 1,
        justifyContent: 'center'
    },
    audioBar: {
        height: 4,
        backgroundColor: '#25D366',
        borderRadius: 2,
        marginBottom: 4
    },
    audioLabel: {
        fontSize: 11
    },
    imageWrap: {
        borderRadius: 8,
        overflow: 'hidden',
        marginBottom: 6
    },
    attachedImage: {
        width: width * 0.65,
        height: 200,
        borderRadius: 8
    },
    docWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 8,
        borderRadius: 8,
        backgroundColor: 'rgba(0,0,0,0.06)',
        marginBottom: 6
    },
    docName: {
        fontSize: 13,
        fontWeight: 'bold',
        marginLeft: 8,
        flex: 1
    },
    inputBar: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 8,
        paddingTop: 8
    },
    attachBtn: {
        width: 42,
        height: 42,
        borderRadius: 21,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 2
    },
    inputWrapper: {
        flex: 1,
        borderRadius: 22,
        paddingHorizontal: 14,
        paddingVertical: Platform.OS === 'ios' ? 8 : 4,
        marginHorizontal: 6,
        minHeight: 42,
        justifyContent: 'center'
    },
    textInput: {
        fontSize: 15,
        paddingVertical: 0
    },
    sendBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 1,
        elevation: 3
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center'
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        justifyContent: 'flex-end'
    },
    bottomSheet: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '65%',
        padding: 18
    },
    sheetHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 14
    },
    sheetTitle: {
        fontSize: 16,
        fontWeight: 'bold'
    },
    qrItem: {
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth
    },
    qrTitle: {
        fontSize: 14,
        fontWeight: 'bold',
        marginBottom: 2
    },
    qrMsg: {
        fontSize: 13
    },
    detailsCard: {
        margin: 20,
        borderRadius: 24,
        padding: 24,
        alignSelf: 'center',
        width: Math.min(width - 40, 360)
    },
    detailsHeader: {
        alignItems: 'center',
        marginBottom: 18
    },
    avatarWrapLarge: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#008069',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10
    },
    avatarTextLarge: {
        color: '#FFFFFF',
        fontSize: 24,
        fontWeight: 'bold'
    },
    detailsName: {
        fontSize: 20,
        fontWeight: 'bold'
    },
    detailsPhone: {
        fontSize: 14,
        marginTop: 2
    },
    detailsBody: {
        marginBottom: 20
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(255,255,255,0.06)'
    },
    detailKey: {
        fontSize: 13
    },
    detailVal: {
        fontSize: 13,
        fontWeight: '600'
    },
    closeBtn: {
        backgroundColor: '#008069',
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: 'center'
    },
    closeBtnText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: 'bold'
    },
    headerBadge: {
        position: 'absolute',
        top: 2,
        right: 2,
        backgroundColor: '#25D366',
        borderRadius: 8,
        minWidth: 16,
        height: 16,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 3
    },
    headerBadgeText: {
        color: '#FFFFFF',
        fontSize: 9,
        fontWeight: 'bold'
    },
    callEventRow: {
        alignItems: 'center',
        marginVertical: 6,
        paddingHorizontal: 12
    },
    callEventBubble: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 14,
        borderWidth: 1,
        width: '100%',
        maxWidth: width * 0.92,
        elevation: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 2
    },
    callIconWrap: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center'
    },
    callTitleText: {
        fontSize: 14,
        fontWeight: '700'
    },
    callSubText: {
        fontSize: 12,
        marginTop: 2
    },
    callBackBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 16,
        gap: 4
    },
    callBackText: {
        color: '#25D366',
        fontSize: 12,
        fontWeight: '700'
    },
    callHistorySheet: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 16,
        maxHeight: '75%',
        width: '100%'
    },
    historyDateChip: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
        alignSelf: 'center',
        marginVertical: 8
    },
    historyDateText: {
        fontSize: 11,
        fontWeight: '700'
    },
    historyItemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth
    },
    historyIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center'
    },
    historyItemTitle: {
        fontSize: 14,
        fontWeight: '600'
    },
    historyItemSub: {
        fontSize: 12,
        marginTop: 2
    },
    historyCallBtn: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: 'rgba(37,211,102,0.12)',
        justifyContent: 'center',
        alignItems: 'center'
    }
});
