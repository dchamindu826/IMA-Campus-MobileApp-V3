import React, { useState, useEffect, useRef, useContext, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput,
  KeyboardAvoidingView, Platform, Image, ActivityIndicator, Linking
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import * as ImagePicker from 'react-native-image-picker';
import { io } from 'socket.io-client';
import moment from 'moment';

import api, { IMAGE_URL } from '../services/api';
import COLORS from '../constants/colors';
import { AuthContext } from '../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';

const SupportChatScreen = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { userToken, userInfo } = useContext(AuthContext);
  
  const [businesses, setBusinesses] = useState([]);
  const [inquiriesData, setInquiriesData] = useState([]);
  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [inquiry, setInquiry] = useState(null);
  
  const [messages, setMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(true);

  const socketRef = useRef(null);
  const flatListRef = useRef(null);
  const inquiryRef = useRef(null);

  useEffect(() => {
    inquiryRef.current = inquiry;
  }, [inquiry]);

  useFocusEffect(
    useCallback(() => {
      fetchBusinessesAndInquiries();
      return () => {
        if (socketRef.current) socketRef.current.disconnect();
      };
    }, [])
  );

  const fetchBusinessesAndInquiries = async () => {
    setLoading(true);
    try {
      const bizRes = await api.get('/mobile/businesses');
      if (bizRes.data && bizRes.data.businesses) {
        setBusinesses(bizRes.data.businesses);
      }

      const inqRes = await api.get('/web-inquiry/my-inquiries');
      if (inqRes.data && inqRes.data.success && inqRes.data.inquiries) {
        setInquiriesData(inqRes.data.inquiries);
      }
    } catch (e) {
      console.log('Error fetching businesses/inquiries', e);
    } finally {
      setLoading(false);
    }
  };

  // Socket initialization
  useEffect(() => {
    if (!userToken) return;

    const baseURL = api.defaults.baseURL.replace('/api', '');
    socketRef.current = io(baseURL, {
      auth: { token: userToken },
    });

    socketRef.current.on('new_web_inquiry_message', (msg) => {
      const currentInquiry = inquiryRef.current;
      setMessages((prev) => {
        if (prev.find((m) => m.id === msg.id)) return prev;
        if (currentInquiry && currentInquiry.id === msg.inquiryId) {
          if (msg.direction === 'outbound') {
            api.post('/web-inquiry/student-mark-read', { inquiryId: currentInquiry.id }).catch((e) => {});
          }
          return [...prev, msg];
        }
        return prev;
      });
    });

    socketRef.current.on('web_inquiry_student_notification', (data) => {
      fetchBusinessesAndInquiries(); // Refresh list to get unread counts
    });

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [userToken]);

  // Handle joining a room
  useEffect(() => {
    if (inquiry && socketRef.current) {
      socketRef.current.emit('join_web_inquiry_room', { inquiryId: inquiry.id });
      api.post('/web-inquiry/student-mark-read', { inquiryId: inquiry.id }).catch((e) => {});
      
      // Update local unread count
      setInquiriesData(prev => prev.map(i => i.id === inquiry.id ? { ...i, studentUnreadCount: 0 } : i));
    }
  }, [inquiry]);

  const startInquiry = async (business) => {
    setSelectedBusiness(business);
    setLoading(true);
    try {
      const res = await api.post('/web-inquiry/start', { businessId: business.id });
      if (res.data.success) {
        setInquiry(res.data.inquiry);
        setMessages(res.data.inquiry?.messages || res.data.messages || []);
      }
    } catch (error) {
      console.log('Failed to start chat', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePickFile = () => {
    ImagePicker.launchImageLibrary({ mediaType: 'mixed', selectionLimit: 1 }, (response) => {
      if (response.didCancel) return;
      if (response.errorMessage) {
        console.log('ImagePicker Error: ', response.errorMessage);
        return;
      }
      if (response.assets && response.assets.length > 0) {
        setSelectedFile(response.assets[0]);
      }
    });
  };

  const sendMessage = async () => {
    if ((!inputMsg.trim() && !selectedFile) || !inquiry || !socketRef.current) return;

    setIsUploading(true);
    let mediaUrl = null;
    let mediaType = null;

    if (selectedFile) {
      const formData = new FormData();
      formData.append('file', {
        uri: selectedFile.uri,
        type: selectedFile.type,
        name: selectedFile.fileName || `upload_${Date.now()}.jpg`,
      });

      try {
        const res = await api.post('/web-inquiry/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        mediaUrl = res.data.fileUrl;
        
        if (selectedFile.type?.startsWith('image/')) mediaType = 'image';
        else if (selectedFile.type?.startsWith('video/')) mediaType = 'video';
        else mediaType = 'document';
      } catch (err) {
        console.log('Upload failed', err);
        setIsUploading(false);
        return;
      }
    }

    socketRef.current.emit('send_web_inquiry_message', {
      inquiryId: inquiry.id,
      businessId: inquiry.businessId,
      message: inputMsg.trim(),
      mediaUrl,
      mediaType,
      replyToId: null,
    });

    setInputMsg('');
    setSelectedFile(null);
    setIsUploading(false);
  };

  const renderBusinessItem = ({ item }) => {
    const unreadCount = inquiriesData.find((i) => i.businessId === item.id)?.studentUnreadCount || 0;
    
    return (
      <TouchableOpacity style={styles.businessCard} onPress={() => startInquiry(item)}>
        <View style={styles.businessLogoContainer}>
          {item.logo && item.logo !== 'default.png' && item.logo !== 'null' ? (
            <Image source={{ uri: `${IMAGE_URL}icons/${item.logo}` }} style={styles.businessLogo} />
          ) : (
            <Text style={styles.businessInitials}>{item.name.charAt(0)}</Text>
          )}
        </View>
        <View style={styles.businessInfo}>
          <Text style={styles.businessName}>{item.name}</Text>
          <Text style={styles.businessSub}>Click to Chat</Text>
        </View>
        {unreadCount > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>{unreadCount}</Text>
          </View>
        )}
        <Icon name="chevron-right" size={24} color="#ccc" />
      </TouchableOpacity>
    );
  };

  const renderMessage = ({ item, index }) => {
    const isMe = item.direction === 'inbound';
    
    return (
      <View style={[styles.messageWrapper, isMe ? styles.messageWrapperMe : styles.messageWrapperOther]}>
        <View style={[styles.messageBubble, isMe ? styles.messageBubbleMe : styles.messageBubbleOther]}>
          {!isMe && item.senderName && (
            <Text style={styles.senderName}>{item.senderName}</Text>
          )}
          
          {item.mediaUrl && (
            <View style={{ marginBottom: 5 }}>
              {item.mediaType?.includes('image') ? (
                <TouchableOpacity onPress={() => Linking.openURL(`${api.defaults.baseURL.replace('/api', '')}/storage/images/chat_uploads/${item.mediaUrl}`)}>
                   <Image source={{ uri: `${api.defaults.baseURL.replace('/api', '')}/storage/images/chat_uploads/${item.mediaUrl}` }} style={styles.msgImage} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.fileButton} onPress={() => Linking.openURL(`${api.defaults.baseURL.replace('/api', '')}/storage/images/chat_uploads/${item.mediaUrl}`)}>
                  <Icon name="file-document" size={24} color={isMe ? "#008069" : COLORS.primary} />
                  <Text style={[styles.fileText, { color: isMe ? "#008069" : COLORS.primary }]}>View Attachment</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {item.message ? <Text style={[styles.messageText, { color: isMe ? '#111b21' : '#111b21' }]}>{item.message}</Text> : null}
          
          <View style={styles.messageFooter}>
            <Text style={styles.timeText}>{moment(item.createdAt).format('hh:mm A')}</Text>
            {isMe && (
              <Icon name="check-all" size={14} color={item.isRead ? "#53bdeb" : "#8696a0"} style={{ marginLeft: 4 }} />
            )}
          </View>
        </View>
      </View>
    );
  };

  if (loading && !inquiry) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => inquiry ? setInquiry(null) : navigation.goBack()}>
          <Icon name="arrow-left" size={24} color="white" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>{inquiry && selectedBusiness ? `${selectedBusiness.name} Support` : 'Lumi Chat Support'}</Text>
          {inquiry && <Text style={styles.headerSubtitle}>We usually reply in a few minutes</Text>}
        </View>
      </View>

      {!inquiry ? (
        // Business Selection List
        <View style={styles.selectionContainer}>
          <View style={styles.welcomeBox}>
            <Text style={styles.welcomeTitle}>Welcome to Support! 👋</Text>
            <Text style={styles.welcomeSub}>
              ඔබ අපත් සමඟ සම්බන්ධ වීමට කැමති ආයතනය තෝරා ගැටලු ඉදිරිපත් කරන්න.
            </Text>
          </View>
          <Text style={styles.sectionTitle}>SELECT BUSINESS</Text>
          <FlatList
            data={businesses}
            keyExtractor={item => item.id.toString()}
            renderItem={renderBusinessItem}
            contentContainerStyle={{ paddingBottom: 20 }}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={<Text style={styles.emptyText}>No businesses available.</Text>}
          />
        </View>
      ) : (
        // Chat Interface
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : null}>
          {inquiry.status === 'RESOLVED' && (
            <View style={styles.resolvedBanner}>
              <Icon name="shield-alert" size={16} color="#54656f" />
              <Text style={styles.resolvedText}>This inquiry has been marked as resolved.</Text>
            </View>
          )}

          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item, index) => item.id ? item.id.toString() : index.toString()}
            renderItem={renderMessage}
            contentContainerStyle={{ padding: 15, paddingBottom: 20 }}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
          />

          {inquiry.status === 'OPEN' && (
            <View style={styles.inputContainer}>
              {selectedFile && (
                <View style={styles.selectedFilePreview}>
                  <Icon name="file-image" size={20} color="#54656f" />
                  <Text style={styles.selectedFileName} numberOfLines={1}>{selectedFile.fileName || 'Attached File'}</Text>
                  <TouchableOpacity onPress={() => setSelectedFile(null)}>
                    <Icon name="close-circle" size={20} color="#666" />
                  </TouchableOpacity>
                </View>
              )}
              
              <View style={styles.inputRow}>
                <TouchableOpacity style={styles.attachBtn} onPress={handlePickFile}>
                  <Icon name="paperclip" size={24} color="#54656f" />
                </TouchableOpacity>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Type a message..."
                    placeholderTextColor="#54656f"
                    value={inputMsg}
                    onChangeText={setInputMsg}
                    multiline
                  />
                </View>
                <TouchableOpacity 
                  style={[styles.sendBtn, (!inputMsg.trim() && !selectedFile) ? { opacity: 0.5 } : {}]}
                  onPress={sendMessage}
                  disabled={(!inputMsg.trim() && !selectedFile) || isUploading}
                >
                  {isUploading ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Icon name="send" size={20} color="white" />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#efeae2' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#efeae2' },
  
  header: { backgroundColor: '#008069', flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 15, elevation: 4 },
  backBtn: { padding: 5, marginRight: 10 },
  headerTitleContainer: { flex: 1 },
  headerTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  headerSubtitle: { color: 'rgba(255,255,255,0.9)', fontSize: 12 },
  
  selectionContainer: { flex: 1, padding: 20 },
  welcomeBox: { backgroundColor: 'white', padding: 20, borderRadius: 15, marginBottom: 20, elevation: 2, alignItems: 'center' },
  welcomeTitle: { fontSize: 18, fontWeight: 'bold', color: '#111b21', marginBottom: 8 },
  welcomeSub: { fontSize: 14, color: '#54656f', textAlign: 'center', lineHeight: 20 },
  sectionTitle: { fontSize: 12, fontWeight: 'bold', color: '#54656f', marginBottom: 10, marginLeft: 5 },
  
  businessCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 15, borderRadius: 15, marginBottom: 12, elevation: 2 },
  businessLogoContainer: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#dfe5e7', justifyContent: 'center', alignItems: 'center', marginRight: 15, overflow: 'hidden' },
  businessLogo: { width: '100%', height: '100%', resizeMode: 'cover' },
  businessInitials: { fontSize: 20, fontWeight: 'bold', color: '#54656f' },
  businessInfo: { flex: 1 },
  businessName: { fontSize: 16, fontWeight: 'bold', color: '#111b21' },
  businessSub: { fontSize: 13, color: '#54656f', marginTop: 2 },
  unreadBadge: { backgroundColor: '#ef4444', minWidth: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6, marginRight: 10 },
  unreadText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  emptyText: { textAlign: 'center', color: '#666', marginTop: 20 },
  
  resolvedBanner: { backgroundColor: '#ffd279', padding: 8, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  resolvedText: { fontSize: 12, fontWeight: 'bold', color: '#54656f', marginLeft: 5 },
  
  messageWrapper: { marginBottom: 10, flexDirection: 'row' },
  messageWrapperMe: { justifyContent: 'flex-end' },
  messageWrapperOther: { justifyContent: 'flex-start' },
  messageBubble: { maxWidth: '80%', padding: 10, borderRadius: 15, elevation: 1 },
  messageBubbleMe: { backgroundColor: '#d9fdd3', borderTopRightRadius: 0 },
  messageBubbleOther: { backgroundColor: 'white', borderTopLeftRadius: 0 },
  senderName: { fontSize: 12, fontWeight: 'bold', color: '#53bdeb', marginBottom: 4 },
  msgImage: { width: 200, height: 200, borderRadius: 10, resizeMode: 'cover' },
  fileButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.05)', padding: 10, borderRadius: 10 },
  fileText: { fontSize: 14, fontWeight: 'bold', marginLeft: 8 },
  messageText: { fontSize: 15, lineHeight: 20 },
  messageFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 },
  timeText: { fontSize: 10, color: '#8696a0' },
  
  inputContainer: { backgroundColor: '#f0f2f5', paddingHorizontal: 10, paddingVertical: 10 },
  selectedFilePreview: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 10, borderRadius: 10, marginBottom: 10, marginHorizontal: 5 },
  selectedFileName: { flex: 1, fontSize: 14, color: '#111b21', marginLeft: 10, marginRight: 10 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end' },
  attachBtn: { padding: 10 },
  inputWrapper: { flex: 1, backgroundColor: 'white', borderRadius: 20, paddingHorizontal: 15, minHeight: 45, maxHeight: 100, justifyContent: 'center' },
  textInput: { fontSize: 16, color: '#111b21', paddingVertical: 10 },
  sendBtn: { width: 45, height: 45, borderRadius: 25, backgroundColor: '#00a884', justifyContent: 'center', alignItems: 'center', marginLeft: 10, marginBottom: 2 }
});

export default SupportChatScreen;
