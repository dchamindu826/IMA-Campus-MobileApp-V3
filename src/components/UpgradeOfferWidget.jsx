import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Dimensions, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import api, { IMAGE_URL } from '../services/api';
import COLORS from '../constants/colors';

const { width } = Dimensions.get('window');

const UpgradeOfferWidget = ({ navigation, triggerShow }) => {
    const [eligible, setEligible] = useState(false);
    const [pendingUpgrade, setPendingUpgrade] = useState(false);
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState(null);
    const [showModal, setShowModal] = useState(false);

    // Subjects selection
    const [selectedSubjects, setSelectedSubjects] = useState([]);
    const [selectedUpgradeMethod, setSelectedUpgradeMethod] = useState('full'); // 'full' or 'installment'

    useEffect(() => {
        const checkEligibility = async () => {
            try {
                const res = await api.get('upgrade-pricing/calculate');
                if (res.data && res.data.eligible) {
                    setEligible(true);
                    setData(res.data);

                    // Show modal on load if not pending
                    if (res.data.showUpgradeOffer !== false) {
                        setTimeout(() => setShowModal(true), 1500);
                    }
                } else if (res.data && res.data.pendingUpgrade) {
                    setPendingUpgrade(true);
                    setData(res.data);
                }
            } catch (err) {
                console.error("Error checking upgrade eligibility:", err);
            } finally {
                setLoading(false);
            }
        };
        checkEligibility();
    }, []);

    useEffect(() => {
        if (triggerShow && eligible) setShowModal(true);
    }, [triggerShow, eligible]);

    const formatPrice = (num) => {
        if (num === undefined || num === null) return '0.00';
        return Number(num).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
    };

    const getPricing = () => {
        if (!data || !data.batches || selectedSubjects.length === 0) {
            return { subtotal: 0, bundleDiscount: 0, monthlyPaid: 0, balanceToPay: 0, installments: [] };
        }

        let totalSubtotal = 0;
        let totalBundleDiscount = 0;
        let totalMonthlyPaid = 0;
        let totalBalanceToPay = 0;
        const combinedInstallmentsMap = {};

        data.batches.forEach(batch => {
            const batchSelectedSubjects = (batch.subjects || []).filter(id => selectedSubjects.includes(id));
            if (batchSelectedSubjects.length === 0) return;

            const selectedDetails = (batch.subjectDetails || []).filter(sub => selectedSubjects.includes(sub.id));
            const subtotal = selectedDetails.reduce((sum, sub) => sum + sub.upgradeFullTarget, 0);
            totalSubtotal += subtotal;

            let bundleDiscount = 0;
            const batchSelectedCount = batchSelectedSubjects.length;
            const rich = batch.richConfig;

            if (rich && rich.enableBundle) {
                const bundleSubIds = (rich.bundleSubjects || []).map(x => parseInt(x));
                const allSelectedAreEligible = batchSelectedSubjects.every(id => bundleSubIds.includes(id));
                if (allSelectedAreEligible) {
                    if (batchSelectedCount === 2 && rich.bundle2Price > 0) {
                        bundleDiscount = Math.max(0, subtotal - rich.bundle2Price);
                    } else if (batchSelectedCount === 3 && rich.bundle3Price > 0) {
                        bundleDiscount = Math.max(0, subtotal - rich.bundle3Price);
                    }
                }
            }

            if (bundleDiscount === 0 && batch.bundleDiscountsMap && batch.bundleDiscountsMap[batchSelectedCount] !== undefined) {
                bundleDiscount = batch.bundleDiscountsMap[batchSelectedCount];
            }
            const activeBundleDiscount = selectedUpgradeMethod === 'installment' ? 0 : bundleDiscount;
            totalBundleDiscount += activeBundleDiscount;

            let monthlyPaid = 0;
            if (batch.paidMonthlyPerSubject) {
                batchSelectedSubjects.forEach(id => {
                    monthlyPaid += batch.paidMonthlyPerSubject[id] || 0;
                });
            } else {
                monthlyPaid = (batch.totalPaidMonthly / (batch.subjectDetails?.length || 1)) * batchSelectedSubjects.length;
            }
            totalMonthlyPaid += monthlyPaid;

            const balanceToPay = Math.max(0, subtotal - activeBundleDiscount - monthlyPaid);
            totalBalanceToPay += balanceToPay;

            if (batch.richConfig?.enableInstallments) {
                const allSelectedAreEligible = batchSelectedSubjects.every(id => (batch.richConfig.installmentSubjects || []).includes(id));
                if (allSelectedAreEligible) {
                    let templateSteps = [];
                    if (batchSelectedCount === 1) templateSteps = batch.richConfig.installments1 || [];
                    else if (batchSelectedCount === 2) templateSteps = batch.richConfig.installments2 || [];
                    else if (batchSelectedCount === 3) templateSteps = batch.richConfig.installments3 || [];

                    if (templateSteps.length > 0) {
                        templateSteps.forEach((step, i) => {
                            const stepNum = i + 1;
                            if (!combinedInstallmentsMap[stepNum]) combinedInstallmentsMap[stepNum] = 0;
                            combinedInstallmentsMap[stepNum] += step.amount;
                        });
                    }
                }
            } else {
                selectedDetails.forEach(sub => {
                    if (sub.installmentSteps) {
                        sub.installmentSteps.forEach(step => {
                            const stepNum = step.installmentNum;
                            if (!combinedInstallmentsMap[stepNum]) combinedInstallmentsMap[stepNum] = 0;
                            combinedInstallmentsMap[stepNum] += step.amount;
                        });
                    }
                });
            }
        });

        const installments = Object.keys(combinedInstallmentsMap)
            .sort((a, b) => parseInt(a) - parseInt(b))
            .map(num => ({
                installmentNum: parseInt(num),
                amount: combinedInstallmentsMap[num]
            }));

        return { subtotal: totalSubtotal, bundleDiscount: totalBundleDiscount, monthlyPaid: totalMonthlyPaid, balanceToPay: totalBalanceToPay, installments };
    };

    const toggleSubject = (id) => {
        setSelectedSubjects(prev =>
            prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
        );
    };

    const handleProceed = () => {
        if (selectedSubjects.length === 0) {
            return;
        }

        const pricingResult = getPricing();
        const isInstallment = selectedUpgradeMethod === 'installment';

        let activeBalance = isInstallment && pricingResult.installments.length > 0
            ? pricingResult.installments[0].amount
            : pricingResult.balanceToPay;

        let pMethodChosen = isInstallment ? 'installment' : 'full';

        const upgradesPayload = [];
        let systemRemark = '';

        data.batches.forEach(batch => {
            const batchSelectedSubjects = (batch.subjects || []).filter(id => selectedSubjects.includes(id));
            if (batchSelectedSubjects.length === 0) return;

            const selectedDetails = (batch.subjectDetails || []).filter(sub => selectedSubjects.includes(sub.id));
            const subtotal = selectedDetails.reduce((sum, sub) => sum + sub.upgradeFullTarget, 0);

            let bundleDiscount = 0;
            const batchSelectedCount = batchSelectedSubjects.length;
            const rich = batch.richConfig;
            if (rich && rich.enableBundle) {
                const bundleSubIds = (rich.bundleSubjects || []).map(x => parseInt(x));
                const allSelectedAreEligible = batchSelectedSubjects.every(id => bundleSubIds.includes(id));
                if (allSelectedAreEligible) {
                    if (batchSelectedCount === 2 && rich.bundle2Price > 0) bundleDiscount = Math.max(0, subtotal - rich.bundle2Price);
                    else if (batchSelectedCount === 3 && rich.bundle3Price > 0) bundleDiscount = Math.max(0, subtotal - rich.bundle3Price);
                }
            }
            if (bundleDiscount === 0 && batch.bundleDiscountsMap && batch.bundleDiscountsMap[batchSelectedCount] !== undefined) {
                bundleDiscount = batch.bundleDiscountsMap[batchSelectedCount];
            }
            const activeBundleDiscount = pMethodChosen === 'installment' ? 0 : bundleDiscount;

            let monthlyPaid = 0;
            if (batch.paidMonthlyPerSubject) {
                batchSelectedSubjects.forEach(id => {
                    monthlyPaid += batch.paidMonthlyPerSubject[id] || 0;
                });
            } else {
                monthlyPaid = (batch.totalPaidMonthly / (batch.subjectDetails?.length || 1)) * batchSelectedSubjects.length;
            }

            let batchAmount = 0;
            let batchInstallments = null;

            if (pMethodChosen === 'installment') {
                let firstInstallmentAmount = 0;
                if (batch.richConfig?.enableInstallments) {
                    const allSelectedAreEligible = batchSelectedSubjects.every(id => (batch.richConfig.installmentSubjects || []).includes(id));
                    if (allSelectedAreEligible) {
                        let templateSteps = [];
                        if (batchSelectedCount === 1) templateSteps = batch.richConfig.installments1 || [];
                        else if (batchSelectedCount === 2) templateSteps = batch.richConfig.installments2 || [];
                        else if (batchSelectedCount === 3) templateSteps = batch.richConfig.installments3 || [];
                        if (templateSteps.length > 0) {
                            firstInstallmentAmount = templateSteps[0].amount;
                            batchInstallments = templateSteps;
                        }
                    }
                } else {
                    selectedDetails.forEach(sub => {
                        if (sub.installmentSteps && sub.installmentSteps.length > 0) {
                            firstInstallmentAmount += sub.installmentSteps[0].amount;
                        }
                    });
                }
                batchAmount = firstInstallmentAmount;
            } else {
                batchAmount = Math.max(0, subtotal - activeBundleDiscount - monthlyPaid);
            }

            const batchRemarkDetails = pMethodChosen === 'installment'
                ? `[UPGRADE]: Transitioned to Installment Card (Installment #1 paid upfront). Amount: LKR ${formatPrice(batchAmount)}`
                : `[UPGRADE]: Transitioned from Monthly to FULL Card. Upgrade Balance: LKR ${formatPrice(batchAmount)}`;

            systemRemark += `${batchRemarkDetails}. Prev Paid: LKR ${formatPrice(monthlyPaid)}\n`;

            upgradesPayload.push({
                businessId: batch.businessId,
                batchId: batch.batchId,
                groupId: batch.groupId,
                subjects: batchSelectedSubjects,
                paymentMethodChosen: pMethodChosen,
                paymentType: pMethodChosen === 'installment' ? 2 : 3,
                amount: batchAmount,
                installments: batchInstallments,
                remark: `${batchRemarkDetails}. Prev Paid: LKR ${formatPrice(monthlyPaid)}`
            });
        });

        setShowModal(false);
        navigation.navigate('PaymentMethod', {
            amount: activeBalance.toString(),
            businessId: upgradesPayload[0]?.businessId,
            batchId: upgradesPayload[0]?.batchId,
            groupId: upgradesPayload[0]?.groupId,
            subjects: selectedSubjects,
            payType: pMethodChosen,
            systemRemark: systemRemark.trim(),
            isUpgrade: true,
            upgradesPayload: upgradesPayload
        });
    };

    if (loading) return null;

    if (!eligible && pendingUpgrade) {
        return (
            <View style={styles.bannerContainer}>
                <LinearGradient colors={['#F59E0B', '#D97706']} style={styles.banner}>
                    <View style={styles.bannerContent}>
                        <Icon name="timer-sand" size={24} color="#FFF" />
                        <View style={styles.bannerTextContainer}>
                            <Text style={styles.bannerTitle}>Upgrade Pending Verification</Text>
                            <Text style={styles.bannerSub}>Your upgrade request is being verified.</Text>
                        </View>
                    </View>
                </LinearGradient>
            </View>
        );
    }

    if (!eligible) return null;

    const pricing = getPricing();
    const showInstallmentToggle = data?.richConfig?.enableInstallments &&
        [1, 2, 3].includes(selectedSubjects.length) &&
        pricing.installments.length > 0;

    return (
        <>
            <View style={styles.bannerContainer}>
                <TouchableOpacity onPress={() => setShowModal(true)} activeOpacity={0.9}>
                    <LinearGradient colors={[COLORS.primary, '#9B1B1B']} style={styles.banner}>
                        <View style={styles.bannerContent}>
                            <Icon name="star-circle" size={32} color="#FBBF24" />
                            <View style={styles.bannerTextContainer}>
                                <Text style={styles.bannerTitle}>Special Upgrade Offer!</Text>
                                <Text style={styles.bannerSub}>Upgrade to a Full Card & Save Big.</Text>
                            </View>
                            <Icon name="chevron-right" size={24} color="#FFF" />
                        </View>
                    </LinearGradient>
                </TouchableOpacity>
            </View>

            <Modal visible={showModal} transparent={true} animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <View style={styles.modalHeader}>
                                <View style={styles.modalHeaderIcon}>
                                    <Icon name="trending-up" size={24} color={COLORS.primary} />
                                </View>
                                <Text style={styles.modalTitle}>Upgrade Your Classes</Text>
                                <TouchableOpacity onPress={() => setShowModal(false)} style={styles.closeBtn}>
                                    <Icon name="close" size={20} color="#666" />
                                </TouchableOpacity>
                            </View>

                            <Text style={styles.stepTitle}>1. Select Subjects to Upgrade</Text>

                            {data?.batches?.map((batch) => {
                                if (!batch.subjectDetails || batch.subjectDetails.length === 0) return null;
                                return (
                                    <View key={batch.batchId} style={{ marginBottom: 15 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                                            <View style={{ width: 4, height: 16, backgroundColor: COLORS.primary, borderRadius: 2, marginRight: 8 }} />
                                            <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#FFF' }}>
                                                {batch.businessName} - {batch.batchName}
                                            </Text>
                                        </View>
                                        {batch.subjectDetails.map(sub => {
                                            const isSelected = selectedSubjects.includes(sub.id);
                                            const isAlreadyPaid = data.alreadyPaidSubjects && data.alreadyPaidSubjects.includes(sub.id);

                                            return (
                                                <TouchableOpacity
                                                    key={sub.id}
                                                    style={[
                                                        styles.subjectItem,
                                                        isSelected && styles.subjectItemSelected,
                                                        isAlreadyPaid && { opacity: 0.6, backgroundColor: '#333' }
                                                    ]}
                                                    onPress={() => {
                                                        if (isAlreadyPaid) return;
                                                        toggleSubject(sub.id);
                                                    }}
                                                    disabled={isAlreadyPaid}
                                                >
                                                    <Icon
                                                        name={isSelected ? "checkbox-marked-circle" : (isAlreadyPaid ? "lock" : "checkbox-blank-circle-outline")}
                                                        size={24}
                                                        color={isSelected ? COLORS.primary : "#CCC"}
                                                    />
                                                    <View style={{ flex: 1, marginLeft: 10 }}>
                                                        <Text style={[styles.subjectText, isSelected && { color: COLORS.primary }]}>
                                                            {sub.name}
                                                        </Text>
                                                        {isAlreadyPaid && (
                                                            <Text style={{ fontSize: 10, color: '#4ADE80', fontWeight: 'bold' }}>ALREADY UPGRADED</Text>
                                                        )}
                                                    </View>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                );
                            })}

                            {selectedSubjects.length > 0 && (
                                <View style={styles.summaryBox}>
                                    <Text style={styles.summaryTitle}>Payment Summary</Text>

                                    <View style={styles.summaryRow}>
                                        <Text style={styles.summaryLabel}>Total Monthly Paid:</Text>
                                        <Text style={styles.summaryValue}>LKR {formatPrice(pricing.monthlyPaid)}</Text>
                                    </View>

                                    <View style={styles.summaryRow}>
                                        <Text style={styles.summaryLabel}>Full Course Price:</Text>
                                        <Text style={styles.summaryValue}>LKR {formatPrice(pricing.subtotal)}</Text>
                                    </View>

                                    {pricing.bundleDiscount > 0 && (
                                        <View style={styles.summaryRow}>
                                            <Text style={[styles.summaryLabel, { color: '#10B981' }]}>Bundle Discount:</Text>
                                            <Text style={[styles.summaryValue, { color: '#10B981' }]}>- LKR {formatPrice(pricing.bundleDiscount)}</Text>
                                        </View>
                                    )}

                                    <View style={styles.divider} />

                                    <View style={styles.summaryRow}>
                                        <Text style={styles.totalLabel}>Total Upgrade Balance:</Text>
                                        <Text style={styles.totalValue}>LKR {formatPrice(pricing.balanceToPay)}</Text>
                                    </View>
                                </View>
                            )}

                            {showInstallmentToggle && (
                                <View style={styles.paymentMethodToggle}>
                                    <TouchableOpacity
                                        style={[styles.toggleBtn, selectedUpgradeMethod === 'full' && styles.activeToggle]}
                                        onPress={() => setSelectedUpgradeMethod('full')}
                                    >
                                        <Text style={[styles.toggleText, selectedUpgradeMethod === 'full' && styles.activeToggleText]}>Full Pay</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.toggleBtn, selectedUpgradeMethod === 'installment' && styles.activeToggle]}
                                        onPress={() => setSelectedUpgradeMethod('installment')}
                                    >
                                        <Text style={[styles.toggleText, selectedUpgradeMethod === 'installment' && styles.activeToggleText]}>Installments</Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                            {selectedUpgradeMethod === 'installment' && pricing.installments.length > 0 && (
                                <View style={styles.installmentBox}>
                                    <Text style={styles.installmentTitle}>Installment Plan</Text>
                                    {pricing.installments.map(inst => (
                                        <View key={inst.installmentNum} style={styles.summaryRow}>
                                            <Text style={styles.summaryLabel}>Phase {inst.installmentNum}</Text>
                                            <Text style={styles.summaryValue}>LKR {formatPrice(inst.amount)}</Text>
                                        </View>
                                    ))}
                                    <View style={styles.summaryRow}>
                                        <Text style={[styles.totalLabel, { fontSize: 14 }]}>Pay Now (Phase 1):</Text>
                                        <Text style={[styles.totalValue, { fontSize: 18 }]}>LKR {formatPrice(pricing.installments[0].amount)}</Text>
                                    </View>
                                </View>
                            )}
                        </ScrollView>

                        {!pendingUpgrade && (
                            <View style={styles.footer}>
                                <TouchableOpacity
                                    style={[styles.proceedBtn, selectedSubjects.length === 0 && { backgroundColor: '#CCC' }]}
                                    onPress={handleProceed}
                                    disabled={selectedSubjects.length === 0}
                                >
                                    <Text style={styles.proceedText}>Proceed to Checkout</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                </View>
            </Modal>
        </>
    );
};

const styles = StyleSheet.create({
    bannerContainer: { paddingHorizontal: 20, marginBottom: 15 },
    banner: { borderRadius: 15, padding: 15, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
    bannerContent: { flexDirection: 'row', alignItems: 'center' },
    bannerTextContainer: { flex: 1, marginLeft: 15 },
    bannerTitle: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
    bannerSub: { color: '#FFD700', fontSize: 12, fontWeight: '600', marginTop: 2 },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#F9FAFB', borderTopLeftRadius: 25, borderTopRightRadius: 25, maxHeight: '85%', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 30 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
    modalHeaderIcon: { width: 40, height: 40, backgroundColor: '#FEE2E2', borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    modalTitle: { flex: 1, fontSize: 18, fontWeight: '900', color: '#1A1A1A' },
    closeBtn: { padding: 5, backgroundColor: '#E5E7EB', borderRadius: 15 },

    stepTitle: { fontSize: 14, fontWeight: '800', color: '#4B5563', marginBottom: 10, marginTop: 10 },
    subjectItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 15, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB' },
    subjectItemSelected: { borderColor: COLORS.primary, backgroundColor: '#FEF2F2' },
    subjectText: { fontSize: 15, fontWeight: '700', color: '#374151', marginLeft: 15 },

    summaryBox: { backgroundColor: '#FFF', borderRadius: 12, padding: 15, marginTop: 15, borderWidth: 1, borderColor: '#E5E7EB' },
    summaryTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 15 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    summaryLabel: { fontSize: 13, color: '#6B7280', fontWeight: '600' },
    summaryValue: { fontSize: 13, color: '#111827', fontWeight: '800' },
    divider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 10 },
    totalLabel: { fontSize: 15, fontWeight: '900', color: '#111827' },
    totalValue: { fontSize: 20, fontWeight: '900', color: COLORS.primary },

    paymentMethodToggle: { flexDirection: 'row', backgroundColor: '#E5E7EB', borderRadius: 12, padding: 4, marginTop: 20 },
    toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
    activeToggle: { backgroundColor: '#FFF', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 3, elevation: 2 },
    toggleText: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
    activeToggleText: { color: COLORS.primary },

    installmentBox: { backgroundColor: '#ECFDF5', padding: 15, borderRadius: 12, marginTop: 15, borderWidth: 1, borderColor: '#10B981' },
    installmentTitle: { fontSize: 14, fontWeight: '800', color: '#065F46', marginBottom: 10 },

    footer: { marginTop: 20 },
    proceedBtn: { backgroundColor: COLORS.primary, paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
    proceedText: { color: '#FFF', fontSize: 15, fontWeight: '900' }
});

export default UpgradeOfferWidget;
