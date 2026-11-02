import React, { useState, useEffect, useRef, useContext, useMemo } from 'react';
import {
    View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
    ImageBackground, Image, ActivityIndicator, Modal, KeyboardAvoidingView,
    Platform, Dimensions, Alert, StatusBar
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Video from 'react-native-video';
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

    const flatListRef = useRef(null);

    const theme = useMemo(() => isDarkMode ? {
        headerBg: '#1f2c34',
        bg: '#0b141a',
        bubbleIn: '#202c33',
        bubbleOut: '#005c4b',
        textIn: '#e9edef',
        textOut: '#e9edef',
        timeIn: '#8696a0',
        timeOut: '#8696a0',
        inputBarBg: '#1f2c34',
        inputBoxBg: '#2a3942',
        inputText: '#e9edef',
        iconColor: '#8696a0',
        sendBtn: '#00a884',
        dateChipBg: 'rgba(17, 27, 33, 0.92)',
        dateChipText: '#8696a0',
        doodleImg: require('../assets/whatsapp-bg-dark.png')
    } : {
        headerBg: '#008069',
        bg: '#efeae2',
        bubbleIn: '#ffffff',
        bubbleOut: '#d9fdd3',
        textIn: '#111b21',
        textOut: '#111b21',
        timeIn: '#667781',
        timeOut: '#667781',
        inputBarBg: '#f0f2f5',
        inputBoxBg: '#ffffff',
        inputText: '#111b21',
        iconColor: '#54656f',
        sendBtn: '#008069',
        dateChipBg: 'rgba(255, 255, 255, 0.92)',
        dateChipText: '#54656f',
        doodleImg: require('../assets/whatsapp-bg-light.png')
    }, [isDarkMode]);

    const leadId = lead?.id;
    const leadName = lead?.name ? lead.name.trim() : lead?.phone || 'Lead';
    const leadPhone = lead?.phone || '';

    // Fetch Messages
    const fetchMessages = async () => {
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
    };

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
    }, [leadId]);

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
    }, [socket, leadId]);

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
        const isOutbound = item.direction === 'OUTBOUND';
        const isAudio = Boolean(item.mediaType && item.mediaType.includes('audio')) || Boolean(item.mediaUrl && item.mediaUrl.match(/\.(mp3|ogg|wav|m4a)$/i));
        const isImage = Boolean(item.mediaType && item.mediaType.includes('image')) || Boolean(item.mediaUrl && item.mediaUrl.match(/\.(jpg|jpeg|png|webp|gif)$/i));
        const isDoc = Boolean(item.mediaUrl && !isAudio && !isImage);

        // Date separator
        const prevMsg = index > 0 ? messages[index - 1] : null;
        const showDate = !prevMsg || new Date(prevMsg.createdAt).toDateString() !== new Date(item.createdAt).toDateString();

        const timeStr = new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        return (
            <View>
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
                        isOutbound ? { backgroundColor: theme.bubbleOut, borderTopRightRadius: 2 } : { backgroundColor: theme.bubbleIn, borderTopLeftRadius: 2 }
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
                        data={messages}
                        keyExtractor={(item) => String(item.id)}
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
    }
});
