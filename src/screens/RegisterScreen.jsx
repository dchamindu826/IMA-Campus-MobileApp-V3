import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Image, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Picker } from '@react-native-picker/picker'; // 🔥 NEW: Dropdown eka ganna damma
import COLORS from '../constants/colors';
import api from '../services/api';
import CustomAlert from '../components/CustomAlert';

// 🔥 NEW: Password Requirements UI Component eka
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

const RegisterScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  // 🔥 UPDATED: confirmPassword add kara
  const [formData, setFormData] = useState({
    fName: '', lName: '', phone: '', directPhone: '', nic: '',
    houseNo: '', streetName: '', village: '', town: '', district: '', password: '', confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({ title: '', msg: '', type: 'success' });

  // 🔥 NEW: Password checking state 
  const [passwordChecks, setPasswordChecks] = useState({
    length: false,
    numbers: false,
    specialChar: false,
    letters: false
  });

  // 🔥 NEW: Password Validate karana function eka (Web eke wagema)
  const validatePassword = (password) => {
    const length = password.length >= 8;
    const numbers = (password.match(/\d/g) || []).length >= 2; 
    const specialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password); 
    const letters = /[a-zA-Z]/.test(password); 

    setPasswordChecks({ length, numbers, specialChar, letters });
    return length && numbers && specialChar && letters;
  };

  const handleChange = (key, val) => {
    setFormData({ ...formData, [key]: val });
    
    // Check password logic as user types
    if (key === 'password') {
        validatePassword(val);
    }
  };

  const handleRegister = async () => {
    if (!formData.fName || !formData.lName || !formData.phone || !formData.nic || !formData.password || !formData.confirmPassword || !formData.district) {
      setAlertConfig({ 
        title: 'Missing Info', 
        msg: 'Please fill all mandatory fields including District and Confirm Password.', 
        type: 'error' 
      });
      setAlertVisible(true);
      return;
    }

    // 🔥 NEW: Strict Password Requirements before submit 
    if (!validatePassword(formData.password)) {
        setAlertConfig({ 
            title: 'Weak Password', 
            msg: 'Please ensure your password meets all security requirements!', 
            type: 'error' 
        });
        setAlertVisible(true);
        return;
    }

    // 🔥 NEW: Confirm Password check
    if (formData.password !== formData.confirmPassword) {
        setAlertConfig({ 
            title: 'Password Mismatch', 
            msg: 'Passwords do not match!', 
            type: 'error' 
        });
        setAlertVisible(true);
        return;
    }

    setLoading(true);
    try {
      // 🔥 UPDATED: Web eke payload ekata samana wenna haduwa
      const payload = {
        firstName: formData.fName,
        lastName: formData.lName,
        phone: formData.phone,
        optionalPhone: formData.directPhone,
        nic: formData.nic,
        addressHouseNo: formData.houseNo, 
        addressStreet: formData.streetName,
        city: formData.town,
        district: formData.district,
        password: formData.password,
        confirmPassword: formData.confirmPassword 
      };

      const response = await api.post('/auth/register', payload);
      
      setAlertConfig({ title: 'Success', msg: 'Account created successfully!', type: 'success' });
      setAlertVisible(true);
      
      setTimeout(() => {
        setAlertVisible(false);
        navigation.navigate('Login');
      }, 2000);

    } catch (error) {
      let errorMsg = "Registration failed. Please try again.";
      
      if (error.response && error.response.data) {
        if (error.response.data.errors) {
          const firstErrorKey = Object.keys(error.response.data.errors)[0];
          errorMsg = error.response.data.errors[firstErrorKey][0];
        } else if (error.response.data.error) { // Web eke error message eka enna puluwan mehema
          errorMsg = error.response.data.error;
        } else if (error.response.data.message) {
          errorMsg = error.response.data.message;
        }
      }

      setAlertConfig({ title: 'Error', msg: errorMsg, type: 'error' });
      setAlertVisible(true);
    } finally { 
      setLoading(false); 
    }
  };

  const renderInput = (label, placeholder, key, isMandatory = true, isPassword = false, kbType = 'default') => (
    <View style={styles.inputContainer}>
      <Text style={styles.inputLabel}>{label} {isMandatory && <Text style={{color: 'red'}}>*</Text>}</Text>
      <TextInput
        placeholder={placeholder}
        placeholderTextColor="#999"
        style={styles.input}
        secureTextEntry={isPassword}
        keyboardType={kbType}
        value={formData[key]}
        onChangeText={(val) => handleChange(key, val)}
      />
    </View>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: 'white' }}>
      <CustomAlert isVisible={alertVisible} title={alertConfig.title} message={alertConfig.msg} type={alertConfig.type} onClose={() => setAlertVisible(false)} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} bounces={false}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 10, paddingBottom: 25, height: undefined }]}>
          <Image source={require('../assets/logo_white.png')} style={styles.logo} resizeMode="contain" />
        </View>
        <View style={styles.form}>
          <Text style={styles.title}>Create Account</Text>
          
          <View style={styles.row}>
            <View style={{flex: 1, marginRight: 10}}>{renderInput("First Name", "Janith", "fName")}</View>
            <View style={{flex: 1}}>{renderInput("Last Name", "Karunarathna", "lName")}</View>
          </View>

          {renderInput("Phone Number", "07********", "phone", true, false, "numeric")}
          
          {/* Direct Phone eka Optional */}
          {renderInput("Secondary Number (Optional)", "07********", "directPhone", false, false, "numeric")}
          
          {renderInput("National Identity Card (NIC)", "991922757V", "nic")}

          <Text style={{fontSize: 16, fontWeight: 'bold', marginTop: 15, marginBottom: 15, color: '#333'}}>
            Address Details
          </Text>

          <View style={styles.row}>
            <View style={{flex: 1, marginRight: 10}}>{renderInput("House No (Optional)", "102/A", "houseNo", false)}</View>
            <View style={{flex: 2}}>{renderInput("Street Name", "Wijitha Mawatha", "streetName", true)}</View>
          </View>

          {renderInput("Lane (Optional)", "Yakkala", "village", false, false)}

          <View style={styles.row}>
            <View style={{flex: 1, marginRight: 10}}>{renderInput("Town", "Yakkala", "town", true)}</View>
            <View style={{flex: 1}}>
              {/* 🔥 NEW: District Picker eka (Dropdown) */}
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>District <Text style={{color: 'red'}}>*</Text></Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={formData.district}
                    onValueChange={(itemValue) => handleChange('district', itemValue)}
                    style={styles.picker}
                  >
                    <Picker.Item label="Select District" value="" color="#999" />
                    {districtsList.map((dist, index) => (
                      <Picker.Item key={index} label={dist} value={dist} color="#000" />
                    ))}
                  </Picker>
                </View>
              </View>
            </View>
          </View>

          {/* 🔥 NEW: Password Requirements & Confirm Password Section */}
          <View style={{marginTop: 15, paddingTop: 15, borderTopWidth: 1, borderTopColor: '#eee'}}>
            {renderInput("Secure Password", "Create a strong password", "password", true, true)}
            
            <View style={styles.passwordRequirementsBox}>
              <PasswordRequirement met={passwordChecks.length} text="Minimum 8 characters long" />
              <PasswordRequirement met={passwordChecks.letters} text="Contains at least one letter" />
              <PasswordRequirement met={passwordChecks.numbers} text="Contains at least 2 numbers" />
              <PasswordRequirement met={passwordChecks.specialChar} text="Contains special character (!@#$)" />
            </View>

            {renderInput("Confirm Password", "Re-enter your password", "confirmPassword", true, true)}
          </View>

          <TouchableOpacity style={styles.btn} onPress={handleRegister} disabled={loading}>
            {loading ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>Create Account</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.footerText}>Already have an account? <Text style={{color: COLORS.primary, fontWeight:'bold'}}>Login here</Text></Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  header: { backgroundColor: COLORS.primary, height: 160, justifyContent: 'center', alignItems: 'center', borderBottomLeftRadius: 50, borderBottomRightRadius: 50 },
  logo: { width: 160, height: 60 },
  form: { padding: 25 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#333', marginBottom: 20 },
  inputContainer: { marginBottom: 15 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 5 },
  input: { backgroundColor: '#f9f9f9', borderRadius: 10, paddingHorizontal: 15, height: 50, borderWidth: 1, borderColor: '#eee', color: '#000' },
  pickerContainer: { backgroundColor: '#f9f9f9', borderRadius: 10, borderWidth: 1, borderColor: '#eee', height: 50, justifyContent: 'center' },
  picker: { height: 50, color: '#000' },
  row: { flexDirection: 'row' },
  passwordRequirementsBox: { backgroundColor: '#f5f5f5', padding: 15, borderRadius: 10, marginBottom: 15, borderWidth: 1, borderColor: '#eaeaea' },
  btn: { backgroundColor: COLORS.primary, borderRadius: 12, height: 55, justifyContent: 'center', alignItems: 'center', marginTop: 20, elevation: 4 },
  btnText: { color: 'white', fontSize: 16, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 },
  footerText: { textAlign: 'center', marginTop: 20, color: '#666' }
});

export default RegisterScreen;