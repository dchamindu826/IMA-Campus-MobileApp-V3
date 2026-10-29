import React, { useState, useEffect, useContext, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, Image, Modal, Alert, Animated } from 'react-native';
import { AuthContext } from '../context/AuthContext';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import io from 'socket.io-client';
import api from '../services/api';
import COLORS from '../constants/colors';
import { launchImageLibrary } from 'react-native-image-picker';

const DP_IMAGES = Array.from({ length: 20 }, (_, i) => `${(i + 1).toString().padStart(2, '0')}.jpg`);
const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

const CommunityChatScreen = ({ route, navigation }) => {
    const { businessId, businessName } = route.params || {};
    const { userInfo, userToken } = useContext(AuthContext);

    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState("");
    const [isLocked, setIsLocked] = useState(false);
    const [onlineCount, setOnlineCount] = useState(0);

    // Profile State
    const [showProfileSetup, setShowProfileSetup] = useState(false);
    const [tempUsername, setTempUsername] = useState("");
    const [selectedDp, setSelectedDp] = useState(DP_IMAGES[0]);
    const [chatProfile, setChatProfile] = useState(null);

    // AI Agent State
    const [showAIAgent, setShowAIAgent] = useState(false);

    // Interactions State
    const [selectedMessage, setSelectedMessage] = useState(null); // For reactions
    const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
    const [showPollModal, setShowPollModal] = useState(false);
    const [pollQuestion, setPollQuestion] = useState("");
    const [pollOptions, setPollOptions] = useState(["", ""]);

    const socketRef = useRef(null);
    const flatListRef = useRef(null);

    const userRole = String(userInfo?.role || 'Student').toUpperCase();
    const isStaff = userRole !== 'STUDENT' && userRole !== 'USER';

    useEffect(() => {
        if (!isStaff) {
            checkProfile();
        } else {
            initChat();
        }

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };
    }, []);

    const checkProfile = async () => {
        try {
            const res = await api.get('mobile/chat/profile');
            if (res.data?.profile?.appChatUsername) {
                setChatProfile({ username: res.data.profile.appChatUsername, dp: res.data.profile.appChatDp });
                initChat();
            } else {
                setShowProfileSetup(true);
            }
        } catch (e) {
            setShowProfileSetup(true);
        }
    };

    const saveProfile = async () => {
        if (!tempUsername.trim()) {
            Alert.alert("Error", "Please enter a username");
            return;
        }
        try {
            const res = await api.post('mobile/chat/profile', { username: tempUsername, dp: selectedDp });
            if (res.data.success) {
                setChatProfile({ username: res.data.profile.appChatUsername, dp: res.data.profile.appChatDp });
                setShowProfileSetup(false);
                initChat();
            }
        } catch (e) {
            Alert.alert("Error", e.response?.data?.error || "Failed to update profile");
        }
    };

    const initChat = async () => {
        if (!businessId) return;
        try {
            const res = await api.get(`mobile/chat/history/${businessId}`);
            if (res.data.success) {
                setMessages(res.data.messages);
                setIsLocked(res.data.isLocked);
            }

            const backendUrl = api.defaults.baseURL.split('/api')[0];
            socketRef.current = io(backendUrl, { auth: { token: userToken } });

            socketRef.current.on("connect_error", (err) => {
                Alert.alert("Debug", "Socket connection error: " + err.message);
            });

            socketRef.current.emit("join_business_chat", { businessId });

            socketRef.current.on("new_message", (msg) => {
                setMessages(prev => [msg, ...prev]);
            });

            socketRef.current.on("message_deleted", ({ messageId }) => {
                setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isDeleted: true } : m));
            });

            socketRef.current.on("message_pinned", ({ messageId, isPinned }) => {
                setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isPinned: isPinned } : m));
            });

            socketRef.current.on("message_updated", ({ messageId, metadata }) => {
                setMessages(prev => prev.map(m => m.id === messageId ? { ...m, metadata } : m));
            });

            socketRef.current.on("chat_locked_toggled", ({ isLocked }) => {
                setIsLocked(isLocked);
            });

            socketRef.current.on("online_count", ({ count }) => {
                setOnlineCount(count);
            });

            socketRef.current.on("error", (err) => {
                Alert.alert("Notice", err.message);
            });

        } catch (e) {
            console.log("Init Chat Error", e);
        }
    };

    const sendMessage = () => {
        if (!newMessage.trim()) return;

        if (!socketRef.current || !socketRef.current.connected) {
            Alert.alert("Error", "Chat is disconnected. Reconnecting...");
            socketRef.current?.connect();
            return;
        }

        socketRef.current.emit("send_message", { businessId, message: newMessage });
        setNewMessage("");
    };

    const sendImage = async () => {
        setShowAttachmentMenu(false);
        const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.8 });
        if (result.didCancel || !result.assets?.length) return;

        const asset = result.assets[0];
        const formData = new FormData();
        formData.append('image', {
            uri: Platform.OS === 'ios' ? asset.uri.replace('file://', '') : asset.uri,
            type: asset.type || 'image/jpeg',
            name: asset.fileName || 'upload.jpg',
        });

        try {
            // Reusing an existing image upload endpoint if available, or assume there's one
            const res = await api.post('mobile/chat/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (res.data.success && socketRef.current) {
                socketRef.current.emit("send_message", {
                    businessId,
                    message: "",
                    metadata: { attachmentUrl: res.data.imageUrl, type: 'image' }
                });
            }
        } catch (e) {
            Alert.alert("Error", "Image upload failed. Backend might need an endpoint for this.");
        }
    };

    const sendPoll = () => {
        setShowPollModal(false);
        if (!pollQuestion.trim() || pollOptions.some(o => !o.trim())) {
            Alert.alert("Error", "Please fill all poll fields.");
            return;
        }
        if (socketRef.current) {
            socketRef.current.emit("send_message", {
                businessId,
                message: "",
                metadata: {
                    poll: {
                        question: pollQuestion,
                        options: pollOptions,
                        votes: {}
                    }
                }
            });
        }
        setPollQuestion("");
        setPollOptions(["", ""]);
    };

    const reactToMessage = (messageId, emoji) => {
        setSelectedMessage(null);
        if (socketRef.current) {
            socketRef.current.emit("react_message", { messageId, businessId, emoji });
        }
    };

    const votePoll = (messageId, optionIndex) => {
        if (socketRef.current) {
            socketRef.current.emit("vote_poll", { messageId, businessId, optionIndex });
        }
    };

    const deleteMessage = (msgId) => {
        if (!isStaff) return;
        Alert.alert("Delete Message", "Are you sure?", [
            { text: "Cancel" },
            {
                text: "Delete", onPress: () => {
                    socketRef.current.emit("delete_message", { messageId: msgId, businessId });
                    setSelectedMessage(null);
                }
            }
        ]);
    };

    // Grouping messages by date
    const groupedMessages = useMemo(() => {
        const groups = [];
        let lastDate = null;

        // messages are inverted (newest first in flatlist, which means it renders from bottom to top)
        // We want DateHeaders to appear ABOVE the messages of that date. Since FlatList is inverted, 
        // the item at index N is visually BELOW index N+1. 
        // So when date changes, the DateHeader should be inserted AFTER the last message of that date in the array.
        messages.forEach((msg, index) => {
            groups.push(msg);

            const currentDateStr = new Date(msg.createdAt).toDateString();
            const nextMsg = messages[index + 1];
            const nextDateStr = nextMsg ? new Date(nextMsg.createdAt).toDateString() : null;

            if (currentDateStr !== nextDateStr) {
                groups.push({ id: `date_${currentDateStr}`, isDateHeader: true, date: currentDateStr, originalDate: msg.createdAt });
            }
        });
        return groups;
    }, [messages]);

    const renderMessage = ({ item }) => {
        if (item.isDateHeader) {
            return (
                <View style={styles.dateHeaderContainer}>
                    <View style={styles.dateHeaderBubble}>
                        <Text style={styles.dateHeaderText}>
                            {new Date(item.originalDate).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                        </Text>
                    </View>
                </View>
            );
        }

        const isMine = item.senderId === userInfo.id;

        if (item.isDeleted) {
            return (
                <View style={[styles.messageWrapper, isMine ? styles.messageMine : styles.messageOther]}>
                    <View style={[styles.messageBubble, { backgroundColor: '#f0f0f0' }]}>
                        <Text style={{ color: '#888', fontStyle: 'italic', fontSize: 13 }}>
                            {item.deletedByAI ? "🛡️ Removed by AI Moderation" : "🗑️ Deleted by Admin"}
                        </Text>
                    </View>
                </View>
            );
        }

        const baseUrl = api.defaults.baseURL.split('/api')[0];
        const dpUrl = item.sender?.appChatDp ? `${baseUrl}/storage/images/chat_dps/${item.sender.appChatDp}` : null;

        const metadata = item.metadata || {};
        const reactions = metadata.reactions || {};
        const reactionCounts = Object.values(reactions).reduce((acc, emoji) => {
            acc[emoji] = (acc[emoji] || 0) + 1;
            return acc;
        }, {});

        return (
            <TouchableOpacity
                activeOpacity={0.9}
                onLongPress={() => setSelectedMessage(item)}
                delayLongPress={400}
                style={[styles.messageWrapper, isMine ? styles.messageMine : styles.messageOther]}
            >
                {/* DP on the left for others */}
                {!isMine && (
                    <Image
                        source={dpUrl ? { uri: dpUrl } : require('../../assets/images/user-avatar.png')}
                        style={styles.avatar}
                        defaultSource={require('../../assets/images/user-avatar.png')}
                    />
                )}

                <View style={{ maxWidth: '85%' }}>
                    {/* Name */}
                    <Text style={[styles.senderName, isMine ? { alignSelf: 'flex-end', marginRight: 2 } : { marginLeft: 2 }]}>
                        {item.sender?.role !== 'Student' ? (item.sender?.firstName + ' 👑') : item.sender?.appChatUsername}
                    </Text>

                    <View style={[styles.messageBubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>

                        {/* Attachments */}
                        {metadata.attachmentUrl && (
                            <Image
                                source={{ uri: `${baseUrl}/storage/images/chat_uploads/${metadata.attachmentUrl}` }}
                                style={styles.attachmentImage}
                                resizeMode="cover"
                            />
                        )}

                        {/* Poll */}
                        {metadata.poll && (
                            <View style={styles.pollContainer}>
                                <Text style={[styles.pollQuestion, isMine ? { color: 'white' } : {}]}>📊 {metadata.poll.question}</Text>
                                {metadata.poll.options.map((opt, idx) => {
                                    const votes = Object.values(metadata.poll.votes || {}).filter(v => v === idx).length;
                                    const totalVotes = Object.keys(metadata.poll.votes || {}).length || 1;
                                    const pct = Math.round((votes / totalVotes) * 100);
                                    return (
                                        <TouchableOpacity key={idx} style={styles.pollOption} onPress={() => votePoll(item.id, idx)}>
                                            <View style={[styles.pollProgress, { width: `${pct}%` }]} />
                                            <Text style={styles.pollOptionText}>{opt}</Text>
                                            <Text style={styles.pollVotes}>{votes} ({pct}%)</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        )}

                        {item.message ? <Text style={isMine ? styles.textMine : styles.textOther}>{item.message}</Text> : null}

                        <View style={styles.msgFooter}>
                            <Text style={isMine ? styles.timeTextMine : styles.timeTextOther}>
                                {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                        </View>
                    </View>

                    {/* Reactions Display */}
                    {Object.keys(reactionCounts).length > 0 && (
                        <View style={[styles.reactionsRow, isMine ? { right: 5, bottom: -12 } : { left: 5, bottom: -12 }]}>
                            {Object.entries(reactionCounts).map(([emoji, count]) => (
                                <View key={emoji} style={styles.reactionBadge}>
                                    <Text style={{ fontSize: 10 }}>{emoji} {count > 1 ? count : ''}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                </View>

                {/* DP on the right for me */}
                {isMine && (
                    <Image
                        source={dpUrl ? { uri: dpUrl } : require('../../assets/images/user-avatar.png')}
                        style={[styles.avatar, { marginRight: 0, marginLeft: 8 }]}
                        defaultSource={require('../../assets/images/user-avatar.png')}
                    />
                )}
            </TouchableOpacity>
        );
    };

    if (showProfileSetup) {
        return (
            <View style={styles.profileContainer}>
                <LinearGradient colors={[COLORS.primary, '#9B1B1B']} style={StyleSheet.absoluteFill} />
                <View style={styles.profileCard}>
                    <Text style={styles.profileTitle}>Setup Your Chat Profile</Text>
                    <Text style={styles.profileSubtitle}>Choose a username and an avatar</Text>
                    <Image source={{ uri: `${api.defaults.baseURL.split('/api')[0]}/storage/images/chat_dps/${selectedDp}` }} style={styles.largeAvatar} />
                    <FlatList horizontal data={DP_IMAGES} keyExtractor={item => item} showsHorizontalScrollIndicator={false} style={{ maxHeight: 70, marginBottom: 20 }}
                        renderItem={({ item }) => (
                            <TouchableOpacity onPress={() => setSelectedDp(item)}>
                                <Image source={{ uri: `${api.defaults.baseURL.split('/api')[0]}/storage/images/chat_dps/${item}` }} style={[styles.smallAvatar, selectedDp === item && styles.selectedAvatar]} />
                            </TouchableOpacity>
                        )}
                    />
                    <TextInput style={styles.inputField} placeholder="Choose a cool username" value={tempUsername} onChangeText={setTempUsername} maxLength={20} />
                    <TouchableOpacity style={styles.saveButton} onPress={saveProfile}>
                        <Text style={styles.saveButtonText}>Join Chat</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
            {/* Header Revamp */}
            <LinearGradient colors={['#9B1B1B', COLORS.primary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 10 }}>
                    <Icon name="arrow-left" size={24} color="white" />
                </TouchableOpacity>
                <View style={{ flex: 1, marginLeft: 5 }}>
                    <Text style={styles.headerTitle} numberOfLines={1}>{businessName || 'Community Chat'}</Text>
                    <Text style={styles.onlineCountText}>🟢 {onlineCount} Online</Text>
                </View>
                {isStaff && (
                    <TouchableOpacity onPress={() => socketRef.current?.emit("toggle_lock", { businessId, isLocked: !isLocked })} style={{ padding: 10 }}>
                        <Icon name={isLocked ? "lock" : "lock-open-variant"} size={22} color="white" />
                    </TouchableOpacity>
                )}
            </LinearGradient>

            <FlatList
                ref={flatListRef}
                data={groupedMessages}
                keyExtractor={(item) => item.id.toString()}
                renderItem={renderMessage}
                inverted
                contentContainerStyle={{ padding: 15, paddingBottom: 30 }}
            />

            {/* AI Agent Floating Icon */}
            <TouchableOpacity style={styles.aiAgentFab} onPress={() => setShowAIAgent(true)}>
                <LinearGradient colors={['#FF007F', '#7F00FF']} style={styles.aiFabGradient}>
                    <Icon name="robot-outline" size={26} color="white" />
                </LinearGradient>
            </TouchableOpacity>

            {(isLocked && !isStaff) ? (
                <View style={styles.lockedBar}>
                    <Icon name="lock" size={20} color="#888" />
                    <Text style={{ color: '#888', marginLeft: 10 }}>Chat is locked by an admin</Text>
                </View>
            ) : (
                <View style={styles.inputArea}>
                    <TouchableOpacity style={styles.attachBtn} onPress={() => setShowAttachmentMenu(!showAttachmentMenu)}>
                        <Icon name="plus" size={24} color="#666" />
                    </TouchableOpacity>
                    <TextInput
                        style={styles.messageInput}
                        placeholder="Type your message..."
                        value={newMessage}
                        onChangeText={setNewMessage}
                        multiline
                    />
                    <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
                        <Icon name="send" size={20} color="white" />
                    </TouchableOpacity>
                </View>
            )}

            {/* Attachments Menu */}
            {showAttachmentMenu && (
                <View style={styles.attachmentMenu}>
                    <TouchableOpacity style={styles.attachOption} onPress={sendImage}>
                        <View style={[styles.attachIconBg, { backgroundColor: '#E1F5FE' }]}>
                            <Icon name="image" size={24} color="#03A9F4" />
                        </View>
                        <Text style={styles.attachText}>Photo</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.attachOption} onPress={() => { setShowAttachmentMenu(false); setShowPollModal(true); }}>
                        <View style={[styles.attachIconBg, { backgroundColor: '#E8F5E9' }]}>
                            <Icon name="poll" size={24} color="#4CAF50" />
                        </View>
                        <Text style={styles.attachText}>Poll</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Poll Modal */}
            <Modal visible={showPollModal} transparent animationType="slide" onRequestClose={() => setShowPollModal(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.pollModalContent}>
                        <Text style={styles.modalTitle}>Create a Poll</Text>
                        <TextInput style={styles.inputField} placeholder="Ask a question..." value={pollQuestion} onChangeText={setPollQuestion} />
                        {pollOptions.map((opt, idx) => (
                            <TextInput key={idx} style={styles.inputField} placeholder={`Option ${idx + 1}`} value={opt} onChangeText={(text) => {
                                const newOpts = [...pollOptions];
                                newOpts[idx] = text;
                                setPollOptions(newOpts);
                            }} />
                        ))}
                        <TouchableOpacity onPress={() => setPollOptions([...pollOptions, ""])} style={{ marginBottom: 15 }}>
                            <Text style={{ color: COLORS.primary }}>+ Add Option</Text>
                        </TouchableOpacity>
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                            <TouchableOpacity style={[styles.saveButton, { flex: 1, backgroundColor: '#CCC' }]} onPress={() => setShowPollModal(false)}>
                                <Text style={styles.saveButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.saveButton, { flex: 1 }]} onPress={sendPoll}>
                                <Text style={styles.saveButtonText}>Send</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Reactions Modal */}
            <Modal visible={!!selectedMessage} transparent animationType="fade" onRequestClose={() => setSelectedMessage(null)}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSelectedMessage(null)}>
                    <View style={styles.reactionsCard}>
                        <View style={styles.reactionGrid}>
                            {REACTIONS.map(emoji => (
                                <TouchableOpacity key={emoji} style={styles.reactionBtn} onPress={() => reactToMessage(selectedMessage.id, emoji)}>
                                    <Text style={{ fontSize: 28 }}>{emoji}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        {isStaff && (
                            <TouchableOpacity style={styles.deleteOption} onPress={() => deleteMessage(selectedMessage.id)}>
                                <Icon name="delete" size={24} color="red" />
                                <Text style={{ color: 'red', marginLeft: 10, fontSize: 16 }}>Delete Message</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* AI Agent Bottom Sheet */}
            <Modal visible={showAIAgent} transparent animationType="slide" onRequestClose={() => setShowAIAgent(false)}>
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowAIAgent(false)}>
                    <TouchableOpacity activeOpacity={1} style={styles.aiSheet}>
                        <View style={styles.aiHeader}>
                            <Icon name="robot-outline" size={30} color={COLORS.primary} />
                            <Text style={styles.aiTitle}>AI Community Agent</Text>
                        </View>
                        <Text style={styles.aiDesc}>I'm actively monitoring this chat to keep it safe from spam, links, and inappropriate words.</Text>
                        <TouchableOpacity style={styles.aiCommandBtn} onPress={() => { Alert.alert("AI", "Summarizing the last 100 messages..."); setShowAIAgent(false); }}>
                            <Icon name="text-box-search-outline" size={20} color="#333" />
                            <Text style={styles.aiCommandText}>Summarize today's chat</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.aiCommandBtn} onPress={() => { Alert.alert("AI", "Generating a quiz based on chat history..."); setShowAIAgent(false); }}>
                            <Icon name="head-question-outline" size={20} color="#333" />
                            <Text style={styles.aiCommandText}>Generate a Quick Quiz</Text>
                        </TouchableOpacity>
                    </TouchableOpacity>
                </TouchableOpacity>
            </Modal>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#E5DDD5' }, // WhatsApp-like bg
    header: { flexDirection: 'row', alignItems: 'center', paddingTop: 40, paddingBottom: 10, paddingHorizontal: 5, elevation: 5 },
    headerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
    onlineCountText: { color: '#E0F2F1', fontSize: 12, marginTop: 2 },

    dateHeaderContainer: { alignItems: 'center', marginVertical: 10 },
    dateHeaderBubble: { backgroundColor: '#E1F5FE', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 15, elevation: 1 },
    dateHeaderText: { fontSize: 12, color: '#455A64', fontWeight: 'bold' },

    messageWrapper: { flexDirection: 'row', marginBottom: 15, alignItems: 'flex-end', maxWidth: '85%' },
    messageMine: { alignSelf: 'flex-end', justifyContent: 'flex-end' },
    messageOther: { alignSelf: 'flex-start' },
    avatar: { width: 32, height: 32, borderRadius: 16, marginRight: 8, marginBottom: 5 },
    senderName: { fontSize: 12, color: '#075E54', fontWeight: 'bold', marginBottom: 2, marginLeft: 2 },
    messageBubble: { padding: 8, paddingHorizontal: 12, borderRadius: 12, minWidth: 80, elevation: 1, position: 'relative' },
    bubbleMine: { backgroundColor: '#DCF8C6', borderBottomRightRadius: 0 },
    bubbleOther: { backgroundColor: 'white', borderBottomLeftRadius: 0 },
    textMine: { color: '#333', fontSize: 15, paddingRight: 40, paddingBottom: 5 },
    textOther: { color: '#333', fontSize: 15, paddingRight: 40, paddingBottom: 5 },

    msgFooter: { position: 'absolute', bottom: 4, right: 8 },
    timeTextMine: { fontSize: 10, color: '#888' },
    timeTextOther: { fontSize: 10, color: '#999' },

    reactionsRow: { position: 'absolute', flexDirection: 'row', gap: 2, backgroundColor: 'rgba(255,255,255,0.8)', padding: 2, borderRadius: 10, elevation: 2 },
    reactionBadge: { backgroundColor: 'white', borderRadius: 10, paddingHorizontal: 4, paddingVertical: 2, borderWidth: 0.5, borderColor: '#DDD' },

    attachmentImage: { width: 200, height: 200, borderRadius: 10, marginBottom: 5 },

    pollContainer: { backgroundColor: 'rgba(255,255,255,0.5)', padding: 10, borderRadius: 10, marginBottom: 5, width: 220 },
    pollQuestion: { fontWeight: 'bold', marginBottom: 10, color: '#333' },
    pollOption: { backgroundColor: '#F0F0F0', padding: 8, borderRadius: 5, marginBottom: 5, overflow: 'hidden', position: 'relative' },
    pollProgress: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#B2DFDB', opacity: 0.5 },
    pollOptionText: { fontSize: 13, zIndex: 1, color: '#333' },
    pollVotes: { fontSize: 10, color: '#666', position: 'absolute', right: 8, top: 8, zIndex: 1 },

    inputArea: { flexDirection: 'row', padding: 8, backgroundColor: '#F0F0F0', alignItems: 'center' },
    attachBtn: { padding: 10 },
    messageInput: { flex: 1, backgroundColor: 'white', borderRadius: 20, paddingHorizontal: 15, paddingVertical: 8, maxHeight: 100, fontSize: 15 },
    sendButton: { backgroundColor: COLORS.primary, width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginLeft: 8 },

    attachmentMenu: { position: 'absolute', bottom: 70, left: 10, backgroundColor: 'white', borderRadius: 10, padding: 15, elevation: 5, flexDirection: 'row', gap: 20 },
    attachOption: { alignItems: 'center' },
    attachIconBg: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginBottom: 5 },
    attachText: { fontSize: 12, color: '#555' },

    lockedBar: { padding: 15, backgroundColor: '#E0E0E0', flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },

    aiAgentFab: { position: 'absolute', top: 100, right: 15, elevation: 5 },
    aiFabGradient: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    pollModalContent: { width: '85%', backgroundColor: 'white', borderRadius: 15, padding: 20 },
    modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
    reactionsCard: { width: '80%', backgroundColor: 'white', borderRadius: 15, padding: 20 },
    reactionGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
    reactionBtn: { padding: 5 },
    deleteOption: { flexDirection: 'row', alignItems: 'center', marginTop: 10, borderTopWidth: 1, borderColor: '#EEE', paddingTop: 15 },

    aiSheet: { position: 'absolute', bottom: 0, width: '100%', backgroundColor: 'white', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, elevation: 10 },
    aiHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    aiTitle: { fontSize: 18, fontWeight: 'bold', marginLeft: 10, color: COLORS.primary },
    aiDesc: { color: '#666', fontSize: 13, marginBottom: 20, lineHeight: 18 },
    aiCommandBtn: { flexDirection: 'row', alignItems: 'center', padding: 15, backgroundColor: '#F5F5F5', borderRadius: 10, marginBottom: 10 },
    aiCommandText: { marginLeft: 10, fontSize: 15, color: '#333' },

    // Profile Setup Styles
    profileContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    profileCard: { backgroundColor: 'white', width: '100%', padding: 25, borderRadius: 20, alignItems: 'center', elevation: 10 },
    profileTitle: { fontSize: 22, fontWeight: 'bold', color: '#333', marginBottom: 5 },
    profileSubtitle: { fontSize: 14, color: '#666', marginBottom: 20 },
    largeAvatar: { width: 100, height: 100, borderRadius: 50, marginBottom: 20, borderWidth: 3, borderColor: COLORS.primary },
    smallAvatar: { width: 60, height: 60, borderRadius: 30, marginRight: 10, borderWidth: 2, borderColor: 'transparent' },
    selectedAvatar: { borderColor: COLORS.primary },
    inputField: { width: '100%', backgroundColor: '#F5F5F5', borderRadius: 10, padding: 15, fontSize: 16, marginBottom: 15, borderWidth: 1, borderColor: '#DDD' },
    saveButton: { width: '100%', backgroundColor: COLORS.primary, padding: 15, borderRadius: 10, alignItems: 'center' },
    saveButtonText: { color: 'white', fontSize: 16, fontWeight: 'bold' }
});

export default CommunityChatScreen;
