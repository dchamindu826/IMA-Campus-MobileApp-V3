import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  Platform,
  StatusBar
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

const { width } = Dimensions.get('window');

export default function StudentProgressScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState('WEEKLY'); // 'WEEKLY' | 'MONTHLY'
  const [formatFilter, setFormatFilter] = useState('ALL'); // 'ALL' | 'MCQ' | 'STRUCTURED' | 'BOTH'
  const [progressData, setProgressData] = useState(null);
  const [selectedChartBar, setSelectedChartBar] = useState(null);

  useEffect(() => {
    loadProgress();
  }, []);

  const loadProgress = async () => {
    try {
      setLoading(true);
      const res = await api.get('papers/student/progress');
      setProgressData(res.data);
    } catch (err) {
      console.error('Failed to load student progress:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadProgress();
  };

  const currentCategoryData = activeCategory === 'WEEKLY' 
    ? progressData?.weekly 
    : progressData?.monthly;

  const currentSummary = currentCategoryData?.summary || {
    totalAttempted: 0,
    averageScore: 0,
    highestScore: 0,
    passRate: 0,
  };

  const testList = (currentCategoryData?.tests || []).filter(t => {
    if (formatFilter === 'ALL') return true;
    return t.paperType === formatFilter;
  });

  const chartData = (currentCategoryData?.chartData || []).slice(-8);

  const getFormatBadgeColor = (type) => {
    switch (type) {
      case 'MCQ': return '#10b981';
      case 'STRUCTURED': return '#a855f7';
      case 'BOTH': return '#3b82f6';
      default: return '#64748b';
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0f1d" />

      {/* Top Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Test Progress & Analytics</Text>
          <Text style={styles.headerSubtitle}>Official Performance Records</Text>
        </View>
        <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
          <Ionicons name="refresh-outline" size={20} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#f59e0b" />
          <Text style={styles.loadingText}>Loading performance statistics...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f59e0b" />}
          showsVerticalScrollIndicator={false}
        >
          {/* Category Switcher (Weekly vs Monthly) */}
          <View style={styles.categorySwitcher}>
            <TouchableOpacity
              style={[styles.categoryTab, activeCategory === 'WEEKLY' && styles.categoryTabActive]}
              onPress={() => {
                setActiveCategory('WEEKLY');
                setSelectedChartBar(null);
              }}
            >
              <Ionicons 
                name="flash" 
                size={16} 
                color={activeCategory === 'WEEKLY' ? '#f59e0b' : '#64748b'} 
                style={{ marginRight: 6 }} 
              />
              <Text style={[styles.categoryTabText, activeCategory === 'WEEKLY' && styles.categoryTabTextActive]}>
                Weekly Tests
              </Text>
              <View style={[styles.categoryCountBadge, activeCategory === 'WEEKLY' && styles.categoryCountBadgeActive]}>
                <Text style={styles.categoryCountText}>{progressData?.weekly?.summary?.totalAttempted || 0}</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.categoryTab, activeCategory === 'MONTHLY' && styles.categoryTabActive]}
              onPress={() => {
                setActiveCategory('MONTHLY');
                setSelectedChartBar(null);
              }}
            >
              <Ionicons 
                name="trophy" 
                size={16} 
                color={activeCategory === 'MONTHLY' ? '#f59e0b' : '#64748b'} 
                style={{ marginRight: 6 }} 
              />
              <Text style={[styles.categoryTabText, activeCategory === 'MONTHLY' && styles.categoryTabTextActive]}>
                Monthly Tests
              </Text>
              <View style={[styles.categoryCountBadge, activeCategory === 'MONTHLY' && styles.categoryCountBadgeActive]}>
                <Text style={styles.categoryCountText}>{progressData?.monthly?.summary?.totalAttempted || 0}</Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* 4 KPI Summary Cards */}
          <View style={styles.kpiGrid}>
            <View style={styles.kpiCard}>
              <View style={[styles.kpiIconWrapper, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                <Ionicons name="speedometer-outline" size={20} color="#f59e0b" />
              </View>
              <Text style={styles.kpiValue}>{currentSummary.averageScore}%</Text>
              <Text style={styles.kpiLabel}>Average Score</Text>
            </View>

            <View style={styles.kpiCard}>
              <View style={[styles.kpiIconWrapper, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                <Ionicons name="ribbon-outline" size={20} color="#10b981" />
              </View>
              <Text style={[styles.kpiValue, { color: '#10b981' }]}>{currentSummary.highestScore} pts</Text>
              <Text style={styles.kpiLabel}>Highest Score</Text>
            </View>

            <View style={styles.kpiCard}>
              <View style={[styles.kpiIconWrapper, { backgroundColor: 'rgba(99, 102, 241, 0.15)' }]}>
                <Ionicons name="document-text-outline" size={20} color="#6366f1" />
              </View>
              <Text style={styles.kpiValue}>{currentSummary.totalAttempted}</Text>
              <Text style={styles.kpiLabel}>Completed Tests</Text>
            </View>

            <View style={styles.kpiCard}>
              <View style={[styles.kpiIconWrapper, { backgroundColor: 'rgba(236, 72, 153, 0.15)' }]}>
                <Ionicons name="checkmark-done-circle-outline" size={20} color="#ec4899" />
              </View>
              <Text style={[styles.kpiValue, { color: '#ec4899' }]}>{currentSummary.passRate}%</Text>
              <Text style={styles.kpiLabel}>Pass Rate</Text>
            </View>
          </View>

          {/* Performance Bar Chart */}
          {chartData.length > 0 && (
            <View style={styles.chartSection}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Performance Trend</Text>
                <Text style={styles.sectionSubtitle}>Last {chartData.length} Tests</Text>
              </View>

              {selectedChartBar && (
                <View style={styles.chartTooltip}>
                  <Text style={styles.tooltipTitle}>{selectedChartBar.title}</Text>
                  <Text style={styles.tooltipScore}>Score: {selectedChartBar.score} pts ({selectedChartBar.percentage}%)</Text>
                </View>
              )}

              <View style={styles.chartContainer}>
                <View style={styles.barsRow}>
                  {chartData.map((item, index) => {
                    const barHeight = Math.max(12, (item.percentage / 100) * 110);
                    const isSelected = selectedChartBar?.title === item.title;
                    const isHigh = item.percentage >= 75;
                    const isPass = item.percentage >= 50;
                    return (
                      <TouchableOpacity
                        key={index}
                        style={styles.barColumn}
                        onPress={() => setSelectedChartBar(item)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.barScoreText}>{item.score}</Text>
                        <View style={styles.barTrack}>
                          <View
                            style={[
                              styles.barFill,
                              {
                                height: barHeight,
                                backgroundColor: isSelected 
                                  ? '#38bdf8' 
                                  : isHigh 
                                  ? '#10b981' 
                                  : isPass 
                                  ? '#f59e0b' 
                                  : '#ef4444'
                              }
                            ]}
                          />
                        </View>
                        <Text style={styles.barLabel} numberOfLines={1}>
                          {item.date ? item.date.slice(5) : `#${index + 1}`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>
          )}

          {/* Format Filter Pills */}
          <View style={styles.formatFilterRow}>
            {['ALL', 'MCQ', 'STRUCTURED', 'BOTH'].map(f => (
              <TouchableOpacity
                key={f}
                style={[styles.filterPill, formatFilter === f && styles.filterPillActive]}
                onPress={() => setFormatFilter(f)}
              >
                <Text style={[styles.filterPillText, formatFilter === f && styles.filterPillTextActive]}>
                  {f === 'ALL' ? 'All Formats' : f}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Test History List */}
          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>Exam History ({testList.length})</Text>
            {testList.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="folder-open-outline" size={44} color="#334155" />
                <Text style={styles.emptyTitle}>No Completed Tests</Text>
                <Text style={styles.emptySubtitle}>
                  You haven't completed any {activeCategory.toLowerCase()} tests in this category yet.
                </Text>
              </View>
            ) : (
              testList.map((test, idx) => (
                <View key={test.submissionId || idx} style={styles.testCard}>
                  <View style={styles.testCardHeader}>
                    <View style={styles.testCardTitleBox}>
                      <View style={styles.testBadgesRow}>
                        <View style={[styles.badge, { backgroundColor: `${getFormatBadgeColor(test.paperType)}20`, borderColor: `${getFormatBadgeColor(test.paperType)}40` }]}>
                          <Text style={[styles.badgeText, { color: getFormatBadgeColor(test.paperType) }]}>
                            {test.paperType}
                          </Text>
                        </View>
                        <Text style={styles.testDateText}>{new Date(test.submittedAt).toLocaleDateString()}</Text>
                      </View>
                      <Text style={styles.testTitle}>{test.title}</Text>
                    </View>
                    <View style={styles.scorePill}>
                      <Text style={styles.scorePillValue}>{test.score ?? 0}</Text>
                      <Text style={styles.scorePillUnit}>pts</Text>
                    </View>
                  </View>

                  <View style={styles.testCardFooter}>
                    <View style={styles.rankBox}>
                      <Ionicons name="podium-outline" size={14} color="#f59e0b" />
                      <Text style={styles.rankText}>
                        Rank #{test.rank || '-'} of {test.totalParticipants || '-'} Candidates
                      </Text>
                    </View>
                    {test.paperType === 'BOTH' && (
                      <Text style={styles.breakdownText}>
                        MCQ: {test.mcqScore ?? 0} | Essay: {test.structuredScore ?? 'Pending'}
                      </Text>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0f1d' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(10, 15, 29, 0.95)',
  },
  backButton: { padding: 6, borderRadius: 10, backgroundColor: 'rgba(255, 255, 255, 0.05)' },
  headerTitleContainer: { flex: 1, marginLeft: 12 },
  headerTitle: { color: '#ffffff', fontSize: 17, fontWeight: '800' },
  headerSubtitle: { color: '#94a3b8', fontSize: 11, fontWeight: '500' },
  refreshButton: { padding: 6, borderRadius: 10, backgroundColor: 'rgba(255, 255, 255, 0.05)' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#94a3b8', fontSize: 13, marginTop: 12, fontWeight: '500' },
  scrollContent: { flex: 1, padding: 16 },
  categorySwitcher: {
    flexDirection: 'row',
    backgroundColor: '#131b2e',
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 16,
  },
  categoryTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
  },
  categoryTabActive: { backgroundColor: 'rgba(245, 158, 11, 0.15)', borderWidth: 1, borderColor: 'rgba(245, 158, 11, 0.4)' },
  categoryTabText: { color: '#64748b', fontSize: 13, fontWeight: '700' },
  categoryTabTextActive: { color: '#f59e0b' },
  categoryCountBadge: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  categoryCountBadgeActive: { backgroundColor: 'rgba(245, 158, 11, 0.3)' },
  categoryCountText: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 18 },
  kpiCard: {
    width: (width - 42) / 2,
    backgroundColor: '#131b2e',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  kpiIconWrapper: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  kpiValue: { color: '#ffffff', fontSize: 20, fontWeight: '900', letterSpacing: 0.5 },
  kpiLabel: { color: '#94a3b8', fontSize: 11, fontWeight: '600', marginTop: 2 },
  chartSection: {
    backgroundColor: '#131b2e',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 16,
  },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  sectionSubtitle: { color: '#94a3b8', fontSize: 11, fontWeight: '600' },
  chartTooltip: {
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#38bdf8',
    marginBottom: 12,
  },
  tooltipTitle: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  tooltipScore: { color: '#38bdf8', fontSize: 12, fontWeight: '800', marginTop: 2 },
  chartContainer: { height: 140, justifyContent: 'flex-end', paddingTop: 10 },
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: 120 },
  barColumn: { alignItems: 'center', flex: 1 },
  barScoreText: { color: '#94a3b8', fontSize: 9, fontWeight: '700', marginBottom: 4 },
  barTrack: { width: 14, height: 110, backgroundColor: 'rgba(255, 255, 255, 0.04)', borderRadius: 7, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', borderRadius: 7 },
  barLabel: { color: '#64748b', fontSize: 9, fontWeight: '600', marginTop: 6 },
  formatFilterRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#131b2e',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  filterPillActive: { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
  filterPillText: { color: '#94a3b8', fontSize: 11, fontWeight: '700' },
  filterPillTextActive: { color: '#000000' },
  historySection: { gap: 10 },
  testCard: {
    backgroundColor: '#131b2e',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  testCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  testCardTitleBox: { flex: 1, marginRight: 10 },
  testBadgesRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  badgeText: { fontSize: 9, fontWeight: '800' },
  testDateText: { color: '#64748b', fontSize: 10, fontWeight: '600' },
  testTitle: { color: '#ffffff', fontSize: 13, fontWeight: '800', lineHeight: 18 },
  scorePill: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  scorePillValue: { color: '#10b981', fontSize: 16, fontWeight: '900' },
  scorePillUnit: { color: '#10b981', fontSize: 8, fontWeight: '800' },
  testCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  rankBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rankText: { color: '#f59e0b', fontSize: 11, fontWeight: '700' },
  breakdownText: { color: '#94a3b8', fontSize: 10, fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyTitle: { color: '#ffffff', fontSize: 15, fontWeight: '800', marginTop: 10 },
  emptySubtitle: { color: '#64748b', fontSize: 12, textAlign: 'center', marginTop: 4, paddingHorizontal: 20 },
});
