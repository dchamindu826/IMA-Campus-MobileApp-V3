import React, { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity,
    TextInput, ActivityIndicator, RefreshControl, StatusBar, Platform, ScrollView
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import api from '../services/api';
import { useCall } from '../context/CallContext';
import { AuthContext } from '../context/AuthContext';

const FREE_SEM_TABS = ['NEW', 'ASSIGNED', 'IMPORTED', 'ALL'];
const AFTER_SEM_TABS = ['NEW', 'ASSIGNED', 'PAID', 'ALL'];

const AVATAR_PALETTES = [
    { bg: '#EEF2FF', text: '#4338CA', border: '#C7D2FE' },
    { bg: '#ECFDF5', text: '#047857', border: '#A7F3D0' },
    { bg: '#FFFBEB', text: '#B45309', border: '#FDE68A' },
    { bg: '#FDF2F8', text: '#BE185D', border: '#FBCFE8' },
    { bg: '#F0F9FF', text: '#0369A1', border: '#BAE6FD' },
    { bg: '#FAF5FF', text: '#7E22CE', border: '#E9D5FF' },
    { bg: '#F0FDFA', text: '#0F766E', border: '#99F6E4' }
];

const getAvatarPalette = (str, isDark) => {
    if (isDark) {
        return {
            bg: 'rgba(239, 68, 68, 0.15)',
            text: '#F87171',
            border: 'rgba(239, 68, 68, 0.25)'
        };
    }
    return {
        bg: '#FEF2F2',
        text: '#D32F2F',
        border: '#FECACA'
    };
};

export default function CrmContactsScreen({ route, navigation }) {
    const insets = useSafeAreaInsets();
    const { socket, startOutboundCall } = useCall();
    const { userInfo } = useContext(AuthContext);

    const {
        businessId,
        businessName = 'Business',
        crmType = 'FREE_SEMINAR',
        isDarkMode: initialDark = true
    } = route.params || {};

    const [isDarkMode, setIsDarkMode] = useState(initialDark);
    const tabs = crmType === 'FREE_SEMINAR' ? FREE_SEM_TABS : AFTER_SEM_TABS;
    const [activeTab, setActiveTab] = useState('ALL');

    const [leads, setLeads] = useState([]);
    const [counts, setCounts] = useState({});
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState('ALL');

    // Categorized statistics and unique categories (Batches, Unread, Statuses)
    const categories = useMemo(() => {
        const batchMap = new Map();
        let unreadTotal = 0;

        leads.forEach(l => {
            if ((l.unreadCount || 0) > 0) unreadTotal++;
            const bName = l.batch?.name || l.batchName;
            if (bName) {
                batchMap.set(bName, (batchMap.get(bName) || 0) + 1);
            }
        });

        const list = [
            { id: 'ALL', label: 'All', count: leads.length, icon: 'account-group' },
            { id: 'UNREAD', label: 'Unread', count: unreadTotal, icon: 'message-badge', isAlert: unreadTotal > 0 }
        ];

        batchMap.forEach((cnt, name) => {
            list.push({
                id: `BATCH_${name}`,
                label: name,
                count: cnt,
                icon: 'school',
                isBatch: true,
                batchName: name
            });
        });

        return list;
    }, [leads]);

    // Filter leads by selectedCategory
    const filteredLeads = useMemo(() => {
        if (selectedCategory === 'ALL') return leads;
        if (selectedCategory === 'UNREAD') return leads.filter(l => (l.unreadCount || 0) > 0);
        if (selectedCategory.startsWith('BATCH_')) {
            const bName = selectedCategory.replace('BATCH_', '');
            return leads.filter(l => (l.batch?.name === bName || l.batchName === bName));
        }
        return leads;
    }, [leads, selectedCategory]);

    // Unified 3-color IMA Campus Red Theme
    const theme = useMemo(() => isDarkMode ? {
        headerBg: '#881337',
        bg: '#0F172A',
        tabBarBg: '#1E293B',
        tabActiveText: '#EF4444',
        tabInactiveText: '#94A3B8',
        tabIndicator: '#EF4444',
        itemBg: '#1E293B',
        border: 'rgba(255, 255, 255, 0.08)',
        textPrimary: '#F8FAFC',
        textSecondary: '#94A3B8',
        unreadBadge: '#EF4444',
        searchBg: '#1E293B',
        callBtnBg: '#334155'
    } : {
        headerBg: '#D32F2F',
        bg: '#F8FAFC',
        tabBarBg: '#D32F2F',
        tabActiveText: '#FFFFFF',
        tabInactiveText: 'rgba(255, 255, 255, 0.75)',
        tabIndicator: '#FFFFFF',
        itemBg: '#FFFFFF',
        border: '#E2E8F0',
        textPrimary: '#0F172A',
        textSecondary: '#64748B',
        unreadBadge: '#D32F2F',
        searchBg: '#F1F5F9',
        callBtnBg: '#FEF2F2'
    }, [isDarkMode]);

    const fetchLeads = useCallback(async (isSilent = false) => {
        if (!isSilent) setLoading(true);
        try {
            const endpoint = crmType === 'FREE_SEMINAR' 
                ? '/coordinator-crm/leads' 
                : '/after-seminar-crm/leads';

            const res = await api.get(endpoint, {
                params: {
                    tab: activeTab,
                    campaignType: crmType,
                    businessId: businessId || '',
                    searchQuery: searchQuery.trim(),
                    loggedUserRole: userInfo?.role || ''
                }
            });

            const leadData = res.data?.leads || (Array.isArray(res.data) ? res.data : []);
            setLeads(leadData);
            if (res.data?.counts) {
                setCounts(res.data.counts);
            }
        } catch (e) {
            console.log("Mobile: Error fetching CRM leads:", e?.message);
        } finally {
            if (!isSilent) setLoading(false);
            setRefreshing(false);
        }
    }, [crmType, activeTab, businessId, searchQuery, userInfo?.role]);

    useEffect(() => {
        fetchLeads(false);
    }, [fetchLeads]);

    // Socket real-time webhook update listeners
    useEffect(() => {
        if (!socket) return;

        const handleRealtimeUpdate = (data) => {
            if (!data?.businessId || String(data.businessId) === String(businessId)) {
                console.log("Mobile: Realtime webhook lead event received, refreshing contact list...");
                fetchLeads(true);
            }
        };

        socket.on('new_inbound_message', handleRealtimeUpdate);
        socket.on('lead_updated', handleRealtimeUpdate);

        return () => {
            socket.off('new_inbound_message', handleRealtimeUpdate);
            socket.off('lead_updated', handleRealtimeUpdate);
        };
    }, [socket, businessId, fetchLeads]);

    const onRefresh = () => {
        setRefreshing(true);
        fetchLeads(false);
    };

    const formatTimestamp = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        const now = new Date();
        const isToday = d.toDateString() === now.toDateString();
        
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const isYesterday = d.toDateString() === yesterday.toDateString();

        if (isToday) {
            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        if (isYesterday) {
            return 'Yesterday';
        }
        return `${d.getDate()}/${d.getMonth() + 1}`;
    };

    const handleCallLead = (lead) => {
        startOutboundCall({
            lead: {
                phone: lead.phone,
                name: lead.name,
                businessId: businessId,
                campaignType: crmType
            },
            businessId,
            campaignType: crmType
        });
    };

    const renderLeadItem = ({ item }) => {
        const lastMsg = item.chatMessages && item.chatMessages.length > 0 
            ? item.chatMessages[item.chatMessages.length - 1] 
            : null;
        const msgText = lastMsg?.message || item.lastMessage || 'No messages yet';
        const isOutbound = String(lastMsg?.direction || '').toLowerCase() === 'outbound' || lastMsg?.isOutbound;
        const unread = item.unreadCount || 0;
        const displayName = item.name ? item.name.trim() : item.phone;
        const initials = (item.name || item.phone || 'L').slice(0, 2).toUpperCase();
        const avatarPalette = getAvatarPalette(displayName, isDarkMode);

        const batchTitle = item.batch?.name || item.batchName;
        const statusTitle = item.status;

        return (
            <TouchableOpacity 
                style={[
                    styles.contactCard, 
                    { 
                        backgroundColor: theme.itemBg, 
                        borderColor: unread > 0 ? theme.unreadBadge : theme.border,
                        borderWidth: unread > 0 ? 1.5 : 1
                    }
                ]}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('WhatsAppChat', {
                    lead: item,
                    businessId,
                    businessName,
                    crmType,
                    isDarkMode
                })}
            >
                {/* Top Row: Avatar + Name + Timestamp */}
                <View style={styles.cardHeaderRow}>
                    <View style={[styles.avatarWrap, { backgroundColor: avatarPalette.bg, borderColor: avatarPalette.border }]}>
                        <Text style={[styles.avatarText, { color: avatarPalette.text }]}>{initials}</Text>
                    </View>

                    <View style={styles.cardTitleWrap}>
                        <View style={styles.leadTopRow}>
                            <Text style={[styles.leadName, { color: theme.textPrimary }]} numberOfLines={1}>
                                {displayName}
                            </Text>
                            <Text style={[styles.timeText, { color: unread > 0 ? theme.unreadBadge : theme.textSecondary }]}>
                                {formatTimestamp(item.updatedAt || item.createdAt)}
                            </Text>
                        </View>
                        <Text style={[styles.phoneSubText, { color: theme.textSecondary }]}>
                            {item.phone}
                        </Text>
                    </View>
                </View>

                {/* Categorized Badges (Batch & Status) */}
                {(batchTitle || statusTitle) && (
                    <View style={styles.tagRow}>
                        {batchTitle && (
                            <View style={[styles.batchTag, { backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : '#F1F5F9', borderColor: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0' }]}>
                                <Icon name="school" size={13} color={isDarkMode ? '#F87171' : '#D32F2F'} style={{ marginRight: 4 }} />
                                <Text style={[styles.batchTagText, { color: theme.textPrimary }]} numberOfLines={1}>
                                    {batchTitle}
                                </Text>
                            </View>
                        )}
                        {statusTitle && (
                            <View style={[
                                styles.statusTag, 
                                { 
                                    backgroundColor: statusTitle === 'PAID' ? (isDarkMode ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2') : (isDarkMode ? 'rgba(255, 255, 255, 0.05)' : '#F8FAFC'),
                                    borderColor: statusTitle === 'PAID' ? (isDarkMode ? 'rgba(239, 68, 68, 0.3)' : '#FCA5A5') : (isDarkMode ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0')
                                }
                            ]}>
                                <Text style={[
                                    styles.statusTagText, 
                                    { color: statusTitle === 'PAID' ? (isDarkMode ? '#F87171' : '#D32F2F') : theme.textSecondary }
                                ]}>
                                    {statusTitle}
                                </Text>
                            </View>
                        )}
                    </View>
                )}

                {/* Message Snippet Box */}
                <View style={[styles.snippetContainer, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : '#F8FAFC' }]}>
                    <View style={styles.snippetRow}>
                        {isOutbound && (
                            <Icon name="check-all" size={15} color={isDarkMode ? '#F87171' : '#D32F2F'} style={{ marginRight: 5 }} />
                        )}
                        <Text 
                            style={[
                                styles.snippetText, 
                                { 
                                    color: unread > 0 ? theme.textPrimary : theme.textSecondary, 
                                    fontWeight: unread > 0 ? '700' : '400' 
                                }
                            ]} 
                            numberOfLines={1}
                        >
                            {msgText}
                        </Text>
                    </View>
                </View>

                {/* Card Actions Footer */}
                <View style={styles.cardFooter}>
                    <View style={styles.footerLeft}>
                        {unread > 0 && (
                            <View style={[styles.unreadBadge, { backgroundColor: theme.unreadBadge }]}>
                                <Icon name="message-badge" size={12} color="#FFFFFF" style={{ marginRight: 3 }} />
                                <Text style={styles.unreadText}>{unread} new</Text>
                            </View>
                        )}
                    </View>

                    <View style={styles.footerActions}>
                        {/* Direct WhatsApp Call */}
                        <TouchableOpacity 
                            style={[styles.actionBtn, { backgroundColor: isDarkMode ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2' }]}
                            activeOpacity={0.8}
                            onPress={() => handleCallLead(item)}
                        >
                            <Icon name="phone" size={14} color={isDarkMode ? '#EF4444' : '#D32F2F'} />
                            <Text style={[styles.actionBtnCallText, { color: isDarkMode ? '#EF4444' : '#D32F2F' }]}>Call</Text>
                        </TouchableOpacity>

                        {/* Open Chat */}
                        <TouchableOpacity 
                            style={[styles.actionBtn, { backgroundColor: isDarkMode ? '#334155' : '#F1F5F9' }]}
                            activeOpacity={0.8}
                            onPress={() => navigation.navigate('WhatsAppChat', {
                                lead: item,
                                businessId,
                                businessName,
                                crmType,
                                isDarkMode
                            })}
                        >
                            <Icon name="whatsapp" size={14} color={theme.textPrimary} />
                            <Text style={[styles.actionBtnChatText, { color: theme.textPrimary }]}>Chat</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={[styles.container, { backgroundColor: theme.bg }]}>
            <StatusBar barStyle="light-content" backgroundColor={theme.headerBg} />

            {/* WhatsApp Header */}
            <View style={[styles.header, { backgroundColor: theme.headerBg, paddingTop: Math.max(insets.top, 14) + 6 }]}>
                <View style={styles.headerTop}>
                    <TouchableOpacity 
                        onPress={() => navigation.goBack()}
                        style={styles.backBtn}
                        activeOpacity={0.8}
                    >
                        <Icon name="arrow-left" size={24} color="#FFFFFF" />
                    </TouchableOpacity>

                    <View style={styles.headerTitleWrap}>
                        <Text style={styles.headerTitle} numberOfLines={1}>
                            {businessName}
                        </Text>
                        <Text style={styles.headerSubtitle}>
                            {crmType === 'FREE_SEMINAR' ? 'Free Seminar CRM (WhatsApp)' : 'After Seminar CRM (WhatsApp)'}
                        </Text>
                    </View>

                    <View style={styles.headerRightActions}>
                        <TouchableOpacity 
                            onPress={() => setShowSearch(!showSearch)}
                            style={styles.headerIconBtn}
                        >
                            <Icon name={showSearch ? "close" : "magnify"} size={22} color="#FFFFFF" />
                        </TouchableOpacity>

                        <TouchableOpacity 
                            onPress={() => setIsDarkMode(!isDarkMode)}
                            style={styles.headerIconBtn}
                        >
                            <Icon name={isDarkMode ? "white-balance-sunny" : "moon-waning-crescent"} size={20} color="#FFFFFF" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Animated Search Bar */}
                {showSearch && (
                    <View style={[styles.searchBar, { backgroundColor: theme.searchBg }]}>
                        <Icon name="magnify" size={20} color={theme.textSecondary} style={{ marginRight: 8 }} />
                        <TextInput 
                            placeholder="Search name or phone number..."
                            placeholderTextColor={theme.textSecondary}
                            style={[styles.searchInput, { color: theme.textPrimary }]}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            autoFocus
                        />
                        {searchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => setSearchQuery('')}>
                                <Icon name="close-circle" size={18} color={theme.textSecondary} />
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/* WhatsApp Tabs Bar */}
                <View style={styles.tabsRow}>
                    {tabs.map(tab => {
                        const isSelected = activeTab === tab;
                        const count = counts[tab] ?? null;
                        return (
                            <TouchableOpacity 
                                key={tab}
                                style={[styles.tabItem, isSelected && { borderBottomColor: theme.tabIndicator, borderBottomWidth: 3 }]}
                                onPress={() => setActiveTab(tab)}
                                activeOpacity={0.8}
                            >
                                <Text style={[styles.tabText, { color: isSelected ? theme.tabActiveText : theme.tabInactiveText }]}>
                                    {tab} {count !== null ? `(${count})` : ''}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </View>

            {/* Horizontal Category Filter Pills */}
            <View style={[styles.categoryBarWrap, { backgroundColor: isDarkMode ? '#0F172A' : '#F8FAFC', borderBottomColor: theme.border }]}>
                <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.categoryScroll}
                >
                    {categories.map((cat) => {
                        const isSel = selectedCategory === cat.id;
                        return (
                            <TouchableOpacity
                                key={cat.id}
                                style={[
                                    styles.categoryChip,
                                    isSel 
                                        ? { backgroundColor: isDarkMode ? '#EF4444' : '#D32F2F' } 
                                        : { backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF', borderColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E2E8F0', borderWidth: 1 }
                                ]}
                                onPress={() => setSelectedCategory(cat.id)}
                                activeOpacity={0.8}
                            >
                                <Icon 
                                    name={cat.icon || "tag-outline"} 
                                    size={14} 
                                    color={isSel ? '#FFFFFF' : (isDarkMode ? '#94A3B8' : '#64748B')} 
                                    style={{ marginRight: 5 }}
                                />
                                <Text style={[
                                    styles.categoryChipText,
                                    { color: isSel ? '#FFFFFF' : theme.textPrimary, fontWeight: isSel ? '700' : '500' }
                                ]}>
                                    {cat.label}
                                </Text>
                                <View style={[
                                    styles.categoryCountBadge,
                                    { backgroundColor: isSel ? 'rgba(255,255,255,0.25)' : (cat.isAlert ? '#EF4444' : (isDarkMode ? 'rgba(255,255,255,0.1)' : '#F1F5F9')) }
                                ]}>
                                    <Text style={[
                                        styles.categoryCountText,
                                        { color: isSel ? '#FFFFFF' : (cat.isAlert ? '#FFFFFF' : theme.textSecondary) }
                                    ]}>
                                        {cat.count}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>

            {/* Leads List */}
            {loading && !refreshing ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#25D366" />
                    <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading WhatsApp Conversations...</Text>
                </View>
            ) : filteredLeads.length === 0 ? (
                <View style={styles.centerContainer}>
                    <Icon name="chat-outline" size={56} color={theme.textSecondary} style={{ opacity: 0.5 }} />
                    <Text style={[styles.emptyText, { color: theme.textPrimary }]}>No Conversations Found</Text>
                    <Text style={[styles.emptySubText, { color: theme.textSecondary }]}>
                        {searchQuery 
                            ? 'No leads matched your search query.' 
                            : selectedCategory !== 'ALL' 
                                ? `No contacts in '${selectedCategory.replace('BATCH_', '')}' category.`
                                : `Leads assigned to ${activeTab} will appear here.`
                        }
                    </Text>
                </View>
            ) : (
                <FlatList 
                    data={filteredLeads}
                    keyExtractor={(item) => String(item.id)}
                    renderItem={renderLeadItem}
                    contentContainerStyle={{ paddingVertical: 8, paddingBottom: 60 }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#25D366']} tintColor="#25D366" />
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        elevation: 6,
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 6
    },
    headerTop: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingBottom: 10
    },
    backBtn: {
        padding: 6,
        marginRight: 6
    },
    headerTitleWrap: {
        flex: 1
    },
    headerTitle: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: 'bold'
    },
    headerSubtitle: {
        color: 'rgba(255, 255, 255, 0.78)',
        fontSize: 11,
        marginTop: 1
    },
    headerRightActions: {
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
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 12,
        marginBottom: 10,
        paddingHorizontal: 12,
        borderRadius: 12,
        height: 42
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        paddingVertical: 0
    },
    tabsRow: {
        flexDirection: 'row',
        justifyContent: 'space-around'
    },
    tabItem: {
        paddingVertical: 10,
        paddingHorizontal: 12,
        alignItems: 'center',
        borderBottomWidth: 3,
        borderBottomColor: 'transparent'
    },
    tabText: {
        fontSize: 13,
        fontWeight: 'bold',
        letterSpacing: 0.3
    },
    categoryBarWrap: {
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    categoryScroll: {
        paddingHorizontal: 12,
        gap: 8,
    },
    categoryChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 20,
    },
    categoryChipText: {
        fontSize: 12,
    },
    categoryCountBadge: {
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 10,
        marginLeft: 6,
    },
    categoryCountText: {
        fontSize: 11,
        fontWeight: '700',
    },
    contactCard: {
        marginHorizontal: 12,
        marginVertical: 6,
        padding: 12,
        borderRadius: 14,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
        elevation: 2,
    },
    cardHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    cardTitleWrap: {
        flex: 1,
    },
    phoneSubText: {
        fontSize: 12,
        marginTop: 1,
    },
    batchTag: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        borderWidth: 1,
        maxWidth: '65%',
    },
    batchTagText: {
        fontSize: 11,
        fontWeight: '600',
    },
    statusTag: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        borderWidth: 1,
    },
    statusTagText: {
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    snippetContainer: {
        marginTop: 8,
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 8,
    },
    cardFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 10,
    },
    footerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    footerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        gap: 5,
    },
    actionBtnCallText: {
        color: '#25D366',
        fontSize: 12,
        fontWeight: '700',
    },
    actionBtnChatText: {
        fontSize: 12,
        fontWeight: '700',
    },
    leadItem: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth
    },
    avatarWrap: {
        width: 50,
        height: 50,
        borderRadius: 25,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14
    },
    avatarText: {
        fontSize: 18,
        fontWeight: 'bold'
    },
    leadContent: {
        flex: 1,
        justifyContent: 'center'
    },
    leadTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 3
    },
    leadName: {
        fontSize: 16,
        fontWeight: 'bold',
        flex: 1,
        marginRight: 8
    },
    timeText: {
        fontSize: 12,
        fontWeight: '500'
    },
    leadBottomRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    snippetRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        marginRight: 10
    },
    snippetText: {
        fontSize: 13,
        flex: 1
    },
    leadActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8
    },
    unreadBadge: {
        minWidth: 20,
        height: 20,
        borderRadius: 10,
        paddingHorizontal: 6,
        justifyContent: 'center',
        alignItems: 'center'
    },
    unreadText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: 'bold'
    },
    callBtn: {
        width: 34,
        height: 34,
        borderRadius: 17,
        justifyContent: 'center',
        alignItems: 'center'
    },
    tagRow: {
        flexDirection: 'row',
        gap: 6,
        marginTop: 6
    },
    miniTag: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6
    },
    miniTagText: {
        fontSize: 10,
        fontWeight: '600'
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 30
    },
    loadingText: {
        marginTop: 12,
        fontSize: 14
    },
    emptyText: {
        fontSize: 17,
        fontWeight: 'bold',
        marginTop: 14
    },
    emptySubText: {
        fontSize: 13,
        textAlign: 'center',
        marginTop: 6,
        lineHeight: 18
    }
});
