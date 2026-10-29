import React, { useState, useEffect, useContext } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, ActivityIndicator, Modal, FlatList } from 'react-native';
import { AuthContext } from '../context/AuthContext';
import { CallContext } from '../context/CallContext';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import COLORS from '../constants/colors';
import api from '../services/api';

const STATUS_OPTIONS = [
    { value: 'ACTIVE', label: 'ACTIVE', color: '#10B981', icon: 'check-circle' },
    { value: 'LUNCH', label: 'LUNCH', color: '#F59E0B', icon: 'coffee' },
    { value: 'AWAY', label: 'AWAY', color: '#F97316', icon: 'account-off' },
    { value: 'OFFLINE', label: 'OFFLINE', color: '#EF4444', icon: 'phone-off' }
];

const StaffDashboardScreen = ({ navigation }) => {
    const { userInfo, logout } = useContext(AuthContext);
    const { socket } = useContext(CallContext);
    
    const [businesses, setBusinesses] = useState([]);
    const [overview, setOverview] = useState(null);
    const [agentStatus, setAgentStatus] = useState('OFFLINE');
    const [loading, setLoading] = useState(true);
    const [showStatusModal, setShowStatusModal] = useState(false);

    useEffect(() => {
        loadDashboardData();
    }, []);

    const loadDashboardData = async () => {
        try {
            setLoading(true);
            const [chatRes, overviewRes] = await Promise.all([
                api.get('/mobile/chat/businesses'),
                api.get('/mobile/staff/overview')
            ]);
            
            if (chatRes.data?.businesses) {
                setBusinesses(chatRes.data.businesses);
            }
            if (overviewRes.data) {
                setOverview(overviewRes.data);
                setAgentStatus(overviewRes.data.agentStatus || 'OFFLINE');
                
                // Make sure socket is joined to pool if they are initially ACTIVE/AWAY/LUNCH
                if (socket && overviewRes.data.agentStatus && overviewRes.data.agentStatus !== 'OFFLINE') {
                    socket.emit('join_wa_agent_pool', { status: overviewRes.data.agentStatus });
                }
            }
        } catch (e) {
            console.log("Error loading dashboard data", e);
        } finally {
            setLoading(false);
        }
    };

    const changeStatus = (newStatus) => {
        setAgentStatus(newStatus);
        setShowStatusModal(false);
        if (socket) {
            if (newStatus === 'OFFLINE') {
                socket.emit('leave_wa_agent_pool');
            } else {
                socket.emit('join_wa_agent_pool', { status: newStatus });
            }
        }
    };

    const currentStatusConfig = STATUS_OPTIONS.find(s => s.value === agentStatus) || STATUS_OPTIONS[3];

    const formatDate = (dateString) => {
        const d = new Date(dateString);
        return `${d.getMonth()+1}/${d.getDate()}`;
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
            <LinearGradient colors={[COLORS.primary, '#9B1B1B']} style={styles.header}>
                <View style={styles.topRow}>
                    <View style={styles.userInfoRow}>
                        <Icon name="shield-account" size={40} color="white" />
                        <View style={{ marginLeft: 10 }}>
                            <Text style={styles.greetingText}>Staff Dashboard</Text>
                            <Text style={styles.usernameText}>{userInfo?.firstName} {userInfo?.lastName}</Text>
                        </View>
                    </View>
                    <TouchableOpacity onPress={logout} style={styles.logoutButton}>
                        <Icon name="logout" size={24} color="white" />
                    </TouchableOpacity>
                </View>
            </LinearGradient>

            {loading ? (
                <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 50 }} />
            ) : (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                    
                    {/* Overview Section */}
                    <View style={styles.overviewSection}>
                        <View style={styles.overviewHeader}>
                            <View>
                                <Text style={styles.sectionTitle}>Overview</Text>
                                <Text style={styles.subtitle}>{overview?.businesses?.[0]?.name || 'Assigned Workspace'}</Text>
                            </View>
                            
                            <TouchableOpacity 
                                style={[styles.statusBadge, { backgroundColor: currentStatusConfig.color + '20', borderColor: currentStatusConfig.color }]}
                                onPress={() => setShowStatusModal(true)}
                            >
                                <Icon name={currentStatusConfig.icon} size={16} color={currentStatusConfig.color} />
                                <Text style={[styles.statusText, { color: currentStatusConfig.color }]}>STATUS: {currentStatusConfig.label}</Text>
                                <Icon name="chevron-down" size={16} color={currentStatusConfig.color} style={{ marginLeft: 4 }}/>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.metricsRow}>
                            <View style={styles.metricCard}>
                                <Text style={styles.metricValue}>{overview?.activeStudentsCount || 0}</Text>
                                <Text style={styles.metricLabel}>Active Students</Text>
                            </View>
                            <View style={styles.metricCard}>
                                <Text style={styles.metricValue}>{overview?.batches?.length || 0}</Text>
                                <Text style={styles.metricLabel}>Assigned Batches</Text>
                            </View>
                        </View>

                        {overview?.timetables && overview.timetables.length > 0 && (
                            <View style={styles.timetableSection}>
                                <Text style={styles.sectionTitle}>Upcoming Classes</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                                    {overview.timetables.map((t, index) => (
                                        <View key={t.id || index} style={styles.timetableCard}>
                                            <View style={styles.timeBadge}>
                                                <Text style={styles.timeBadgeText}>{formatDate(t.date)}</Text>
                                            </View>
                                            <Text style={styles.timeText}>{t.startTime} - {t.endTime}</Text>
                                            <Text style={styles.subjectText} numberOfLines={1}>{t.title}</Text>
                                            <Text style={styles.batchText} numberOfLines={1}>{t.batchName}</Text>
                                        </View>
                                    ))}
                                </ScrollView>
                            </View>
                        )}
                    </View>

                    {/* Chat Moderation Section */}
                    <View style={styles.content}>
                        <Text style={styles.sectionTitle}>Chat Moderation</Text>
                        <Text style={styles.subtitle}>Select a business to monitor its community chat.</Text>
                        
                        {businesses.map((b) => (
                            <TouchableOpacity 
                                key={b.id} 
                                style={styles.card}
                                onPress={() => navigation.navigate('CommunityChat', { businessId: b.id, businessName: b.name })}
                            >
                                <View style={styles.cardIcon}>
                                    <Icon name="domain" size={30} color={COLORS.primary} />
                                </View>
                                <View style={styles.cardText}>
                                    <Text style={styles.cardTitle}>{b.name}</Text>
                                    <Text style={styles.cardSubtitle}>Manage chat and members</Text>
                                </View>
                                <Icon name="chevron-right" size={24} color="#ccc" />
                            </TouchableOpacity>
                        ))}
                    </View>
                </ScrollView>
            )}

            {/* Status Selector Modal */}
            <Modal visible={showStatusModal} transparent animationType="fade">
                <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowStatusModal(false)}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Set Your Status</Text>
                        <Text style={styles.modalSubtitle}>Change status to receive or stop incoming calls.</Text>
                        {STATUS_OPTIONS.map(status => (
                            <TouchableOpacity 
                                key={status.value} 
                                style={[styles.statusOptionBtn, agentStatus === status.value && { backgroundColor: status.color + '10', borderColor: status.color }]}
                                onPress={() => changeStatus(status.value)}
                            >
                                <Icon name={status.icon} size={24} color={status.color} />
                                <Text style={[styles.statusOptionText, { color: status.color }]}>{status.label}</Text>
                                {agentStatus === status.value && <Icon name="check" size={20} color={status.color} style={{ marginLeft: 'auto' }} />}
                            </TouchableOpacity>
                        ))}
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8F9FB' },
    header: { paddingTop: 50, paddingBottom: 30, paddingHorizontal: 25, borderBottomLeftRadius: 35, borderBottomRightRadius: 35, elevation: 10 },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    userInfoRow: { flexDirection: 'row', alignItems: 'center' },
    greetingText: { color: '#E0E0E0', fontSize: 14, fontWeight: '500' },
    usernameText: { color: 'white', fontSize: 20, fontWeight: 'bold' },
    logoutButton: { width: 45, height: 45, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
    
    overviewSection: { padding: 20, paddingBottom: 0 },
    overviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 15 },
    statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
    statusText: { fontSize: 12, fontWeight: 'bold', marginLeft: 4 },
    
    metricsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
    metricCard: { flex: 0.48, backgroundColor: 'white', padding: 15, borderRadius: 15, elevation: 2, alignItems: 'center' },
    metricValue: { fontSize: 24, fontWeight: 'bold', color: COLORS.primary },
    metricLabel: { fontSize: 12, color: '#666', marginTop: 5 },
    
    timetableSection: { marginBottom: 10 },
    timetableCard: { backgroundColor: 'white', padding: 15, borderRadius: 15, marginRight: 15, width: 160, elevation: 2, borderWidth: 1, borderColor: '#eee' },
    timeBadge: { alignSelf: 'flex-start', backgroundColor: '#E3F2FD', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, marginBottom: 8 },
    timeBadgeText: { fontSize: 10, color: COLORS.primary, fontWeight: 'bold' },
    timeText: { fontSize: 12, fontWeight: 'bold', color: '#333', marginBottom: 4 },
    subjectText: { fontSize: 13, color: '#555', marginBottom: 2 },
    batchText: { fontSize: 11, color: '#888' },

    content: { padding: 20 },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1A1A1A', marginBottom: 2 },
    subtitle: { fontSize: 13, color: '#666', marginBottom: 15 },
    card: { flexDirection: 'row', backgroundColor: 'white', padding: 15, borderRadius: 15, marginBottom: 15, alignItems: 'center', elevation: 2 },
    cardIcon: { width: 50, height: 50, backgroundColor: '#E3F2FD', borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    cardText: { flex: 1 },
    cardTitle: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    cardSubtitle: { fontSize: 12, color: '#888' },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
    modalContent: { width: '80%', backgroundColor: 'white', borderRadius: 20, padding: 20, elevation: 10 },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 5 },
    modalSubtitle: { fontSize: 13, color: '#666', marginBottom: 20 },
    statusOptionBtn: { flexDirection: 'row', alignItems: 'center', padding: 15, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#eee' },
    statusOptionText: { fontSize: 16, fontWeight: 'bold', marginLeft: 12 }
});

export default StaffDashboardScreen;
