import React, { useState, useEffect, useContext } from 'react';
import { 
  View, Text, StyleSheet, FlatList, TouchableOpacity, 
  Image, ActivityIndicator, Platform 
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api, { IMAGE_URL } from '../services/api';
import COLORS from '../constants/colors';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const ClassRoomScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [mySubjects, setMySubjects] = useState([]); // Changed to mySubjects
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMyClassroom();
  }, []);

  const fetchMyClassroom = async () => {
    try {
      setLoading(true);
      const res = await api.get('/classRoom');
      
      // Backend eken enne: Business -> Batches -> Groups -> Courses hierarchy ekak.
      // Api meka flatten karanna ona kelinma courses tika ganna.
      
      let allCourses = [];

      if (res.data.businesses) {
        res.data.businesses.forEach(business => {
            if (business.batches) {
                business.batches.forEach(batch => {
                    if (batch.groups) {
                        batch.groups.forEach(group => {
                            if (group.courses) {
                                group.courses.forEach(course => {
                                    // Duplicate nowenna ID eken check karamu (optional)
                                    // Business Logo eka course ekata assign karamu lassanata penna
                                    allCourses.push({
                                        ...course,
                                        businessLogo: business.logo,
                                        businessName: business.name
                                    });
                                });
                            }
                        });
                    }
                });
            }
        });
      }

      setMySubjects(allCourses);
    } catch (e) {
      console.log("Error fetching classroom", e);
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.courseCard} 
      onPress={() => navigation.navigate('CourseContent', { 
        courseId: item.id,  // Dan yanne hariyatama Course ID eka
        courseTitle: item.name 
      })}
    >
      <Image 
        source={{ uri: `${IMAGE_URL}icons/${item.businessLogo}` }} 
        style={styles.logo} 
      />
      <View style={styles.cardInfo}>
        <Text style={styles.courseName}>{item.name}</Text>
        <Text style={styles.lecturer}>{item.description}</Text> 
        <Text style={styles.tapText}>{item.businessName}</Text>
      </View>
      <Icon name="chevron-right" size={24} color="#BBB" />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <Text style={styles.headerTitle}>My Classroom</Text>
        <TouchableOpacity onPress={fetchMyClassroom}>
          <Icon name="refresh" size={24} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 50 }} />
      ) : (
        <FlatList
          data={mySubjects}
          keyExtractor={(item, index) => item.id.toString() + index} // Unique Key
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <Text style={styles.emptyText}>You haven't enrolled in any subjects yet.</Text>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FB' },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 20,
    paddingBottom: 15,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEE'
  },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  listContainer: { paddingHorizontal: 20, paddingBottom: 20 },
  courseCard: { 
    flexDirection: 'row', 
    backgroundColor: 'white', 
    padding: 15, 
    borderRadius: 15, 
    marginBottom: 15, 
    alignItems: 'center', 
    elevation: 3 
  },
  logo: { width: 50, height: 50, borderRadius: 10 },
  cardInfo: { flex: 1, marginLeft: 15 },
  courseName: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  lecturer: { fontSize: 12, color: '#666' },
  tapText: { fontSize: 10, color: COLORS.primary, marginTop: 3, fontWeight: 'bold' },
  emptyText: { textAlign: 'center', marginTop: 50, color: '#999' }
});

export default ClassRoomScreen;