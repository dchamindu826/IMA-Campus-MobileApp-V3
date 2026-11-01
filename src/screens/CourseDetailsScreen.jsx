import React, { useState, useMemo, useEffect, useLayoutEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Image, Modal, StatusBar, Platform, LayoutAnimation, UIManager, Dimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import COLORS from '../constants/colors';
import api, { IMAGE_URL } from '../services/api';

const { width } = Dimensions.get('window');

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const CourseDetailsScreen = ({ route, navigation }) => {
    const insets = useSafeAreaInsets();
    const { businessData, autoSelect, selectedBatchId, selectedMonthGroupId, preSelectedSubjects, paymentPlan } = route.params;

    const isSpecialFlow = String(businessData?.category || '').toLowerCase() !== 'others';
    const initialStreams = businessData?.streams ? businessData.streams.split(',').map(s => s.trim()).filter(s => s && s.toLowerCase() !== 'all') : [];
    const initialShowStreamFilter = isSpecialFlow && initialStreams.length >= 2;

    const [step, setStep] = useState(2); // Always start at Batch
    const [activeStream, setActiveStream] = useState('All');
    const [selectedBatch, setSelectedBatch] = useState(null);
    const [selectedClassType, setSelectedClassType] = useState('theory'); // 'theory' | 'paper'
    const [selectedPlan, setSelectedPlan] = useState(null);
    const [selectedMonthGroup, setSelectedMonthGroup] = useState(null);
    const [selectedSubjects, setSelectedSubjects] = useState([]);
    const [enrolledSubjects, setEnrolledSubjects] = useState([]);
    const [groupPaidSubjects, setGroupPaidSubjects] = useState({});
    const [fullPaidSubjects, setFullPaidSubjects] = useState([]);
    const [batchInstallments, setBatchInstallments] = useState([]);

    const [totalAmount, setTotalAmount] = useState(0);
    const [isDiscountApplied, setIsDiscountApplied] = useState(false);
    const [activeDiscountPrice, setActiveDiscountPrice] = useState(null);
    const [loading, setLoading] = useState(false);

    const [showInstallmentModal, setShowInstallmentModal] = useState(false);
    const [availableInstallmentPlan, setAvailableInstallmentPlan] = useState(null);

    useLayoutEffect(() => {
        navigation.setOptions({ headerShown: false });
    }, [navigation]);

    useFocusEffect(
        useCallback(() => {
            api.get('/student/my-enrolled-subjects').then(res => {
                if (Array.isArray(res.data)) {
                    setEnrolledSubjects(res.data);
                } else if (res.data && res.data.enrolledSubjects) {
                    setEnrolledSubjects(res.data.enrolledSubjects || []);
                    setGroupPaidSubjects(res.data.groupPaidSubjects || {});
                    setFullPaidSubjects(res.data.fullPaidSubjects || []);
                }
            }).catch(e => { });
        }, [])
    );

    useEffect(() => {
        if (selectedBatch?.id) {
            api.get(`mobile/installments/${selectedBatch.id}`)
                .then(res => { if (Array.isArray(res.data)) setBatchInstallments(res.data); })
                .catch(e => console.log("Installments fetch error:", e));
        }
    }, [selectedBatch]);

    useEffect(() => {
        if (autoSelect) {
            try {
                const batch = (businessData?.batches || []).find(b => b.id == selectedBatchId);
                if (batch) {
                    setSelectedBatch(batch);
                    const groups = Array.isArray(batch.groups) ? batch.groups : Object.values(batch.groups || {});
                    const group = groups.find(g => g.id == selectedMonthGroupId);
                    if (group) setSelectedMonthGroup(group);
                    setSelectedPlan(paymentPlan || 'full');

                    if (preSelectedSubjects) {
                        const subjectsArr = typeof preSelectedSubjects === 'string' ? JSON.parse(preSelectedSubjects) : preSelectedSubjects;
                        if (Array.isArray(subjectsArr)) {
                            setSelectedSubjects(subjectsArr.map(id => parseInt(id)));
                        }
                    }
                    changeStep(5);
                }
            } catch (e) {
                console.log("Auto select parse error:", e);
            }
        }
    }, [autoSelect]);

    const availableStreams = useMemo(() => {
        if (!businessData?.streams) return ['All'];
        const streams = businessData.streams.split(',').map(s => s.trim()).filter(s => s && s.toLowerCase() !== 'all');
        return [...streams, 'All'];
    }, [businessData]);

    const showStreamFilter = isSpecialFlow && availableStreams.length >= 2;
    const batches = useMemo(() => businessData?.batches || [], [businessData]);
    const safeGroups = useMemo(() => { if (!selectedBatch?.groups) return []; return Array.isArray(selectedBatch.groups) ? selectedBatch.groups : Object.values(selectedBatch.groups); }, [selectedBatch]);

    const filteredSubjects = useMemo(() => {
        if (!selectedMonthGroup?.courses) return [];
        let courses = [];
        try {
            if (typeof selectedMonthGroup.courses === 'string') courses = JSON.parse(selectedMonthGroup.courses);
            else courses = Array.isArray(selectedMonthGroup.courses) ? selectedMonthGroup.courses : Object.values(selectedMonthGroup.courses);
        } catch (e) { }

        const targetType = selectedClassType === 'paper' ? 2 : 1;
        courses = courses.filter(c => {
            const cType = parseInt(c.courseType || selectedMonthGroup?.classType || 1, 10);
            return cType === targetType;
        });

        if (isSpecialFlow && activeStream !== 'All') {
            courses = courses.filter(c => {
                let parsedStreams = [];
                try {
                    if (c.streams && typeof c.streams === 'string') parsedStreams = JSON.parse(c.streams);
                    else if (Array.isArray(c.streams)) parsedStreams = c.streams;
                } catch (e) { }
                if (parsedStreams && parsedStreams.length > 0 && (parsedStreams.includes(activeStream) || parsedStreams.includes('Common Subjects') || parsedStreams.includes('Common'))) return true;
                if (c.stream && (c.stream.includes(activeStream) || c.stream.includes('Common'))) return true;
                return false;
            });
        }

        const uniqueCourses = [];
        const seenNames = new Set();
        for (let c of courses) {
            const cleanName = c.name.trim().toLowerCase().replace(/\s+/g, ' ');
            const isPaidInGroup = (groupPaidSubjects[selectedMonthGroup?.id] || []).includes(c.id);
            const isFullyPaid = fullPaidSubjects.includes(c.id);

            if (!seenNames.has(cleanName)) {
                seenNames.add(cleanName);
                uniqueCourses.push(c);
            }
        }
        return uniqueCourses;
    }, [selectedMonthGroup, activeStream, isSpecialFlow, selectedClassType, groupPaidSubjects, fullPaidSubjects]);

    const toggleSubject = (courseId) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setSelectedSubjects(prev => prev.includes(courseId) ? prev.filter(id => id !== courseId) : [...prev, courseId]);
    };

    useEffect(() => {
        try {
            if (selectedSubjects.length === 0) { setTotalAmount(0); setIsDiscountApplied(false); setActiveDiscountPrice(null); return; }
            let total = 0; let rules = [];
            try { rules = JSON.parse(selectedMonthGroup?.discount_rules || '[]'); rules.sort((a, b) => b.courseCount - a.courseCount); } catch (e) { }

            const eligibleCount = filteredSubjects.filter(c => selectedSubjects.includes(c.id) && !c.isDiscountExcluded).length;
            let activeRule = null;
            for (let rule of rules) { if (eligibleCount >= rule.courseCount) { activeRule = rule; break; } }

            setIsDiscountApplied(!!activeRule);
            if (activeRule && activeRule.pricePerCourse != null && activeRule.pricePerCourse !== '') {
                setActiveDiscountPrice(activeRule.pricePerCourse);
            } else {
                setActiveDiscountPrice(null);
            }

            if (activeRule && activeRule.packagePrice != null && activeRule.packagePrice !== '') {
                total = parseFloat(activeRule.packagePrice || 0);
                filteredSubjects.filter(c => selectedSubjects.includes(c.id) && c.isDiscountExcluded).forEach(course => {
                    total += parseFloat(course.price || 0);
                });
            } else {
                filteredSubjects.filter(c => selectedSubjects.includes(c.id)).forEach(course => {
                    if (activeRule && activeRule.pricePerCourse != null && activeRule.pricePerCourse !== '' && !course.isDiscountExcluded) {
                        total += parseFloat(activeRule.pricePerCourse || 0);
                    } else {
                        total += parseFloat(course.price || 0);
                    }
                });
                if (activeRule && activeRule.fixedDiscount && parseFloat(activeRule.fixedDiscount) > 0) {
                    total = Math.max(0, total - parseFloat(activeRule.fixedDiscount));
                }
            }
            setTotalAmount(total);
        } catch (err) { }
    }, [selectedSubjects, filteredSubjects, selectedMonthGroup]);

    const checkInstallmentEligibility = () => {
        if (selectedPlan !== 'full' || batchInstallments.length === 0) return null;
        let sortedPlans = [...batchInstallments].sort((a, b) => b.subjectCount - a.subjectCount);
        for (let plan of sortedPlans) {
            if (selectedSubjects.length >= plan.subjectCount) return plan;
        }
        return null;
    };

    const proceedToPayment = () => {
        if (selectedSubjects.length === 0) return Alert.alert("Wait", "Please select at least one subject.");
        setLoading(true);
        setTimeout(() => {
            const eligiblePlan = checkInstallmentEligibility();
            if (eligiblePlan) {
                setAvailableInstallmentPlan(eligiblePlan); setShowInstallmentModal(true); setLoading(false);
            } else { navigateToPayment('full', totalAmount, null); }
        }, 300);
    };

    const navigateToPayment = (payType, amount, installmentPlan) => {
        setShowInstallmentModal(false); setLoading(false);
        navigation.navigate('PaymentMethod', {
            amount, businessId: businessData.id, batchId: selectedBatch.id, groupId: selectedMonthGroup.id, subjects: selectedSubjects, payType, installmentPlan: installmentPlan ? JSON.stringify(installmentPlan) : null
        });
    };

    const handlePayFullAmount = () => navigateToPayment('full', totalAmount, null);
    const handlePayInstallmentAmount = () => {
        try {
            const details = JSON.parse(availableInstallmentPlan.details);
            navigateToPayment('installment', parseFloat(details[0].amount), availableInstallmentPlan);
        } catch (e) { Alert.alert("Error", "Could not parse installment steps."); }
    };

    const changeStep = (newStep) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setStep(newStep);
    };

    const getBatchCourseCounts = (batch) => {
        let theoryCount = 0;
        let paperCount = 0;
        const seenTheory = new Set();
        const seenPaper = new Set();
        const groups = Array.isArray(batch?.groups) ? batch.groups : Object.values(batch?.groups || {});
        groups.forEach(g => {
            const gClassType = parseInt(g.classType || 1, 10);
            const courses = Array.isArray(g.courses) ? g.courses : Object.values(g.courses || {});
            courses.forEach(c => {
                const cleanName = (c.name || '').trim().toLowerCase();
                const cType = parseInt(c.courseType || gClassType || 1, 10);
                if (cType === 2) {
                    if (!seenPaper.has(cleanName)) {
                        seenPaper.add(cleanName);
                        paperCount++;
                    }
                } else {
                    if (!seenTheory.has(cleanName)) {
                        seenTheory.add(cleanName);
                        theoryCount++;
                    }
                }
            });
        });
        return { theoryCount, paperCount };
    };

    const isBatchDual = (batch) => {
        if (!batch) return false;
        const bType = parseInt(batch.type || 1, 10);
        const { theoryCount, paperCount } = getBatchCourseCounts(batch);
        const groups = Array.isArray(batch.groups) ? batch.groups : Object.values(batch.groups || {});
        const hasPaperGroups = groups.some(g => parseInt(g.classType || 1, 10) === 2);
        const hasTheoryGroups = groups.some(g => parseInt(g.classType || 1, 10) === 1);
        return (bType === 3 || bType === 4) || (paperCount > 0 && theoryCount > 0) || (hasPaperGroups && hasTheoryGroups);
    };

    const handleBatchSelect = (batch) => {
        setSelectedBatch(batch);
        const bType = parseInt(batch?.type || 1, 10);
        const { theoryCount, paperCount } = getBatchCourseCounts(batch);
        const groups = Array.isArray(batch?.groups) ? batch.groups : Object.values(batch?.groups || {});
        const hasPaperGroups = groups.some(g => parseInt(g.classType || 1, 10) === 2);
        const hasTheoryGroups = groups.some(g => parseInt(g.classType || 1, 10) === 1);
        const hasBoth = (bType === 3 || bType === 4) || (paperCount > 0 && theoryCount > 0) || (hasPaperGroups && hasTheoryGroups);

        if (hasBoth) {
            changeStep(2.5);
        } else if (bType === 2 || (paperCount > 0 && theoryCount === 0) || (hasPaperGroups && !hasTheoryGroups)) {
            setSelectedClassType('paper');
            proceedToPaymentOrSubjects(batch, 'paper');
        } else {
            setSelectedClassType('theory');
            proceedToPaymentOrSubjects(batch, 'theory');
        }
    };

    const proceedToPaymentOrSubjects = (batch, classType) => {
        const targetType = classType === 'paper' ? 2 : 1;
        const groups = Array.isArray(batch?.groups) ? batch.groups : Object.values(batch?.groups || {});
        const availableGroups = groups.filter(g => parseInt(g.classType || 1, 10) === targetType);
        const hasMonthly = availableGroups.some(g => g.type === 1);
        const hasFull = availableGroups.some(g => g.type !== 1);

        if (hasMonthly && !hasFull) {
            setSelectedPlan('monthly');
            const monthlyGroups = availableGroups.filter(g => g.type === 1).sort((a, b) => (a.itemOrder || 1) - (b.itemOrder || 1));
            if (monthlyGroups.length === 1) {
                setSelectedMonthGroup(monthlyGroups[0]);
                changeStep(5);
            } else {
                changeStep(4);
            }
        } else if (hasFull && !hasMonthly) {
            setSelectedPlan('full');
            const fullGroups = availableGroups.filter(g => g.type !== 1).sort((a, b) => (a.itemOrder || 1) - (b.itemOrder || 1));
            if (fullGroups.length === 1) {
                setSelectedMonthGroup(fullGroups[0]);
                changeStep(5);
            } else if (fullGroups.length > 1) {
                changeStep(4);
            } else {
                setSelectedMonthGroup(availableGroups[0] || null);
                changeStep(5);
            }
        } else if (hasMonthly && hasFull) {
            setSelectedPlan(null);
            setSelectedMonthGroup(null);
            changeStep(3);
        } else {
            setSelectedPlan(null);
            setSelectedMonthGroup(availableGroups[0] || null);
            changeStep(5);
        }
    };

    const handleBack = () => {
        if (step === 1) navigation.goBack();
        else if (step === 2) {
            if (isSpecialFlow && activeStream !== 'All') changeStep(1);
            else navigation.goBack();
        }
        else if (step === 2.5) {
            changeStep(2);
            setSelectedBatch(null);
        }
        else if (step === 3) {
            if (isBatchDual(selectedBatch)) changeStep(2.5);
            else changeStep(2);
        }
        else if (step === 4) {
            const targetType = selectedClassType === 'paper' ? 2 : 1;
            const streamGroups = safeGroups.filter(g => parseInt(g.classType || 1, 10) === targetType);
            const hasMonthly = streamGroups.some(g => g.type === 1);
            const hasFull = streamGroups.some(g => g.type !== 1);
            if (hasMonthly && hasFull) {
                changeStep(3);
            } else if (isBatchDual(selectedBatch)) {
                changeStep(2.5);
            } else {
                changeStep(2);
            }
        }
        else if (step === 5) {
            if (autoSelect) {
                navigation.goBack();
                return;
            }
            setSelectedSubjects([]);
            const targetType = selectedClassType === 'paper' ? 2 : 1;
            const streamGroups = safeGroups.filter(g => parseInt(g.classType || 1, 10) === targetType);
            const hasMonthly = streamGroups.some(g => g.type === 1);
            const hasFull = streamGroups.some(g => g.type !== 1);
            const activeGroups = streamGroups.filter(g => selectedPlan === 'monthly' ? g.type === 1 : g.type !== 1);
            if (activeGroups.length > 1) {
                changeStep(4);
            } else if (hasMonthly && hasFull) {
                changeStep(3);
            } else if (isBatchDual(selectedBatch)) {
                changeStep(2.5);
            } else {
                changeStep(2);
            }
        }
    };

    const getStepTitle = () => {
        if (step === 1) return "SELECT STREAM";
        if (step === 2) return "SELECT BATCH";
        if (step === 2.5) return "CLASS STREAM";
        if (step === 3) return "PAYMENT TYPE";
        if (step === 4) return "SELECT MONTH";
        return "SELECT SUBJECTS";
    };

    const getProgress = () => {
        const totalSteps = 5;
        const currentStepVal = step === 2.5 ? 2.5 : step;
        return (currentStepVal / totalSteps) * 100;
    };

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={true} />

            <LinearGradient colors={[COLORS.primary, '#9A0007']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.headerGradient, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
                <View style={styles.headerTopRow}>
                    <TouchableOpacity activeOpacity={0.8} onPress={handleBack} style={styles.backBtn}>
                        <Icon name="arrow-left" size={24} color="white" />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.headerCourseName} numberOfLines={1}>{businessData.name}</Text>
                        <View style={styles.stepBadge}>
                            <Text style={styles.stepIndicatorText}>Step {step} • {getStepTitle()}</Text>
                        </View>
                    </View>
                </View>
                
                {/* Progress Bar */}
                <View style={styles.progressContainer}>
                    <View style={[styles.progressBar, { width: `${getProgress()}%` }]} />
                </View>

                {/* Decorative BG */}
                <Icon name="school" size={140} color="rgba(255,255,255,0.05)" style={styles.headerWatermark} />
            </LinearGradient>

            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>

                {step === 1 && isSpecialFlow && (
                    <View style={styles.animateFade}>
                        <Text style={styles.label}>Select Your Stream</Text>
                        {availableStreams.filter(s => s !== 'All').map((stream, idx) => (
                            <TouchableOpacity activeOpacity={0.8} key={idx} onPress={() => { setActiveStream(stream); changeStep(2); }}>
                                <LinearGradient colors={idx % 2 === 0 ? ['#D32F2F', '#9A0007'] : ['#E53935', '#B71C1C']} start={{x:0, y:0}} end={{x:1, y:1}} style={[styles.streamMainCard, { marginTop: idx > 0 ? 15 : 0 }]}>
                                    <View style={styles.cardContent}>
                                        <View>
                                            <Text style={styles.streamTitle}>{stream}</Text>
                                            <View style={styles.startBtn}><Text style={styles.startBtnText}>Select Stream <Icon name="chevron-right" size={14} /></Text></View>
                                        </View>
                                        <Icon name={idx % 2 === 0 ? "palette" : "finance"} size={80} color="rgba(255,255,255,0.15)" style={styles.bgIcon} />
                                    </View>
                                </LinearGradient>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}

                {step === 2 && (
                    <View style={styles.animateFade}>
                        <Text style={styles.label}>Choose a Batch</Text>
                        {batches.length > 0 ? (
                            batches.map(batch => {
                                const isSelected = selectedBatch?.id === batch.id;
                                return (
                                    <TouchableOpacity activeOpacity={0.8} key={batch.id} style={[styles.modernCard, isSelected && styles.modernCardActive]} onPress={() => handleBatchSelect(batch)}>
                                        {batch.logo && batch.logo !== 'default.png' ? (
                                            <Image source={{ uri: `${IMAGE_URL}icons/${batch.logo}` }} style={{ width: 70, height: 70, borderRadius: 12, backgroundColor: '#fff', marginRight: 15 }} resizeMode="cover" />
                                        ) : (
                                            <View style={{ width: 70, height: 70, borderRadius: 12, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', marginRight: 15 }}>
                                                <Icon name="school" size={30} color={COLORS.primary} />
                                            </View>
                                        )}
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.cardText}>{batch.name}</Text>
                                            <Text style={styles.cardSubText}>Tap to select</Text>
                                        </View>
                                        <View style={[styles.checkCircle, isSelected && styles.checkCircleActive]}>
                                            {isSelected && <Icon name="check" size={16} color="white" />}
                                        </View>
                                    </TouchableOpacity>
                                );
                            })
                        ) : <Text style={styles.emptyText}>No batches available.</Text>}
                    </View>
                )}

                {step === 2.5 && (() => {
                    const counts = getBatchCourseCounts(selectedBatch);
                    return (
                        <View style={styles.animateFade}>
                            <View style={{ alignItems: 'center', marginBottom: 20 }}>
                                <View style={styles.batchBadge}>
                                    <Text style={styles.batchBadgeText}>{selectedBatch?.name}</Text>
                                </View>
                                <Text style={[styles.label, { textAlign: 'center', marginTop: 10, marginBottom: 4 }]}>Select Class Stream</Text>
                                <Text style={{ fontSize: 13, color: '#6B7280', textAlign: 'center' }}>Choose between Theory or Paper classes to continue</Text>
                            </View>

                            {/* THEORY CLASS CARD */}
                            <TouchableOpacity 
                                activeOpacity={0.88} 
                                onPress={() => {
                                    setSelectedClassType('theory');
                                    proceedToPaymentOrSubjects(selectedBatch, 'theory');
                                }}
                                style={{ marginBottom: 16 }}
                            >
                                <LinearGradient 
                                    colors={['#1E3A8A', '#2563EB']} 
                                    start={{x:0, y:0}} 
                                    end={{x:1, y:1}} 
                                    style={styles.classStreamCard}
                                >
                                    <View style={styles.classStreamIconWrapBlue}>
                                        <Icon name="book-open-page-variant" size={36} color="#93C5FD" />
                                    </View>
                                    <View style={{ flex: 1, marginLeft: 14 }}>
                                        <View style={styles.streamBadgeBlue}>
                                            <Text style={styles.streamBadgeTextBlue}>{counts.theoryCount} Subjects Available</Text>
                                        </View>
                                        <Text style={styles.classStreamTitle}>Theory Class</Text>
                                        <Text style={styles.classStreamSub}>Structured Theory & Concept Lessons</Text>
                                        <Text style={styles.classStreamDesc} numberOfLines={2}>
                                            Comprehensive syllabus coverage, concept clarity, theory notes & foundational learning.
                                        </Text>
                                    </View>
                                    <Icon name="chevron-right" size={26} color="rgba(255,255,255,0.7)" />
                                </LinearGradient>
                            </TouchableOpacity>

                            {/* PAPER CLASS CARD */}
                            <TouchableOpacity 
                                activeOpacity={0.88} 
                                onPress={() => {
                                    setSelectedClassType('paper');
                                    proceedToPaymentOrSubjects(selectedBatch, 'paper');
                                }}
                            >
                                <LinearGradient 
                                    colors={['#B45309', '#D97706']} 
                                    start={{x:0, y:0}} 
                                    end={{x:1, y:1}} 
                                    style={styles.classStreamCard}
                                >
                                    <View style={styles.classStreamIconWrapAmber}>
                                        <Icon name="file-document-edit" size={36} color="#FDE68A" />
                                    </View>
                                    <View style={{ flex: 1, marginLeft: 14 }}>
                                        <View style={styles.streamBadgeAmber}>
                                            <Text style={styles.streamBadgeTextAmber}>{counts.paperCount} Subjects Available</Text>
                                        </View>
                                        <Text style={styles.classStreamTitle}>Paper Class</Text>
                                        <Text style={styles.classStreamSub}>Timed Exam Papers & Marking Discussion</Text>
                                        <Text style={styles.classStreamDesc} numberOfLines={2}>
                                            Model exam papers, structured past paper discussions, marking schemes & timing coaching.
                                        </Text>
                                    </View>
                                    <Icon name="chevron-right" size={26} color="rgba(255,255,255,0.7)" />
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    );
                })()}

                {step === 3 && (() => {
                    const targetType = selectedClassType === 'paper' ? 2 : 1;
                    const streamGroups = safeGroups.filter(g => parseInt(g.classType || 1, 10) === targetType);
                    const hasFullPayment = streamGroups.some(g => g.type == 2 || String(g.name).toLowerCase().includes('full'));
                    const hasMonthlyPayment = streamGroups.some(g => g.type == 1);
                    
                    return (
                    <View style={styles.animateFade}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                            <View style={selectedClassType === 'paper' ? styles.streamBadgeAmber : styles.streamBadgeBlue}>
                                <Text style={selectedClassType === 'paper' ? styles.streamBadgeTextAmber : styles.streamBadgeTextBlue}>
                                    {selectedClassType === 'paper' ? '📝 Paper Class' : '📘 Theory Class'}
                                </Text>
                            </View>
                        </View>

                        <Text style={styles.label}>Payment Plan</Text>
                        
                        {hasFullPayment && (
                        <TouchableOpacity activeOpacity={0.8} onPress={() => {
                            setSelectedPlan('full');
                            const fullGroups = streamGroups.filter(g => g.type == 2 || String(g.name).toLowerCase().includes('full'));
                            if (fullGroups.length === 0) {
                                if (streamGroups.length > 0) { setSelectedMonthGroup(streamGroups[0]); changeStep(5); }
                                else { Alert.alert("Wait", "Subjects not configured yet."); return; }
                            } else if (fullGroups.length === 1) { setSelectedMonthGroup(fullGroups[0]); changeStep(5); }
                            else { changeStep(4); }
                        }}>
                            <LinearGradient colors={['#FFB75E', '#ED8F03']} start={{x:0, y:0}} end={{x:1, y:1}} style={styles.premiumCard}>
                                <View style={styles.bestValueRibbon}><Text style={styles.ribbonText}>BEST VALUE</Text></View>
                                <View style={styles.planIconWrapper}>
                                    <Icon name="lightning-bolt" size={32} color="#ED8F03" />
                                </View>
                                <View style={{flex: 1, marginLeft: 15}}>
                                    <Text style={styles.premiumTitle}>One-Time Payment</Text>
                                    <Text style={styles.premiumSub}>Unlock all bundle discounts & offers</Text>
                                </View>
                                <Icon name="chevron-right" size={24} color="rgba(255,255,255,0.8)" />
                            </LinearGradient>
                        </TouchableOpacity>
                        )}

                        {hasMonthlyPayment && (
                        <TouchableOpacity activeOpacity={0.8} onPress={() => { 
                            setSelectedPlan('monthly'); 
                            const monthlyGroups = streamGroups.filter(g => g.type == 1);
                            if (monthlyGroups.length === 1) {
                                setSelectedMonthGroup(monthlyGroups[0]);
                                changeStep(5);
                            } else {
                                changeStep(4);
                            }
                        }}>
                            <LinearGradient colors={['#424242', '#212121']} start={{x:0, y:0}} end={{x:1, y:1}} style={styles.premiumCard}>
                                <View style={styles.planIconWrapper}>
                                    <Icon name="calendar-month-outline" size={32} color="#1E3C72" />
                                </View>
                                <View style={{flex: 1, marginLeft: 15}}>
                                    <Text style={styles.premiumTitle}>Monthly Payment</Text>
                                    <Text style={styles.premiumSub}>Pay month-by-month</Text>
                                </View>
                                <Icon name="chevron-right" size={24} color="rgba(255,255,255,0.8)" />
                            </LinearGradient>
                        </TouchableOpacity>
                        )}

                        {hasFullPayment && (
                        <View style={styles.perksBox}>
                            <Text style={styles.perksTitle}>Why choose Full Payment?</Text>
                            <View style={styles.perkRow}><Icon name="check-decagram" size={20} color="#10B981" /><Text style={styles.perkText}>Exclusive Bundle Discounts</Text></View>
                            <View style={styles.perkRow}><Icon name="check-decagram" size={20} color="#10B981" /><Text style={styles.perkText}>No monthly interruptions</Text></View>
                            <View style={styles.perkRow}><Icon name="check-decagram" size={20} color="#10B981" /><Text style={styles.perkText}>Premium Study Materials & Offline Access</Text></View>
                        </View>
                        )}
                        
                        {!hasFullPayment && !hasMonthlyPayment && (
                            <Text style={styles.emptyText}>No payment plans configured for this business.</Text>
                        )}
                    </View>
                    );
                })()}

                {step === 4 && (() => {
                    const targetType = selectedClassType === 'paper' ? 2 : 1;
                    const displayGroups = safeGroups.filter(g => {
                        const matchesClass = parseInt(g.classType || 1, 10) === targetType;
                        const matchesPlan = selectedPlan === 'monthly' ? g.type == 1 : g.type != 1;
                        return matchesClass && matchesPlan;
                    });
                    return (
                        <View style={styles.animateFade}>
                            <Text style={styles.label}>Select {selectedPlan === 'monthly' ? 'Month' : 'Group'}</Text>
                            {displayGroups.map(group => (
                                <TouchableOpacity activeOpacity={0.8} key={group.id} style={styles.modernCard} onPress={() => { setSelectedMonthGroup(group); changeStep(5); }}>
                                    <View style={styles.logoContainer}><Icon name="calendar-month" size={24} color={COLORS.primary} /></View>
                                    <Text style={[styles.cardText, {marginLeft: 15, flex: 1}]}>{group.name}</Text>
                                    <Icon name="chevron-right" size={24} color="#ccc" />
                                </TouchableOpacity>
                            ))}
                            {displayGroups.length === 0 && <Text style={styles.emptyText}>No plans available.</Text>}
                        </View>
                    );
                })()}

                {step === 5 && (
                    <View style={styles.animateFade}>
                        {selectedMonthGroup && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 15 }}>
                                <View style={selectedClassType === 'paper' ? styles.streamBadgeAmber : styles.streamBadgeBlue}>
                                    <Text style={selectedClassType === 'paper' ? styles.streamBadgeTextAmber : styles.streamBadgeTextBlue}>
                                        {selectedClassType === 'paper' ? '📝 Paper Class' : '📘 Theory Class'}
                                    </Text>
                                </View>
                                <View style={styles.floatingChip}>
                                    <Icon name="calendar-check" size={16} color="white" style={{ marginRight: 6 }} />
                                    <Text style={styles.floatingChipText}>Plan: {selectedMonthGroup.name}</Text>
                                </View>
                            </View>
                        )}

                        {showStreamFilter && (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                                {availableStreams.map(stream => (
                                    <TouchableOpacity key={stream} onPress={() => { setActiveStream(stream); setSelectedSubjects([]); }}
                                        style={[styles.streamChip, activeStream === stream ? styles.streamChipActive : {}]}>
                                        <Text style={{ fontWeight: '800', fontSize: 13, color: activeStream === stream ? 'white' : '#666' }}>{stream}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        )}

                        <Text style={[styles.label, { marginTop: 0 }]}>Select Subjects</Text>

                        {isDiscountApplied && (
                            <LinearGradient colors={['#10B981', '#059669']} start={{x:0, y:0}} end={{x:1, y:1}} style={styles.discountBannerNew}>
                                <Icon name="ticket-percent" size={28} color="white" />
                                <View style={{ marginLeft: 12, flex: 1 }}>
                                    <Text style={styles.discountTitleNew}>Bundle Discount Applied!</Text>
                                    <Text style={styles.discountSubNew}>Special pricing unlocked for selected subjects.</Text>
                                </View>
                            </LinearGradient>
                        )}

                        {filteredSubjects.length > 0 ? (
                            filteredSubjects.map(sub => {
                                const isSelected = selectedSubjects.includes(sub.id);
                                const isAlreadyPaid = (groupPaidSubjects[selectedMonthGroup?.id] || []).includes(sub.id) || fullPaidSubjects.includes(sub.id);
                                const dPrice = parseFloat(activeDiscountPrice || sub.price || 0);
                                const normalPrice = parseFloat(sub.price || 0);
                                const displayPrice = (isDiscountApplied && !sub.isDiscountExcluded && activeDiscountPrice) ? dPrice : normalPrice;

                                let courseImage = null;
                                try {
                                    let parsedPrices = sub.groupPrices;
                                    if (typeof parsedPrices === 'string') parsedPrices = JSON.parse(parsedPrices);
                                    if (typeof parsedPrices === 'string') parsedPrices = JSON.parse(parsedPrices);

                                    if (Array.isArray(parsedPrices)) {
                                        let imgObj = parsedPrices.find(gp => parseInt(gp.groupId) === parseInt(selectedMonthGroup?.id) && gp.lecturerImage && gp.lecturerImage.trim() !== '');
                                        if (!imgObj) imgObj = parsedPrices.find(gp => gp.lecturerImage && gp.lecturerImage.trim() !== '');
                                        if (imgObj) courseImage = imgObj.lecturerImage;
                                    }
                                } catch (e) { }

                                const validLecturerName = sub.lecturerName && sub.lecturerName.trim().toUpperCase() !== 'TBA' && sub.lecturerName.trim().length > 0;
                                const hasValidImage = courseImage && courseImage !== 'null' && courseImage !== 'default.png' && courseImage.trim() !== '';

                                return (
                                    <TouchableOpacity
                                        key={sub.id}
                                        disabled={isAlreadyPaid}
                                        style={[styles.subjectCard, isSelected && styles.subjectCardActive, isAlreadyPaid && styles.subjectCardDisabled]}
                                        onPress={() => toggleSubject(sub.id)}
                                        activeOpacity={0.8}
                                    >
                                        <View style={{ flex: 1 }}>
                                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                                {hasValidImage ? (
                                                    <Image source={{ uri: `${IMAGE_URL}icons/${courseImage}` }} style={styles.lecturerAvatar} />
                                                ) : (
                                                    <View style={styles.lecturerAvatarPlaceholder}><Icon name="account" size={24} color="#9CA3AF" /></View>
                                                )}
                                                <Text style={styles.subLecturerName} numberOfLines={1}>{validLecturerName ? sub.lecturerName : 'TBA'}</Text>
                                            </View>
                                            
                                            <Text style={[styles.subName, isAlreadyPaid && { color: '#9CA3AF' }]} numberOfLines={2}>{sub.name}</Text>
                                            
                                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
                                                <View style={[styles.priceTag, isSelected && styles.priceTagActive]}>
                                                    <Text style={[styles.subPrice, isSelected && {color: 'white'}]}>Rs. {displayPrice.toLocaleString()}</Text>
                                                </View>
                                                {isDiscountApplied && !sub.isDiscountExcluded && activeDiscountPrice && !isAlreadyPaid && (
                                                    <Text style={styles.strikePrice}>Rs. {normalPrice.toLocaleString()}</Text>
                                                )}
                                            </View>
                                            
                                            {isAlreadyPaid && (
                                                <View style={styles.alreadyPaidBadge}>
                                                    <Icon name="check-circle" size={12} color="#059669" />
                                                    <Text style={styles.alreadyPaidText}>ENROLLED</Text>
                                                </View>
                                            )}
                                        </View>

                                        <View style={[styles.checkCircleLarge, isSelected && styles.checkCircleLargeActive]}>
                                            {isSelected && <Icon name="check" size={20} color="white" />}
                                        </View>
                                    </TouchableOpacity>
                                );
                            })
                        ) : (
                            <View style={{ alignItems: 'center', marginTop: 40 }}>
                                <Icon name="text-box-search-outline" size={80} color="#E5E7EB" />
                                <Text style={styles.emptyText}>No subjects found.</Text>
                            </View>
                        )}
                    </View>
                )}
            </ScrollView>

            {step === 5 && (
                <View style={[styles.glassFooter, { paddingBottom: (Platform.OS === 'ios' ? 30 : 15) + insets.bottom }]}>
                    <View>
                        <Text style={styles.totalLabel}>TOTAL PAYABLE</Text>
                        <Text style={styles.totalText}>Rs. {totalAmount.toLocaleString()}</Text>
                    </View>
                    <TouchableOpacity activeOpacity={0.8} disabled={totalAmount === 0 || loading} onPress={proceedToPayment} style={{width: 140}}>
                        <LinearGradient 
                            colors={totalAmount === 0 ? ['#D1D5DB', '#9CA3AF'] : [COLORS.primary, '#9A0007']} 
                            start={{x:0, y:0}} end={{x:1, y:1}} 
                            style={styles.payBtnGradient}
                        >
                            {loading ? <ActivityIndicator color="white" /> : <Text style={styles.payBtnText}>PROCEED <Icon name="arrow-right" size={18} /></Text>}
                        </LinearGradient>
                    </TouchableOpacity>
                </View>
            )}

            <Modal visible={showInstallmentModal} transparent={true} animationType="fade">
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { paddingBottom: (Platform.OS === 'ios' ? 40 : 25) + insets.bottom }]}>
                        <TouchableOpacity style={styles.closeModalBtn} onPress={() => setShowInstallmentModal(false)}><Icon name="close" size={20} color="#666" /></TouchableOpacity>

                        <View style={{ alignItems: 'center', marginBottom: 25, marginTop: 10 }}>
                            <View style={styles.modalShieldIcon}>
                                <Icon name="shield-check" size={40} color={COLORS.primary} />
                            </View>
                            <Text style={styles.modalTitle}>Payment Options</Text>
                            <Text style={styles.modalSubTitle}>Choose how you want to proceed with payment</Text>
                        </View>

                        <TouchableOpacity style={styles.modalBtnOutline} onPress={handlePayFullAmount}>
                            <View style={styles.modalIconBox}><Icon name="cash-check" size={26} color={COLORS.primary} /></View>
                            <View style={{ flex: 1, marginLeft: 15 }}>
                                <Text style={{ fontWeight: '900', color: '#1A1A1A', fontSize: 16 }}>Pay Full Amount</Text>
                                <Text style={{ color: '#666', fontSize: 13, fontWeight: '700', marginTop: 2 }}>Pay Rs. {totalAmount.toLocaleString()} securely</Text>
                            </View>
                            <Icon name="chevron-right" size={24} color="#ccc" />
                        </TouchableOpacity>

                        <TouchableOpacity activeOpacity={0.8} onPress={handlePayInstallmentAmount}>
                            <LinearGradient colors={['#B71C1C', '#E53935']} start={{x:0, y:0}} end={{x:1, y:1}} style={styles.modalBtnSolid}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 15 }}>
                                    <Icon name="calendar-clock" size={24} color="white" />
                                    <Text style={{ fontWeight: '900', color: 'white', fontSize: 16, marginLeft: 10 }}>Pay in Installments</Text>
                                </View>

                                <View style={{ backgroundColor: 'rgba(255,255,255,0.15)', padding: 15, borderRadius: 12, marginBottom: 15 }}>
                                    {availableInstallmentPlan && JSON.parse(availableInstallmentPlan.details).map((inst, index) => {
                                        let suffix = index === 0 ? 'st' : index === 1 ? 'nd' : index === 2 ? 'rd' : 'th';
                                        return (
                                            <View key={index} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                                                <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '700' }}>{index + 1}{suffix} Phase</Text>
                                                <Text style={{ color: 'white', fontSize: 15, fontWeight: '900' }}>Rs. {parseFloat(inst.amount).toLocaleString()}</Text>
                                            </View>
                                        );
                                    })}
                                </View>
                                
                                <View style={{ backgroundColor: 'white', padding: 12, borderRadius: 10, alignItems: 'center' }}>
                                    <Text style={{ color: '#1E3A8A', fontWeight: '900', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }}>Pay 1st Installment Now</Text>
                                </View>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    
    // Header Styles
    headerGradient: { paddingHorizontal: 20, paddingBottom: 22, borderBottomLeftRadius: 35, borderBottomRightRadius: 35, elevation: 10, overflow: 'hidden' },
    headerTopRow: { flexDirection: 'row', alignItems: 'center', zIndex: 2 },
    backBtn: { marginRight: 15, width: 40, height: 40, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
    headerCourseName: { fontSize: 22, fontWeight: '900', color: 'white', letterSpacing: 0.5 },
    stepBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, alignSelf: 'flex-start', marginTop: 8 },
    stepIndicatorText: { color: 'white', fontSize: 11, fontWeight: '800', letterSpacing: 1 },
    headerWatermark: { position: 'absolute', right: -20, top: 10, zIndex: 1, transform: [{rotate: '-15deg'}] },
    progressContainer: { height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, marginTop: 20, zIndex: 2 },
    progressBar: { height: '100%', backgroundColor: 'white', borderRadius: 2 },

    label: { fontSize: 14, fontWeight: '900', color: '#64748B', marginBottom: 15, marginTop: 10, textTransform: 'uppercase', letterSpacing: 1 },
    emptyText: { textAlign: 'center', marginTop: 15, color: '#94A3B8', fontWeight: 'bold', fontSize: 16 },
    
    // Step 1: Stream Cards
    streamMainCard: { height: 130, borderRadius: 24, overflow: 'hidden', elevation: 6, padding: 20, justifyContent: 'center', shadowColor: '#000', shadowOffset: {width:0, height:4}, shadowOpacity: 0.2, shadowRadius: 8 },
    cardContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    streamTitle: { color: 'white', fontSize: 24, fontWeight: '900', marginBottom: 12 },
    startBtn: { backgroundColor: 'rgba(255,255,255,0.25)', alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
    startBtnText: { color: 'white', fontWeight: '800', fontSize: 13 },
    bgIcon: { position: 'absolute', right: -10, bottom: -15 },
    
    // Step 2 & 4: Modern Cards
    modernCard: { backgroundColor: 'white', padding: 16, borderRadius: 20, marginBottom: 14, flexDirection: 'row', alignItems: 'center', elevation: 2, shadowColor: '#94A3B8', shadowOffset: {width:0, height:2}, shadowOpacity: 0.1, shadowRadius: 5 },
    modernCardActive: { backgroundColor: '#F0F9FF', borderColor: '#38BDF8', borderWidth: 1.5, elevation: 4 },
    logoContainer: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
    logoContainerActive: { backgroundColor: 'white' },
    batchLogo: { width: 40, height: 40, borderRadius: 20 },
    cardText: { fontSize: 16, fontWeight: '800', color: '#1E293B', marginBottom: 4 },
    cardSubText: { fontSize: 12, color: '#64748B', fontWeight: '600' },
    checkCircle: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#CBD5E1', justifyContent: 'center', alignItems: 'center' },
    checkCircleActive: { backgroundColor: '#38BDF8', borderColor: '#38BDF8' },

    // Step 3: Payment Plan Cards
    premiumCard: { padding: 20, borderRadius: 24, marginBottom: 16, flexDirection: 'row', alignItems: 'center', elevation: 6, shadowColor: '#000', shadowOffset: {width:0, height:4}, shadowOpacity: 0.2, shadowRadius: 8 },
    planIconWrapper: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center' },
    premiumTitle: { color: 'white', fontSize: 18, fontWeight: '900', marginBottom: 4 },
    premiumSub: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600' },
    bestValueRibbon: { position: 'absolute', top: 0, right: 20, backgroundColor: '#EF4444', paddingHorizontal: 12, paddingVertical: 4, borderBottomLeftRadius: 8, borderBottomRightRadius: 8 },
    ribbonText: { color: 'white', fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
    
    perksBox: { backgroundColor: 'white', padding: 20, borderRadius: 20, marginTop: 10, elevation: 2 },
    perksTitle: { fontSize: 15, fontWeight: '900', color: '#1E293B', marginBottom: 15 },
    perkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    perkText: { marginLeft: 10, fontSize: 13, color: '#475569', fontWeight: '700' },

    // Step 5: Subjects
    floatingChip: { backgroundColor: '#3B82F6', alignSelf: 'flex-start', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, flexDirection: 'row', alignItems: 'center', marginBottom: 20, elevation: 3 },
    floatingChipText: { color: 'white', fontWeight: '800', fontSize: 13 },
    streamChip: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 25, marginRight: 10, backgroundColor: 'white', elevation: 2, marginBottom: 5 },
    streamChipActive: { backgroundColor: '#1E293B', elevation: 4 },
    
    discountBannerNew: { padding: 16, borderRadius: 20, marginBottom: 20, flexDirection: 'row', alignItems: 'center', elevation: 4 },
    discountTitleNew: { color: 'white', fontWeight: '900', fontSize: 15 },
    discountSubNew: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '700', marginTop: 2 },

    subjectCard: { backgroundColor: 'white', padding: 18, borderRadius: 24, marginBottom: 15, flexDirection: 'row', alignItems: 'center', elevation: 3, shadowColor: '#64748B', shadowOffset: {width:0, height:3}, shadowOpacity: 0.1, shadowRadius: 6 },
    subjectCardActive: { borderColor: COLORS.primary, backgroundColor: '#FFF5F5', borderWidth: 2, elevation: 5 },
    subjectCardDisabled: { backgroundColor: '#F8FAFC', opacity: 0.7, elevation: 0 },
    
    subName: { fontSize: 16, fontWeight: '900', color: '#1E293B', lineHeight: 22 },
    lecturerAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 10, backgroundColor: '#E2E8F0' },
    lecturerAvatarPlaceholder: { width: 40, height: 40, borderRadius: 20, marginRight: 10, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
    subLecturerName: { fontSize: 13, color: '#475569', fontWeight: '800' },
    
    priceTag: { backgroundColor: '#F1F5F9', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, alignSelf: 'flex-start', marginRight: 10 },
    priceTagActive: { backgroundColor: COLORS.primary },
    subPrice: { fontWeight: '900', color: '#1E293B', fontSize: 15 },
    strikePrice: { textDecorationLine: 'line-through', color: '#94A3B8', fontSize: 12, fontWeight: '800' },
    
    checkCircleLarge: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: '#CBD5E1', justifyContent: 'center', alignItems: 'center', marginLeft: 15 },
    checkCircleLargeActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary, transform: [{scale: 1.1}] },
    
    alreadyPaidBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#D1FAE5', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginTop: 10 },
    alreadyPaidText: { color: '#059669', fontSize: 10, fontWeight: '900', letterSpacing: 0.5, marginLeft: 4 },

    // Footer
    glassFooter: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: 'rgba(255,255,255,0.95)', borderTopLeftRadius: 30, borderTopRightRadius: 30, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', elevation: 20, shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 15 },
    totalLabel: { fontSize: 12, color: '#64748B', fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 },
    totalText: { fontSize: 24, fontWeight: '900', color: '#0F172A' },
    payBtnGradient: { paddingVertical: 15, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', elevation: 6 },
    payBtnText: { color: 'white', fontWeight: '900', fontSize: 15, marginRight: 6, letterSpacing: 0.5 },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.7)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: 'white', borderTopLeftRadius: 40, borderTopRightRadius: 40, padding: 25, elevation: 20 },
    closeModalBtn: { position: 'absolute', top: 20, right: 20, width: 40, height: 40, backgroundColor: '#F1F5F9', borderRadius: 20, justifyContent: 'center', alignItems: 'center', zIndex: 10 },
    modalShieldIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#F0F9FF', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
    modalTitle: { fontSize: 24, fontWeight: '900', color: '#0F172A' },
    modalSubTitle: { fontSize: 13, color: '#64748B', fontWeight: '700', marginTop: 6 },
    
    modalBtnOutline: { flexDirection: 'row', alignItems: 'center', borderWidth: 2, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', padding: 18, borderRadius: 24, marginBottom: 15 },
    modalIconBox: { width: 50, height: 50, borderRadius: 16, backgroundColor: '#DBEAFE', justifyContent: 'center', alignItems: 'center' },
    modalBtnSolid: { padding: 20, borderRadius: 24, elevation: 8, shadowColor: '#1E3A8A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 8 },

    // Class Stream Styles (Theory vs Paper)
    batchBadge: { backgroundColor: '#F1F5F9', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#CBD5E1' },
    batchBadgeText: { fontSize: 12, fontWeight: '900', color: COLORS.primary, textTransform: 'uppercase', letterSpacing: 0.8 },
    classStreamCard: { borderRadius: 24, padding: 20, flexDirection: 'row', alignItems: 'center', elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 },
    classStreamIconWrapBlue: { width: 64, height: 64, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
    classStreamIconWrapAmber: { width: 64, height: 64, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
    streamBadgeBlue: { backgroundColor: 'rgba(59, 130, 246, 0.25)', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginBottom: 6, borderWidth: 1, borderColor: 'rgba(147, 197, 253, 0.4)' },
    streamBadgeAmber: { backgroundColor: 'rgba(245, 158, 11, 0.25)', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginBottom: 6, borderWidth: 1, borderColor: 'rgba(253, 230, 138, 0.4)' },
    streamBadgeTextBlue: { color: '#DBEAFE', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
    streamBadgeTextAmber: { color: '#FEF3C7', fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
    classStreamTitle: { color: 'white', fontSize: 20, fontWeight: '900', marginBottom: 2 },
    classStreamSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700', marginBottom: 4 },
    classStreamDesc: { color: 'rgba(255,255,255,0.7)', fontSize: 11, lineHeight: 15, fontWeight: '500' },
});

export default CourseDetailsScreen;
