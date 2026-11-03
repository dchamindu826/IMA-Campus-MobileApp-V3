import React, { useState, useEffect, useContext } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    StatusBar, ActivityIndicator, Modal, FlatList, Platform, RefreshControl, Image
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthContext } from '../context/AuthContext';
import { useCall } from '../context/CallContext';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import COLORS from '../constants/colors';
import api from '../services/api';

const STATUS_OPTIONS = [
    { value: 'ACTIVE', label: 'ACTIVE', color: '#10B981', icon: 'check-circle', desc: 'Ready to receive WhatsApp incoming calls' },
    { value: 'LUNCH', label: 'LUNCH', color: '#F59E0B', icon: 'food', desc: 'On lunch break - calls will not ring' },
    { value: 'AWAY', label: 'AWAY', color: '#F97316', icon: 'clock-outline', desc: 'Temporarily away from desk' },
    { value: 'OFFLINE', label: 'OFFLINE', color: '#EF4444', icon: 'phone-off', desc: 'Disconnected from call queue' }
];

const StaffDashboardScreen = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const { userInfo, logout } = useContext(AuthContext);
    const { agentStatus, changeStatus } = useCall();
    
    const [isDarkMode, setIsDarkMode] = useState(true);
    const [businesses, setBusinesses] = useState([]);
    const [overview, setOverview] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [showStatusModal, setShowStatusModal] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [overviewRes, bizRes] = await Promise.all([
                api.get('/mobile/staff/overview').catch(() => ({ data: null })),
                api.get('/admin/businesses').catch(() => ({ data: [] }))
            ]);
            
            if (overviewRes?.data) {
                setOverview(overviewRes.data);
            }
            if (bizRes?.data && Array.isArray(bizRes.data) && bizRes.data.length > 0) {
                setBusinesses(bizRes.data);
            } else if (overviewRes?.data?.businesses) {
                setBusinesses(overviewRes.data.businesses);
            }
        } catch (e) {
            console.log("Mobile: Error loading staff dashboard:", e?.message);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const onRefresh = () => {
        setRefreshing(true);
        loadData();
    };

    const currentStatusConfig = STATUS_OPTIONS.find(s => s.value === agentStatus) || STATUS_OPTIONS[3];

    const theme = isDarkMode ? {
        bg: '#0b141a',
        cardBg: '#111b21',
        cardBorder: 'rgba(255, 255, 255, 0.08)',
        textPrimary: '#e9edef',
        textSecondary: '#8696a0',
        accent: '#25D366',
        headerGrad: ['#1f2c34', '#111b21'],
        subCard: '#1f2c34',
        statusBar: '#1f2c34'
    } : {
        bg: '#F0F2F5',
        cardBg: '#FFFFFF',
        cardBorder: '#E9EDEF',
        textPrimary: '#111827',
        textSecondary: '#667781',
        accent: '#008069',
        headerGrad: ['#008069', '#075E54'],
        subCard: '#F0F2F5',
        statusBar: '#008069'
    };

    const roleName = String(userInfo?.role || 'Staff').replace(/_/g, ' ');

    return (
        <View style={[styles.container, { backgroundColor: theme.bg }]}>
            <StatusBar 
                barStyle="light-content" 
                backgroundColor={theme.statusBar} 
            />

            {/* Top Navigation Bar */}
            <LinearGradient 
                colors={theme.headerGrad} 
                style={[styles.header, { paddingTop: Math.max(insets.top, 16) + 10 }]}
            >
                <View style={styles.topRow}>
                    <View style={styles.userInfoRow}>
                        <View style={styles.avatarWrapper}>
                            {userInfo?.image ? (
                                <Image source={{ uri: userInfo.image }} style={styles.avatar} />
                            ) : (
                                <Icon name="account-tie" size={28} color="#FFFFFF" />
                            )}
                        </View>
                        <View style={{ marginLeft: 12 }}>
                            <Text style={styles.greetingText}>Staff Workspace</Text>
                            <Text style={styles.usernameText} numberOfLines={1}>
                                {userInfo?.firstName} {userInfo?.lastName}
                            </Text>
                            <View style={styles.roleTag}>
                                <Text style={styles.roleTagText}>{roleName.toUpperCase()}</Text>
                            </View>
                        </View>
                    </View>

                    <View style={styles.topActions}>
                        {/* Theme Toggle Button */}
                        <TouchableOpacity 
                            onPress={() => setIsDarkMode(!isDarkMode)} 
                            style={styles.iconButton}
                            activeOpacity={0.8}
                        >
                            <Icon name={isDarkMode ? "white-balance-sunny" : "moon-waning-crescent"} size={20} color="#FFFFFF" />
                        </TouchableOpacity>

                        {/* Logout Button */}
                        <TouchableOpacity 
                            onPress={logout} 
                            style={[styles.iconButton, { backgroundColor: isDarkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.2)' }]}
                            activeOpacity={0.8}
                        >
                            <Icon name="logout" size={20} color="#FFFFFF" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Agent Call Status Bar */}
                <View style={styles.statusBarContainer}>
                    <View style={styles.statusInfoCol}>
                        <Text style={styles.statusLabel}>INCOMING CALL STATUS</Text>
                        <Text style={styles.statusSubLabel}>
                            {agentStatus === 'ACTIVE' 
                                ? 'Calls will ring on this device' 
                                : 'Calls suppressed (Not Active)'}
                        </Text>
                    </View>

                    <TouchableOpacity 
                        style={[styles.statusPill, { backgroundColor: currentStatusConfig.color + '22', borderColor: currentStatusConfig.color }]}
                        onPress={() => setShowStatusModal(true)}
                        activeOpacity={0.85}
                    >
                        <View style={[styles.statusDot, { backgroundColor: currentStatusConfig.color }]} />
                        <Text style={[styles.statusPillText, { color: currentStatusConfig.color }]}>
                            {currentStatusConfig.label}
                        </Text>
                        <Icon name="chevron-down" size={16} color={currentStatusConfig.color} style={{ marginLeft: 4 }} />
                    </TouchableOpacity>
                </View>
            </LinearGradient>

            {loading && !refreshing ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={theme.accent} />
                    <Text style={[styles.loadingText, { color: theme.textSecondary }]}>Loading Allocated Businesses...</Text>
                </View>
            ) : (
                <ScrollView 
                    showsVerticalScrollIndicator={false} 
                    contentContainerStyle={{ paddingBottom: 110, paddingHorizontal: 16 }}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.accent]} tintColor={theme.accent} />
                    }
                >
                    {/* Quick Stats Grid */}
                    <View style={styles.metricsRow}>
                        <View style={[styles.metricCard, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
                            <Icon name="domain" size={24} color={theme.accent} />
                            <Text style={[styles.metricValue, { color: theme.textPrimary }]}>{businesses.length}</Text>
                            <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Allocated Businesses</Text>
                        </View>
                        <View style={[styles.metricCard, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
                            <Icon name="account-group" size={24} color={theme.accent} />
                            <Text style={[styles.metricValue, { color: theme.textPrimary }]}>{overview?.activeStudentsCount || 0}</Text>
                            <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Enrolled Leads</Text>
                        </View>
                        <View style={[styles.metricCard, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
                            <Icon name="buffer" size={24} color={theme.accent} />
                            <Text style={[styles.metricValue, { color: theme.textPrimary }]}>{overview?.batches?.length || 0}</Text>
                            <Text style={[styles.metricLabel, { color: theme.textSecondary }]}>Active Batches</Text>
                        </View>
                    </View>

                    {/* Section Title */}
                    <View style={styles.sectionHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Icon name="briefcase-outline" size={22} color={theme.accent} style={{ marginRight: 8 }} />
                            <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Allocated Businesses & CRMs</Text>
                        </View>
                        <Text style={[styles.sectionSubtitle, { color: theme.textSecondary }]}>
                            Select a CRM below to access WhatsApp chats, messages, and calls
                        </Text>
                    </View>

                    {/* Allocated Businesses List */}
                    {businesses.length === 0 ? (
                        <View style={[styles.emptyBox, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
                            <Icon name="briefcase-off-outline" size={48} color={theme.textSecondary} />
                            <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>No Businesses Allocated</Text>
                            <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>
                                You currently don't have any businesses assigned to your staff profile.
                            </Text>
                        </View>
                    ) : (
                        businesses.map((biz) => (
                            <View 
                                key={biz.id} 
                                style={[styles.businessCard, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}
                            >
                                {/* Business Header Info */}
                                <View style={styles.bizHeader}>
                                    <View style={[styles.bizIconWrapper, { backgroundColor: theme.subCard }]}>
                                        <Icon name="domain" size={26} color={theme.accent} />
                                    </View>
                                    <View style={styles.bizInfo}>
                                        <Text style={[styles.bizName, { color: theme.textPrimary }]}>{biz.name}</Text>
                                        <Text style={[styles.bizMeta, { color: theme.textSecondary }]}>
                                             {biz.medium || 'Sinhala'} • {biz.category || 'Academic'}
                                        </Text>
                                    </View>
                                    <View style={[styles.activeTag, { backgroundColor: isDarkMode ? 'rgba(0, 168, 132, 0.15)' : '#E7FCE3', borderColor: isDarkMode ? 'rgba(0, 168, 132, 0.3)' : '#A7F3D0' }]}>
                                        <Text style={[styles.activeTagText, { color: isDarkMode ? '#00a884' : '#008069' }]}>LIVE CRM</Text>
                                    </View>
                                </View>

                                <View style={[styles.divider, { backgroundColor: theme.cardBorder }]} />

                                {/* CRM Action Buttons for this Business */}
                                <View style={styles.crmButtonsContainer}>
                                    {/* 1. Free Seminar CRM (Authentic WhatsApp Primary Green Button) */}
                                    <TouchableOpacity 
                                        style={[styles.crmActionBtn, { backgroundColor: isDarkMode ? '#00a884' : '#008069' }]}
                                        activeOpacity={0.85}
                                        onPress={() => navigation.navigate('CrmContacts', {
                                            businessId: biz.id,
                                            businessName: biz.name,
                                            batches: biz.batches || [],
                                            crmType: 'FREE_SEMINAR',
                                            isDarkMode
                                        })}
                                    >
                                        <View style={styles.crmBtnIcon}>
                                            <Icon name="whatsapp" size={20} color="#FFFFFF" />
                                        </View>
                                        <View style={styles.crmBtnTextCol}>
                                            <Text style={styles.crmBtnTitle}>Free Sem CRM</Text>
                                            <Text style={styles.crmBtnSubtitle}>Leads, Chats & WhatsApp Calls</Text>
                                        </View>
                                        <Icon name="chevron-right" size={22} color="#FFFFFF" style={{ opacity: 0.9 }} />
                                    </TouchableOpacity>

                                    {/* 2. After Seminar CRM (WhatsApp Teal Outline/Subtle Button) */}
                                    <TouchableOpacity 
                                        style={[
                                            styles.crmActionBtn, 
                                            { 
                                                backgroundColor: isDarkMode ? '#1f2c34' : '#FFFFFF',
                                                borderWidth: 1.5,
                                                borderColor: isDarkMode ? 'rgba(0, 168, 132, 0.4)' : '#008069'
                                            }
                                        ]}
                                        activeOpacity={0.85}
                                        onPress={() => navigation.navigate('CrmContacts', {
                                            businessId: biz.id,
                                            businessName: biz.name,
                                            batches: biz.batches || [],
                                            crmType: 'AFTER_SEMINAR',
                                            isDarkMode
                                        })}
                                    >
                                        <View style={[styles.crmBtnIcon, { backgroundColor: isDarkMode ? 'rgba(0, 168, 132, 0.2)' : '#E7FCE3' }]}>
                                            <Icon name="message-text-outline" size={20} color={isDarkMode ? '#00a884' : '#008069'} />
                                        </View>
                                        <View style={styles.crmBtnTextCol}>
                                            <Text style={[styles.crmBtnTitle, { color: theme.textPrimary }]}>After Sem CRM</Text>
                                            <Text style={[styles.crmBtnSubtitle, { color: theme.textSecondary }]}>Enrolled Follow-up & Chats</Text>
                                        </View>
                                        <Icon name="chevron-right" size={22} color={theme.textSecondary} />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))
                    )}
                </ScrollView>
            )}

            {/* Agent Status Selector Modal */}
            <Modal visible={showStatusModal} transparent animationType="fade">
                <TouchableOpacity 
                    style={styles.modalOverlay} 
                    activeOpacity={1} 
                    onPress={() => setShowStatusModal(false)}
                >
                    <View style={[styles.modalContent, { backgroundColor: isDarkMode ? '#1f2c34' : '#FFFFFF' }]}>
                        <View style={styles.modalHeaderRow}>
                            <Icon name="headset" size={24} color={theme.accent} />
                            <Text style={[styles.modalTitle, { color: isDarkMode ? '#FFFFFF' : '#111827' }]}>
                                Set Staff Agent Status
                            </Text>
                        </View>
                        <Text style={[styles.modalSubtitle, { color: isDarkMode ? '#8696a0' : '#6B7280' }]}>
                            This status controls whether incoming WhatsApp calls ring on this phone.
                        </Text>

                        {STATUS_OPTIONS.map((status) => {
                            const isSelected = agentStatus === status.value;
                            return (
                                <TouchableOpacity 
                                    key={status.value} 
                                    style={[
                                        styles.statusOptionBtn, 
                                        { 
                                            backgroundColor: isSelected ? status.color + '15' : (isDarkMode ? '#111b21' : '#F9FAFB'),
                                            borderColor: isSelected ? status.color : (isDarkMode ? 'rgba(255,255,255,0.06)' : '#E5E7EB')
                                        }
                                    ]}
                                    onPress={() => {
                                        changeStatus(status.value);
                                        setShowStatusModal(false);
                                    }}
                                    activeOpacity={0.8}
                                >
                                    <View style={[styles.statusIconWrap, { backgroundColor: status.color + '25' }]}>
                                        <Icon name={status.icon} size={22} color={status.color} />
                                    </View>
                                    <View style={{ flex: 1, marginLeft: 12 }}>
                                        <Text style={[styles.statusOptionLabel, { color: status.color }]}>
                                            {status.label}
                                        </Text>
                                        <Text style={[styles.statusOptionDesc, { color: isDarkMode ? '#8696a0' : '#6B7280' }]}>
                                            {status.desc}
                                        </Text>
                                    </View>
                                    {isSelected && (
                                        <Icon name="check-circle" size={22} color={status.color} />
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        paddingHorizontal: 18,
        paddingBottom: 20,
        borderBottomLeftRadius: 28,
        borderBottomRightRadius: 28,
        elevation: 12,
        shadowColor: '#000',
        shadowOpacity: 0.35,
        shadowRadius: 10
    },
    topRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    userInfoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1
    },
    avatarWrapper: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden'
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24
    },
    greetingText: {
        color: 'rgba(255, 255, 255, 0.75)',
        fontSize: 12,
        fontWeight: '500'
    },
    usernameText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: 'bold',
        maxWidth: 200
    },
    roleTag: {
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(255, 255, 255, 0.18)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
        marginTop: 3
    },
    roleTagText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.5
    },
    topActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8
    },
    iconButton: {
        width: 38,
        height: 38,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.15)',
        justifyContent: 'center',
        alignItems: 'center'
    },
    statusBarContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.22)',
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 16,
        marginTop: 16
    },
    statusInfoCol: {
        flex: 1
    },
    statusLabel: {
        color: 'rgba(255, 255, 255, 0.9)',
        fontSize: 11,
        fontWeight: 'bold',
        letterSpacing: 0.4
    },
    statusSubLabel: {
        color: 'rgba(255, 255, 255, 0.65)',
        fontSize: 11,
        marginTop: 2
    },
    statusPill: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1.5
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 6
    },
    statusPillText: {
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 0.5
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center'
    },
    loadingText: {
        marginTop: 12,
        fontSize: 14,
        fontWeight: '500'
    },
    metricsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginVertical: 18,
        gap: 10
    },
    metricCard: {
        flex: 1,
        paddingVertical: 14,
        paddingHorizontal: 8,
        borderRadius: 16,
        alignItems: 'center',
        borderWidth: 1,
        elevation: 2
    },
    metricValue: {
        fontSize: 20,
        fontWeight: '800',
        marginTop: 6
    },
    metricLabel: {
        fontSize: 10,
        fontWeight: '600',
        marginTop: 2,
        textAlign: 'center'
    },
    sectionHeader: {
        marginBottom: 14
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: 'bold'
    },
    sectionSubtitle: {
        fontSize: 12,
        marginTop: 3
    },
    businessCard: {
        borderRadius: 20,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        elevation: 3,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 8
    },
    bizHeader: {
        flexDirection: 'row',
        alignItems: 'center'
    },
    bizIconWrapper: {
        width: 44,
        height: 44,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center'
    },
    bizInfo: {
        flex: 1,
        marginLeft: 12
    },
    bizName: {
        fontSize: 17,
        fontWeight: 'bold'
    },
    bizMeta: {
        fontSize: 12,
        marginTop: 2
    },
    activeTag: {
        backgroundColor: 'rgba(37, 211, 102, 0.15)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8
    },
    activeTagText: {
        color: '#25D366',
        fontSize: 10,
        fontWeight: '800'
    },
    divider: {
        height: 1,
        marginVertical: 14
    },
    crmButtonsContainer: {
        gap: 10
    },
    crmActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 14,
        elevation: 2
    },
    freeSemBtn: {
        backgroundColor: '#008069'
    },
    afterSemBtn: {
        backgroundColor: '#3730A3'
    },
    crmBtnIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        justifyContent: 'center',
        alignItems: 'center'
    },
    crmBtnTextCol: {
        flex: 1,
        marginLeft: 12
    },
    crmBtnTitle: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: 'bold'
    },
    crmBtnSubtitle: {
        color: 'rgba(255, 255, 255, 0.8)',
        fontSize: 11,
        marginTop: 1
    },
    emptyBox: {
        padding: 30,
        borderRadius: 20,
        alignItems: 'center',
        borderWidth: 1
    },
    emptyTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        marginTop: 12
    },
    emptySubtitle: {
        fontSize: 13,
        textAlign: 'center',
        marginTop: 6
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20
    },
    modalContent: {
        width: '100%',
        maxWidth: 380,
        borderRadius: 24,
        padding: 22,
        elevation: 12
    },
    modalHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 6
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold'
    },
    modalSubtitle: {
        fontSize: 13,
        marginBottom: 18,
        lineHeight: 18
    },
    statusOptionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: 14,
        marginBottom: 10,
        borderWidth: 1.5
    },
    statusIconWrap: {
        width: 38,
        height: 38,
        borderRadius: 19,
        justifyContent: 'center',
        alignItems: 'center'
    },
    statusOptionLabel: {
        fontSize: 15,
        fontWeight: 'bold'
    },
    statusOptionDesc: {
        fontSize: 11,
        marginTop: 2
    }
});

export default StaffDashboardScreen;
