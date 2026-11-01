import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl, Image, StatusBar, Platform } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import COLORS from '../constants/colors';
import api, { IMAGE_URL } from '../services/api';

const MyCoursesScreen = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mySubjects, setMySubjects] = useState([]);

  const [step, setStep] = useState(1);
  const [selectedBusiness, setSelectedBusiness] = useState(null);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [classTypeFilter, setClassTypeFilter] = useState('All'); // 'All', 'Theory', 'Paper'

  const insets = useSafeAreaInsets();

  useFocusEffect(useCallback(() => { fetchClassroomData(); }, []));

  const fetchClassroomData = async () => {
    try {
      const res = await api.get('mobile/classroom');
      setMySubjects(res.data || []);
    } catch (e) {
      console.log("Classroom Fetch Error:", e);
    } finally {
      setLoading(false); setRefreshing(false);
    }
  };

  const onRefresh = () => { setRefreshing(true); fetchClassroomData(); };

  const handleBack = () => {
    if (step === 3) {
      setStep(2);
      setSelectedBatch(null);
      setClassTypeFilter('All');
    } else if (step === 2) {
      setStep(1);
      setSelectedBusiness(null);
      setClassTypeFilter('All');
    } else {
      navigation.goBack();
    }
  };

  const businesses = useMemo(() => {
    const map = new Map();
    mySubjects.forEach(s => {
      if (!map.has(s.businessName)) {
        map.set(s.businessName, { name: s.businessName, logo: s.businessLogo });
      }
    });
    return Array.from(map.values());
  }, [mySubjects]);

  const batchesForBusiness = useMemo(() => {
    if (!selectedBusiness) return [];
    const map = new Map();
    mySubjects.filter(s => s.businessName === selectedBusiness.name).forEach(s => {
      if (!map.has(s.batchName)) {
        map.set(s.batchName, { name: s.batchName, businessName: s.businessName, logo: s.batchLogo || s.businessLogo });
      }
    });
    return Array.from(map.values());
  }, [mySubjects, selectedBusiness]);

  const batchSubjects = useMemo(() => {
    if (!selectedBatch) return [];
    return mySubjects.filter(s => s.businessName === selectedBatch.businessName && s.batchName === selectedBatch.name);
  }, [mySubjects, selectedBatch]);

  const { totalTheory, totalPaper } = useMemo(() => {
    let theory = 0;
    let paper = 0;
    batchSubjects.forEach(s => {
      const isPaper = parseInt(s.courseType || s.classType || 1, 10) === 2;
      if (isPaper) paper++;
      else theory++;
    });
    return { totalTheory: theory, totalPaper: paper };
  }, [batchSubjects]);

  const subjectsWithHeaders = useMemo(() => {
    if (!selectedBatch) return [];
    let list = batchSubjects;
    if (classTypeFilter === 'Theory') {
      list = list.filter(s => parseInt(s.courseType || s.classType || 1, 10) !== 2);
    } else if (classTypeFilter === 'Paper') {
      list = list.filter(s => parseInt(s.courseType || s.classType || 1, 10) === 2);
    }

    const streamMap = new Map();
    list.forEach(s => {
      const groupName = s.groupName || "General Subjects";
      if (!streamMap.has(groupName)) streamMap.set(groupName, []);
      streamMap.get(groupName).push(s);
    });

    const finalList = [];
    streamMap.forEach((subjects, stream) => {
      finalList.push({ isHeader: true, title: stream });
      subjects.forEach(sub => finalList.push(sub));
    });

    return finalList;
  }, [batchSubjects, classTypeFilter]);

  const renderBusinessCard = ({ item }) => (
    <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={() => { setSelectedBusiness(item); setStep(2); }}>
      <View style={styles.logoContainer}>
        <Image source={{ uri: `${IMAGE_URL}icons/${item.logo || 'default.png'}` }} style={styles.logo} resizeMode="contain" />
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.cardSubText}>View Batches</Text>
      </View>
      <Icon name="chevron-right" size={24} color="#CCC" />
    </TouchableOpacity>
  );

  const renderBatchCard = ({ item }) => (
    <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={() => { setSelectedBatch(item); setClassTypeFilter('All'); setStep(3); }}>
      <View style={styles.logoContainer}>
        <Image source={{ uri: `${IMAGE_URL}icons/${item.logo || 'default.png'}` }} style={styles.logo} resizeMode="contain" />
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.cardSubText}>{item.businessName}</Text>
      </View>
      <Icon name="chevron-right" size={24} color="#CCC" />
    </TouchableOpacity>
  );

  const renderSubjectCard = ({ item }) => {
    if (item.isHeader) {
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>{item.title}</Text>
        </View>
      );
    }

    const hasValidImage = item.lecturerImage && item.lecturerImage !== 'null' && item.lecturerImage !== 'default.png' && item.lecturerImage.trim() !== '';
    const lecturerName = item.description && item.description.toUpperCase() !== 'TBA' ? item.description : 'TBA';
    const isPaper = parseInt(item.courseType || item.classType || 1, 10) === 2;

    return (
      <TouchableOpacity style={styles.courseCard} activeOpacity={0.8} onPress={() => navigation.navigate('CourseContent', { courseId: item.id, courseTitle: item.name, hasAccess: true })}>
        <View style={styles.largeAvatarContainer}>
          {hasValidImage ? (
            <Image source={{ uri: `${IMAGE_URL}icons/${item.lecturerImage}` }} style={styles.largeAvatar} resizeMode="cover" />
          ) : (
            <View style={styles.largeAvatarPlaceholder}><Icon name="account" size={32} color="#9CA3AF" /></View>
          )}
        </View>

        <View style={styles.cardInfo}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 6 }}>
            {isPaper ? (
              <View style={styles.paperBadge}>
                <Text style={styles.paperBadgeText}>📝 Paper Class</Text>
              </View>
            ) : (
              <View style={styles.theoryBadge}>
                <Text style={styles.theoryBadgeText}>📘 Theory</Text>
              </View>
            )}
            {item.code ? <Text style={styles.courseCode}>{item.code}</Text> : null}
          </View>
          <Text style={styles.courseName} numberOfLines={2}>{item.name}</Text>
          <View style={styles.metaRow}>
            <Icon name="account-tie" size={14} color="#666" style={{ marginRight: 6 }} />
            <Text style={styles.lecturer} numberOfLines={1}>{lecturerName}</Text>
          </View>
        </View>
        <Icon name="play-circle" size={32} color={COLORS.primary} style={{ marginLeft: 10 }} />
      </TouchableOpacity>
    );
  };

  let headerText = "My Courses";
  let subText = "Select your course";
  if (step === 2) {
    headerText = selectedBusiness?.name || "My Batches";
    subText = "Select your batch";
  } else if (step === 3) {
    headerText = selectedBatch?.name || "Subjects";
    subText = "Select a subject to learn";
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={true} />

      <LinearGradient colors={[COLORS.primary, '#9A0007']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.redHeader, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <Icon name="school" size={150} color="rgba(255,255,255,0.06)" style={{ position: 'absolute', right: -30, top: -20, transform: [{ rotate: '-15deg' }] }} />
        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
          <Icon name="arrow-left" size={24} color="white" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>{headerText}</Text>
          <Text style={styles.subHeaderText}>{subText}</Text>
        </View>
      </LinearGradient>

      {step === 3 && totalTheory > 0 && totalPaper > 0 && (
        <View style={styles.filterBar}>
          <TouchableOpacity 
            onPress={() => setClassTypeFilter('All')} 
            style={[styles.filterChip, classTypeFilter === 'All' && styles.filterChipActive]}
          >
            <Text style={[styles.filterChipText, classTypeFilter === 'All' && styles.filterChipTextActive]}>
              All ({totalTheory + totalPaper})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setClassTypeFilter('Theory')} 
            style={[styles.filterChip, classTypeFilter === 'Theory' && styles.filterChipActiveBlue]}
          >
            <Text style={[styles.filterChipText, classTypeFilter === 'Theory' && styles.filterChipTextActiveBlue]}>
              📘 Theory ({totalTheory})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => setClassTypeFilter('Paper')} 
            style={[styles.filterChip, classTypeFilter === 'Paper' && styles.filterChipActiveAmber]}
          >
            <Text style={[styles.filterChipText, classTypeFilter === 'Paper' && styles.filterChipTextActiveAmber]}>
              📝 Paper ({totalPaper})
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.content}>
        {loading && !refreshing ? <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 50 }} /> : (
          <FlatList
            data={step === 1 ? businesses : step === 2 ? batchesForBusiness : subjectsWithHeaders}
            keyExtractor={(item, index) => item.id ? item.id.toString() : index.toString()}
            renderItem={step === 1 ? renderBusinessCard : step === 2 ? renderBatchCard : renderSubjectCard}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconBox}><Icon name="school-outline" size={60} color="#D1D5DB" /></View>
                <Text style={styles.emptyTitle}>No Enrollments Found</Text>
                <Text style={styles.emptyText}>You haven't enrolled in any courses yet or your payment is pending approval.</Text>
              </View>
            }
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  redHeader: { paddingHorizontal: 20, paddingBottom: 22, minHeight: 115, borderBottomLeftRadius: 35, borderBottomRightRadius: 35, elevation: 8, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, zIndex: 10, flexDirection: 'row', alignItems: 'center' },
  backBtn: { marginRight: 15, padding: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12 },
  headerTitle: { fontSize: 20, fontWeight: '900', color: 'white', letterSpacing: 0.5 },
  subHeaderText: { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '600', marginTop: 2 },
  
  filterBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4, gap: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: 'white', borderWidth: 1, borderColor: '#E5E7EB', elevation: 1 },
  filterChipActive: { backgroundColor: '#1E293B', borderColor: '#1E293B', elevation: 3 },
  filterChipActiveBlue: { backgroundColor: '#2563EB', borderColor: '#2563EB', elevation: 3 },
  filterChipActiveAmber: { backgroundColor: '#D97706', borderColor: '#D97706', elevation: 3 },
  filterChipText: { fontSize: 12, fontWeight: '800', color: '#4B5563' },
  filterChipTextActive: { color: 'white' },
  filterChipTextActiveBlue: { color: 'white' },
  filterChipTextActiveAmber: { color: 'white' },

  theoryBadge: { backgroundColor: '#DBEAFE', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#BFDBFE' },
  theoryBadgeText: { fontSize: 10, fontWeight: '900', color: '#1D4ED8' },
  paperBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#FDE68A' },
  paperBadgeText: { fontSize: 10, fontWeight: '900', color: '#B45309' },

  content: { flex: 1 },
  listContainer: { padding: 20, paddingBottom: 100 },
  card: { flexDirection: 'row', backgroundColor: 'white', padding: 16, borderRadius: 20, marginBottom: 15, alignItems: 'center', elevation: 2, borderWidth: 1, borderColor: '#F3F4F6' },
  logoContainer: { width: 75, height: 75, borderRadius: 15, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#F0F0F0', overflow: 'hidden' },
  logo: { width: '90%', height: '90%' },
  cardInfo: { flex: 1, marginLeft: 15 },
  cardTitle: { fontSize: 16, fontWeight: '900', color: '#1A1A1A', marginBottom: 4 },
  cardSubText: { fontSize: 12, color: '#6B7280', fontWeight: '700' },
  courseCard: { flexDirection: 'row', backgroundColor: 'white', padding: 16, borderRadius: 20, marginBottom: 15, alignItems: 'center', elevation: 3, borderWidth: 1, borderColor: '#F3F4F6' },
  iconBox: { width: 55, height: 55, borderRadius: 15, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#FECACA' },
  courseName: { fontSize: 15, fontWeight: '900', color: '#1A1A1A', marginBottom: 4, lineHeight: 20 },
  courseCode: { fontSize: 10, fontWeight: '900', color: COLORS.primary, backgroundColor: '#FEF2F2', alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, marginBottom: 4, letterSpacing: 0.5 },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  lecturer: { fontSize: 12, color: '#4B5563', fontWeight: '700', flex: 1 },
  emptyContainer: { alignItems: 'center', marginTop: 60, paddingHorizontal: 20 },
  emptyIconBox: { width: 100, height: 100, borderRadius: 50, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center', marginBottom: 20, elevation: 2 },
  emptyTitle: { fontSize: 20, fontWeight: '900', color: '#1A1A1A', marginBottom: 10 },
  emptyText: { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 22, fontWeight: '700' },
  sectionHeader: { paddingVertical: 10, paddingHorizontal: 5, marginTop: 10, marginBottom: 10 },
  sectionHeaderText: { fontSize: 18, fontWeight: '900', color: COLORS.primary, letterSpacing: 0.5 },
  largeAvatarContainer: { width: 65, height: 65, borderRadius: 32.5, marginRight: 15, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#F0F0F0', overflow: 'hidden' },
  largeAvatar: { width: '100%', height: '100%' },
  largeAvatarPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' }
});

export default MyCoursesScreen;
