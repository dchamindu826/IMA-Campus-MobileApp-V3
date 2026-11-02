import React, { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity,
    TextInput, ActivityIndicator, RefreshControl, StatusBar, Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import api from '../services/api';
import { useCall } from '../context/CallContext';
import { AuthContext } from '../context/AuthContext';

const FREE_SEM_TABS = ['NEW', 'ASSIGNED', 'IMPORTED', 'ALL'];
const AFTER_SEM_TABS = ['NEW', 'ASSIGNED', 'PAID', 'ALL'];

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

    // Theme definitions matching WhatsApp Light / Dark Mode
    const theme = useMemo(() => isDarkMode ? {
        headerBg: '#1f2c34',
        bg: '#0b141a',
        tabBarBg: '#1f2c34',
        tabActiveText: '#00a884',
        tabInactiveText: '#8696a0',
        tabIndicator: '#00a884',
        itemBg: '#111b21',
        border: 'rgba(255, 255, 255, 0.06)',
        textPrimary: '#e9edef',
        textSecondary: '#8696a0',
        unreadBadge: '#25D366',
        searchBg: '#111b21',
        callBtnBg: '#005c4b'
    } : {
        headerBg: '#008069',
        bg: '#FFFFFF',
        tabBarBg: '#008069',
        tabActiveText: '#FFFFFF',
        tabInactiveText: 'rgba(255, 255, 255, 0.7)',
        tabIndicator: '#FFFFFF',
        itemBg: '#FFFFFF',
        border: '#E5E7EB',
        textPrimary: '#111827',
        textSecondary: '#6B7280',
        unreadBadge: '#25D366',
        searchBg: '#F3F4F6',
        callBtnBg: '#E8F5E9'
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
        const isOutbound = lastMsg?.direction === 'OUTBOUND';
        const unread = item.unreadCount || 0;
        const displayName = item.name ? item.name.trim() : item.phone;
        const initials = (item.name || item.phone || 'L').slice(0, 2).toUpperCase();

        return (
            <TouchableOpacity 
                style={[styles.leadItem, { backgroundColor: theme.itemBg, borderBottomColor: theme.border }]}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('WhatsAppChat', {
                    lead: item,
                    businessId,
                    businessName,
                    crmType,
                    isDarkMode
                })}
            >
                {/* Avatar */}
                <View style={[styles.avatarWrap, { backgroundColor: isDarkMode ? '#202c33' : '#E0E7FF' }]}>
                    <Text style={[styles.avatarText, { color: isDarkMode ? '#e9edef' : '#3730A3' }]}>{initials}</Text>
                </View>

                {/* Content */}
                <View style={styles.leadContent}>
                    <View style={styles.leadTopRow}>
                        <Text style={[styles.leadName, { color: theme.textPrimary }]} numberOfLines={1}>
                            {displayName}
                        </Text>
                        <Text style={[styles.timeText, { color: unread > 0 ? theme.unreadBadge : theme.textSecondary }]}>
                            {formatTimestamp(item.updatedAt || item.createdAt)}
                        </Text>
                    </View>

                    <View style={styles.leadBottomRow}>
                        <View style={styles.snippetRow}>
                            {isOutbound && (
                                <Icon name="check-all" size={16} color="#53bdeb" style={{ marginRight: 4 }} />
                            )}
                            <Text 
                                style={[styles.snippetText, { color: unread > 0 ? theme.textPrimary : theme.textSecondary, fontWeight: unread > 0 ? '700' : '400' }]} 
                                numberOfLines={1}
                            >
                                {msgText}
                            </Text>
                        </View>

                        <View style={styles.leadActions}>
                            {/* Unread Badge */}
                            {unread > 0 && (
                                <View style={[styles.unreadBadge, { backgroundColor: theme.unreadBadge }]}>
                                    <Text style={styles.unreadText}>{unread}</Text>
                                </View>
                            )}

                            {/* Direct WhatsApp Call Button */}
                            <TouchableOpacity 
                                style={[styles.callBtn, { backgroundColor: isDarkMode ? 'rgba(37, 211, 102, 0.18)' : '#E8F5E9' }]}
                                activeOpacity={0.8}
                                onPress={() => handleCallLead(item)}
                            >
                                <Icon name="phone" size={17} color="#25D366" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Batch / Phase Tags */}
                    {(item.batch?.name || item.phase || item.status) && (
                        <View style={styles.tagRow}>
                            {item.batch?.name && (
                                <View style={[styles.miniTag, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#EEF2FF' }]}>
                                    <Text style={[styles.miniTagText, { color: isDarkMode ? '#aebac1' : '#4338CA' }]}>{item.batch.name}</Text>
                                </View>
                            )}
                            {item.status && (
                                <View style={[styles.miniTag, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.06)' : '#F3F4F6' }]}>
                                    <Text style={[styles.miniTagText, { color: isDarkMode ? '#8696a0' : '#4B5563' }]}>{item.status}</Text>
                                </View>
                            )}
                        </View>
                    )}
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

            {/* Leads List */}
            {loading && !refreshing ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#25D366" />
                    <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading WhatsApp Conversations...</Text>
                </View>
            ) : leads.length === 0 ? (
                <View style={styles.centerContainer}>
                    <Icon name="chat-outline" size={56} color={theme.textSecondary} style={{ opacity: 0.5 }} />
                    <Text style={[styles.emptyText, { color: theme.textPrimary }]}>No Conversations in {activeTab}</Text>
                    <Text style={[styles.emptySubText, { color: theme.textSecondary }]}>
                        {searchQuery ? 'No leads matched your search query.' : 'Leads assigned to this tab will appear here.'}
                    </Text>
                </View>
            ) : (
                <FlatList 
                    data={leads}
                    keyExtractor={(item) => String(item.id)}
                    renderItem={renderLeadItem}
                    contentContainerStyle={{ paddingBottom: 60 }}
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
