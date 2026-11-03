import React, { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, FlatList, TouchableOpacity,
    TextInput, ActivityIndicator, RefreshControl, StatusBar, Platform, ScrollView, Modal
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
        batches: passedBatches = [],
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
    const [availableBatches, setAvailableBatches] = useState(passedBatches || []);
    const [selectedBatch, setSelectedBatch] = useState(null); // null = All Batches
    const [showBatchModal, setShowBatchModal] = useState(false);

    // Auto-fetch batches for this business if not passed in navigation
    useEffect(() => {
        if ((!availableBatches || availableBatches.length === 0) && businessId) {
            api.get('/admin/businesses')
                .then(res => {
                    const list = res.data || [];
                    const biz = list.find(b => String(b.id || b._id) === String(businessId));
                    if (biz && Array.isArray(biz.batches) && biz.batches.length > 0) {
                        setAvailableBatches(biz.batches);
                    }
                })
                .catch(() => {});
        }
    }, [businessId]);

    // Unique list of all batches (from business structure + leads in memory)
    const allBatches = useMemo(() => {
        const map = new Map();
        (availableBatches || []).forEach(b => {
            const bName = b.name || b.title;
            if (bName) {
                map.set(String(bName).toLowerCase(), { id: b.id || b._id || bName, name: bName });
            }
        });
        leads.forEach(l => {
            const bName = l.batch?.name || l.batchName;
            if (bName && !map.has(String(bName).toLowerCase())) {
                map.set(String(bName).toLowerCase(), { id: l.batch?.id || bName, name: bName });
            }
        });
        return Array.from(map.values());
    }, [availableBatches, leads]);

    const getBatchCount = (batchName) => {
        if (!batchName) return leads.length;
        return leads.filter(l => {
            const bName = l.batch?.name || l.batchName;
            return bName && bName.toLowerCase() === batchName.toLowerCase();
        }).length;
    };

    const unreadCount = useMemo(() => {
        return leads.filter(l => (l.unreadCount || 0) > 0).length;
    }, [leads]);

    // Filter leads by selectedCategory AND selectedBatch
    const filteredLeads = useMemo(() => {
        let result = leads;
        if (selectedBatch) {
            result = result.filter(l => {
                const bName = l.batch?.name || l.batchName;
                const bId = l.batch?.id || l.batchId;
                return (bName && bName.toLowerCase() === selectedBatch.name.toLowerCase()) ||
                       (bId && String(bId) === String(selectedBatch.id));
            });
        }
        if (selectedCategory === 'UNREAD') {
            result = result.filter(l => (l.unreadCount || 0) > 0);
        }
        return result;
    }, [leads, selectedBatch, selectedCategory]);

    // Authentic WhatsApp Light / Dark Mode Theme
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
        tabInactiveText: 'rgba(255, 255, 255, 0.75)',
        tabIndicator: '#FFFFFF',
        itemBg: '#FFFFFF',
        border: '#E9EDEF',
        textPrimary: '#111827',
        textSecondary: '#667781',
        unreadBadge: '#25D366',
        searchBg: '#F0F2F5',
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
                    styles.leadRow, 
                    { 
                        backgroundColor: theme.itemBg,
                        borderBottomColor: theme.border
                    }
                ]}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('WhatsAppChat', {
                    lead: item,
                    businessId,
                    businessName,
                    crmType,
                    isDarkMode
                })}
            >
                {/* Circular Avatar */}
                <View style={[styles.avatarWrap, { backgroundColor: avatarPalette.bg }]}>
                    <Text style={[styles.avatarText, { color: avatarPalette.text }]}>{initials}</Text>
                </View>

                {/* Lead Info & Snippet */}
                <View style={styles.leadContent}>
                    {/* Top Row: Name + Timestamp */}
                    <View style={styles.leadTopRow}>
                        <Text style={[styles.leadName, { color: theme.textPrimary }]} numberOfLines={1}>
                            {displayName}
                        </Text>
                        <Text style={[styles.timeText, { color: unread > 0 ? theme.unreadBadge : theme.textSecondary }]}>
                            {formatTimestamp(item.updatedAt || item.createdAt)}
                        </Text>
                    </View>

                    {/* Secondary Row: Batch Pill + Status + Phone */}
                    {(batchTitle || item.phone) && (
                        <View style={styles.leadSubRow}>
                            {batchTitle && (
                                <View style={[styles.batchPill, { backgroundColor: isDarkMode ? '#1F2C34' : '#F0F2F5' }]}>
                                    <Icon name="school-outline" size={12} color={isDarkMode ? '#00a884' : '#008069'} style={{ marginRight: 3 }} />
                                    <Text style={[styles.batchPillText, { color: isDarkMode ? '#00a884' : '#008069' }]} numberOfLines={1}>
                                        {batchTitle}
                                    </Text>
                                </View>
                            )}
                            {statusTitle && (
                                <View style={[
                                    styles.statusMiniTag, 
                                    { backgroundColor: statusTitle === 'PAID' ? (isDarkMode ? 'rgba(37,211,102,0.15)' : '#E8F5E9') : (isDarkMode ? 'rgba(255,255,255,0.06)' : '#F0F2F5') }
                                ]}>
                                    <Text style={[
                                        styles.statusMiniText, 
                                        { color: statusTitle === 'PAID' ? '#25D366' : theme.textSecondary }
                                    ]}>
                                        {statusTitle}
                                    </Text>
                                </View>
                            )}
                            {item.phone && displayName !== item.phone && (
                                <Text style={[styles.leadPhoneText, { color: theme.textSecondary }]} numberOfLines={1}>
                                    {item.phone}
                                </Text>
                            )}
                        </View>
                    )}

                    {/* Bottom Row: Outbound ticks + Snippet + Right actions */}
                    <View style={styles.leadBottomRow}>
                        <View style={styles.snippetRow}>
                            {isOutbound && (
                                <Icon 
                                    name="check-all" 
                                    size={15} 
                                    color="#53bdeb" 
                                    style={{ marginRight: 4 }} 
                                />
                            )}
                            <Text 
                                style={[
                                    styles.snippetText, 
                                    { 
                                        color: unread > 0 ? theme.textPrimary : theme.textSecondary,
                                        fontWeight: unread > 0 ? '600' : '400'
                                    }
                                ]} 
                                numberOfLines={1}
                            >
                                {msgText}
                            </Text>
                        </View>

                        {/* Right Actions: Unread Badge + WhatsApp Call Button */}
                        <View style={styles.rowRightActions}>
                            {unread > 0 && (
                                <View style={[styles.unreadBadge, { backgroundColor: theme.unreadBadge }]}>
                                    <Text style={styles.unreadText}>{unread}</Text>
                                </View>
                            )}

                            <TouchableOpacity 
                                style={[styles.quickCallBtn, { backgroundColor: theme.callBtnBg }]}
                                activeOpacity={0.7}
                                onPress={() => handleCallLead(item)}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                                <Icon name="phone" size={16} color={isDarkMode ? '#00a884' : '#008069'} />
                            </TouchableOpacity>
                        </View>
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

            {/* Batch Dropdown & Quick Unread Filter Bar */}
            <View style={[styles.filterBar, { backgroundColor: isDarkMode ? '#111b21' : '#FFFFFF', borderBottomColor: theme.border }]}>
                {/* Batch Dropdown Trigger Button */}
                <TouchableOpacity
                    style={[
                        styles.batchDropdownBtn,
                        selectedBatch
                            ? { backgroundColor: isDarkMode ? '#0A332C' : '#E7FCE3', borderColor: isDarkMode ? '#00a884' : '#25D366' }
                            : { backgroundColor: isDarkMode ? '#1f2c34' : '#F0F2F5', borderColor: theme.border }
                    ]}
                    activeOpacity={0.8}
                    onPress={() => setShowBatchModal(true)}
                >
                    <Icon
                        name="school-outline"
                        size={16}
                        color={selectedBatch ? (isDarkMode ? '#00a884' : '#008069') : theme.textSecondary}
                        style={{ marginRight: 6 }}
                    />
                    <Text
                        style={[
                            styles.batchDropdownText,
                            {
                                color: selectedBatch ? (isDarkMode ? '#00a884' : '#008069') : theme.textPrimary,
                                fontWeight: selectedBatch ? '700' : '500'
                            }
                        ]}
                        numberOfLines={1}
                    >
                        {selectedBatch ? `${selectedBatch.name} (${getBatchCount(selectedBatch.name)})` : 'All Batches'}
                    </Text>
                    {selectedBatch ? (
                        <TouchableOpacity
                            onPress={() => setSelectedBatch(null)}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            style={{ marginLeft: 6 }}
                        >
                            <Icon name="close-circle" size={16} color={isDarkMode ? '#00a884' : '#008069'} />
                        </TouchableOpacity>
                    ) : (
                        <Icon name="chevron-down" size={18} color={theme.textSecondary} style={{ marginLeft: 4 }} />
                    )}
                </TouchableOpacity>

                {/* Quick Unread Toggle Filter */}
                <TouchableOpacity
                    style={[
                        styles.unreadFilterPill,
                        selectedCategory === 'UNREAD'
                            ? { backgroundColor: '#25D366', borderColor: '#25D366' }
                            : { backgroundColor: isDarkMode ? '#1f2c34' : '#F0F2F5', borderColor: theme.border }
                    ]}
                    onPress={() => setSelectedCategory(prev => prev === 'UNREAD' ? 'ALL' : 'UNREAD')}
                    activeOpacity={0.8}
                >
                    <Icon
                        name="message-badge"
                        size={14}
                        color={selectedCategory === 'UNREAD' ? '#FFFFFF' : theme.textSecondary}
                        style={{ marginRight: 4 }}
                    />
                    <Text
                        style={[
                            styles.unreadFilterText,
                            { color: selectedCategory === 'UNREAD' ? '#FFFFFF' : theme.textPrimary, fontWeight: selectedCategory === 'UNREAD' ? '700' : '500' }
                        ]}
                    >
                        Unread
                    </Text>
                    {unreadCount > 0 && (
                        <View style={[styles.unreadFilterBadge, { backgroundColor: selectedCategory === 'UNREAD' ? 'rgba(0,0,0,0.2)' : '#25D366' }]}>
                            <Text style={styles.unreadFilterBadgeText}>
                                {unreadCount}
                            </Text>
                        </View>
                    )}
                </TouchableOpacity>
            </View>

            {/* Batch Filter Selection Modal */}
            <Modal
                visible={showBatchModal}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setShowBatchModal(false)}
            >
                <TouchableOpacity
                    style={styles.modalBackdrop}
                    activeOpacity={1}
                    onPress={() => setShowBatchModal(false)}
                >
                    <View
                        style={[styles.modalSheet, { backgroundColor: isDarkMode ? '#1f2c34' : '#FFFFFF' }]}
                        onStartShouldSetResponder={() => true}
                    >
                        {/* Modal Header */}
                        <View style={styles.modalHeader}>
                            <View style={styles.modalIndicator} />
                            <View style={styles.modalTitleRow}>
                                <View style={{ flex: 1 }}>
                                    <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Select Batch</Text>
                                    <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>{businessName}</Text>
                                </View>
                                <TouchableOpacity onPress={() => setShowBatchModal(false)} style={styles.modalCloseBtn}>
                                    <Icon name="close" size={22} color={theme.textSecondary} />
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Batch Options */}
                        <ScrollView style={styles.modalScroll} contentContainerStyle={{ paddingBottom: 24 }}>
                            {/* Option 1: All Batches */}
                            <TouchableOpacity
                                style={[
                                    styles.batchOptionItem,
                                    !selectedBatch && { backgroundColor: isDarkMode ? 'rgba(0,168,132,0.15)' : '#E7FCE3' }
                                ]}
                                onPress={() => {
                                    setSelectedBatch(null);
                                    setShowBatchModal(false);
                                }}
                            >
                                <View style={styles.batchOptionLeft}>
                                    <Icon
                                        name="account-group"
                                        size={20}
                                        color={!selectedBatch ? (isDarkMode ? '#00a884' : '#008069') : theme.textSecondary}
                                        style={{ marginRight: 12 }}
                                    />
                                    <View>
                                        <Text
                                            style={[
                                                styles.batchOptionName,
                                                { color: !selectedBatch ? (isDarkMode ? '#00a884' : '#008069') : theme.textPrimary, fontWeight: !selectedBatch ? '700' : '500' }
                                            ]}
                                        >
                                            All Batches
                                        </Text>
                                        <Text style={[styles.batchOptionCount, { color: theme.textSecondary }]}>
                                            {leads.length} total leads
                                        </Text>
                                    </View>
                                </View>
                                {!selectedBatch && (
                                    <Icon name="check-circle" size={20} color={isDarkMode ? '#00a884' : '#008069'} />
                                )}
                            </TouchableOpacity>

                            {/* Option 2..N: Batches */}
                            {allBatches.length > 0 ? (
                                allBatches.map(b => {
                                    const isSelected = selectedBatch?.id === b.id || selectedBatch?.name === b.name;
                                    const count = getBatchCount(b.name);
                                    return (
                                        <TouchableOpacity
                                            key={String(b.id || b.name)}
                                            style={[
                                                styles.batchOptionItem,
                                                isSelected && { backgroundColor: isDarkMode ? 'rgba(0,168,132,0.15)' : '#E7FCE3' }
                                            ]}
                                            onPress={() => {
                                                setSelectedBatch(b);
                                                setShowBatchModal(false);
                                            }}
                                        >
                                            <View style={styles.batchOptionLeft}>
                                                <Icon
                                                    name="school"
                                                    size={20}
                                                    color={isSelected ? (isDarkMode ? '#00a884' : '#008069') : theme.textSecondary}
                                                    style={{ marginRight: 12 }}
                                                />
                                                <View>
                                                    <Text
                                                        style={[
                                                            styles.batchOptionName,
                                                            { color: isSelected ? (isDarkMode ? '#00a884' : '#008069') : theme.textPrimary, fontWeight: isSelected ? '700' : '500' }
                                                        ]}
                                                    >
                                                        {b.name}
                                                    </Text>
                                                    <Text style={[styles.batchOptionCount, { color: theme.textSecondary }]}>
                                                        {count} {count === 1 ? 'lead' : 'leads'}
                                                    </Text>
                                                </View>
                                            </View>
                                            {isSelected && (
                                                <Icon name="check-circle" size={20} color={isDarkMode ? '#00a884' : '#008069'} />
                                            )}
                                        </TouchableOpacity>
                                    );
                                })
                            ) : (
                                <View style={{ padding: 24, alignItems: 'center' }}>
                                    <Text style={{ color: theme.textSecondary, fontSize: 14 }}>No batches found for this business.</Text>
                                </View>
                            )}
                        </ScrollView>
                    </View>
                </TouchableOpacity>
            </Modal>

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
    leadRow: {
        flexDirection: 'row',
        alignItems: 'center',
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
        marginBottom: 2
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
    leadSubRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
        marginBottom: 4
    },
    batchPill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        maxWidth: 160
    },
    batchPillText: {
        fontSize: 11,
        fontWeight: '600'
    },
    statusMiniTag: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4
    },
    statusMiniText: {
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase'
    },
    leadPhoneText: {
        fontSize: 11
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
        marginRight: 8
    },
    snippetText: {
        fontSize: 13,
        flex: 1
    },
    rowRightActions: {
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
    quickCallBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center'
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
    },
    // Batch Filter Bar
    filterBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderBottomWidth: 1,
        gap: 8
    },
    batchDropdownBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1
    },
    batchDropdownText: {
        fontSize: 13,
        flex: 1
    },
    unreadFilterPill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1
    },
    unreadFilterText: {
        fontSize: 12
    },
    unreadFilterBadge: {
        marginLeft: 6,
        borderRadius: 10,
        paddingHorizontal: 5,
        paddingVertical: 1,
        minWidth: 18,
        alignItems: 'center',
        justifyContent: 'center'
    },
    unreadFilterBadgeText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: 'bold'
    },
    // Modal Styles
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end'
    },
    modalSheet: {
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '65%',
        paddingTop: 10,
        elevation: 20,
        shadowColor: '#000',
        shadowOpacity: 0.35,
        shadowRadius: 10
    },
    modalHeader: {
        paddingHorizontal: 16,
        paddingBottom: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(128,128,128,0.2)'
    },
    modalIndicator: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(128,128,128,0.4)',
        alignSelf: 'center',
        marginBottom: 10
    },
    modalTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    modalTitle: {
        fontSize: 17,
        fontWeight: 'bold'
    },
    modalSubtitle: {
        fontSize: 12,
        marginTop: 2
    },
    modalCloseBtn: {
        padding: 4
    },
    modalScroll: {
        paddingHorizontal: 12,
        paddingTop: 8
    },
    batchOptionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 12,
        marginVertical: 3
    },
    batchOptionLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1
    },
    batchOptionName: {
        fontSize: 14
    },
    batchOptionCount: {
        fontSize: 11,
        marginTop: 2
    }
});
