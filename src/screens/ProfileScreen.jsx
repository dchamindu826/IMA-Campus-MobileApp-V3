import React, { useState, useContext, useEffect, useLayoutEffect } from 'react';
import { 
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, 
  Image, ActivityIndicator, Platform, KeyboardAvoidingView, StatusBar 
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { launchImageLibrary } from 'react-native-image-picker';
import { Picker } from '@react-native-picker/picker'; 
import COLORS from '../constants/colors';
import { AuthContext } from '../context/AuthContext';
import api, { IMAGE_URL } from '../services/api';
import CustomAlert from '../components/CustomAlert';

const PasswordRequirement = ({ met, text }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
    <Text style={{ color: met ? '#4ade80' : '#999', marginRight: 8, fontSize: 14, fontWeight: 'bold' }}>
      {met ? '✔' : '○'}
    </Text>
    <Text style={{ color: met ? '#4ade80' : '#999', fontSize: 12, fontWeight: met ? 'bold' : 'normal' }}>
      {text}
    </Text>
  </View>
);

const districtsList = ["Ampara", "Anuradhapura", "Badulla", "Batticaloa", "Colombo", "Galle", "Gampaha", "Hambantota", "Jaffna", "Kalutara", "Kandy", "Kegalle", "Kilinochchi", "Kurunegala", "Mannar", "Matale", "Matara", "Monaragala", "Mullaitivu", "Nuwara Eliya", "Polonnaruwa", "Puttalam", "Ratnapura", "Trincomalee", "Vavuniya"];

const ProfileScreen = ({ navigation }) => {
  const { userInfo, logout, updateUserInfo, userToken } = useContext(AuthContext);
  
  const [loading, setLoading] = useState(false);
  const [passLoading, setPassLoading] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', msg: '', type: 'success' });

  const [form, setForm] = useState({ addressHouseNo: '', addressStreet: '', city: '', district: '' });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordChecks, setPasswordChecks] = useState({ length: false, numbers: false, specialChar: false, letters: false });

  const [dpFile, setDpFile] = useState(null);
  const [previewUri, setPreviewUri] = useState(null);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    if (userInfo) {
      setForm({
        addressHouseNo: userInfo.addressHouseNo || userInfo.houseNo || '',
        addressStreet: userInfo.addressStreet || userInfo.streetName || '',
        city: userInfo.city || userInfo.town || '',
        district: userInfo.district || '',
      });
    }
  }, [userInfo]);

  const showAlert = (title, msg, type) => {
    setAlertConfig({ title, msg, type });
    setAlertVisible(true);
  };

  const handleLogout = async () => {
    await logout();
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  const handleImagePick = async () => {
    try {
      const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.7 });
      if (result.assets && result.assets.length > 0) {
        setDpFile(result.assets[0]);
        setPreviewUri(result.assets[0].uri); 
      }
    } catch (err) {
      showAlert("Error", "Could not open photo library: " + err.message, "error");
    }
  };

  const handleUpdateProfile = async () => {
    setLoading(true);
    try {
      const formData = new FormData();
      if (dpFile) {
        formData.append('image', {
          uri: Platform.OS === 'android' ? dpFile.uri : dpFile.uri.replace('file://', ''),
          type: dpFile.type || 'image/jpeg',
          name: dpFile.fileName || `profile_${Date.now()}.jpg`, 
        });
      }
      formData.append('id', userInfo.id || userInfo.userId); 
      formData.append('addressHouseNo', form.addressHouseNo);
      formData.append('addressStreet', form.addressStreet);
      formData.append('city', form.city);
      formData.append('district', form.district);

      const res = await api.post('/mobile/profile/update', formData, {
        headers: { 'Content-Type': 'multipart/form-data', 'Authorization': `Bearer ${userToken}` },
        transformRequest: (data, headers) => { return data; }
      });

      updateUserInfo({ ...form, image: res.data?.image || res.data?.message?.image || userInfo.image });
      showAlert("Success", "Profile updated successfully!", "success");
    } catch (error) {
      showAlert("Error Details", error.response?.data?.error || "Failed to update profile.", "error");
    } finally {
      setLoading(false);
    }
  };

  const validatePassword = (password) => {
    const length = password.length >= 8;
    const numbers = (password.match(/\d/g) || []).length >= 2; 
    const specialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password); 
    const letters = /[a-zA-Z]/.test(password); 
    setPasswordChecks({ length, numbers, specialChar, letters });
    return length && numbers && specialChar && letters;
  };

  const handlePasswordChange = (key, val) => {
    setPasswords({ ...passwords, [key]: val });
    if (key === 'newPassword') validatePassword(val);
  };

  const handleSavePassword = async () => {
    if (!passwords.currentPassword || !passwords.newPassword || !passwords.confirmPassword) {
      return showAlert("Error", "Please fill all password fields.", "error");
    }
    if (!validatePassword(passwords.newPassword)) {
        return showAlert("Weak Password", "Please ensure your new password meets all security requirements!", "error");
    }
    if (passwords.newPassword !== passwords.confirmPassword) {
      return showAlert("Error", "New passwords do not match!", "error");
    }
    setPassLoading(true);
    try {
      await api.post('/mobile/profile/password', {
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword
      }, { headers: { 'Authorization': `Bearer ${userToken}` } });

      showAlert("Success", "Password changed successfully!", "success");
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordChecks({ length: false, numbers: false, specialChar: false, letters: false });
    } catch (error) {
      showAlert("Error", error.response?.data?.error || "Failed to change password.", "error");
    } finally {
      setPassLoading(false);
    }
  };

  // 🔥 මෙතන variable එක හරියට හැදුවා (Home එකේ වගේම)
  const finalProfileImageUri = userInfo?.image && userInfo.image !== 'default.png' && userInfo.image !== 'null' 
      ? `${IMAGE_URL}images/${userInfo.image}` 
      : null;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex: 1, backgroundColor: '#F4F6F9'}}>
      <StatusBar backgroundColor={COLORS.primary} barStyle="light-content" translucent={true} />
      <CustomAlert isVisible={alertVisible} title={alertConfig.title} message={alertConfig.msg} type={alertConfig.type} onClose={() => setAlertVisible(false)} />
      
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom: 40}}>
        <View style={styles.header}>
          <View style={styles.topBar}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Icon name="arrow-left" size={24} color="white" />
            </TouchableOpacity>
            <Text style={styles.topBarTitle}>Profile</Text>
            <View style={{ width: 40 }} />
          </View>

          <TouchableOpacity style={styles.imageWrapper} onPress={handleImagePick}>
            {previewUri ? (
              <Image source={{ uri: previewUri }} style={styles.profileImage} />
            ) : finalProfileImageUri ? (
              <Image 
                source={{ uri: finalProfileImageUri }} // ✅ Harigassuwa
                style={styles.profileImage}
                key={finalProfileImageUri} // ✅ Harigassuwa
              />
            ) : (
              <View style={styles.defaultIcon}>
                <Icon name="account" size={60} color="#ccc" />
              </View>
            )}
            <View style={styles.cameraBtn}>
              <Icon name="camera-plus" size={16} color="white" />
            </View>
          </TouchableOpacity>
          <Text style={styles.headerName}>{userInfo?.fName || userInfo?.firstName} {userInfo?.lName || userInfo?.lastName}</Text>
          
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <Icon name="logout" size={18} color="white" />
            <Text style={styles.logoutText}> Logout</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.formContainer}>
          <Text style={styles.sectionTitle}>Personal Information</Text>
          <View style={styles.row}>
            <View style={{flex:1, marginRight: 12}}>
              <Text style={styles.label}>First Name</Text>
              <TextInput style={styles.disabledInput} value={userInfo?.fName || userInfo?.firstName} editable={false} />
            </View>
            <View style={{flex:1}}>
              <Text style={styles.label}>Last Name</Text>
              <TextInput style={styles.disabledInput} value={userInfo?.lName || userInfo?.lastName} editable={false} />
            </View>
          </View>
          <View style={styles.inputGroup}>
             <Text style={styles.label}>Phone Number</Text>
             <TextInput style={styles.disabledInput} value={userInfo?.phone} editable={false} />
          </View>
          <View style={styles.inputGroup}>
             <Text style={styles.label}>NIC Number</Text>
             <TextInput style={styles.disabledInput} value={userInfo?.nic} editable={false} />
          </View>

          <Text style={[styles.sectionTitle, {marginTop: 25}]}>Delivery Address</Text>
          <View style={styles.row}>
              <View style={{flex:0.8, marginRight: 12}}>
                 <Text style={styles.label}>House No</Text>
                 <TextInput style={styles.input} value={form.addressHouseNo} onChangeText={(txt) => setForm({...form, addressHouseNo: txt})} placeholder="e.g. 12/A" placeholderTextColor="#aaa" />
              </View>
              <View style={{flex:2}}>
                 <Text style={styles.label}>Street Name</Text>
                 <TextInput style={styles.input} value={form.addressStreet} onChangeText={(txt) => setForm({...form, addressStreet: txt})} placeholder="Main Street" placeholderTextColor="#aaa" />
              </View>
          </View>
          <View style={styles.row}>
              <View style={{flex:1, marginRight: 12}}>
                 <Text style={styles.label}>City / Town</Text>
                 <TextInput style={styles.input} value={form.city} onChangeText={(txt) => setForm({...form, city: txt})} placeholder="Your City" placeholderTextColor="#aaa" />
              </View>
              <View style={{flex:1}}>
                 <Text style={styles.label}>District</Text>
                 <View style={styles.pickerContainer}>
                    <Picker selectedValue={form.district} onValueChange={(itemValue) => setForm({...form, district: itemValue})} style={styles.picker} dropdownIconColor="#666">
                      <Picker.Item label="Select" value="" color="#999" />
                      {districtsList.map((dist, index) => <Picker.Item key={index} label={dist} value={dist} color="#000" />)}
                    </Picker>
                 </View>
              </View>
          </View>

          <TouchableOpacity style={styles.updateBtn} onPress={handleUpdateProfile} disabled={loading}>
            {loading ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>UPDATE PROFILE</Text>}
          </TouchableOpacity>

          <View style={styles.divider} />
          <Text style={styles.sectionTitle}>Security</Text>
          <View style={styles.inputGroup}>
             <Text style={styles.label}>Current Password</Text>
             <TextInput secureTextEntry style={styles.input} value={passwords.currentPassword} onChangeText={(txt) => handlePasswordChange('currentPassword', txt)} placeholder="••••••••" placeholderTextColor="#aaa" />
          </View>
          <View style={styles.inputGroup}>
             <Text style={styles.label}>New Password</Text>
             <TextInput secureTextEntry style={styles.input} value={passwords.newPassword} onChangeText={(txt) => handlePasswordChange('newPassword', txt)} placeholder="••••••••" placeholderTextColor="#aaa" />
          </View>

          {passwords.newPassword.length > 0 && (
            <View style={styles.passwordRequirementsBox}>
              <PasswordRequirement met={passwordChecks.length} text="Minimum 8 characters long" />
              <PasswordRequirement met={passwordChecks.letters} text="Contains at least one letter" />
              <PasswordRequirement met={passwordChecks.numbers} text="Contains at least 2 numbers" />
              <PasswordRequirement met={passwordChecks.specialChar} text="Contains special character (!@#$)" />
            </View>
          )}

          <View style={styles.inputGroup}>
             <Text style={styles.label}>Confirm New Password</Text>
             <TextInput secureTextEntry style={styles.input} value={passwords.confirmPassword} onChangeText={(txt) => handlePasswordChange('confirmPassword', txt)} placeholder="••••••••" placeholderTextColor="#aaa" />
          </View>

          <TouchableOpacity style={styles.passwordBtn} onPress={handleSavePassword} disabled={passLoading}>
            {passLoading ? <ActivityIndicator color={COLORS.primary} /> : <Text style={styles.passwordBtnText}>UPDATE PASSWORD</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const STATUSBAR_HEIGHT = Platform.OS === 'ios' ? 50 : StatusBar.currentHeight || 24;

const styles = StyleSheet.create({
  header: { alignItems: 'center', paddingBottom: 35, paddingTop: STATUSBAR_HEIGHT, backgroundColor: COLORS.primary, borderBottomLeftRadius: 40, borderBottomRightRadius: 40, elevation: 8, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10 },
  topBar: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 20 },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
  topBarTitle: { color: 'white', fontSize: 20, fontWeight: '700', letterSpacing: 0.5 },
  imageWrapper: { position: 'relative', elevation: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.3, shadowRadius: 8 },
  profileImage: { width: 115, height: 115, borderRadius: 60, borderWidth: 4, borderColor: '#fff' },
  defaultIcon: { width: 115, height: 115, borderRadius: 60, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center', borderWidth: 4, borderColor: '#fff' },
  cameraBtn: { position: 'absolute', bottom: 2, right: 2, backgroundColor: '#222', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff', elevation: 4 },
  headerName: { color: 'white', fontSize: 22, fontWeight: 'bold', marginTop: 16, letterSpacing: 0.5 },
  logoutBtn: { flexDirection: 'row', marginTop: 15, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 22, paddingVertical: 10, borderRadius: 25, alignItems: 'center' },
  logoutText: { color: 'white', fontWeight: '700', fontSize: 14, letterSpacing: 0.5 },
  formContainer: { padding: 25, paddingTop: 30 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#1A1A1A', marginBottom: 18, borderLeftWidth: 4, borderLeftColor: COLORS.primary, paddingLeft: 12, letterSpacing: 0.5, textTransform: 'uppercase' },
  inputGroup: { marginBottom: 18 },
  label: { fontSize: 11, color: '#666', marginBottom: 6, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 16, height: 54, borderWidth: 1, borderColor: '#E5E7EB', color: '#1A1A1A', fontSize: 15, elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
  disabledInput: { backgroundColor: '#F3F4F6', borderRadius: 14, paddingHorizontal: 16, height: 54, borderWidth: 1, borderColor: '#E5E7EB', color: '#9CA3AF', fontSize: 15, fontWeight: '500' },
  pickerContainer: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', height: 54, justifyContent: 'center', elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2 },
  picker: { height: 54, color: '#1A1A1A' },
  row: { flexDirection: 'row', marginBottom: 18 },
  updateBtn: { backgroundColor: COLORS.primary, borderRadius: 14, height: 56, justifyContent: 'center', alignItems: 'center', marginTop: 15, elevation: 6, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  btnText: { color: 'white', fontSize: 15, fontWeight: '800', letterSpacing: 1 },
  divider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 35 },
  passwordRequirementsBox: { backgroundColor: '#f5f5f5', padding: 15, borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#eaeaea' },
  passwordBtn: { backgroundColor: 'transparent', borderRadius: 14, height: 56, justifyContent: 'center', alignItems: 'center', marginTop: 15, borderWidth: 2, borderColor: COLORS.primary },
  passwordBtnText: { color: COLORS.primary, fontSize: 15, fontWeight: '800', letterSpacing: 1 },
});

export default ProfileScreen;