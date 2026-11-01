import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    ActivityIndicator, Modal, Alert, Image, StatusBar, Platform, Dimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import api from '../services/api';
import COLORS from '../constants/colors';

const { width } = Dimensions.get('window');

const MCQPaperScreen = ({ route, navigation }) => {
    const insets = useSafeAreaInsets();
    const { contentId, courseTitle, paperTitle, thumbnail: initialThumbnail } = route.params || {};

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [paperData, setPaperData] = useState(null);
    const [submission, setSubmission] = useState(null);

    // Exam States: 'PRE_START' | 'COUNTDOWN_TO_START' | 'IN_PROGRESS' | 'SUBMITTED'
    const [examStatus, setExamStatus] = useState('PRE_START');
    const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
    const [selectedAnswers, setSelectedAnswers] = useState({}); // { [questionId]: optionId }
    const [timeRemainingSeconds, setTimeRemainingSeconds] = useState(null);
    const [timeUntilStartSeconds, setTimeUntilStartSeconds] = useState(null);

    // Modals
    const [showPaletteModal, setShowPaletteModal] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);

    const timerIntervalRef = useRef(null);

    useEffect(() => {
        if (contentId) {
            loadPaper();
        }
        return () => {
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        };
    }, [contentId]);

    const loadPaper = async () => {
        try {
            setLoading(true);
            const res = await api.get(`papers/content/${contentId}`);
            const data = res.data;
            setPaperData(data);

            const p = data.paper;
            const sub = data.userSubmission;
            const serverNow = new Date(data.serverTime || Date.now());

            if (sub) {
                setSubmission(sub);
                if (sub.status === 'SUBMITTED' || sub.status === 'GRADED') {
                    setExamStatus('SUBMITTED');
                    if (Array.isArray(sub.answers)) {
                        const ansMap = {};
                        sub.answers.forEach(a => {
                            ansMap[a.questionId] = a.selectedOptionId;
                        });
                        setSelectedAnswers(ansMap);
                    }
                    setLoading(false);
                    return;
                }
            }

            // Check Scheduled vs Flexible Timer
            if (p.timerMode === 'SCHEDULED' && p.scheduledStartTime) {
                const startTime = new Date(p.scheduledStartTime);
                const diffToStart = Math.floor((startTime.getTime() - serverNow.getTime()) / 1000);

                if (diffToStart > 0) {
                    setTimeUntilStartSeconds(diffToStart);
                    setExamStatus('COUNTDOWN_TO_START');
                } else {
                    const examEndTime = new Date(startTime.getTime() + p.durationMinutes * 60 * 1000);
                    const diffToEnd = Math.floor((examEndTime.getTime() - serverNow.getTime()) / 1000);

                    if (diffToEnd > 0) {
                        setTimeRemainingSeconds(diffToEnd);
                        setExamStatus('IN_PROGRESS');
                    } else {
                        setTimeRemainingSeconds(0);
                        setExamStatus('SUBMITTED');
                    }
                }
            } else {
                // Flexible Mode
                if (sub && sub.status === 'IN_PROGRESS' && sub.startedAt) {
                    const startedAt = new Date(sub.startedAt);
                    const examEndTime = new Date(startedAt.getTime() + p.durationMinutes * 60 * 1000);
                    const diffToEnd = Math.floor((examEndTime.getTime() - serverNow.getTime()) / 1000);

                    if (diffToEnd > 0) {
                        setTimeRemainingSeconds(diffToEnd);
                        setExamStatus('IN_PROGRESS');
                    } else {
                        setTimeRemainingSeconds(0);
                        setExamStatus('SUBMITTED');
                    }
                } else {
                    setExamStatus('PRE_START');
                }
            }
        } catch (err) {
            console.error("Failed to load student paper details:", err);
            Alert.alert("Error", "Could not load exam details. Please check your internet connection.");
        } finally {
            setLoading(false);
        }
    };

    // Live Countdown Interval
    useEffect(() => {
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

        if (examStatus === 'COUNTDOWN_TO_START' && timeUntilStartSeconds !== null) {
            timerIntervalRef.current = setInterval(() => {
                setTimeUntilStartSeconds(prev => {
                    if (prev <= 1) {
                        clearInterval(timerIntervalRef.current);
                        const durationSecs = (paperData?.paper?.durationMinutes || 60) * 60;
                        setTimeRemainingSeconds(durationSecs);
                        setExamStatus('IN_PROGRESS');
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }

        if (examStatus === 'IN_PROGRESS' && timeRemainingSeconds !== null) {
            timerIntervalRef.current = setInterval(() => {
                setTimeRemainingSeconds(prev => {
                    if (prev <= 1) {
                        clearInterval(timerIntervalRef.current);
                        handleAutoSubmit();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }

        return () => {
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        };
    }, [examStatus, timeUntilStartSeconds, timeRemainingSeconds, paperData]);

    const handleStartExam = async () => {
        if (!paperData?.paper?.id) return;
        try {
            setLoading(true);
            const res = await api.post(`papers/${paperData.paper.id}/start`);
            setSubmission(res.data.submission);
            const durationSecs = (paperData.paper.durationMinutes || 60) * 60;
            setTimeRemainingSeconds(durationSecs);
            setExamStatus('IN_PROGRESS');
        } catch (err) {
            console.error("Failed to start paper session:", err);
            Alert.alert("Error", "Failed to start exam. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const handleSelectOption = (questionId, optionId) => {
        if (examStatus !== 'IN_PROGRESS') return;
        setSelectedAnswers(prev => ({
            ...prev,
            [questionId]: optionId
        }));
    };

    const handleAutoSubmit = () => {
        Alert.alert("Time Expired", "Exam time is up! Submitting your answers now.");
        executeSubmit();
    };

    const executeSubmit = async () => {
        if (!paperData?.paper?.id) return;
        setSubmitting(true);
        setShowConfirmModal(false);
        try {
            const answersArray = Object.keys(selectedAnswers).map(qId => ({
                questionId: parseInt(qId),
                selectedOptionId: selectedAnswers[qId]
            }));

            const res = await api.post(`papers/${paperData.paper.id}/submit`, {
                answers: answersArray
            });

            setSubmission(res.data.submission);
            setExamStatus('SUBMITTED');
            // Refresh to get correct answers for review
            loadPaper();
            Alert.alert("Exam Completed", `Your answers have been submitted! Score: ${res.data.score}%`);
        } catch (err) {
            console.error("Failed to submit exam:", err);
            Alert.alert("Error", "Submission failed. Please check connection and try again.");
        } finally {
            setSubmitting(false);
        }
    };

    const formatSeconds = (totalSecs) => {
        if (totalSecs === null || totalSecs === undefined || totalSecs < 0) return '00:00';
        const hours = Math.floor(totalSecs / 3600);
        const minutes = Math.floor((totalSecs % 3600) / 60);
        const seconds = totalSecs % 60;
        if (hours > 0) {
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    const formatCountdownDays = (totalSecs) => {
        if (!totalSecs || totalSecs < 0) return '00h 00m 00s';
        const days = Math.floor(totalSecs / 86400);
        const hours = Math.floor((totalSecs % 86400) / 3600);
        const minutes = Math.floor((totalSecs % 3600) / 60);
        const seconds = totalSecs % 60;
        if (days > 0) {
            return `${days}d ${hours}h ${minutes}m ${seconds}s`;
        }
        return `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
    };

    const getThumbnailUrl = () => {
        const thumb = paperData?.content?.thumbnail || initialThumbnail;
        if (!thumb || thumb === 'default.png' || thumb === 'null') return null;
        if (thumb.startsWith('http')) return thumb;
        return `https://imacampus.online/api/storage/documents/${thumb}`;
    };

    const questions = paperData?.paper?.questions || [];
    const currentQ = questions[currentQuestionIdx];
    const answeredCount = Object.keys(selectedAnswers).filter(k => selectedAnswers[k] !== undefined && selectedAnswers[k] !== null).length;
    const unansweredCount = questions.length - answeredCount;

    if (loading) {
        return (
            <View style={[styles.centerContainer, { paddingTop: insets.top }]}>
                <StatusBar barStyle="light-content" backgroundColor="#0a0f1d" />
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.loadingText}>Loading exam details...</Text>
            </View>
        );
    }

    return (
        <View style={[styles.container, { paddingTop: Math.max(insets.top, 20) + 8, paddingBottom: insets.bottom }]}>
            <StatusBar barStyle="light-content" backgroundColor="#0a0f1d" />

            {/* 🌟 TOP HEADER 🌟 */}
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={() => {
                        if (examStatus === 'IN_PROGRESS') {
                            Alert.alert(
                                "Leave Exam?",
                                "Your exam timer is currently running! Are you sure you want to leave?",
                                [
                                    { text: "Cancel", style: "cancel" },
                                    { text: "Leave", style: "destructive", onPress: () => navigation.goBack() }
                                ]
                            );
                        } else {
                            navigation.goBack();
                        }
                    }}
                    style={styles.headerBackBtn}
                >
                    <Icon name="arrow-left" size={22} color="#ffffff" />
                </TouchableOpacity>

                <View style={styles.headerTitleWrap}>
                    <Text style={styles.headerSubBadge}>MCQ Examination</Text>
                    <Text style={styles.headerTitle} numberOfLines={1}>
                        {paperData?.content?.title || paperTitle || "MCQ Paper"}
                    </Text>
                </View>

                {/* Status Indicator / Timer in Header */}
                {examStatus === 'IN_PROGRESS' && (
                    <View style={styles.headerRightActions}>
                        <View style={[
                            styles.timerPill,
                            timeRemainingSeconds !== null && timeRemainingSeconds < 300 && styles.timerPillUrgent
                        ]}>
                            <Icon
                                name="clock-outline"
                                size={15}
                                color={timeRemainingSeconds !== null && timeRemainingSeconds < 300 ? '#f87171' : '#34d399'}
                            />
                            <Text style={[
                                styles.timerText,
                                timeRemainingSeconds !== null && timeRemainingSeconds < 300 && styles.timerTextUrgent
                            ]}>
                                {formatSeconds(timeRemainingSeconds)}
                            </Text>
                        </View>

                        <TouchableOpacity
                            style={styles.paletteToggleBtn}
                            onPress={() => setShowPaletteModal(true)}
                        >
                            <Icon name="grid" size={18} color="#ffffff" />
                            <Text style={styles.paletteToggleText}>{answeredCount}/{questions.length}</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            {/* 🌟 1. PRE-START STATE (Flexible Mode) 🌟 */}
            {examStatus === 'PRE_START' && (
                <ScrollView contentContainerStyle={styles.preStartScroll} showsVerticalScrollIndicator={false}>
                    {/* 16:9 Thumbnail Banner */}
                    <View style={styles.thumbnailContainer}>
                        {getThumbnailUrl() ? (
                            <Image source={{ uri: getThumbnailUrl() }} style={styles.thumbnailImage} resizeMode="cover" />
                        ) : (
                            <LinearGradient
                                colors={['#1e1b4b', '#311042', '#0f172a']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.thumbnailPlaceholder}
                            >
                                <Icon name="trophy-award" size={60} color="#f59e0b" />
                            </LinearGradient>
                        )}
                        <View style={styles.thumbnailOverlayBadge}>
                            <Icon name="check-decagram" size={14} color="#34d399" />
                            <Text style={styles.thumbnailOverlayText}>Ready to Start</Text>
                        </View>
                    </View>

                    {/* Paper Title & Instructions */}
                    <View style={styles.preStartContent}>
                        <Text style={styles.preStartTitle}>{paperData?.content?.title || paperTitle}</Text>
                        <Text style={styles.preStartCourse}>{courseTitle}</Text>

                        <View style={styles.instructionBox}>
                            <View style={styles.instructionHeader}>
                                <Icon name="information-outline" size={18} color="#818cf8" />
                                <Text style={styles.instructionHeaderText}>Exam Instructions</Text>
                            </View>
                            <Text style={styles.instructionText}>
                                {paperData?.paper?.instructions || "Read all questions carefully. Once you click 'Start Exam Now', your countdown timer will begin immediately. Answers will automatically submit when time expires."}
                            </Text>
                        </View>

                        {/* Exam Specs Grid */}
                        <View style={styles.metricsGrid}>
                            <View style={styles.metricCard}>
                                <Icon name="clock-time-four-outline" size={24} color="#38bdf8" />
                                <Text style={styles.metricLabel}>Duration</Text>
                                <Text style={styles.metricValue}>{paperData?.paper?.durationMinutes || 60} Mins</Text>
                            </View>

                            <View style={styles.metricCard}>
                                <Icon name="format-list-numbered" size={24} color="#34d399" />
                                <Text style={styles.metricLabel}>Questions</Text>
                                <Text style={styles.metricValue}>{questions.length} MCQs</Text>
                            </View>

                            <View style={styles.metricCard}>
                                <Icon name="star-outline" size={24} color="#fbbf24" />
                                <Text style={styles.metricLabel}>Pass Mark</Text>
                                <Text style={styles.metricValue}>{paperData?.paper?.passMarks || 40}%</Text>
                            </View>
                        </View>

                        {/* Start Exam CTA */}
                        <TouchableOpacity
                            style={styles.startBtn}
                            onPress={handleStartExam}
                            activeOpacity={0.85}
                        >
                            <LinearGradient
                                colors={['#059669', '#10b981']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.startBtnGradient}
                            >
                                <Icon name="play" size={20} color="#ffffff" />
                                <Text style={styles.startBtnText}>START EXAM NOW</Text>
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            )}

            {/* 🌟 2. SCHEDULED COUNTDOWN STATE 🌟 */}
            {examStatus === 'COUNTDOWN_TO_START' && (
                <View style={styles.countdownCenterWrap}>
                    <View style={styles.calendarIconCircle}>
                        <Icon name="calendar-clock" size={48} color="#f59e0b" />
                    </View>

                    <Text style={styles.scheduledBadge}>SYNCHRONIZED SCHEDULED EXAM</Text>
                    <Text style={styles.scheduledTitle}>{paperData?.content?.title || paperTitle}</Text>
                    <Text style={styles.scheduledSubtitle}>
                        This paper is synchronized to start simultaneously for all registered students.
                    </Text>

                    <View style={styles.countdownCard}>
                        <Text style={styles.countdownCardLabel}>EXAM STARTS IN</Text>
                        <Text style={styles.countdownValue}>{formatCountdownDays(timeUntilStartSeconds)}</Text>
                        <Text style={styles.countdownCardNotice}>
                            Questions will unlock automatically when the timer reaches zero.
                        </Text>
                    </View>
                </View>
            )}

            {/* 🌟 3. IN PROGRESS EXAM STATE 🌟 */}
            {examStatus === 'IN_PROGRESS' && (
                <View style={{ flex: 1 }}>
                    <ScrollView contentContainerStyle={styles.examScroll} showsVerticalScrollIndicator={false}>
                        {currentQ ? (
                            <View style={styles.questionCard}>
                                {/* Question Top Bar */}
                                <View style={styles.qTopBar}>
                                    <View style={styles.qBadge}>
                                        <Text style={styles.qBadgeText}>Question {currentQuestionIdx + 1} of {questions.length}</Text>
                                    </View>
                                    <View style={styles.qStatusBadge}>
                                        <Icon
                                            name={selectedAnswers[currentQ.id] !== undefined ? "check-circle" : "circle-outline"}
                                            size={14}
                                            color={selectedAnswers[currentQ.id] !== undefined ? "#34d399" : "#94a3b8"}
                                        />
                                        <Text style={[
                                            styles.qStatusText,
                                            selectedAnswers[currentQ.id] !== undefined && { color: '#34d399' }
                                        ]}>
                                            {selectedAnswers[currentQ.id] !== undefined ? 'Answered' : 'Not Answered'}
                                        </Text>
                                    </View>
                                </View>

                                {/* Question Text */}
                                <Text style={styles.questionText}>{currentQ.questionText}</Text>

                                {/* Optional Question Image / Figure */}
                                {currentQ.image && (
                                    <View style={styles.qImageBox}>
                                        <Image
                                            source={{ uri: `https://imacampus.online/api/storage/documents/${currentQ.image}` }}
                                            style={styles.qImage}
                                            resizeMode="contain"
                                        />
                                    </View>
                                )}

                                {/* Options List */}
                                <View style={styles.optionsWrap}>
                                    {(currentQ.options || []).map((opt, optIdx) => {
                                        const isSelected = selectedAnswers[currentQ.id] === opt.id;
                                        return (
                                            <TouchableOpacity
                                                key={opt.id || optIdx}
                                                style={[
                                                    styles.optionBtn,
                                                    isSelected && styles.optionBtnSelected
                                                ]}
                                                onPress={() => handleSelectOption(currentQ.id, opt.id)}
                                                activeOpacity={0.8}
                                            >
                                                <View style={[
                                                    styles.optionNumberCircle,
                                                    isSelected && styles.optionNumberCircleSelected
                                                ]}>
                                                    {isSelected ? (
                                                        <Icon name="check" size={16} color="#ffffff" />
                                                    ) : (
                                                        <Text style={styles.optionNumberText}>{optIdx + 1}</Text>
                                                    )}
                                                </View>
                                                <Text style={[
                                                    styles.optionText,
                                                    isSelected && styles.optionTextSelected
                                                ]}>
                                                    {opt.optionText}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>
                        ) : (
                            <View style={styles.emptyWrap}>
                                <Text style={styles.emptyText}>No questions available in this paper.</Text>
                            </View>
                        )}
                    </ScrollView>

                    {/* Bottom Sticky Action Bar */}
                    <View style={styles.bottomActionBar}>
                        <TouchableOpacity
                            style={[styles.navBtn, currentQuestionIdx === 0 && styles.navBtnDisabled]}
                            disabled={currentQuestionIdx === 0}
                            onPress={() => setCurrentQuestionIdx(prev => Math.max(0, prev - 1))}
                        >
                            <Icon name="chevron-left" size={20} color="#ffffff" />
                            <Text style={styles.navBtnText}>Previous</Text>
                        </TouchableOpacity>

                        {currentQuestionIdx < questions.length - 1 ? (
                            <TouchableOpacity
                                style={styles.nextBtn}
                                onPress={() => setCurrentQuestionIdx(prev => Math.min(questions.length - 1, prev + 1))}
                            >
                                <Text style={styles.nextBtnText}>Next</Text>
                                <Icon name="chevron-right" size={20} color="#ffffff" />
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                style={styles.submitExamBtn}
                                onPress={() => setShowConfirmModal(true)}
                            >
                                <Icon name="send" size={16} color="#ffffff" />
                                <Text style={styles.submitExamBtnText}>Submit Exam</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            )}

            {/* 🌟 4. SUBMITTED / RESULTS STATE 🌟 */}
            {examStatus === 'SUBMITTED' && (
                <ScrollView contentContainerStyle={styles.resultScroll} showsVerticalScrollIndicator={false}>
                    {/* Score Banner */}
                    <View style={styles.scoreBanner}>
                        <View style={styles.trophyCircle}>
                            <Icon name="trophy-award" size={42} color="#ffffff" />
                        </View>

                        <View style={[
                            styles.passFailBadge,
                            (submission?.score || 0) >= (paperData?.paper?.passMarks || 40) ? styles.passBadge : styles.failBadge
                        ]}>
                            <Text style={styles.passFailText}>
                                {(submission?.score || 0) >= (paperData?.paper?.passMarks || 40) ? 'EXAM PASSED' : 'EXAM FAILED'}
                            </Text>
                        </View>

                        <Text style={styles.scorePercentage}>{submission?.score || 0}%</Text>
                        <Text style={styles.scoreDetail}>
                            You scored {submission?.correctAnswers || 0} of {submission?.totalQuestions || questions.length} questions correctly.
                        </Text>

                        {/* Summary Numbers */}
                        <View style={styles.resultStatsRow}>
                            <View style={styles.resultStatBox}>
                                <Text style={styles.statLabel}>Pass Mark</Text>
                                <Text style={styles.statValue}>{paperData?.paper?.passMarks || 40}%</Text>
                            </View>
                            <View style={styles.resultStatBox}>
                                <Text style={styles.statLabel}>Correct</Text>
                                <Text style={[styles.statValue, { color: '#34d399' }]}>{submission?.correctAnswers || 0}</Text>
                            </View>
                            <View style={styles.resultStatBox}>
                                <Text style={styles.statLabel}>Total</Text>
                                <Text style={styles.statValue}>{questions.length}</Text>
                            </View>
                        </View>
                    </View>

                    {/* Question Review Section */}
                    <View style={styles.reviewHeader}>
                        <Icon name="eye-outline" size={20} color="#818cf8" />
                        <Text style={styles.reviewHeaderText}>Question Review</Text>
                    </View>

                    {questions.map((q, idx) => {
                        const studentAnswerId = selectedAnswers[q.id];
                        return (
                            <View key={q.id || idx} style={styles.reviewCard}>
                                <View style={styles.reviewCardTop}>
                                    <Text style={styles.reviewQNum}>Question {idx + 1}</Text>
                                </View>
                                <Text style={styles.reviewQText}>{q.questionText}</Text>

                                {q.image && (
                                    <View style={styles.qImageBox}>
                                        <Image
                                            source={{ uri: `https://imacampus.online/api/storage/documents/${q.image}` }}
                                            style={styles.qImage}
                                            resizeMode="contain"
                                        />
                                    </View>
                                )}

                                <View style={styles.reviewOptionsList}>
                                    {(q.options || []).map((opt, oIdx) => {
                                        const isChosen = studentAnswerId === opt.id;
                                        const isCorrect = opt.isCorrect;

                                        let optStyle = styles.reviewOpt;
                                        if (isCorrect) optStyle = [styles.reviewOpt, styles.reviewOptCorrect];
                                        else if (isChosen && !isCorrect) optStyle = [styles.reviewOpt, styles.reviewOptWrong];

                                        return (
                                            <View key={opt.id || oIdx} style={optStyle}>
                                                <View style={[
                                                    styles.reviewOptCircle,
                                                    isCorrect && { backgroundColor: '#059669' },
                                                    isChosen && !isCorrect && { backgroundColor: '#dc2626' }
                                                ]}>
                                                    {isCorrect ? (
                                                        <Icon name="check" size={14} color="#ffffff" />
                                                    ) : isChosen ? (
                                                        <Icon name="close" size={14} color="#ffffff" />
                                                    ) : (
                                                        <Text style={styles.reviewOptCircleText}>{oIdx + 1}</Text>
                                                    )}
                                                </View>
                                                <Text style={[
                                                    styles.reviewOptText,
                                                    isCorrect && { color: '#34d399', fontWeight: 'bold' },
                                                    isChosen && !isCorrect && { color: '#f87171' }
                                                ]}>
                                                    {opt.optionText}
                                                </Text>
                                                {isCorrect && (
                                                    <View style={styles.correctPill}>
                                                        <Text style={styles.correctPillText}>Correct</Text>
                                                    </View>
                                                )}
                                                {isChosen && !isCorrect && (
                                                    <View style={styles.wrongPill}>
                                                        <Text style={styles.wrongPillText}>Your Choice</Text>
                                                    </View>
                                                )}
                                            </View>
                                        );
                                    })}
                                </View>
                            </View>
                        );
                    })}
                </ScrollView>
            )}

            {/* 🌟 QUESTION PALETTE MODAL 🌟 */}
            <Modal visible={showPaletteModal} transparent animationType="fade">
                <View style={styles.modalBackdrop}>
                    <View style={styles.paletteModalCard}>
                        <View style={styles.paletteModalHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Icon name="grid" size={20} color="#818cf8" />
                                <Text style={styles.paletteModalTitle}>Question Palette</Text>
                            </View>
                            <TouchableOpacity onPress={() => setShowPaletteModal(false)}>
                                <Icon name="close" size={22} color="#94a3b8" />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.paletteSummaryRow}>
                            <View style={styles.paletteLegend}>
                                <View style={[styles.legendDot, { backgroundColor: '#059669' }]} />
                                <Text style={styles.legendText}>Answered ({answeredCount})</Text>
                            </View>
                            <View style={styles.paletteLegend}>
                                <View style={[styles.legendDot, { backgroundColor: '#334155' }]} />
                                <Text style={styles.legendText}>Unanswered ({unansweredCount})</Text>
                            </View>
                        </View>

                        <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={styles.paletteGrid}>
                            {questions.map((q, idx) => {
                                const isAnswered = selectedAnswers[q.id] !== undefined;
                                const isCurrent = idx === currentQuestionIdx;
                                return (
                                    <TouchableOpacity
                                        key={q.id || idx}
                                        style={[
                                            styles.paletteItem,
                                            isAnswered && styles.paletteItemAnswered,
                                            isCurrent && styles.paletteItemCurrent
                                        ]}
                                        onPress={() => {
                                            setCurrentQuestionIdx(idx);
                                            setShowPaletteModal(false);
                                        }}
                                    >
                                        <Text style={[
                                            styles.paletteItemText,
                                            isAnswered && { color: '#ffffff' },
                                            isCurrent && { fontWeight: '900', color: '#ffffff' }
                                        ]}>
                                            {idx + 1}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>

                        <TouchableOpacity
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                                paddingVertical: 10,
                                marginTop: 10,
                                marginBottom: 6,
                                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: 'rgba(245, 158, 11, 0.25)'
                            }}
                            onPress={() => {
                                setShowPaletteModal(false);
                                setShowInstructions(true);
                            }}
                        >
                            <Icon name="information-outline" size={16} color="#f59e0b" />
                            <Text style={{ color: '#f59e0b', fontSize: 12, fontWeight: '700' }}>View Exam Instructions</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.paletteDoneBtn}
                            onPress={() => setShowPaletteModal(false)}
                        >
                            <Text style={styles.paletteDoneBtnText}>CLOSE PALETTE</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* 🌟 CONFIRM SUBMIT MODAL 🌟 */}
            <Modal visible={showConfirmModal} transparent animationType="fade">
                <View style={styles.modalBackdrop}>
                    <View style={styles.confirmModalCard}>
                        <View style={styles.confirmIconCircle}>
                            <Icon name="send-check" size={36} color="#ffffff" />
                        </View>
                        <Text style={styles.confirmTitle}>Submit Examination?</Text>
                        <Text style={styles.confirmMsg}>
                            Are you ready to submit your answers? Once submitted, you cannot change your answers.
                        </Text>

                        <View style={styles.confirmStatsBox}>
                            <Text style={styles.confirmStatText}>
                                ✅ Answered: <Text style={{ fontWeight: 'bold', color: '#34d399' }}>{answeredCount}</Text>
                            </Text>
                            <Text style={styles.confirmStatText}>
                                ⚠️ Unanswered: <Text style={{ fontWeight: 'bold', color: unansweredCount > 0 ? '#f87171' : '#94a3b8' }}>{unansweredCount}</Text>
                            </Text>
                        </View>

                        <View style={styles.confirmActionsRow}>
                            <TouchableOpacity
                                style={styles.confirmCancelBtn}
                                onPress={() => setShowConfirmModal(false)}
                            >
                                <Text style={styles.confirmCancelText}>Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.confirmSubmitBtn}
                                onPress={executeSubmit}
                                disabled={submitting}
                            >
                                {submitting ? (
                                    <ActivityIndicator size="small" color="#ffffff" />
                                ) : (
                                    <Text style={styles.confirmSubmitText}>Confirm & Submit</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

export default MCQPaperScreen;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0f1d'
    },
    centerContainer: {
        flex: 1,
        backgroundColor: '#0a0f1d',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20
    },
    loadingText: {
        color: '#94a3b8',
        marginTop: 12,
        fontSize: 14
    },
    header: {
        minHeight: 56,
        paddingVertical: 6,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.08)',
        backgroundColor: '#0e1526'
    },
    headerBackBtn: {
        width: 34,
        height: 34,
        borderRadius: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8
    },
    headerTitleWrap: {
        flex: 1,
        justifyContent: 'center',
        marginRight: 6
    },
    headerSubBadge: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#f43f5e',
        textTransform: 'uppercase',
        letterSpacing: 0.5
    },
    headerTitle: {
        fontSize: 13,
        fontWeight: '800',
        color: '#ffffff',
        lineHeight: 17
    },
    headerRightActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5
    },
    timerPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 7,
        paddingVertical: 4,
        borderRadius: 12,
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.3)'
    },
    timerPillUrgent: {
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        borderColor: 'rgba(239, 68, 68, 0.4)'
    },
    timerText: {
        fontSize: 11,
        fontWeight: 'bold',
        color: '#34d399',
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'
    },
    timerTextUrgent: {
        color: '#f87171'
    },
    paletteToggleBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 7,
        paddingVertical: 4,
        borderRadius: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)'
    },
    paletteToggleText: {
        color: '#ffffff',
        fontSize: 10,
        fontWeight: 'bold'
    },
    /* Pre-Start Screen */
    preStartScroll: {
        padding: 20,
        alignItems: 'center'
    },
    thumbnailContainer: {
        width: '100%',
        aspectRatio: 16 / 9,
        maxHeight: 220,
        borderRadius: 18,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.12)',
        marginBottom: 18,
        position: 'relative'
    },
    thumbnailImage: {
        width: '100%',
        height: '100%'
    },
    thumbnailPlaceholder: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center'
    },
    thumbnailOverlayBadge: {
        position: 'absolute',
        top: 12,
        right: 12,
        backgroundColor: 'rgba(6, 78, 59, 0.85)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        borderWidth: 1,
        borderColor: 'rgba(52, 211, 153, 0.4)'
    },
    thumbnailOverlayText: {
        color: '#34d399',
        fontSize: 11,
        fontWeight: 'bold'
    },
    preStartContent: {
        width: '100%',
        alignItems: 'center'
    },
    preStartTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#ffffff',
        textAlign: 'center',
        marginBottom: 4
    },
    preStartCourse: {
        fontSize: 13,
        color: '#94a3b8',
        marginBottom: 16,
        textAlign: 'center'
    },
    instructionBox: {
        width: '100%',
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 14,
        padding: 14,
        marginBottom: 16
    },
    instructionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 6
    },
    instructionHeaderText: {
        color: '#c7d2fe',
        fontSize: 13,
        fontWeight: 'bold'
    },
    instructionText: {
        color: '#94a3b8',
        fontSize: 12,
        lineHeight: 18
    },
    metricsGrid: {
        flexDirection: 'row',
        gap: 10,
        width: '100%',
        marginBottom: 24
    },
    metricCard: {
        flex: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 14,
        padding: 12,
        alignItems: 'center'
    },
    metricLabel: {
        fontSize: 10,
        fontWeight: 'bold',
        color: '#94a3b8',
        marginTop: 6,
        textTransform: 'uppercase'
    },
    metricValue: {
        fontSize: 13,
        fontWeight: 'bold',
        color: '#ffffff',
        marginTop: 2
    },
    startBtn: {
        width: '100%',
        borderRadius: 14,
        overflow: 'hidden',
        elevation: 6
    },
    startBtnGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        gap: 8
    },
    startBtnText: {
        color: '#ffffff',
        fontSize: 15,
        fontWeight: '900',
        letterSpacing: 0.5
    },
    /* Scheduled Countdown View */
    countdownCenterWrap: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24
    },
    calendarIconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(245, 158, 11, 0.12)',
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.3)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16
    },
    scheduledBadge: {
        color: '#fbbf24',
        fontSize: 11,
        fontWeight: 'bold',
        letterSpacing: 0.5,
        marginBottom: 8
    },
    scheduledTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: '#ffffff',
        textAlign: 'center',
        marginBottom: 6
    },
    scheduledSubtitle: {
        fontSize: 12,
        color: '#94a3b8',
        textAlign: 'center',
        marginBottom: 24,
        paddingHorizontal: 20
    },
    countdownCard: {
        width: '100%',
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.3)',
        borderRadius: 20,
        padding: 24,
        alignItems: 'center'
    },
    countdownCardLabel: {
        color: '#fbbf24',
        fontSize: 11,
        fontWeight: 'bold',
        letterSpacing: 1,
        marginBottom: 8
    },
    countdownValue: {
        fontSize: 32,
        fontWeight: '900',
        color: '#ffffff',
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        marginBottom: 10
    },
    countdownCardNotice: {
        color: '#64748b',
        fontSize: 11,
        textAlign: 'center'
    },
    /* Exam In-Progress Screen */
    examScroll: {
        padding: 16,
        paddingBottom: 24
    },
    questionCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 20,
        padding: 16
    },
    qTopBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.06)',
        paddingBottom: 10,
        marginBottom: 14
    },
    qBadge: {
        backgroundColor: 'rgba(244, 63, 94, 0.15)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(244, 63, 94, 0.3)'
    },
    qBadgeText: {
        color: '#fb7185',
        fontSize: 11,
        fontWeight: 'bold'
    },
    qStatusBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4
    },
    qStatusText: {
        color: '#94a3b8',
        fontSize: 11
    },
    questionText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#ffffff',
        lineHeight: 24,
        marginBottom: 16
    },
    qImageBox: {
        width: '100%',
        height: 200,
        backgroundColor: '#000000',
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 16,
        justifyContent: 'center',
        alignItems: 'center'
    },
    qImage: {
        width: '100%',
        height: '100%'
    },
    optionsWrap: {
        gap: 10
    },
    optionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: 14,
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        gap: 12
    },
    optionBtnSelected: {
        backgroundColor: 'rgba(244, 63, 94, 0.12)',
        borderColor: '#f43f5e'
    },
    optionNumberCircle: {
        width: 30,
        height: 30,
        borderRadius: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        justifyContent: 'center',
        alignItems: 'center'
    },
    optionNumberCircleSelected: {
        backgroundColor: '#f43f5e'
    },
    optionNumberText: {
        color: '#94a3b8',
        fontSize: 13,
        fontWeight: 'bold'
    },
    optionText: {
        flex: 1,
        color: '#cbd5e1',
        fontSize: 14,
        lineHeight: 20
    },
    optionTextSelected: {
        color: '#ffffff',
        fontWeight: 'bold'
    },
    bottomActionBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#0e1526',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.08)'
    },
    navBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        gap: 6
    },
    navBtnDisabled: {
        opacity: 0.3
    },
    navBtnText: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: 'bold'
    },
    nextBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: '#3b82f6',
        gap: 6
    },
    nextBtnText: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: 'bold'
    },
    submitExamBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: '#059669',
        gap: 6
    },
    submitExamBtnText: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: '900'
    },
    /* Submitted / Scorecard Section */
    resultScroll: {
        padding: 16
    },
    scoreBanner: {
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.12)',
        borderRadius: 22,
        padding: 24,
        alignItems: 'center',
        marginBottom: 20
    },
    trophyCircle: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: '#d97706',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
        borderWidth: 3,
        borderColor: 'rgba(255, 255, 255, 0.2)'
    },
    passFailBadge: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 20,
        marginBottom: 6
    },
    passBadge: {
        backgroundColor: 'rgba(16, 185, 129, 0.2)',
        borderWidth: 1,
        borderColor: 'rgba(16, 185, 129, 0.5)'
    },
    failBadge: {
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.5)'
    },
    passFailText: {
        fontSize: 11,
        fontWeight: '900',
        color: '#ffffff',
        letterSpacing: 0.5
    },
    scorePercentage: {
        fontSize: 44,
        fontWeight: '900',
        color: '#ffffff',
        marginVertical: 4
    },
    scoreDetail: {
        fontSize: 13,
        color: '#94a3b8',
        textAlign: 'center',
        marginBottom: 16
    },
    resultStatsRow: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.08)',
        paddingTop: 14
    },
    resultStatBox: {
        flex: 1,
        alignItems: 'center'
    },
    statLabel: {
        fontSize: 11,
        color: '#94a3b8',
        marginBottom: 2
    },
    statValue: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#ffffff'
    },
    reviewHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 14
    },
    reviewHeaderText: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: 'bold'
    },
    reviewCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)',
        borderRadius: 16,
        padding: 14,
        marginBottom: 14
    },
    reviewCardTop: {
        marginBottom: 6
    },
    reviewQNum: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#818cf8'
    },
    reviewQText: {
        fontSize: 14,
        color: '#ffffff',
        fontWeight: '600',
        marginBottom: 12
    },
    reviewOptionsList: {
        gap: 8
    },
    reviewOpt: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        borderRadius: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.02)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.06)',
        gap: 8
    },
    reviewOptCorrect: {
        backgroundColor: 'rgba(5, 150, 105, 0.15)',
        borderColor: '#059669'
    },
    reviewOptWrong: {
        backgroundColor: 'rgba(220, 38, 38, 0.15)',
        borderColor: '#dc2626'
    },
    reviewOptCircle: {
        width: 24,
        height: 24,
        borderRadius: 8,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        justifyContent: 'center',
        alignItems: 'center'
    },
    reviewOptCircleText: {
        color: '#94a3b8',
        fontSize: 11,
        fontWeight: 'bold'
    },
    reviewOptText: {
        flex: 1,
        color: '#94a3b8',
        fontSize: 12
    },
    correctPill: {
        backgroundColor: 'rgba(5, 150, 105, 0.3)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6
    },
    correctPillText: {
        color: '#34d399',
        fontSize: 10,
        fontWeight: 'bold'
    },
    wrongPill: {
        backgroundColor: 'rgba(220, 38, 38, 0.3)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6
    },
    wrongPillText: {
        color: '#f87171',
        fontSize: 10,
        fontWeight: 'bold'
    },
    /* Question Palette Modal */
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20
    },
    paletteModalCard: {
        width: '100%',
        backgroundColor: '#0e1526',
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.12)'
    },
    paletteModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12
    },
    paletteModalTitle: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: 'bold'
    },
    paletteSummaryRow: {
        flexDirection: 'row',
        gap: 16,
        marginBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255, 255, 255, 0.08)',
        paddingBottom: 10
    },
    paletteLegend: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6
    },
    legendDot: {
        width: 10,
        height: 10,
        borderRadius: 5
    },
    legendText: {
        color: '#94a3b8',
        fontSize: 11
    },
    paletteGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        justifyContent: 'flex-start'
    },
    paletteItem: {
        width: (width - 40 - 40 - 40) / 5,
        height: 42,
        borderRadius: 10,
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.08)'
    },
    paletteItemAnswered: {
        backgroundColor: '#059669',
        borderColor: '#10b981'
    },
    paletteItemCurrent: {
        borderWidth: 2,
        borderColor: '#38bdf8'
    },
    paletteItemText: {
        color: '#94a3b8',
        fontSize: 13,
        fontWeight: 'bold'
    },
    paletteDoneBtn: {
        marginTop: 18,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: 'center'
    },
    paletteDoneBtnText: {
        color: '#ffffff',
        fontSize: 12,
        fontWeight: 'bold',
        letterSpacing: 0.5
    },
    /* Confirm Modal */
    confirmModalCard: {
        width: '100%',
        backgroundColor: '#0e1526',
        borderRadius: 22,
        padding: 24,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.12)'
    },
    confirmIconCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#059669',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 14
    },
    confirmTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#ffffff',
        marginBottom: 6
    },
    confirmMsg: {
        fontSize: 13,
        color: '#94a3b8',
        textAlign: 'center',
        lineHeight: 18,
        marginBottom: 16
    },
    confirmStatsBox: {
        width: '100%',
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderRadius: 12,
        padding: 12,
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 20
    },
    confirmStatText: {
        fontSize: 13,
        color: '#cbd5e1'
    },
    confirmActionsRow: {
        flexDirection: 'row',
        gap: 12,
        width: '100%'
    },
    confirmCancelBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
        alignItems: 'center'
    },
    confirmCancelText: {
        color: '#cbd5e1',
        fontSize: 13,
        fontWeight: 'bold'
    },
    confirmSubmitBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: '#059669',
        alignItems: 'center'
    },
    confirmSubmitText: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: 'bold'
    },
    emptyWrap: {
        padding: 30,
        alignItems: 'center'
    },
    emptyText: {
        color: '#94a3b8',
        fontSize: 14
    }
});
