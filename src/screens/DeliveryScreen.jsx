import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ScrollView, Modal, ActivityIndicator, Alert, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { WebView } from 'react-native-webview';
import moment from 'moment';

import api, { IMAGE_URL } from '../services/api';
import COLORS from '../constants/colors';
import CustomAlert from '../components/CustomAlert';

const COURIER_URL = "https://www.fdedomestic.com/";

const DeliveryScreen = ({ navigation }) => {
    const insets = useSafeAreaInsets();
    const [deliveries, setDeliveries] = useState([]);
    const [loading, setLoading] = useState(true);
    const [trackingModalOpen, setTrackingModalOpen] = useState(false);

    const [alertVisible, setAlertVisible] = useState(false);
    const [alertConfig, setAlertConfig] = useState({ title: '', msg: '', type: 'success' });

    useEffect(() => {
        fetchDeliveries();
    }, []);

    const fetchDeliveries = async () => {
        setLoading(true);
        try {
            const res = await api.get('/student/deliveries');
            setDeliveries(res.data || []);
        } catch (error) {
            showAlert("Error", "Failed to load delivery details.", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleStatusConfirm = async (deliveryId, status) => {
        try {
            await api.post('/student/deliveries/confirm', { deliveryId, status });
            showAlert("Success", `Marked as ${status}`, "success");
            fetchDeliveries();
        } catch (error) {
            showAlert("Error", "Failed to update status.", "error");
        }
    };

    const showAlert = (title, msg, type) => {
        setAlertConfig({ title, msg, type });
        setAlertVisible(true);
    };

    const copyToClipboard = (text) => {
        try {
            const Clipboard = require('@react-native-clipboard/clipboard').default;
            Clipboard.setString(text);
        } catch (e) {
            console.log("Clipboard not available in binary:", e);
        }
        showAlert("Copied", `Tracking number copied to clipboard!`, "success");
    };

    const renderDeliveryCard = ({ item: delivery }) => {
        const isHold = delivery.status === 'Hold';
        const isNotReceived = delivery.status === 'Not Received';
        const isDelivered = delivery.status === 'Received';
        const isOnTheWay = delivery.status === 'On the way' || isDelivered || isNotReceived;
        const isPacked = delivery.status === 'Packed' || isOnTheWay || isHold;

        const getTuteImgUrl = (imageName) => (!imageName || imageName === 'default-tute.png' || imageName === 'null') ? null : `${IMAGE_URL}icons/${imageName}`;

        return (
            <View style={styles.card}>
                
                {/* Hold Banner */}
                {isHold && (
                    <View style={styles.holdBanner}>
                        <Icon name="alert-circle-outline" size={20} color="#F97316" />
                        <View style={{ marginLeft: 10, flex: 1 }}>
                            <Text style={styles.holdTitle}>Delivery on Hold</Text>
                            <Text style={styles.holdText}>Reason: <Text style={{ fontWeight: 'bold' }}>{delivery.holdReason}</Text></Text>
                            {delivery.holdRemark && <Text style={styles.holdRemark}>"{delivery.holdRemark}"</Text>}
                        </View>
                    </View>
                )}

                {/* Not Received Banner */}
                {isNotReceived && (
                    <View style={styles.errorBanner}>
                        <Icon name="close-circle-outline" size={20} color="#EF4444" />
                        <Text style={styles.errorText}>You reported this as Not Received. Our team will contact you shortly.</Text>
                    </View>
                )}

                {/* Order Details Header */}
                <View style={styles.orderHeader}>
                    <View style={styles.orderIdBadge}>
                        <Text style={styles.orderIdText}>ORD-{delivery.id}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Icon name="clock-outline" size={14} color="#64748B" />
                        <Text style={styles.orderDateText}>{moment(delivery.createdAt).format('YYYY/MM/DD')}</Text>
                    </View>
                </View>

                {/* Packer Remark */}
                {delivery.packRemark && (
                    <View style={styles.packRemarkBox}>
                        <Icon name="alert-outline" size={18} color="#EAB308" />
                        <View style={{ marginLeft: 10, flex: 1 }}>
                            <Text style={styles.packRemarkTitle}>Packer's Remark</Text>
                            <Text style={styles.packRemarkText}>"{delivery.packRemark}"</Text>
                        </View>
                    </View>
                )}

                {/* Tracking Section */}
                {delivery.trackingNumber && (
                    <View style={styles.trackingBox}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                            <Icon name="truck-outline" size={16} color="#3B82F6" />
                            <Text style={styles.trackingTitle}>Live Tracking details</Text>
                        </View>

                        <View style={styles.trackingRow}>
                            <View style={styles.trackingNumberBox}>
                                <Text style={styles.trackingNumberText}>{delivery.trackingNumber}</Text>
                                <TouchableOpacity onPress={() => copyToClipboard(delivery.trackingNumber)} style={styles.copyBtn}>
                                    <Icon name="content-copy" size={18} color="#94A3B8" />
                                </TouchableOpacity>
                            </View>
                            <TouchableOpacity onPress={() => setTrackingModalOpen(true)} style={styles.trackBtn}>
                                <Icon name="web" size={18} color="white" />
                                <Text style={styles.trackBtnText}>Track</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.trackingNote}>💡 Copy tracking number and click Track to view location.</Text>
                    </View>
                )}

                {/* Items */}
                <Text style={styles.itemsSectionTitle}>Included Study Materials</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                    {delivery.items?.map((item, idx) => {
                        const covers = item.tuteCovers?.length > 0 ? item.tuteCovers : (item.tuteImage || item.tuteCover ? [item.tuteImage || item.tuteCover] : []); 
                        
                        return (
                            <View key={idx} style={styles.itemBox}>
                                <View style={{ flex: 1, paddingRight: 10 }}>
                                    <Text style={styles.itemName} numberOfLines={2}>{item.tuteName}</Text>
                                    <View style={styles.qtyBadge}>
                                        <Text style={styles.qtyText}>Qty: {item.quantity}</Text>
                                    </View>
                                </View>
                                <View style={{ flexDirection: 'row' }}>
                                    {covers.length > 0 ? covers.map((c, i) => {
                                        const imgUrl = getTuteImgUrl(c);
                                        return imgUrl ? (
                                            <Image key={i} source={{ uri: imgUrl }} style={styles.itemImage} />
                                        ) : (
                                            <View key={i} style={styles.itemImagePlaceholder}><Icon name="image-outline" size={20} color="#94A3B8" /></View>
                                        );
                                    }) : (
                                        <View style={styles.itemImagePlaceholder}><Icon name="image-outline" size={20} color="#94A3B8" /></View>
                                    )}
                                </View>
                            </View>
                        );
                    })}
                </ScrollView>

                {/* Timeline */}
                <View style={styles.timelineContainer}>
                    <Text style={styles.timelineTitle}>Status Timeline</Text>
                    
                    <View style={styles.timelineStep}>
                        <View style={[styles.timelineDot, { borderColor: '#3B82F6' }]}>
                            <Icon name="check" size={12} color="#3B82F6" />
                        </View>
                        <View style={styles.timelineLine} />
                        <View style={styles.timelineContent}>
                            <Text style={styles.timelineStepTitle}>Order Processing</Text>
                            <Text style={styles.timelineStepSub}>Payment Verified</Text>
                        </View>
                    </View>

                    <View style={styles.timelineStep}>
                        <View style={[styles.timelineDot, (isPacked && !isHold) ? { borderColor: '#3B82F6' } : { borderColor: '#CBD5E1' }]}>
                            {(isPacked && !isHold) && <Icon name="check" size={12} color="#3B82F6" />}
                        </View>
                        <View style={styles.timelineLine} />
                        <View style={styles.timelineContent}>
                            <Text style={[styles.timelineStepTitle, !(isPacked && !isHold) && { color: '#94A3B8' }]}>Packed</Text>
                            <Text style={styles.timelineStepSub}>Ready for Courier</Text>
                        </View>
                    </View>

                    <View style={[styles.timelineStep, { marginBottom: 0 }]}>
                        <View style={[styles.timelineDot, (isOnTheWay && !isHold) ? { borderColor: '#3B82F6' } : { borderColor: '#CBD5E1' }]}>
                            {(isOnTheWay && !isHold) && <Icon name="check" size={12} color="#3B82F6" />}
                        </View>
                        <View style={styles.timelineContent}>
                            <Text style={[styles.timelineStepTitle, !(isOnTheWay && !isHold) && { color: '#94A3B8' }]}>Dispatched</Text>
                            <Text style={styles.timelineStepSub}>Handed over to courier</Text>
                        </View>
                    </View>
                </View>

                {/* Actions */}
                {delivery.status === 'On the way' && (
                    <View style={styles.actionsContainer}>
                        <Text style={styles.actionsPrompt}>Did you receive the package?</Text>
                        <TouchableOpacity style={styles.btnReceived} onPress={() => handleStatusConfirm(delivery.id, 'Received')}>
                            <Icon name="check-circle" size={18} color="white" />
                            <Text style={styles.btnReceivedText}>Yes, Received</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.btnNotReceived} onPress={() => handleStatusConfirm(delivery.id, 'Not Received')}>
                            <Text style={styles.btnNotReceivedText}>Not Yet</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Delivered Status */}
                {isDelivered && (
                    <View style={styles.deliveredBox}>
                        <Icon name="check-circle" size={20} color="#10B981" />
                        <Text style={styles.deliveredText}>Delivered Successfully</Text>
                    </View>
                )}

            </View>
        );
    };

    return (
        <View style={styles.container}>
            <CustomAlert isVisible={alertVisible} title={alertConfig.title} message={alertConfig.msg} type={alertConfig.type} onClose={() => setAlertVisible(false)} />
            
            {/* Header */}
            <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 5, marginRight: 15 }}>
                    <Icon name="arrow-left" size={28} color="white" />
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={styles.headerTitle}>Delivery Hub</Text>
                    <Text style={styles.headerSubtitle}>Track your study materials</Text>
                </View>
                <View style={styles.headerIconBox}>
                    <Icon name="truck-delivery-outline" size={28} color="white" />
                </View>
            </View>

            {loading ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color={COLORS.primary} />
                </View>
            ) : deliveries.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <View style={styles.emptyIconBox}>
                        <Icon name="package-variant" size={50} color="#CBD5E1" />
                    </View>
                    <Text style={styles.emptyTitle}>No Active Deliveries</Text>
                    <Text style={styles.emptySub}>Your tute dispatch details will appear here.</Text>
                </View>
            ) : (
                <FlatList
                    data={deliveries}
                    keyExtractor={item => item.id.toString()}
                    renderItem={renderDeliveryCard}
                    contentContainerStyle={{ padding: 15, paddingBottom: 50 }}
                    showsVerticalScrollIndicator={false}
                />
            )}

            {/* Tracking Modal */}
            <Modal visible={trackingModalOpen} animationType="slide" onRequestClose={() => setTrackingModalOpen(false)}>
                <View style={{ flex: 1, backgroundColor: '#F8FAFC', paddingTop: Math.max(insets.top, 20) + 8 }}>
                    <View style={styles.modalHeader}>
                        <TouchableOpacity onPress={() => setTrackingModalOpen(false)} style={{ padding: 5 }}>
                            <Icon name="close" size={24} color="#1E293B" />
                        </TouchableOpacity>
                        <Text style={styles.modalTitle}>Courier Tracking</Text>
                        <View style={{ width: 34 }} />
                    </View>
                    
                    <WebView 
                        source={{ uri: COURIER_URL }}
                        style={{ flex: 1 }}
                        startInLoadingState={true}
                        renderLoading={() => <ActivityIndicator size="large" color={COLORS.primary} style={styles.webviewLoader} />}
                    />
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F1F5F9' },
    centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    
    header: { backgroundColor: COLORS.primary, flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: 10, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, elevation: 5 },
    headerTitle: { color: 'white', fontSize: 24, fontWeight: 'bold' },
    headerSubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 2 },
    headerIconBox: { width: 50, height: 50, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
    
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
    emptyIconBox: { width: 100, height: 100, backgroundColor: 'white', borderRadius: 50, justifyContent: 'center', alignItems: 'center', marginBottom: 20, elevation: 2 },
    emptyTitle: { fontSize: 22, fontWeight: 'bold', color: '#1E293B', marginBottom: 10 },
    emptySub: { fontSize: 14, color: '#64748B', textAlign: 'center' },
    
    card: { backgroundColor: 'white', borderRadius: 20, padding: 20, marginBottom: 20, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 5 },
    
    holdBanner: { backgroundColor: '#FFF7ED', borderColor: '#FFEDD5', borderWidth: 1, borderRadius: 12, padding: 15, flexDirection: 'row', alignItems: 'flex-start', marginBottom: 15 },
    holdTitle: { color: '#EA580C', fontSize: 13, fontWeight: 'bold', textTransform: 'uppercase' },
    holdText: { color: '#334155', fontSize: 13, marginTop: 4 },
    holdRemark: { color: '#64748B', fontSize: 12, fontStyle: 'italic', marginTop: 4, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: '#FDBA74' },
    
    errorBanner: { backgroundColor: '#FEF2F2', borderColor: '#FEE2E2', borderWidth: 1, borderRadius: 12, padding: 15, flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
    errorText: { color: '#EF4444', fontSize: 13, fontWeight: 'bold', marginLeft: 10, flex: 1 },
    
    orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    orderIdBadge: { backgroundColor: '#EFF6FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
    orderIdText: { color: '#2563EB', fontWeight: 'bold', fontSize: 13 },
    orderDateText: { color: '#64748B', fontSize: 13, marginLeft: 5, fontWeight: '500' },
    
    packRemarkBox: { backgroundColor: '#FEF9C3', borderColor: '#FEF08A', borderWidth: 1, borderRadius: 12, padding: 15, flexDirection: 'row', alignItems: 'flex-start', marginBottom: 15 },
    packRemarkTitle: { color: '#CA8A04', fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 2 },
    packRemarkText: { color: '#334155', fontSize: 13, fontStyle: 'italic' },
    
    trackingBox: { backgroundColor: '#EFF6FF', borderColor: '#DBEAFE', borderWidth: 1, borderRadius: 15, padding: 15, marginBottom: 20 },
    trackingTitle: { color: '#2563EB', fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', marginLeft: 6 },
    trackingRow: { flexDirection: 'row', alignItems: 'center' },
    trackingNumberBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginRight: 10, elevation: 1 },
    trackingNumberText: { flex: 1, color: '#1E293B', fontSize: 15, fontWeight: 'bold', letterSpacing: 1 },
    copyBtn: { padding: 5 },
    trackBtn: { backgroundColor: '#2563EB', paddingHorizontal: 15, paddingVertical: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center', elevation: 2 },
    trackBtnText: { color: 'white', fontWeight: 'bold', marginLeft: 5 },
    trackingNote: { color: '#60A5FA', fontSize: 11, marginTop: 10 },
    
    itemsSectionTitle: { color: '#64748B', fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
    itemBox: { backgroundColor: '#F8FAFC', borderRadius: 15, padding: 15, width: 260, marginRight: 15, flexDirection: 'row', justifyContent: 'space-between', elevation: 1 },
    itemName: { color: '#1E293B', fontSize: 14, fontWeight: 'bold', marginBottom: 8 },
    qtyBadge: { backgroundColor: '#D1FAE5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start' },
    qtyText: { color: '#059669', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' },
    itemImage: { width: 45, height: 60, borderRadius: 6, marginLeft: 5, backgroundColor: '#E2E8F0' },
    itemImagePlaceholder: { width: 45, height: 60, borderRadius: 6, marginLeft: 5, backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' },
    
    timelineContainer: { backgroundColor: '#F8FAFC', borderRadius: 15, padding: 15, marginBottom: 20, borderWidth: 1, borderColor: '#F1F5F9' },
    timelineTitle: { color: '#64748B', fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 15 },
    timelineStep: { flexDirection: 'row', marginBottom: 20, position: 'relative' },
    timelineDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center', zIndex: 2 },
    timelineLine: { position: 'absolute', left: 10, top: 20, bottom: -22, width: 2, backgroundColor: '#E2E8F0', zIndex: 1 },
    timelineContent: { marginLeft: 15, flex: 1, justifyContent: 'center' },
    timelineStepTitle: { color: '#1E293B', fontSize: 14, fontWeight: 'bold' },
    timelineStepSub: { color: '#64748B', fontSize: 11, textTransform: 'uppercase', marginTop: 2 },
    
    actionsContainer: { backgroundColor: '#EFF6FF', borderRadius: 15, padding: 15, alignItems: 'center' },
    actionsPrompt: { color: '#3B82F6', fontSize: 12, fontWeight: 'bold', marginBottom: 12 },
    btnReceived: { backgroundColor: '#10B981', width: '100%', paddingVertical: 12, borderRadius: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 10, elevation: 2 },
    btnReceivedText: { color: 'white', fontWeight: 'bold', textTransform: 'uppercase', marginLeft: 8 },
    btnNotReceived: { backgroundColor: 'white', width: '100%', paddingVertical: 12, borderRadius: 10, justifyContent: 'center', alignItems: 'center', elevation: 1 },
    btnNotReceivedText: { color: '#64748B', fontWeight: 'bold' },
    
    deliveredBox: { backgroundColor: '#D1FAE5', borderRadius: 12, padding: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
    deliveredText: { color: '#059669', fontWeight: 'bold', marginLeft: 8, textTransform: 'uppercase' },

    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
    modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#1E293B' },
    webviewLoader: { position: 'absolute', top: '50%', left: '50%', transform: [{translateX: -20}, {translateY: -20}] }
});

export default DeliveryScreen;
