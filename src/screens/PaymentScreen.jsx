import React, { useState, useCallback, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Platform, StatusBar
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import notifee, { AndroidImportance } from '@notifee/react-native';
import COLORS from '../constants/colors';
import api from '../services/api';
import moment from 'moment';

const PaymentsScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('upcoming');

  const [historyList, setHistoryList] = useState([]);
  const [upcomingList, setUpcomingList] = useState([]);

  // 🔥 Default Header එක අයින් කරනවා
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      fetchPaymentData();
    }, [])
  );

  const fetchPaymentData = async () => {
    try {
      let res;
      try {
        res = await api.get('/student/my-payments');
      } catch (e) {
        res = await api.get('/payments/my-payments');
      }

      const allPayments = res.data?.oldPayments || res.data || [];

      let history = [];
      let upcoming = [];

      allPayments.forEach(p => {
        const isVerifying = p.status === -1 || (p.status === 0 && (p.method === 'Slip' || p.method === 'slip'));

        if (p.status === 1 || p.status === 2 || p.status === 4 || isVerifying) {
          p.displayStatus = (p.status === 1 || p.status === 4) ? 'Approved'
            : p.status === 2 ? 'Rejected'
              : 'Verifying';
          history.push(p);
        } else {
          upcoming.push(p);
        }
      });

      history.sort((a, b) => new Date(b.created_at || b.createdDate || 0) - new Date(a.created_at || a.createdDate || 0));
      upcoming.sort((a, b) => new Date(a.due_date || a.created_at || 0) - new Date(b.due_date || b.created_at || 0));

      setHistoryList(history);
      setUpcomingList(upcoming);

      if (Platform.OS === 'android') {
        checkAndScheduleNotifications(upcoming);
      }

    } catch (e) {
      console.log("Payment Fetch Error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const checkAndScheduleNotifications = async (duePayments) => {
    try {
      await notifee.requestPermission();
      await notifee.createChannel({ id: 'payment_reminders', name: 'Payment Reminders', importance: AndroidImportance.HIGH });
    } catch (e) { }
  };

  const renderPaymentCard = ({ item }) => {
    const isHistory = activeTab === 'history';

    let statusText = isHistory ? item.displayStatus : "Due";
    let statusColor = "#1565C0";
    let statusBg = "#E3F2FD";
    let statusIcon = "calendar-clock";

    if (isHistory) {
      if (statusText === 'Approved') { statusColor = "#10B981"; statusBg = "#D1FAE5"; statusIcon = "check-circle"; }
      else if (statusText === 'Rejected') { statusColor = "#EF4444"; statusBg = "#FEE2E2"; statusIcon = "close-circle"; }
      else if (statusText === 'Verifying') { statusColor = "#F59E0B"; statusBg = "#FEF3C7"; statusIcon = "timer-sand"; }
    } else {
      const today = moment();
      const due = moment(item.due_date || item.created_at);
      if (due.diff(today, 'days') < 0) {
        statusText = "Overdue";
        statusColor = "#EF4444";
        statusBg = "#FEE2E2";
        statusIcon = "alert-circle";
      }
    }

    const isOverdue = statusText === 'Overdue';

    return (
      <View style={[styles.card, isOverdue && styles.cardOverdue]}>
        {/* 🔥 Web එකේ වගේ Overdue නම් රතු පාට ඉරක් අයිනෙන් වැටෙන්න */}
        {isOverdue && <View style={styles.overdueStripe} />}

        <View style={styles.cardHeader}>
          <View style={styles.headerLeft}>
            <View style={styles.headerTextContainer}>
              <Text style={styles.courseName} numberOfLines={2}>{item.courseName || 'Course Payment'}</Text>
              {item.payment_type === 2 && item.installment_no && (
                <View style={styles.phaseBadge}>
                  <Text style={styles.phaseText}>PHASE {item.installment_no}</Text>
                </View>
              )}
            </View>
          </View>

          <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
            <Icon name={statusIcon} size={14} color={statusColor} style={{ marginRight: 4 }} />
            <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
          </View>
        </View>

        <View style={styles.dateContainer}>
          <Icon name="calendar-month" size={14} color={isOverdue ? '#EF4444' : '#888'} />
          <Text style={[styles.dateText, isOverdue && { color: '#EF4444' }]}>
            {isHistory ? 'Paid On: ' : 'Due By: '}
            {item.due_date ? moment(item.due_date).format('MMM DD, YYYY') : moment(item.created_at || item.createdDate).format('MMM DD, YYYY')}
          </Text>
          {isOverdue && <Icon name="alert-circle-outline" size={14} color="#EF4444" style={{ marginLeft: 4 }} />}
        </View>

        <View style={styles.divider} />

        <View style={styles.cardFooter}>
          <View>
            <Text style={styles.label}>AMOUNT PAYABLE</Text>
            <Text style={styles.amountValue}>LKR {parseFloat(item.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
          </View>

          {!isHistory && (
            <TouchableOpacity
              style={styles.payBtn}
              activeOpacity={0.8}
              onPress={async () => {
                try {
                  const res = await api.get('/mobile/businesses');
                  const businesses = res.data?.businesses || [];
                  const businessData = businesses.find(b => parseInt(b.id) === parseInt(item.businessId));

                  if (businessData) {
                    navigation.navigate('CourseDetails', {
                      businessData: businessData,
                      autoSelect: true,
                      selectedBatchId: item.batchId,
                      selectedMonthGroupId: item.groupId,
                      preSelectedSubjects: item.subjects,
                      paymentPlan: item.payment_type === 2 ? 'installment' : 'full'
                    });
                  } else {
                    navigation.navigate('PaymentMethod', {
                      amount: item.amount,
                      mainPaymentId: item.id,
                      payType: item.payment_type === 2 ? 'installment' : 'full'
                    });
                  }
                } catch (e) {
                  navigation.navigate('PaymentMethod', {
                    amount: item.amount,
                    mainPaymentId: item.id,
                    payType: item.payment_type === 2 ? 'installment' : 'full'
                  });
                }
              }}
            >
              <Text style={styles.payBtnText}>PAY NOW</Text>
              <Icon name="chevron-right" color="white" size={18} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor={COLORS.primary} barStyle="light-content" translucent={true} />

      {/* 🔥 අලුත් ලස්සන Header එක */}
      <LinearGradient colors={['#9A0007', '#E53935']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.header, { borderBottomLeftRadius: 35, borderBottomRightRadius: 35, elevation: 8 }]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Icon name="arrow-left" size={24} color="white" />
          </TouchableOpacity>
          <View style={styles.titleContainer}>
            <Text style={styles.headerTitle}>My Payments</Text>
            <Text style={styles.headerSubtitle}>Manage your dues and history</Text>
          </View>
          <View style={styles.headerRightIcon}>
            <Icon name="wallet" size={24} color="white" />
          </View>
        </View>
      </LinearGradient>

      {/* 🔥 Floating Tabs */}
      <View style={styles.tabContainerWrapper}>
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'upcoming' && styles.activeTab]}
            onPress={() => setActiveTab('upcoming')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === 'upcoming' && styles.activeTabText]}>Upcoming</Text>
            {upcomingList.length > 0 && (
              <View style={[styles.badge, activeTab === 'upcoming' ? { backgroundColor: COLORS.primary } : { backgroundColor: '#FF8A80' }]}>
                <Text style={styles.badgeText}>{upcomingList.length}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'history' && styles.activeTab]}
            onPress={() => setActiveTab('history')}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, activeTab === 'history' && styles.activeTabText]}>History</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.content}>
        {loading && !refreshing ? (
          <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 60 }} />
        ) : (
          <FlatList
            data={activeTab === 'history' ? historyList : upcomingList}
            keyExtractor={(item, index) => (item.id || index).toString()}
            renderItem={renderPaymentCard}
            contentContainerStyle={{ padding: 20, paddingTop: 10, paddingBottom: 50 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchPaymentData(); }} colors={[COLORS.primary]} />}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconBg}>
                  <Icon name={activeTab === 'history' ? "receipt" : "check-all"} size={45} color="#A0AAB5" />
                </View>
                <Text style={styles.emptyTitle}>{activeTab === 'history' ? "No History" : "All Caught Up!"}</Text>
                <Text style={styles.emptyText}>{activeTab === 'history' ? "You haven't made any payments yet." : "You have no pending payments."}</Text>
              </View>
            }
          />
        )}
      </View>
    </View>
  );
};

// 🔥 Status Bar Height Calculation
const STATUSBAR_HEIGHT = Platform.OS === 'ios' ? 50 : StatusBar.currentHeight || 24;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F9' },

  header: {
    paddingTop: STATUSBAR_HEIGHT + 10,
    paddingBottom: 40, // Tabs වලට ඉඩ දෙන්න
    backgroundColor: COLORS.primary,
    borderBottomLeftRadius: 35,
    borderBottomRightRadius: 35,
    elevation: 5,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  backBtn: {
    width: 40, height: 40,
    justifyContent: 'center', alignItems: 'flex-start',
  },
  titleContainer: {
    alignItems: 'center'
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: 'white', letterSpacing: 0.5 },
  headerSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '500', marginTop: 2 },
  headerRightIcon: {
    width: 40, height: 40,
    justifyContent: 'center', alignItems: 'flex-end',
    opacity: 0.8
  },

  tabContainerWrapper: {
    marginTop: -25, // 🔥 Header එක උඩින් Floating වෙන්න
    paddingHorizontal: 20,
    zIndex: 10,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#EBEFF5',
    borderRadius: 25,
    padding: 5,
  },
  tab: {
    flex: 1, flexDirection: 'row',
    justifyContent: 'center', alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 20,
  },
  activeTab: {
    backgroundColor: 'white',
    elevation: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 3,
  },
  tabText: { fontSize: 14, fontWeight: '700', color: '#888' },
  activeTabText: { color: '#1A1A1A' },
  badge: { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 6 },
  badgeText: { color: 'white', fontSize: 10, fontWeight: '900' },

  content: { flex: 1 },

  card: {
    backgroundColor: 'white',
    borderRadius: 20,
    marginBottom: 16,
    padding: 20,
    elevation: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 8,
    borderWidth: 1, borderColor: '#F0F0F0',
    overflow: 'hidden' // Stripe එක border එකෙන් එළියට නොයන්න
  },
  cardOverdue: {
    borderColor: '#FEE2E2',
    borderWidth: 1.5,
  },
  overdueStripe: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: 5,
    backgroundColor: '#EF4444'
  },

  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  headerTextContainer: { flex: 1 },
  courseName: { fontSize: 16, fontWeight: '800', color: '#1A1A1A', marginBottom: 6, lineHeight: 22 },

  phaseBadge: { backgroundColor: '#FFF7ED', alignSelf: 'flex-start', borderRadius: 6, borderWidth: 1, borderColor: '#FFEDD5', paddingHorizontal: 8, paddingVertical: 3 },
  phaseText: { fontSize: 10, fontWeight: '900', color: '#F97316', letterSpacing: 0.5 },

  statusBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },

  dateContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  dateText: { fontSize: 12, fontWeight: '700', color: '#888', marginLeft: 6 },

  divider: { height: 1, backgroundColor: '#F0F2F5', marginVertical: 15 },

  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  label: { fontSize: 10, color: '#A0AAB5', fontWeight: '800', letterSpacing: 1, marginBottom: 4 },
  amountValue: { fontSize: 22, fontWeight: '900', color: '#1A1A1A' },

  payBtn: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 20,
    borderRadius: 14,
    elevation: 4, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 5
  },
  payBtnText: { color: 'white', fontWeight: '900', fontSize: 13, marginRight: 4, letterSpacing: 1 },

  emptyContainer: { alignItems: 'center', marginTop: 80 },
  emptyIconBg: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#EBEFF5', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#1A1A1A', marginBottom: 5 },
  emptyText: { color: '#888', fontSize: 14, fontWeight: '500' }
});

export default PaymentsScreen;