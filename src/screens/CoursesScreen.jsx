import React, { useState, useEffect, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator, TextInput, StatusBar, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import COLORS from '../constants/colors';
import api, { IMAGE_URL } from '../services/api';

const CoursesScreen = ({ navigation }) => {
  const [businesses, setBusinesses] = useState([]);
  const [filteredBusinesses, setFilteredBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => { fetchBusinesses(); }, []);

  const fetchBusinesses = async () => {
    try {
      const response = await api.get('mobile/businesses');
      const data = response.data?.businesses || [];
      setBusinesses(data);
      setFilteredBusinesses(data);
    } catch (error) {
      console.log("Businesses fetch error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (text) => {
    setSearchQuery(text);
    if (text) {
        const filtered = businesses.filter(b => b.name.toLowerCase().includes(text.toLowerCase()) || b.category.toLowerCase().includes(text.toLowerCase()));
        setFilteredBusinesses(filtered);
    } else {
        setFilteredBusinesses(businesses);
    }
  };

  // 🔥 FIX: පේළියට දෙකක් වැටෙන්න Card එක පොඩි කළා
  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={() => navigation.navigate('CourseDetails', { businessData: item })}>
      <View style={styles.cardImageContainer}>
        <Image source={{ uri: `${IMAGE_URL}icons/${item.logo || 'default.png'}` }} style={styles.image} resizeMode="contain" />
      </View>
      <View style={styles.cardContent}>
        {/* Category Badge එක මෙතනින් අයින් කරලා තියෙන්නේ */}
        <Text style={styles.title} numberOfLines={2}>{item.name}</Text>
        <View style={styles.footer}>
          <Text style={styles.enrollText}>Enroll</Text>
          <Icon name="arrow-right-circle" size={20} color={COLORS.primary} />
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} translucent={true}/>
      
      {/* 🔥 Premium Red Header 🔥 */}
      <LinearGradient colors={[COLORS.primary, '#9A0007']} start={{x: 0, y: 0}} end={{x: 1, y: 1}} style={styles.redHeader}>
        <Icon name="school" size={150} color="rgba(255,255,255,0.06)" style={{position: 'absolute', right: -30, top: -20, transform: [{rotate: '-15deg'}]}} />
        <Text style={styles.headerTitle}>Available Courses</Text>
        <View style={styles.searchContainer}>
            <Icon name="magnify" size={22} color="#999" style={styles.searchIcon} />
            <TextInput 
                style={styles.searchInput} 
                placeholder="Search courses..." 
                placeholderTextColor="#999"
                value={searchQuery}
                onChangeText={handleSearch}
            />
            {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => handleSearch('')}><Icon name="close-circle" size={20} color="#999" /></TouchableOpacity>
            )}
        </View>
      </LinearGradient>

      <View style={styles.mainBackground}>
        {loading ? <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 50 }} /> : (
          <FlatList 
            data={filteredBusinesses} 
            keyExtractor={(item) => item.id.toString()} 
            renderItem={renderItem} 
            numColumns={2} // 🔥 පේළියට Cards දෙකයි
            columnWrapperStyle={styles.row} // 🔥 Cards දෙක අතර පරතරය
            contentContainerStyle={styles.list} 
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={<View style={styles.emptyContainer}><Icon name="book-search-outline" size={60} color="#ccc"/><Text style={styles.emptyText}>No courses found.</Text></View>}
          />
        )}
      </View>
    </View>
  );
};

const STATUSBAR_HEIGHT = Platform.OS === 'ios' ? 50 : StatusBar.currentHeight || 24;

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F5F7FA' },
  mainBackground: { flex: 1, backgroundColor: '#F5F7FA' },
  
  redHeader: { 
    paddingHorizontal: 20, 
    paddingBottom: 25, 
    paddingTop: STATUSBAR_HEIGHT + 10, 
    borderBottomLeftRadius: 35, 
    borderBottomRightRadius: 35, 
    elevation: 8, 
    shadowColor: COLORS.primary, shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.3, shadowRadius: 10,
    zIndex: 10,
    overflow: 'hidden'
  },
  headerTitle: { fontSize: 24, fontWeight: '900', color: 'white', marginBottom: 15, letterSpacing: 0.5 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 15, paddingHorizontal: 15, height: 48, elevation: 2 },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, color: '#1A1A1A', fontSize: 14, height: '100%' },
  
  list: { padding: 15, paddingTop: 20, paddingBottom: 100 },
  row: { justifyContent: 'space-between', marginBottom: 15 }, // 🔥 Grid Spacing
  
  card: { 
    width: '48%', // 🔥 Screen එකෙන් භාගයක් ගන්නවා
    backgroundColor: 'white', 
    borderRadius: 20, 
    overflow: 'hidden', 
    elevation: 3, 
    borderWidth: 1, borderColor: '#F0F0F0', 
    shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.05, shadowRadius: 5 
  }, 
  cardImageContainer: { height: 100, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', padding: 10 }, 
  image: { width: '100%', height: '100%' }, 
  cardContent: { padding: 12, paddingTop: 15 }, 
  badge: { backgroundColor: '#E0F2FE', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginBottom: 8 }, 
  badgeText: { color: '#0369A1', fontSize: 9, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 }, 
  title: { fontSize: 13, fontWeight: '800', color: '#1A1A1A', marginBottom: 10, lineHeight: 18, height: 36 }, 
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 10 }, 
  enrollText: { fontSize: 12, fontWeight: '800', color: COLORS.primary },

  emptyContainer: {alignItems: 'center', marginTop: 80},
  emptyText: {textAlign: 'center', marginTop: 10, color: '#999', fontWeight: '700', fontSize: 15}
});

export default CoursesScreen;