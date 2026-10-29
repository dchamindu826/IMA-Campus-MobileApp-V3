import React, { useState, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Image, Platform, TextInput, Modal, Dimensions, Alert, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons'; 
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import COLORS from '../constants/colors';
import api from '../services/api';
import CustomAlert from '../components/CustomAlert';
import { WebView } from 'react-native-webview';

const { height } = Dimensions.get('window');

const correctCdmImg = require('../assets/correct-cdm.jpg');
const wrongCdmImg = require('../assets/wrong-cdm.jpg');
const correctReceiptImg = require('../assets/correct-receipt.jpg');
const wrongReceiptImg = require('../assets/wrong-receipt.jpg');

const MERCHANT_ID = "222646";

const PaymentMethodScreen = ({ route, navigation }) => {
    const { amount, businessId, batchId, groupId, subjects, payType, mainPaymentId, installmentPaymentId, systemRemark, isUpgrade, upgradesPayload } = route.params || {};

    const [method, setMethod] = useState(null); 
    const [loading, setLoading] = useState(false);
    const [slipImages, setSlipImages] = useState([]);
    const [remark, setRemark] = useState(''); 

    const [alertVisible, setAlertVisible] = useState(false);
    const [alertConfig, setAlertConfig] = useState({ title: '', msg: '', type: 'success' });
    const [showSlipInstructions, setShowSlipInstructions] = useState(false);
    const [paycorpUrl, setPaycorpUrl] = useState(null);
    const [showPaycorpModal, setShowPaycorpModal] = useState(false);

    useLayoutEffect(() => {
      navigation.setOptions({ headerShown: false });
    }, [navigation]);

    const handleOnlinePay = async () => {
      if (!amount) return;
      setLoading(true);
      try {
          const orderId = `ORD-${Date.now()}`;
          const formattedAmount = parseFloat(amount).toFixed(2);
          
          const initRes = await api.post('/student/paycorp-init', { 
              amount: formattedAmount, 
              orderId: orderId,
              businessId: businessId || 1
          });

          if (initRes.data && initRes.data.success && initRes.data.paymentUrl) {
              setPaycorpUrl(initRes.data.paymentUrl);
              setShowPaycorpModal(true);
              setLoading(false);
          } else {
              setLoading(false);
              setAlertConfig({ title: "Error", msg: "Failed to initialize Sampath IPG.", type: "error" });
              setAlertVisible(true);
          }
      } catch (e) {
          setLoading(false); 
          setAlertConfig({ title: "Error", msg: "Connection failed.", type: "error" }); 
          setAlertVisible(true);
      }
    };

    const handleWebViewNavigationStateChange = async (navState) => {
        const { url } = navState;
        if (url && url.includes('/student/paycorp-return')) {
            setShowPaycorpModal(false);
            setPaycorpUrl(null);
            
            const reqidMatch = url.match(/[?&]reqid=([^&]+)/);
            if (reqidMatch && reqidMatch[1]) {
                const reqid = reqidMatch[1];
                setLoading(true);
                try {
                    const verifyRes = await api.post('/student/paycorp-complete', { reqid, businessId });
                    if (verifyRes.data && verifyRes.data.success) {
                        await saveEnrollmentToBackend('paycorp', reqid);
                    } else {
                        setLoading(false);
                        setAlertConfig({ title: "Failed", msg: "Payment verification failed.", type: "error" }); 
                        setAlertVisible(true);
                    }
                } catch (verifyError) {
                    setLoading(false);
                    setAlertConfig({ title: "Error", msg: "Error verifying payment.", type: "error" }); 
                    setAlertVisible(true);
                }
            } else {
                setAlertConfig({ title: "Error", msg: "Payment returned without a valid ID.", type: "error" }); 
                setAlertVisible(true);
            }
        } else if (url && url.includes('/student/paycorp-cancel')) {
            setShowPaycorpModal(false);
            setPaycorpUrl(null);
            setAlertConfig({ title: "Cancelled", msg: "Payment was cancelled.", type: "error" }); 
            setAlertVisible(true);
        }
    };

    const confirmSlipInstructions = () => {
        setShowSlipInstructions(false);
        setTimeout(() => {
            Alert.alert(
                "Upload Slip",
                "Choose an option to upload your slip",
                [
                    { text: "Take Photo", onPress: openCamera },
                    { text: "Choose from Gallery", onPress: openGallery },
                    { text: "Cancel", style: "cancel" }
                ]
            );
        }, 300);
    };

    const processImages = (result) => {
        if (result.assets && result.assets.length > 0) {
            const newFiles = result.assets;
            const totalFiles = [...slipImages, ...newFiles];
            if (totalFiles.length > 4) {
                setAlertConfig({ title: "Limit Exceeded", msg: "Max 4 slips allowed.", type: "error" });
                setAlertVisible(true);
                setSlipImages(totalFiles.slice(0, 4));
            } else { setSlipImages(totalFiles); }
        }
    };

    const openCamera = async () => {
        try { const result = await launchCamera({ mediaType: 'photo', quality: 0.7 }); processImages(result); } catch (e) {}
    };

    const openGallery = async () => {
        try { const result = await launchImageLibrary({ mediaType: 'photo', quality: 0.7, selectionLimit: 4 }); processImages(result); } catch (e) {}
    };

    const removeFile = (index) => setSlipImages(slipImages.filter((_, i) => i !== index));

    const saveEnrollmentToBackend = async (paymentMethodType, payhereOrderId) => {
      setLoading(true);
      const formData = new FormData();
      
      // Combine user remark and systemRemark if exists
      const finalRemark = systemRemark ? `${systemRemark} | Student Msg: ${remark}` : remark;

      if (businessId && subjects) {
          formData.append('businessId', businessId); formData.append('batchId', batchId); formData.append('groupId', groupId);
          formData.append('subjects', JSON.stringify(subjects)); formData.append('paymentMethodChosen', payType); 
          formData.append('method', paymentMethodType); formData.append('amount', amount); 
          if (finalRemark) formData.append('remark', finalRemark); if (payhereOrderId) formData.append('orderId', payhereOrderId);
          if (isUpgrade && upgradesPayload) formData.append('upgrades', JSON.stringify(upgradesPayload));

          if (paymentMethodType === 'slip') slipImages.forEach(file => formData.append('slipImages', { uri: Platform.OS === 'android' ? file.uri : file.uri.replace('file://', ''), type: file.type || 'image/jpeg', name: file.fileName || `slip_${Date.now()}.jpg` }));

        try {
            await api.post('/student/enroll-with-slip', formData, { headers: { 'Content-Type': 'multipart/form-data', 'Accept': 'application/json' }});
            showSuccessAndExit(paymentMethodType === 'slip' ? "Enrollment successful! Awaiting verification." : "Enrollment Confirmed!");
        } catch (e) { setLoading(false); setAlertConfig({ title: "Failed", msg: "Upload failed.", type: "error" }); setAlertVisible(true); }
    } else if (mainPaymentId) {
        formData.append('paymentId', mainPaymentId);
        if (installmentPaymentId) formData.append('installmentPaymentId', installmentPaymentId);
        if (remark) formData.append('remark', remark);
        if (paymentMethodType === 'slip') slipImages.forEach(file => formData.append('slipImages', { uri: Platform.OS === 'android' ? file.uri : file.uri.replace('file://', ''), type: file.type || 'image/jpeg', name: file.fileName || `slip_${Date.now()}.jpg` }));

        try {
            await api.post('/student/upload-due-slip', formData, { headers: { 'Content-Type': 'multipart/form-data', 'Accept': 'application/json' }});
            showSuccessAndExit("Slip uploaded successfully! Awaiting verification.");
        } catch (e) { setLoading(false); setAlertConfig({ title: "Failed", msg: "Upload failed.", type: "error" }); setAlertVisible(true); }
    }
  };

  const showSuccessAndExit = (msg) => {
      setAlertConfig({ title: "Success", msg: msg, type: "success" }); setAlertVisible(true);
      setTimeout(() => { setAlertVisible(false); setTimeout(() => { navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] }); }, 300); }, 2000);
  };

  const handleFinalSubmit = () => {
      if (method === 'slip') {
          if (slipImages.length === 0) { setAlertConfig({ title: "Missing Slip", msg: "Please select a bank slip.", type: "error" }); setAlertVisible(true); return; }
          saveEnrollmentToBackend('slip', null);
      } else if (method === 'online') { handleOnlinePay(); }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} translucent={true} />
      <CustomAlert isVisible={alertVisible} title={alertConfig.title} message={alertConfig.msg} type={alertConfig.type} onClose={() => setAlertVisible(false)} />
      
      <View style={styles.redHeader}>
        <View style={styles.headerTopRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}><Icon name="arrow-left" size={24} color="white" /></TouchableOpacity>
            <View style={{flex: 1}}>
                <Text style={styles.headerCourseName}>Checkout</Text>
                <Text style={styles.stepIndicatorText}>Select Payment Method</Text>
            </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
          
          <View style={styles.amountCard}>
            <View style={styles.amountIconBox}><Icon name="wallet" size={28} color={COLORS.primary} /></View>
            <Text style={styles.label}>TOTAL PAYABLE AMOUNT</Text>
            <Text style={styles.amountText}>LKR {amount ? parseFloat(amount).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '0.00'}</Text>
          </View>

          <View style={styles.row}>
            <TouchableOpacity style={[styles.card, method === 'online' && styles.activeCard]} onPress={() => setMethod('online')}>
                <View style={[styles.methodIconBox, method === 'online' && {backgroundColor: 'rgba(255,255,255,0.2)'}]}>
                    <Icon name="credit-card-outline" size={32} color={method === 'online' ? 'white' : COLORS.primary} />
                </View>
                <Text style={[styles.cardTitle, method === 'online' && {color: 'white'}]}>Online Pay</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.card, method === 'slip' && styles.activeCard]} onPress={() => setMethod('slip')}>
                <View style={[styles.methodIconBox, method === 'slip' && {backgroundColor: 'rgba(255,255,255,0.2)'}]}>
                    <Icon name="bank-outline" size={32} color={method === 'slip' ? 'white' : COLORS.primary} />
                </View>
                <Text style={[styles.cardTitle, method === 'slip' && {color: 'white'}]}>Bank Slip</Text>
            </TouchableOpacity>
          </View>

          {method === 'online' && (
          <View style={styles.methodContainer}>
              <View style={styles.infoBox}>
                  <Icon name="shield-check" size={24} color="#10B981" />
                  <Text style={styles.infoText}>Pay securely with your Credit or Debit card via Sampath IPG.</Text>
              </View>
              <TouchableOpacity style={styles.submitBtn} onPress={handleFinalSubmit} disabled={loading}>
                  {loading ? <ActivityIndicator color="white" /> : (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={styles.btnText}>Pay LKR {parseFloat(amount).toFixed(2)}</Text>
                      <Icon name="chevron-right" size={20} color="white" style={{ marginLeft: 5 }} />
                  </View>
                  )}
              </TouchableOpacity>
          </View>
          )}

          {method === 'slip' && (
              <View style={styles.methodContainer}>
                  
                  <TouchableOpacity style={styles.uploadBox} onPress={() => setShowSlipInstructions(true)}>
                      <View style={styles.infoIconBadge}><Icon name="information-variant" size={16} color="white"/></View>
                      <View style={{flexDirection: 'row', gap: 10, marginBottom: 15}}>
                          <Icon name="cloud-upload" size={40} color="#9CA3AF" />
                          <Icon name="camera" size={40} color="#9CA3AF" />
                      </View>
                      <Text style={styles.uploadTitle}>{slipImages.length > 0 ? `${slipImages.length} File(s) Selected` : 'Tap to Upload Slip'}</Text>
                      <Text style={styles.uploadSub}>Max 4 slips allowed (JPG, PNG, PDF)</Text>
                  </TouchableOpacity>

                  {slipImages.length > 0 && (
                      <View style={{marginBottom: 20}}>
                          {slipImages.map((file, index) => (
                              <View key={index} style={styles.fileItem}>
                                  <View style={{flexDirection: 'row', alignItems: 'center', flex: 1}}>
                                      <Icon name="file-image" size={24} color={COLORS.primary} style={{marginRight: 12}}/>
                                      <Text style={styles.fileName} numberOfLines={1}>{file.fileName || `Image_${index + 1}`}</Text>
                                  </View>
                                  <TouchableOpacity onPress={() => removeFile(index)} style={styles.deleteBtn}>
                                      <Icon name="trash-can" size={18} color="#EF4444" />
                                  </TouchableOpacity>
                              </View>
                          ))}
                      </View>
                  )}

                  <Text style={styles.inputLabel}>Remark (Optional)</Text>
                  <TextInput style={styles.input} placeholder="Type any message..." placeholderTextColor="#9CA3AF" value={remark} onChangeText={setRemark} multiline={true} numberOfLines={2}/>

                  <TouchableOpacity style={[styles.submitBtn, slipImages.length === 0 && {backgroundColor: '#D1D5DB', shadowOpacity: 0}]} onPress={handleFinalSubmit} disabled={loading || slipImages.length === 0}>
                      {loading ? <ActivityIndicator color="white" /> : <Text style={styles.btnText}>Submit Payment</Text>}
                  </TouchableOpacity>
              </View>
          )}
        </ScrollView>

      <Modal visible={showPaycorpModal} animationType="slide" onRequestClose={() => { setShowPaycorpModal(false); setPaycorpUrl(null); }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
                  <TouchableOpacity onPress={() => { setShowPaycorpModal(false); setPaycorpUrl(null); }} style={{ padding: 5 }}>
                      <Icon name="close" size={24} color="#1A1A1A" />
                  </TouchableOpacity>
                  <Text style={{ marginLeft: 15, fontSize: 18, fontWeight: '700', color: '#1A1A1A' }}>Secure Payment</Text>
              </View>
              {paycorpUrl ? (
                  <WebView 
                      source={{ uri: paycorpUrl }} 
                      style={{ flex: 1 }} 
                      onNavigationStateChange={handleWebViewNavigationStateChange}
                      startInLoadingState={true}
                      renderLoading={() => <ActivityIndicator size="large" color={COLORS.primary} style={{ position: 'absolute', top: '50%', left: '50%', transform: [{translateX: -20}, {translateY: -20}] }} />}
                  />
              ) : null}
          </SafeAreaView>
      </Modal>

      <Modal visible={showSlipInstructions} transparent={true} animationType="fade">
          <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                  <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>Upload Instructions</Text>
                      <TouchableOpacity onPress={() => setShowSlipInstructions(false)} style={styles.closeModalBtn}><Icon name="close" size={20} color="#6B7280"/></TouchableOpacity>
                  </View>

                  <ScrollView showsVerticalScrollIndicator={false}>
                      <View style={styles.instructionCard}>
                          <Text style={styles.instructionTitle}><Icon name="camera" size={18}/> Bank Slip (CDM / Deposit)</Text>
                          <Text style={styles.instructionPoint}>• ස්ලිප් පතෙහි <Text style={{fontWeight: '900', color: '#1A1A1A'}}>මුලු 4ම (4 corners)</Text> පෙනෙන සේ ඡායාරූපය ගන්න.</Text>
                          <Text style={styles.instructionPoint}>• ඡායාරූපය <Text style={{fontWeight: '900', color: '#1A1A1A'}}>බොඳ නොවී</Text> පැහැදිලිව තිබිය යුතුය.</Text>
                          <Text style={styles.instructionPoint}>• <Text style={{fontWeight: '900', color: '#1A1A1A'}}>Ref No, දිනය සහ වේලාව</Text> කියවිය හැකි විය යුතුය.</Text>
                          
                          <View style={styles.imgRow}>
                              <View style={[styles.imgBox, {borderColor: '#10B981'}]}>
                                  <Image source={correctCdmImg} style={styles.instructionImg} resizeMode="contain"/>
                                  <Text style={[styles.imgLabel, {color: '#10B981'}]}><Icon name="check-circle" size={14}/> Correct</Text>
                              </View>
                              <View style={[styles.imgBox, {borderColor: '#EF4444'}]}>
                                  <Image source={wrongCdmImg} style={[styles.instructionImg, {opacity: 0.5}]} resizeMode="contain"/>
                                  <Text style={[styles.imgLabel, {color: '#EF4444'}]}><Icon name="close-circle" size={14}/> Wrong</Text>
                              </View>
                          </View>
                      </View>

                      <View style={styles.instructionCard}>
                          <Text style={styles.instructionTitle}><Icon name="cellphone" size={18}/> Online Transfers / e-Receipts</Text>
                          <Text style={styles.instructionPoint}>• <Text style={{fontWeight: '900', color: '#1A1A1A'}}>Ref No, දිනය සහ වේලාව</Text> අනිවාර්යයෙන්ම දිස්විය යුතුය.</Text>
                          <Text style={styles.instructionPoint}>• ස්ක්‍රීන්ෂොට් එක (crop) නොමැතිව <Text style={{fontWeight: '900', color: '#1A1A1A'}}>සම්පූර්ණයෙන්ම</Text> උඩුගත කරන්න.</Text>
                          
                          <View style={styles.imgRow}>
                              <View style={[styles.imgBox, {borderColor: '#10B981'}]}>
                                  <Image source={correctReceiptImg} style={styles.instructionImg} resizeMode="contain"/>
                                  <Text style={[styles.imgLabel, {color: '#10B981'}]}><Icon name="check-circle" size={14}/> Correct</Text>
                              </View>
                              <View style={[styles.imgBox, {borderColor: '#EF4444'}]}>
                                  <Image source={wrongReceiptImg} style={[styles.instructionImg, {opacity: 0.5}]} resizeMode="contain"/>
                                  <Text style={[styles.imgLabel, {color: '#EF4444'}]}><Icon name="close-circle" size={14}/> Wrong</Text>
                              </View>
                          </View>
                      </View>

                      <TouchableOpacity style={styles.understandBtn} onPress={confirmSlipInstructions}>
                          <Text style={styles.understandBtnText}>I Understand (Upload)</Text>
                      </TouchableOpacity>
                  </ScrollView>
              </View>
          </View>
      </Modal>
    </View>
  );
};

const STATUSBAR_HEIGHT = Platform.OS === 'ios' ? 50 : StatusBar.currentHeight || 24;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7FA' },
  mainBackground: { flex: 1 },
  
  redHeader: { 
    backgroundColor: COLORS.primary, 
    paddingHorizontal: 20, 
    paddingBottom: 25, 
    paddingTop: STATUSBAR_HEIGHT + 10, 
    borderBottomLeftRadius: 35, 
    borderBottomRightRadius: 35, 
    elevation: 8, zIndex: 10,
    shadowColor: COLORS.primary, shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.3, shadowRadius: 10
  },
  headerTopRow: { flexDirection: 'row', alignItems: 'center' },
  backBtn: { marginRight: 15, padding: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12 },
  headerCourseName: { fontSize: 22, fontWeight: '900', color: 'white', letterSpacing: 0.5 },
  stepIndicatorText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '700', marginTop: 2, textTransform: 'uppercase', letterSpacing: 1 },
  
  amountCard: { backgroundColor: 'white', padding: 25, borderRadius: 24, marginBottom: 20, alignItems: 'center', borderWidth: 1, borderColor: '#F3F4F6', elevation: 2, shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.05, shadowRadius: 5 },
  amountIconBox: { width: 50, height: 50, borderRadius: 15, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  label: { fontSize: 11, color: '#6B7280', fontWeight: '800', letterSpacing: 1.5, marginBottom: 4 },
  amountText: { fontSize: 32, fontWeight: '900', color: '#1A1A1A' },
  
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  card: { width: '48%', padding: 20, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#fff', elevation: 1 },
  activeCard: { backgroundColor: COLORS.primary, borderColor: COLORS.primary, elevation: 5, shadowColor: COLORS.primary, shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.3, shadowRadius: 8 },
  methodIconBox: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontWeight: '800', fontSize: 15, color: '#1A1A1A' },
  
  methodContainer: { marginTop: 25 },
  infoBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', padding: 15, borderRadius: 16, marginBottom: 20, borderWidth: 1, borderColor: '#10B981', borderStyle: 'dashed' },
  infoText: { color: '#047857', fontSize: 13, fontWeight: '700', marginLeft: 10, flex: 1 },
  
  inputLabel: { fontSize: 12, color: '#6B7280', marginBottom: 8, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  input: { backgroundColor: 'white', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 16, padding: 16, marginBottom: 25, color: '#1A1A1A', fontSize: 14, fontWeight: '600', minHeight: 60, textAlignVertical: 'top' },
  
  uploadBox: { height: 160, backgroundColor: 'white', borderRadius: 24, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#D1D5DB', borderStyle: 'dashed', marginBottom: 25, position: 'relative' },
  infoIconBadge: { position: 'absolute', top: 12, right: 12, backgroundColor: COLORS.primary, padding: 6, borderRadius: 10 },
  uploadTitle: { color: '#374151', fontWeight: '900', fontSize: 15 },
  uploadSub: { color: '#9CA3AF', fontSize: 11, fontWeight: '700', marginTop: 6 },
  
  fileItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  fileName: { fontSize: 13, fontWeight: '800', color: '#374151' },
  deleteBtn: { backgroundColor: '#FEE2E2', padding: 8, borderRadius: 10 },

  submitBtn: { backgroundColor: COLORS.primary, padding: 18, borderRadius: 16, alignItems: 'center', elevation: 5, shadowColor: COLORS.primary, shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.3, shadowRadius: 5 },
  btnText: { color: 'white', fontWeight: '900', fontSize: 16, letterSpacing: 0.5, textTransform: 'uppercase' },

  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 30, padding: 25, maxHeight: height * 0.85, elevation: 10 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '900', color: '#1A1A1A' },
  closeModalBtn: { backgroundColor: '#F3F4F6', padding: 8, borderRadius: 12 },
  
  instructionCard: { backgroundColor: '#F9FAFB', padding: 18, borderRadius: 20, marginBottom: 15, borderWidth: 1, borderColor: '#E5E7EB' },
  instructionTitle: { color: COLORS.primary, fontWeight: '900', fontSize: 15, marginBottom: 10 },
  instructionPoint: { fontSize: 12, color: '#4B5563', marginBottom: 6, fontWeight: '600', lineHeight: 18 },
  imgRow: { flexDirection: 'row', gap: 12, marginTop: 10 },
  imgBox: { flex: 1, backgroundColor: 'white', padding: 10, borderRadius: 16, borderWidth: 2, alignItems: 'center' },
  instructionImg: { width: '100%', height: 70, borderRadius: 8, marginBottom: 8 },
  imgLabel: { fontSize: 11, fontWeight: '900', flexDirection: 'row', alignItems: 'center' },
  
  understandBtn: { backgroundColor: COLORS.primary, padding: 16, borderRadius: 16, alignItems: 'center', marginTop: 10 },
  understandBtnText: { color: 'white', fontWeight: '900', fontSize: 15, textTransform: 'uppercase', letterSpacing: 0.5 }
});

export default PaymentMethodScreen;