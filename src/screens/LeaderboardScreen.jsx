import React, { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Image,
  StatusBar,
  Dimensions,
  SafeAreaView,
  Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Ionicons } from '@expo/vector-icons';
import LinearGradient from 'react-native-linear-gradient';

import api, { IMAGE_URL } from '../services/api';
import COLORS from '../constants/colors';
import { AuthContext } from '../context/AuthContext';

const { width } = Dimensions.get('window');

const MALE_STUDENT_AVATARS = [
  'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=240&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=240&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=240&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=240&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=240&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=240&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=240&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1463453091185-61582044d556?w=240&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?w=240&auto=format&fit=crop&q=80',
];

const FEMALE_STUDENT_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=240&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=240&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=240&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=240&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=240&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=240&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=240&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?w=240&auto=format&fit=crop&q=80',
];

const isLikelyFemaleStudent = (name = '') => {
  if (!name || typeof name !== 'string') return false;
  const n = name.toLowerCase();
  const femalePatterns = [
    'nethmi', 'kavindi', 'nimasha', 'oshadi', 'thilini', 'rashmi', 'hasini',
    'hashini', 'poornima', 'hiruni', 'sanduni', 'dilani', 'sachini', 'tharushi',
    'chathurika', 'chathuri', 'nadeesha', 'maleesha', 'sewwandi', 'devindi',
    'buddhini', 'hansani', 'madhushani', 'anuradha', 'shashika', 'inoka',
    'chandima', 'deepika', 'kanchana', 'upeksha', 'kumari', 'menike', 'sarah',
    'mary', 'amanda', 'dinithi', 'chamodi', 'imesha', 'anuki', 'senuri', 'piyumi',
    'kasuni', 'sayuri', 'sanuki', 'danushi', 'dulani', 'navodya', 'tharuki'
  ];
  return femalePatterns.some(pattern => n.includes(pattern));
};

const getRealStudentAvatarUri = (studentObj, seed = 0) => {
  if (!studentObj) {
    const list = seed % 2 === 0 ? MALE_STUDENT_AVATARS : FEMALE_STUDENT_AVATARS;
    return list[Math.abs(seed) % list.length];
  }

  const raw =
    studentObj.image ||
    studentObj.profile_image ||
    studentObj.profileImage ||
    studentObj.avatar ||
    studentObj.photo ||
    studentObj.appChatDp ||
    studentObj.student?.image ||
    studentObj.student?.profile_image ||
    studentObj.student?.avatar ||
    studentObj.student?.appChatDp ||
    studentObj.user?.image ||
    studentObj.user?.profile_image ||
    studentObj.user?.appChatDp;

  if (raw && typeof raw === 'string' && raw.trim() !== '' && raw !== 'default.png' && raw !== 'null' && raw !== 'undefined') {
    const clean = raw.trim();
    if (clean.startsWith('http://') || clean.startsWith('https://')) return clean;
    if (clean.startsWith('/storage/')) return `https://imacampus.online${clean}`;
    if (clean.startsWith('storage/')) return `https://imacampus.online/${clean}`;
    if (clean.startsWith('chat_dps/')) return `https://imacampus.online/storage/images/${clean}`;
    return `https://imacampus.online/storage/images/${clean}`;
  }

  // Deterministic realistic student photo based on ID or Name & Gender
  const nameStr =
    studentObj.name ||
    studentObj.student?.name ||
    `${studentObj.firstName || ''} ${studentObj.lastName || ''}`.trim() ||
    'Student';
  const idNum = Number(studentObj.id || studentObj.studentId || studentObj.student?.id || seed) || 0;
  const hash = nameStr.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);

  const isFemale = isLikelyFemaleStudent(nameStr);
  const avatarList = isFemale ? FEMALE_STUDENT_AVATARS : MALE_STUDENT_AVATARS;
  const avatarIndex = Math.abs(idNum + hash + seed) % avatarList.length;
  return avatarList[avatarIndex];
};

const StudentAvatar = ({ uri, name, size = 56, rank = 1, borderColor = '#F59E0B', borderWidth = 2, style = {} }) => {
  const [loadFailed, setLoadFailed] = useState(false);
  const initials = (name || 'ST')
    .split(' ')
    .filter(Boolean)
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth,
          borderColor,
          overflow: 'hidden',
          backgroundColor: '#1e293b',
          justifyContent: 'center',
          alignItems: 'center',
          shadowColor: borderColor,
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.35,
          shadowRadius: 5,
          elevation: 5,
        },
        style,
      ]}
    >
      {!loadFailed && uri ? (
        <Image
          source={{ uri }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
          onError={() => setLoadFailed(true)}
        />
      ) : (
        <LinearGradient
          colors={
            rank === 1
              ? ['#f59e0b', '#b45309']
              : rank === 2
              ? ['#94a3b8', '#475569']
              : rank === 3
              ? ['#f97316', '#c2410c']
              : ['#3b82f6', '#1d4ed8']
          }
          style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}
        >
          <Text style={{ color: '#ffffff', fontWeight: '900', fontSize: Math.max(size * 0.36, 11) }}>
            {initials}
          </Text>
        </LinearGradient>
      )}
    </View>
  );
};

export default function LeaderboardScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { userInfo } = useContext(AuthContext);
  const currentUserId = userInfo?.id || userInfo?.userId;

  // Active Main Tab: 'LEADERBOARD' or 'PROGRESS'
  const [activeTab, setActiveTab] = useState('LEADERBOARD');

  // Loading & Refreshing
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data States
  const [progressData, setProgressData] = useState(null);
  const [subjectLeaderboards, setSubjectLeaderboards] = useState([]); // List of subjects with their papers and leaderboards

  // Progress Tab States
  const [progressCategory, setProgressCategory] = useState('WEEKLY'); // 'WEEKLY' | 'MONTHLY' | 'OVERALL'
  const [formatFilter, setFormatFilter] = useState('ALL'); // 'ALL' | 'MCQ' | 'STRUCTURED' | 'BOTH'
  const [selectedChartBar, setSelectedChartBar] = useState(null);

  const [expandedPapers, setExpandedPapers] = useState({});
  const toggleExpandPaper = (paperId) => {
    setExpandedPapers(prev => ({ ...prev, [paperId]: !prev[paperId] }));
  };

  const myAvatarUri = useMemo(() => {
    return getRealStudentAvatarUri(userInfo, currentUserId);
  }, [userInfo, currentUserId]);

  const loadAllData = async () => {
    try {
      setLoading(true);

      // 1. Fetch Student Progress API
      const progressPromise = api.get('papers/student/progress').catch(err => {
        console.warn('Failed to load progress data:', err);
        return { data: null };
      });

      // 2. Fetch Enrolled Classroom Subjects
      const classroomPromise = api.get('mobile/classroom').catch(err => {
        console.warn('Failed to load classroom subjects:', err);
        return { data: [] };
      });

      const [progressRes, classroomRes] = await Promise.all([progressPromise, classroomPromise]);
      setProgressData(progressRes?.data || null);

      const enrolledSubjects = classroomRes?.data || [];

      // 3. For each subject, fetch module tests to collect paper data & leaderboards
      const subjectMap = new Map();

      // Deduplicate subjects by ID
      enrolledSubjects.forEach(s => {
        if (!subjectMap.has(String(s.id))) {
          subjectMap.set(String(s.id), {
            id: s.id,
            name: s.name,
            batchName: s.batchName,
            businessName: s.businessName,
            businessLogo: s.businessLogo,
            lecturerImage: s.lecturerImage,
            tests: []
          });
        }
      });

      // Fetch module tests for each enrolled subject
      const subjectIds = Array.from(subjectMap.keys());
      const modulePromises = subjectIds.map(id =>
        api.get(`mobile/module/${id}`).then(res => ({ id, data: res.data })).catch(() => ({ id, data: null }))
      );

      const moduleResults = await Promise.all(modulePromises);

      // Extract all papers to load leaderboards
      const papersToFetch = [];

      moduleResults.forEach(m => {
        if (!m.data) return;
        const subj = subjectMap.get(String(m.id));
        if (!subj) return;

        const rankingTests = m.data?.rankingTests || [];
        const sPapers = m.data?.sPapers || [];
        const papers = m.data?.papers || [];

        // Combine test items
        const allTests = [...rankingTests, ...sPapers, ...papers];
        const seenPaperIds = new Set();

        allTests.forEach(item => {
          const p = item.paper || (item.paperType ? item : null);
          const paperId = p?.id || item.id;
          if (paperId && !seenPaperIds.has(String(paperId))) {
            seenPaperIds.add(String(paperId));
            papersToFetch.push({
              subjectId: subj.id,
              subjectName: subj.name,
              contentItem: item,
              paperId: paperId,
              paperTitle: item.title || p?.title || 'Test',
              thumbnail: item.thumbnail
            });
          }
        });
      });

      // Also ensure any tests from student progress history are included
      const historyTests = [
        ...(progressRes?.data?.weekly?.history || []),
        ...(progressRes?.data?.monthly?.history || []),
        ...(progressRes?.data?.overall?.history || []),
        ...(progressRes?.data?.recentTests || [])
      ];

      historyTests.forEach(ht => {
        if (ht.paperId && !papersToFetch.some(p => String(p.paperId) === String(ht.paperId))) {
          papersToFetch.push({
            subjectId: ht.courseId || 0,
            subjectName: ht.courseTitle || ht.subjectName || 'General Exam',
            contentItem: { id: ht.contentId, title: ht.testTitle },
            paperId: ht.paperId,
            paperTitle: ht.testTitle,
            thumbnail: null
          });
        }
      });

      // Fetch live leaderboards for papers (parallel with limit)
      const leaderboardResults = await Promise.all(
        papersToFetch.map(p =>
          api.get(`papers/${p.paperId}/leaderboard`)
            .then(res => ({ ...p, leaderboardData: res.data }))
            .catch(() => ({ ...p, leaderboardData: null }))
        )
      );

      // Group papers by Subject Name
      const groupedBySubject = {};
      const seenPaperKeys = new Set();

      leaderboardResults.forEach(item => {
        if (!item.leaderboardData) return; // Skip if failed to load leaderboard

        const sName = item.subjectName || 'Academic Tests';
        const uniqueKey = `${sName}_${item.paperId}`;
        if (seenPaperKeys.has(uniqueKey)) return;
        seenPaperKeys.add(uniqueKey);

        if (!groupedBySubject[sName]) {
          groupedBySubject[sName] = {
            subjectName: sName,
            subjectId: item.subjectId,
            papers: []
          };
        }

        const lbData = item.leaderboardData;
        const totalCandidates = lbData.manualParticipantCount || lbData.paper?.manualParticipantCount || lbData.totalParticipants || lbData.actualSubmissionsCount || (lbData.leaderboard || []).length;

        groupedBySubject[sName].papers.push({
          paperId: item.paperId,
          title: item.paperTitle,
          contentId: item.contentItem?.id,
          thumbnail: item.thumbnail,
          paperType: lbData.paper?.paperType || item.contentItem?.paper?.paperType || 'MCQ',
          totalParticipants: totalCandidates,
          podium: lbData.podium || {},
          myStanding: lbData.myStanding || null,
          leaderboard: lbData.leaderboard || []
        });
      });

      setSubjectLeaderboards(Object.values(groupedBySubject));
    } catch (error) {
      console.error('Failed to load Leaderboard & Progress screen:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadAllData();
  };

  // Progress Tab Helper Values
  const currentProgressCategoryData = useMemo(() => {
    if (!progressData) return null;
    if (progressCategory === 'WEEKLY') return progressData.weekly;
    if (progressCategory === 'MONTHLY') return progressData.monthly;
    return progressData.overall;
  }, [progressData, progressCategory]);

  const progressSummary = useMemo(() => {
    return {
      totalTaken: currentProgressCategoryData?.totalTaken ?? progressData?.overall?.totalTaken ?? 0,
      averageScore: currentProgressCategoryData?.averageScore ?? progressData?.overall?.averageScore ?? 0,
      highestScore: currentProgressCategoryData?.highestScore ?? progressData?.overall?.highestScore ?? 0,
      passRate: currentProgressCategoryData?.passRate ?? progressData?.overall?.passRate ?? 0
    };
  }, [currentProgressCategoryData, progressData]);

  const progressHistoryList = useMemo(() => {
    const list = currentProgressCategoryData?.history || progressData?.overall?.history || [];
    if (formatFilter === 'ALL') return list;
    return list.filter(t => t.paperType === formatFilter);
  }, [currentProgressCategoryData, progressData, formatFilter]);

  const chartDataList = useMemo(() => {
    const rawChart = progressData?.chartData || [];
    return rawChart.slice(-8);
  }, [progressData]);

  const getFormatBadgeColor = (type) => {
    switch (type) {
      case 'MCQ': return '#10b981';
      case 'STRUCTURED': return '#a855f7';
      case 'BOTH': return '#3b82f6';
      default: return '#64748b';
    }
  };


  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0f1d" />

      {/* Screen Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <View style={styles.headerTitleBox}>
          <Text style={styles.headerTitle}>Leaderboard & Analytics</Text>
          <Text style={styles.headerSubtitle}>Official Ranks & Student Progress</Text>
        </View>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={onRefresh}
          activeOpacity={0.7}
        >
          <Ionicons name="refresh-outline" size={20} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      {/* Dual Segment Switcher (Leaderboard vs Progress) */}
      <View style={styles.topSegmentContainer}>
        <TouchableOpacity
          style={[styles.segmentTab, activeTab === 'LEADERBOARD' && styles.segmentTabActive]}
          onPress={() => setActiveTab('LEADERBOARD')}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={activeTab === 'LEADERBOARD' ? ['#f59e0b', '#d97706'] : ['transparent', 'transparent']}
            style={styles.segmentGradient}
          >
            <Icon
              name="trophy-variant"
              size={18}
              color={activeTab === 'LEADERBOARD' ? '#ffffff' : '#94a3b8'}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.segmentText, activeTab === 'LEADERBOARD' && styles.segmentTextActive]}>
              Leaderboard
            </Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.segmentTab, activeTab === 'PROGRESS' && styles.segmentTabActive]}
          onPress={() => setActiveTab('PROGRESS')}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={activeTab === 'PROGRESS' ? ['#0284c7', '#0369a1'] : ['transparent', 'transparent']}
            style={styles.segmentGradient}
          >
            <Icon
              name="chart-line"
              size={18}
              color={activeTab === 'PROGRESS' ? '#ffffff' : '#94a3b8'}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.segmentText, activeTab === 'PROGRESS' && styles.segmentTextActive]}>
              Progress
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Main Body */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#f59e0b" />
          <Text style={styles.loadingText}>Loading Rankings & Records...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f59e0b" />}
        >
          {/* ============================================================ */}
          {/* TAB 1: LEADERBOARD (SUBJECT TILES & PODIUMS)                */}
          {/* ============================================================ */}
          {activeTab === 'LEADERBOARD' && (
            <View style={styles.leaderboardSection}>
              {subjectLeaderboards.length === 0 ? (
                <View style={styles.emptyStateBox}>
                  <Icon name="trophy-broken" size={54} color="#334155" />
                  <Text style={styles.emptyStateTitle}>No Active Leaderboards</Text>
                  <Text style={styles.emptyStateSubtitle}>
                    There are no ranking tests or leaderboards available for your enrolled subjects right now.
                  </Text>
                </View>
              ) : (
                subjectLeaderboards.map((subj, subjIdx) => (
                  <View key={subjIdx} style={styles.subjectCard}>
                    {/* Subject Header */}
                    <View style={styles.subjectHeader}>
                      <View style={styles.subjectIconBox}>
                        <Icon name="book-open-variant" size={20} color="#f59e0b" />
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.subjectNameText} numberOfLines={1}>{subj.subjectName}</Text>
                        <Text style={styles.subjectTestsCountText}>
                          {subj.papers.length} {subj.papers.length === 1 ? 'Exam' : 'Exams'} Available
                        </Text>
                      </View>
                    </View>

                    {/* Papers inside this Subject */}
                    {subj.papers.map((paper, paperIdx) => {
                      const allRankings = paper.leaderboard || [];
                      const first = paper.podium?.first || allRankings[0];
                      const second = paper.podium?.second || allRankings[1];
                      const third = paper.podium?.third || allRankings[2];
                      const myStanding = paper.myStanding;
                      const totalParticipants = paper.totalParticipants || allRankings.length || 0;
                      const isExpanded = !!expandedPapers[paper.paperId];

                      return (
                        <View key={paperIdx} style={styles.paperTileBox}>
                          {/* Test Info Row */}
                          <View style={styles.paperInfoRow}>
                            <View style={{ flex: 1, paddingRight: 8 }}>
                              <View style={styles.paperTypeRow}>
                                <View style={[styles.badge, { backgroundColor: `${getFormatBadgeColor(paper.paperType)}20`, borderColor: `${getFormatBadgeColor(paper.paperType)}50` }]}>
                                  <Text style={[styles.badgeText, { color: getFormatBadgeColor(paper.paperType) }]}>
                                    {paper.paperType}
                                  </Text>
                                </View>
                              </View>
                              <Text style={styles.paperTitleText} numberOfLines={2}>
                                {paper.title}
                              </Text>
                            </View>

                            {/* Participant Count from Content Hub / Test */}
                            <View style={styles.participantCountBadge}>
                              <Icon name="account-group" size={14} color="#38bdf8" style={{ marginRight: 4 }} />
                              <Text style={styles.participantCountText}>
                                {totalParticipants} Participants
                              </Text>
                            </View>
                          </View>

                          {/* 🏆 SINGLE CHAMPION SPOTLIGHT (when 1 participant has finished) 🏆 */}
                          {first && !second && !third ? (
                            <View style={styles.singleChampionCard}>
                              <LinearGradient
                                colors={['rgba(245, 158, 11, 0.15)', 'rgba(30, 41, 59, 0.6)']}
                                style={styles.singleChampionGradient}
                              >
                                <View style={styles.championHeaderBadgeRow}>
                                  <View style={styles.championTag}>
                                    <Text style={{ fontSize: 13, marginRight: 4 }}>👑</Text>
                                    <Text style={styles.championTagText}>CHAMPION • 1ST PLACE</Text>
                                  </View>
                                  <View style={styles.scorePillGold}>
                                    <Icon name="trophy" size={13} color="#f59e0b" style={{ marginRight: 4 }} />
                                    <Text style={styles.scorePillGoldText}>{first.score ?? 0} PTS</Text>
                                  </View>
                                </View>

                                <View style={styles.championBodyRow}>
                                  <View style={styles.championAvatarWrapper}>
                                    <StudentAvatar
                                      uri={getRealStudentAvatarUri(first.student || first, 1)}
                                      name={first.student?.name || first.name}
                                      size={68}
                                      rank={1}
                                      borderColor="#f59e0b"
                                      borderWidth={3}
                                    />
                                    <View style={styles.crownFloatingBadge}>
                                      <Text style={{ fontSize: 13 }}>🥇</Text>
                                    </View>
                                  </View>

                                  <View style={styles.championInfoCol}>
                                    <Text style={styles.championStudentName} numberOfLines={2}>
                                      {first.student?.name || `${first.student?.firstName || ''} ${first.student?.lastName || ''}`.trim() || 'Top Student'}
                                    </Text>
                                    <View style={styles.championSubDetailsRow}>
                                      {first.student?.city && (
                                        <View style={styles.cityPill}>
                                          <Icon name="map-marker-outline" size={11} color="#94a3b8" />
                                          <Text style={styles.cityPillText}>{first.student.city}</Text>
                                        </View>
                                      )}
                                      <Text style={styles.submissionStatusText}>
                                        {first.durationMinutes ? `⏱ ${first.durationMinutes} mins` : 'Completed Exam'}
                                      </Text>
                                    </View>
                                  </View>
                                </View>

                                {/* Challenger Callout */}
                                <View style={styles.challengerCalloutBox}>
                                  <Icon name="lightning-bolt" size={16} color="#fbbf24" style={{ marginRight: 6 }} />
                                  <Text style={styles.challengerCalloutText}>
                                    Rank #2 and #3 spots are open! Take this exam now to challenge the top rank.
                                  </Text>
                                </View>
                              </LinearGradient>
                            </View>
                          ) : (
                            /* 🏆 3-TIER OLYMPIC PODIUM (when 2 or more participants exist) 🏆 */
                            <View style={styles.podiumWrapper}>
                              {/* #2 Silver */}
                              <View style={styles.podiumColSilver}>
                                <View style={styles.podiumRankCrownSilver}>
                                  <Text style={styles.medalEmoji}>🥈</Text>
                                  <Text style={styles.podiumRankNumberSilver}>#2</Text>
                                </View>
                                <View style={styles.podiumAvatarContainer}>
                                  {second ? (
                                    <StudentAvatar
                                      uri={getRealStudentAvatarUri(second.student || second, 2)}
                                      name={second.student?.name || second.name}
                                      size={54}
                                      rank={2}
                                      borderColor="#cbd5e1"
                                      borderWidth={2.5}
                                    />
                                  ) : (
                                    <View style={styles.emptyPodiumCircle}>
                                      <Icon name="trophy-outline" size={20} color="#64748b" />
                                    </View>
                                  )}
                                </View>
                                {second ? (
                                  <View style={styles.podiumDetails}>
                                    <Text style={styles.podiumStudentName} numberOfLines={1}>
                                      {second.student?.name || `${second.student?.firstName || ''} ${second.student?.lastName || ''}`.trim()}
                                    </Text>
                                    <Text style={styles.podiumScoreSilver}>{second.score ?? 0} pts</Text>
                                  </View>
                                ) : (
                                  <Text style={styles.podiumEmptyText}>Rank #2 Open</Text>
                                )}
                              </View>

                              {/* #1 Champion Gold */}
                              <View style={styles.podiumColGold}>
                                <View style={styles.podiumRankCrownGold}>
                                  <Text style={[styles.medalEmoji, { fontSize: 24 }]}>👑 🥇</Text>
                                  <Text style={styles.podiumRankNumberGold}>CHAMPION</Text>
                                </View>
                                <View style={styles.podiumAvatarContainer}>
                                  {first ? (
                                    <StudentAvatar
                                      uri={getRealStudentAvatarUri(first.student || first, 1)}
                                      name={first.student?.name || first.name}
                                      size={68}
                                      rank={1}
                                      borderColor="#f59e0b"
                                      borderWidth={3.5}
                                    />
                                  ) : (
                                    <View style={styles.emptyPodiumCircleGold}>
                                      <Icon name="trophy-outline" size={24} color="#f59e0b" />
                                    </View>
                                  )}
                                </View>
                                {first ? (
                                  <View style={styles.podiumDetails}>
                                    <Text style={[styles.podiumStudentName, { fontWeight: '900', color: '#ffffff', fontSize: 12 }]} numberOfLines={1}>
                                      {first.student?.name || `${first.student?.firstName || ''} ${first.student?.lastName || ''}`.trim()}
                                    </Text>
                                    <Text style={styles.podiumScoreGold}>{first.score ?? 0} pts</Text>
                                  </View>
                                ) : (
                                  <Text style={styles.podiumEmptyText}>Spot open</Text>
                                )}
                              </View>

                              {/* #3 Bronze */}
                              <View style={styles.podiumColBronze}>
                                <View style={styles.podiumRankCrownBronze}>
                                  <Text style={styles.medalEmoji}>🥉</Text>
                                  <Text style={styles.podiumRankNumberBronze}>#3</Text>
                                </View>
                                <View style={styles.podiumAvatarContainer}>
                                  {third ? (
                                    <StudentAvatar
                                      uri={getRealStudentAvatarUri(third.student || third, 3)}
                                      name={third.student?.name || third.name}
                                      size={54}
                                      rank={3}
                                      borderColor="#f97316"
                                      borderWidth={2.5}
                                    />
                                  ) : (
                                    <View style={styles.emptyPodiumCircle}>
                                      <Icon name="trophy-outline" size={20} color="#64748b" />
                                    </View>
                                  )}
                                </View>
                                {third ? (
                                  <View style={styles.podiumDetails}>
                                    <Text style={styles.podiumStudentName} numberOfLines={1}>
                                      {third.student?.name || `${third.student?.firstName || ''} ${third.student?.lastName || ''}`.trim()}
                                    </Text>
                                    <Text style={styles.podiumScoreBronze}>{third.score ?? 0} pts</Text>
                                  </View>
                                ) : (
                                  <Text style={styles.podiumEmptyText}>Rank #3 Open</Text>
                                )}
                              </View>
                            </View>
                          )}

                          {/* 📋 CANDIDATE RANKINGS LIST 📋 */}
                          {allRankings.length > 0 && (
                            <View style={styles.rankingsContainer}>
                              <View style={styles.rankingsHeaderRow}>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                  <Icon name="format-list-numbered" size={15} color="#f59e0b" style={{ marginRight: 6 }} />
                                  <Text style={styles.rankingsHeaderTitle}>
                                    Rankings ({allRankings.length} {allRankings.length === 1 ? 'Candidate' : 'Candidates'})
                                  </Text>
                                </View>
                                {allRankings.length > 3 && (
                                  <TouchableOpacity onPress={() => toggleExpandPaper(paper.paperId)}>
                                    <Text style={styles.expandRankingsText}>
                                      {isExpanded ? 'Show Less' : `View All (${allRankings.length})`}
                                    </Text>
                                  </TouchableOpacity>
                                )}
                              </View>

                              {/* Rankings Rows */}
                              {(isExpanded ? allRankings : allRankings.slice(0, 3)).map((entry, rIdx) => {
                                const rankNum = entry.rank || rIdx + 1;
                                const studentName = entry.student?.name || `${entry.student?.firstName || ''} ${entry.student?.lastName || ''}`.trim() || 'Student';
                                const isMe = (entry.student?.id && entry.student.id === currentUserId) || entry.id === currentUserId;
                                const avatarUri = getRealStudentAvatarUri(entry.student || entry, rankNum);

                                return (
                                  <View
                                    key={entry.submissionId || entry.id || rIdx}
                                    style={[styles.rankingRow, isMe && styles.rankingRowMe]}
                                  >
                                    {/* Rank Number Badge */}
                                    <View
                                      style={[
                                        styles.rankPill,
                                        rankNum === 1
                                          ? styles.rankPillGold
                                          : rankNum === 2
                                          ? styles.rankPillSilver
                                          : rankNum === 3
                                          ? styles.rankPillBronze
                                          : styles.rankPillNormal,
                                      ]}
                                    >
                                      <Text
                                        style={[
                                          styles.rankPillText,
                                          rankNum === 1
                                            ? { color: '#fbbf24', fontWeight: '900' }
                                            : rankNum === 2
                                            ? { color: '#cbd5e1' }
                                            : rankNum === 3
                                            ? { color: '#f97316' }
                                            : { color: '#94a3b8' },
                                        ]}
                                      >
                                        #{rankNum}
                                      </Text>
                                    </View>

                                    {/* Real Avatar */}
                                    <StudentAvatar
                                      uri={avatarUri}
                                      name={studentName}
                                      size={36}
                                      rank={rankNum}
                                      borderColor={
                                        rankNum === 1
                                          ? '#f59e0b'
                                          : rankNum === 2
                                          ? '#cbd5e1'
                                          : rankNum === 3
                                          ? '#f97316'
                                          : '#475569'
                                      }
                                      borderWidth={1.5}
                                      style={{ marginRight: 10 }}
                                    />

                                    {/* Student Name & Sub info */}
                                    <View style={{ flex: 1, paddingRight: 6 }}>
                                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                        <Text style={[styles.rankingStudentName, isMe && { color: '#fbbf24' }]} numberOfLines={1}>
                                          {studentName}
                                        </Text>
                                        {isMe && (
                                          <View style={styles.youMiniBadge}>
                                            <Text style={styles.youMiniBadgeText}>YOU</Text>
                                          </View>
                                        )}
                                      </View>
                                      <Text style={styles.rankingCityText} numberOfLines={1}>
                                        {entry.student?.city ? `${entry.student.city} • ` : ''}
                                        {entry.durationMinutes ? `${entry.durationMinutes} mins` : 'Completed'}
                                      </Text>
                                    </View>

                                    {/* Score */}
                                    <View style={styles.rankingScoreBox}>
                                      <Text style={styles.rankingScoreText}>{entry.score ?? 0}</Text>
                                      <Text style={styles.rankingScoreSub}>PTS</Text>
                                    </View>
                                  </View>
                                );
                              })}
                            </View>
                          )}

                          {/* 👤 CURRENT STUDENT'S PERSONAL STANDING CARD 👤 */}
                          <View style={styles.myStandingCardContainer}>
                            <View style={styles.myStandingHeaderRow}>
                              <View style={styles.myStandingAvatarWrapper}>
                                <StudentAvatar
                                  uri={myAvatarUri}
                                  name={`${userInfo?.firstName || ''} ${userInfo?.lastName || ''}`.trim() || 'You'}
                                  size={46}
                                  rank={myStanding?.rank || 4}
                                  borderColor={myStanding ? '#f59e0b' : '#3b82f6'}
                                  borderWidth={2}
                                />
                                {myStanding ? (
                                  <View style={styles.myStandingRankMiniBadge}>
                                    <Text style={styles.myStandingRankMiniText}>#{myStanding.rank}</Text>
                                  </View>
                                ) : null}
                              </View>

                              <View style={styles.myStandingNameBlock}>
                                <View style={styles.myStandingNameTitleRow}>
                                  <Text style={styles.myStandingNameText} numberOfLines={1}>
                                    {`${userInfo?.firstName || ''} ${userInfo?.lastName || ''}`.trim() || 'You'}
                                  </Text>
                                  <View style={styles.youBadge}>
                                    <Text style={styles.youBadgeText}>YOU</Text>
                                  </View>
                                </View>
                                <Text style={styles.myStandingSubInfoText} numberOfLines={1}>
                                  {userInfo?.city ? `${userInfo.city} • ` : ''}
                                  {myStanding ? `Ranked #${myStanding.rank} of ${totalParticipants}` : 'Not yet participated'}
                                </Text>
                              </View>

                              {myStanding ? (
                                <View style={styles.myScoreBox}>
                                  <Text style={styles.myScoreValue}>{myStanding.score ?? 0}</Text>
                                  <Text style={styles.myScoreUnit}>MARKS (PTS)</Text>
                                </View>
                              ) : (
                                <TouchableOpacity
                                  style={styles.takeExamMiniBtn}
                                  onPress={() => {
                                    if (paper.contentId) {
                                      navigation.navigate('MCQPaper', {
                                        contentId: paper.contentId,
                                        courseTitle: subj.subjectName,
                                        paperTitle: paper.title,
                                        thumbnail: paper.thumbnail,
                                      });
                                    }
                                  }}
                                  activeOpacity={0.8}
                                >
                                  <Text style={styles.takeExamMiniBtnText}>Take Exam</Text>
                                  <Icon name="arrow-right" size={13} color="#ffffff" style={{ marginLeft: 4 }} />
                                </TouchableOpacity>
                              )}
                            </View>

                            {/* Bottom Strip */}
                            {myStanding ? (
                              <View style={styles.myStandingMetaBar}>
                                <View style={styles.myStandingMetaItem}>
                                  <Icon name="trophy-variant" size={13} color="#f59e0b" style={{ marginRight: 4 }} />
                                  <Text style={styles.myStandingMetaLabel}>Standing: </Text>
                                  <Text style={styles.myStandingMetaHighlight}>Rank #{myStanding.rank}</Text>
                                  <Text style={styles.myStandingMetaSub}> of {totalParticipants}</Text>
                                </View>

                                {myStanding.scoreGap > 0 ? (
                                  <View style={styles.myStandingMetaItem}>
                                    <Icon name="chart-line-variant" size={13} color="#38bdf8" style={{ marginRight: 4 }} />
                                    <Text style={styles.myStandingMetaLabel}>Gap to #1: </Text>
                                    <Text style={[styles.myStandingMetaHighlight, { color: '#38bdf8' }]}>
                                      {myStanding.scoreGap} pts
                                    </Text>
                                  </View>
                                ) : (
                                  <View style={styles.myStandingMetaItem}>
                                    <Icon name="crown" size={13} color="#fbbf24" style={{ marginRight: 4 }} />
                                    <Text style={[styles.myStandingMetaHighlight, { color: '#fbbf24' }]}>Top Scorer</Text>
                                  </View>
                                )}
                              </View>
                            ) : (
                              <View style={styles.myStandingUnattemptedBar}>
                                <Icon name="information-outline" size={13} color="#94a3b8" style={{ marginRight: 5 }} />
                                <Text style={styles.myStandingUnattemptedText}>
                                  Participate in this exam now to earn points and claim your podium rank!
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ))
              )}
            </View>
          )}

          {/* ============================================================ */}
          {/* TAB 2: PROGRESS (EXAM ANALYTICS & CHARTS)                    */}
          {/* ============================================================ */}
          {activeTab === 'PROGRESS' && (
            <View style={styles.progressSection}>
              {/* Category Switcher (Weekly vs Monthly vs Overall) */}
              <View style={styles.categorySwitcher}>
                <TouchableOpacity
                  style={[styles.categoryTab, progressCategory === 'WEEKLY' && styles.categoryTabActive]}
                  onPress={() => {
                    setProgressCategory('WEEKLY');
                    setSelectedChartBar(null);
                  }}
                >
                  <Icon
                    name="lightning-bolt"
                    size={16}
                    color={progressCategory === 'WEEKLY' ? '#f59e0b' : '#64748b'}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.categoryTabText, progressCategory === 'WEEKLY' && styles.categoryTabTextActive]}>
                    Weekly
                  </Text>
                  <View style={[styles.categoryCountBadge, progressCategory === 'WEEKLY' && styles.categoryCountBadgeActive]}>
                    <Text style={styles.categoryCountText}>{progressData?.weekly?.totalTaken || 0}</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.categoryTab, progressCategory === 'MONTHLY' && styles.categoryTabActive]}
                  onPress={() => {
                    setProgressCategory('MONTHLY');
                    setSelectedChartBar(null);
                  }}
                >
                  <Icon
                    name="trophy"
                    size={16}
                    color={progressCategory === 'MONTHLY' ? '#f59e0b' : '#64748b'}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.categoryTabText, progressCategory === 'MONTHLY' && styles.categoryTabTextActive]}>
                    Monthly
                  </Text>
                  <View style={[styles.categoryCountBadge, progressCategory === 'MONTHLY' && styles.categoryCountBadgeActive]}>
                    <Text style={styles.categoryCountText}>{progressData?.monthly?.totalTaken || 0}</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.categoryTab, progressCategory === 'OVERALL' && styles.categoryTabActive]}
                  onPress={() => {
                    setProgressCategory('OVERALL');
                    setSelectedChartBar(null);
                  }}
                >
                  <Icon
                    name="chart-box"
                    size={16}
                    color={progressCategory === 'OVERALL' ? '#f59e0b' : '#64748b'}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.categoryTabText, progressCategory === 'OVERALL' && styles.categoryTabTextActive]}>
                    Overall
                  </Text>
                  <View style={[styles.categoryCountBadge, progressCategory === 'OVERALL' && styles.categoryCountBadgeActive]}>
                    <Text style={styles.categoryCountText}>{progressData?.overall?.totalTaken || 0}</Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* 4 KPI Summary Cards */}
              <View style={styles.kpiGrid}>
                <View style={styles.kpiCard}>
                  <View style={[styles.kpiIconWrapper, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                    <Ionicons name="speedometer-outline" size={20} color="#f59e0b" />
                  </View>
                  <Text style={styles.kpiValue}>{progressSummary.averageScore}%</Text>
                  <Text style={styles.kpiLabel}>Average Score</Text>
                </View>

                <View style={styles.kpiCard}>
                  <View style={[styles.kpiIconWrapper, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                    <Ionicons name="ribbon-outline" size={20} color="#10b981" />
                  </View>
                  <Text style={[styles.kpiValue, { color: '#10b981' }]}>{progressSummary.highestScore} pts</Text>
                  <Text style={styles.kpiLabel}>Highest Score</Text>
                </View>

                <View style={styles.kpiCard}>
                  <View style={[styles.kpiIconWrapper, { backgroundColor: 'rgba(99, 102, 241, 0.15)' }]}>
                    <Ionicons name="document-text-outline" size={20} color="#6366f1" />
                  </View>
                  <Text style={styles.kpiValue}>{progressSummary.totalTaken}</Text>
                  <Text style={styles.kpiLabel}>Completed Exams</Text>
                </View>

                <View style={styles.kpiCard}>
                  <View style={[styles.kpiIconWrapper, { backgroundColor: 'rgba(236, 72, 153, 0.15)' }]}>
                    <Ionicons name="checkmark-done-circle-outline" size={20} color="#ec4899" />
                  </View>
                  <Text style={[styles.kpiValue, { color: '#ec4899' }]}>{progressSummary.passRate}%</Text>
                  <Text style={styles.kpiLabel}>Pass Rate</Text>
                </View>
              </View>

              {/* Performance Progression Bar Chart */}
              {chartDataList.length > 0 && (
                <View style={styles.chartSection}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>Performance Trend</Text>
                    <Text style={styles.sectionSubtitle}>Last {chartDataList.length} Tests</Text>
                  </View>

                  {selectedChartBar && (
                    <View style={styles.chartTooltip}>
                      <Text style={styles.tooltipTitle}>{selectedChartBar.testTitle || selectedChartBar.title}</Text>
                      <Text style={styles.tooltipScore}>
                        Score: {selectedChartBar.score} pts ({selectedChartBar.percentage}%) • Rank #{selectedChartBar.rank || 1}
                      </Text>
                    </View>
                  )}

                  <View style={styles.chartContainer}>
                    <View style={styles.barsRow}>
                      {chartDataList.map((item, index) => {
                        const scorePerc = item.percentage ?? ((item.score / (item.totalMarks || 100)) * 100);
                        const barHeight = Math.max(12, (scorePerc / 100) * 110);
                        const isSelected = selectedChartBar?.testTitle === (item.testTitle || item.title);
                        const isHigh = scorePerc >= 75;
                        const isPass = scorePerc >= 40;

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
                              {item.submittedAt ? item.submittedAt.slice(5, 10) : `#${index + 1}`}
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

              {/* Exam History List */}
              <View style={styles.historySection}>
                <Text style={styles.sectionTitle}>Exam History ({progressHistoryList.length})</Text>
                {progressHistoryList.length === 0 ? (
                  <View style={styles.emptyStateBox}>
                    <Ionicons name="folder-open-outline" size={44} color="#334155" />
                    <Text style={styles.emptyStateTitle}>No Completed Tests</Text>
                    <Text style={styles.emptyStateSubtitle}>
                      You have not completed any {progressCategory.toLowerCase()} tests in this category yet.
                    </Text>
                  </View>
                ) : (
                  progressHistoryList.map((test, idx) => (
                    <View key={test.id || test.submissionId || idx} style={styles.testHistoryCard}>
                      <View style={styles.testCardHeader}>
                        <View style={styles.testCardTitleBox}>
                          <View style={styles.testBadgesRow}>
                            <View style={[styles.badge, { backgroundColor: `${getFormatBadgeColor(test.paperType)}20`, borderColor: `${getFormatBadgeColor(test.paperType)}40` }]}>
                              <Text style={[styles.badgeText, { color: getFormatBadgeColor(test.paperType) }]}>
                                {test.paperType}
                              </Text>
                            </View>
                            <Text style={styles.testDateText}>
                              {test.submittedAt ? new Date(test.submittedAt).toLocaleDateString() : 'Recent'}
                            </Text>
                          </View>
                          <Text style={styles.testTitle}>{test.testTitle || test.title}</Text>
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
                            Rank #{test.rank || 1} of {test.totalParticipants || 1} Candidates
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
            </View>
          )}

          <View style={{ height: 50 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0f1d'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(10, 15, 29, 0.95)'
  },
  backButton: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)'
  },
  headerTitleBox: {
    flex: 1,
    marginLeft: 12
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.3
  },
  headerSubtitle: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1
  },
  refreshButton: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.06)'
  },
  topSegmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#131b2e',
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)'
  },
  segmentTab: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden'
  },
  segmentTabActive: {
    elevation: 3
  },
  segmentGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10
  },
  segmentText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '800'
  },
  segmentTextActive: {
    color: '#ffffff'
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 12,
    fontWeight: '600'
  },
  scrollContainer: {
    flex: 1,
    paddingHorizontal: 16
  },

  // LEADERBOARD STYLES
  leaderboardSection: {
    gap: 16,
    paddingBottom: 20
  },
  subjectCard: {
    backgroundColor: '#131b2e',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)'
  },
  subjectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
    paddingBottom: 12,
    marginBottom: 14
  },
  subjectIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)'
  },
  subjectNameText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '900'
  },
  subjectTestsCountText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2
  },
  paperTileBox: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)'
  },
  paperInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14
  },
  paperTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6
  },
  paperTitleText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20
  },
  participantCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)'
  },
  participantCountText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '800'
  },

  // 🏆 SINGLE CHAMPION SPOTLIGHT STYLES
  singleChampionCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(245, 158, 11, 0.4)',
    marginBottom: 14,
    backgroundColor: '#0f172a',
  },
  singleChampionGradient: {
    padding: 16,
  },
  championHeaderBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  championTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  championTagText: {
    color: '#fbbf24',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  scorePillGold: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  scorePillGoldText: {
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: '900',
  },
  championBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  championAvatarWrapper: {
    position: 'relative',
    marginRight: 14,
  },
  crownFloatingBadge: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 2,
    borderWidth: 1.5,
    borderColor: '#f59e0b',
  },
  championInfoCol: {
    flex: 1,
  },
  championStudentName: {
    color: '#ffffff',
    fontSize: 16.5,
    fontWeight: '900',
    letterSpacing: 0.2,
    lineHeight: 21,
    marginBottom: 4,
  },
  championSubDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  cityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  cityPillText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 3,
  },
  submissionStatusText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  challengerCalloutBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
  },
  challengerCalloutText: {
    color: '#fde68a',
    fontSize: 11,
    fontWeight: '600',
    flex: 1,
    lineHeight: 16,
  },

  // 🏆 3-TIER OLYMPIC PODIUM STYLES
  podiumWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  podiumColSilver: {
    flex: 1,
    alignItems: 'center',
    paddingBottom: 4,
  },
  podiumColGold: {
    flex: 1.2,
    alignItems: 'center',
    paddingBottom: 12,
  },
  podiumColBronze: {
    flex: 1,
    alignItems: 'center',
    paddingBottom: 2,
  },
  podiumRankCrownGold: {
    alignItems: 'center',
    marginBottom: 6,
  },
  podiumRankCrownSilver: {
    alignItems: 'center',
    marginBottom: 6,
  },
  podiumRankCrownBronze: {
    alignItems: 'center',
    marginBottom: 6,
  },
  medalEmoji: {
    fontSize: 18,
    marginBottom: 2,
  },
  podiumRankNumberGold: {
    color: '#fbbf24',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  podiumRankNumberSilver: {
    color: '#cbd5e1',
    fontSize: 9,
    fontWeight: '800',
  },
  podiumRankNumberBronze: {
    color: '#f97316',
    fontSize: 9,
    fontWeight: '800',
  },
  podiumAvatarContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyPodiumCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#475569',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyPodiumCircleGold: {
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(245, 158, 11, 0.4)',
    backgroundColor: 'rgba(245, 158, 11, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  podiumDetails: {
    alignItems: 'center',
    marginTop: 6,
    width: '100%',
  },
  podiumStudentName: {
    color: '#e2e8f0',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  podiumScoreGold: {
    color: '#fbbf24',
    fontSize: 13,
    fontWeight: '900',
    marginTop: 2,
  },
  podiumScoreSilver: {
    color: '#e2e8f0',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },
  podiumScoreBronze: {
    color: '#f97316',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },
  podiumEmptyText: {
    color: '#64748b',
    fontSize: 10,
    fontStyle: 'italic',
    marginTop: 6,
  },

  // 📋 RANKINGS LIST STYLES
  rankingsContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  rankingsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  rankingsHeaderTitle: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  expandRankingsText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  rankingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131b2e',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  rankingRowMe: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  rankPill: {
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  rankPillGold: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
  },
  rankPillSilver: {
    backgroundColor: 'rgba(203, 213, 225, 0.15)',
  },
  rankPillBronze: {
    backgroundColor: 'rgba(249, 115, 22, 0.2)',
  },
  rankPillNormal: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  rankPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  rankingStudentName: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  youMiniBadge: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 6,
  },
  youMiniBadgeText: {
    color: '#0f172a',
    fontSize: 8,
    fontWeight: '900',
  },
  rankingCityText: {
    color: '#94a3b8',
    fontSize: 10.5,
    fontWeight: '500',
    marginTop: 1,
  },
  rankingScoreBox: {
    alignItems: 'flex-end',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  rankingScoreText: {
    color: '#10b981',
    fontSize: 13,
    fontWeight: '900',
  },
  rankingScoreSub: {
    color: '#6ee7b7',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // CURRENT STUDENT BOTTOM STANDING CARD (REDESIGNED & UNCLUTTERED)
  myStandingCardContainer: {
    backgroundColor: '#131b2e',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    marginBottom: 10,
  },
  myStandingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  myStandingAvatarWrapper: {
    position: 'relative',
    marginRight: 10,
  },
  myAvatarImage: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    borderColor: '#f59e0b',
    backgroundColor: '#334155',
  },
  myAvatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    borderColor: '#f59e0b',
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  myStandingRankMiniBadge: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    backgroundColor: '#d97706',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#0f172a',
  },
  myStandingRankMiniText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
  },
  myStandingNameBlock: {
    flex: 1,
    justifyContent: 'center',
    marginRight: 8,
  },
  myStandingNameTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  myStandingNameText: {
    color: '#ffffff',
    fontSize: 13.5,
    fontWeight: '800',
    flexShrink: 1,
  },
  youBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: 'rgba(245, 158, 11, 0.5)',
  },
  youBadgeText: {
    color: '#f59e0b',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  myStandingSubInfoText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  myScoreBox: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    minWidth: 68,
  },
  myScoreValue: {
    color: '#34d399',
    fontSize: 14,
    fontWeight: '900',
  },
  myScoreUnit: {
    color: '#10b981',
    fontSize: 7.5,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginTop: 1,
  },
  myStandingMetaBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: 8,
    marginTop: 10,
  },
  myStandingMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  myStandingMetaLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '500',
  },
  myStandingMetaHighlight: {
    color: '#f59e0b',
    fontSize: 11.5,
    fontWeight: '800',
  },
  myStandingMetaSub: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '500',
  },
  myStandingUnattemptedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: 6,
    marginTop: 8,
  },
  myStandingUnattemptedText: {
    color: '#94a3b8',
    fontSize: 11,
    fontStyle: 'italic',
    flex: 1,
  },
  takeExamMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  takeExamMiniBtnText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '800',
  },

  // PROGRESS TAB STYLES
  progressSection: {
    gap: 16,
    paddingBottom: 20
  },
  categorySwitcher: {
    flexDirection: 'row',
    backgroundColor: '#131b2e',
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)'
  },
  categoryTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10
  },
  categoryTabActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)'
  },
  categoryTabText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '700'
  },
  categoryTabTextActive: {
    color: '#f59e0b'
  },
  categoryCountBadge: {
    marginLeft: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.05)'
  },
  categoryCountBadgeActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.3)'
  },
  categoryCountText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800'
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  kpiCard: {
    width: (width - 42) / 2,
    backgroundColor: '#131b2e',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)'
  },
  kpiIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10
  },
  kpiValue: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.5
  },
  kpiLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2
  },
  chartSection: {
    backgroundColor: '#131b2e',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)'
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800'
  },
  sectionSubtitle: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600'
  },
  chartTooltip: {
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#38bdf8',
    marginBottom: 12
  },
  tooltipTitle: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700'
  },
  tooltipScore: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2
  },
  chartContainer: {
    height: 140,
    justifyContent: 'flex-end',
    paddingTop: 10
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: 120
  },
  barColumn: {
    alignItems: 'center',
    flex: 1
  },
  barScoreText: {
    color: '#94a3b8',
    fontSize: 9,
    fontWeight: '700',
    marginBottom: 4
  },
  barTrack: {
    width: 14,
    height: 110,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 7,
    justifyContent: 'flex-end',
    overflow: 'hidden'
  },
  barFill: {
    width: '100%',
    borderRadius: 7
  },
  barLabel: {
    color: '#64748b',
    fontSize: 9,
    fontWeight: '600',
    marginTop: 6
  },
  formatFilterRow: {
    flexDirection: 'row',
    gap: 8
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#131b2e',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)'
  },
  filterPillActive: {
    backgroundColor: '#f59e0b',
    borderColor: '#f59e0b'
  },
  filterPillText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700'
  },
  filterPillTextActive: {
    color: '#000000'
  },
  historySection: {
    gap: 10
  },
  testHistoryCard: {
    backgroundColor: '#131b2e',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)'
  },
  testCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  testCardTitleBox: {
    flex: 1,
    marginRight: 10
  },
  testBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800'
  },
  testDateText: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '600'
  },
  testTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18
  },
  scorePill: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)'
  },
  scorePillValue: {
    color: '#10b981',
    fontSize: 16,
    fontWeight: '900'
  },
  scorePillUnit: {
    color: '#10b981',
    fontSize: 8,
    fontWeight: '800'
  },
  testCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)'
  },
  rankBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  rankText: {
    color: '#f59e0b',
    fontSize: 11,
    fontWeight: '700'
  },
  breakdownText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '600'
  },
  emptyStateBox: {
    alignItems: 'center',
    paddingVertical: 40
  },
  emptyStateTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 12
  },
  emptyStateSubtitle: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 20
  }
});
