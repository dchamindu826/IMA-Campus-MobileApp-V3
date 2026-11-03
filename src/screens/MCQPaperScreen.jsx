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

    const [activeContentId, setActiveContentId] = useState(contentId || null);
    const [activeCourseTitle, setActiveCourseTitle] = useState(courseTitle || "");
    const [activePaperTitle, setActivePaperTitle] = useState(paperTitle || "");
    const [activeThumbnail, setActiveThumbnail] = useState(initialThumbnail || null);

    // Exam Hub States (When opened without contentId)
    const [hubLoading, setHubLoading] = useState(!contentId);
    const [hubTab, setHubTab] = useState("AVAILABLE"); // "AVAILABLE" | "HISTORY"
    const [hubPapers, setHubPapers] = useState([]);
    const [hubProgress, setHubProgress] = useState(null);

    const [loading, setLoading] = useState(Boolean(contentId));
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

    const loadHubData = async () => {
        try {
            setHubLoading(true);
            const [progRes, classRes] = await Promise.all([
                api.get("papers/student/progress").catch(() => ({ data: null })),
                api.get("mobile/classroom").catch(() => ({ data: [] }))
            ]);

            setHubProgress(progRes?.data || null);
            const subjects = classRes?.data || [];

            const modulePromises = subjects.map(s =>
                api.get(`mobile/module/${s.id}`).then(res => ({ subject: s, data: res.data })).catch(() => null)
            );
            const moduleRes = await Promise.all(modulePromises);

            const collected = [];
            moduleRes.filter(Boolean).forEach(m => {
                const groups = m.data?.lessonGroups || m.data?.contentGroups || [];
                const directContents = m.data?.contents || [];
                const allItems = [...directContents];
                groups.forEach(g => {
                    if (Array.isArray(g.contents)) allItems.push(...g.contents);
                });

                allItems.forEach(item => {
                    const isPaper = item.type === "paper" || item.type === "exam" || item.paper || String(item.title || "").toLowerCase().includes("paper");
                    if (isPaper) {
                        collected.push({
                            id: item.id,
                            contentId: item.id,
                            title: item.title,
                            courseTitle: m.subject?.name || "Course Subject",
                            batchName: m.subject?.batchName || "",
                            paperType: item.paper?.paperType || "MCQ",
                            durationMinutes: item.paper?.durationMinutes || 60,
                            totalQuestions: item.paper?.questionsCount || item.paper?.questions?.length || 50,
                            thumbnail: item.thumbnail
                        });
                    }
                });
            });

            setHubPapers(collected);
        } catch (err) {
            console.log("Error loading exam hub:", err);
        } finally {
            setHubLoading(false);
        }
    };

    useEffect(() => {
        if (activeContentId) {
            loadPaper(activeContentId);
        } else {
            loadHubData();
        }
        return () => {
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        };
    }, [activeContentId]);

    const loadPaper = async (targetId = activeContentId) => {
        if (!targetId) return;
        try {
            setLoading(true);
            const res = await api.get(`papers/content/${targetId}`);
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

    if (!activeContentId) {
        return (
            <View style={[styles.container, { paddingTop: Math.max(insets.top, 20) + 8, paddingBottom: insets.bottom, backgroundColor: "#F8FAFC" }]}>
                <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

                {/* HUB TOP HEADER */}
                <View style={[styles.header, { backgroundColor: "#FFFFFF", borderBottomColor: "#E2E8F0" }]}>
                    <TouchableOpacity
                        onPress={() => navigation.goBack()}
                        style={[styles.headerBackBtn, { backgroundColor: "#F1F5F9" }]}
                    >
                        <Icon name="arrow-left" size={22} color="#0F172A" />
                    </TouchableOpacity>

                    <View style={styles.headerTitleWrap}>
                        <Text style={[styles.headerSubBadge, { color: COLORS.primary }]}>EXAM HALL & PAST PAPERS</Text>
                        <Text style={[styles.headerTitle, { color: "#0F172A", fontSize: 17 }]} numberOfLines={1}>
                            Online Examination Portal
                        </Text>
                    </View>

                    <TouchableOpacity
                        onPress={loadHubData}
                        style={[styles.headerBackBtn, { backgroundColor: "#F1F5F9", marginRight: 0 }]}
                    >
                        <Icon name="refresh" size={20} color="#64748B" />
                    </TouchableOpacity>
                </View>

                {/* Dual Tabs: Available vs History */}
                <View style={hubStyles.tabContainer}>
                    <TouchableOpacity
                        style={[hubStyles.tabBtn, hubTab === "AVAILABLE" && hubStyles.tabBtnActive]}
                        onPress={() => setHubTab("AVAILABLE")}
                    >
                        <Icon name="file-document-edit-outline" size={16} color={hubTab === "AVAILABLE" ? "#FFFFFF" : "#64748B"} style={{ marginRight: 6 }} />
                        <Text style={[hubStyles.tabText, hubTab === "AVAILABLE" && hubStyles.tabTextActive]}>
                            Active Exams ({hubPapers.length})
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[hubStyles.tabBtn, hubTab === "HISTORY" && hubStyles.tabBtnActive]}
                        onPress={() => setHubTab("HISTORY")}
                    >
                        <Icon name="history" size={16} color={hubTab === "HISTORY" ? "#FFFFFF" : "#64748B"} style={{ marginRight: 6 }} />
                        <Text style={[hubStyles.tabText, hubTab === "HISTORY" && hubStyles.tabTextActive]}>
                            Completed ({(hubProgress?.history || []).length})
                        </Text>
                    </TouchableOpacity>
                </View>

                {hubLoading ? (
                    <View style={[styles.centerContainer, { backgroundColor: "#F8FAFC" }]}>
                        <ActivityIndicator size="large" color={COLORS.primary} />
                        <Text style={[styles.loadingText, { color: "#64748B" }]}>Loading exam hall papers...</Text>
                    </View>
                ) : (
                    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
                        {/* Overall Stats Cards */}
                        <View style={hubStyles.statsGrid}>
                            <View style={hubStyles.statCard}>
                                <Icon name="clipboard-check-outline" size={22} color="#10B981" />
                                <Text style={hubStyles.statNum}>{hubProgress?.overall?.totalTaken || 0}</Text>
                                <Text style={hubStyles.statLabel}>Tests Completed</Text>
                            </View>
                            <View style={hubStyles.statCard}>
                                <Icon name="percent-outline" size={22} color="#3B82F6" />
                                <Text style={hubStyles.statNum}>{Math.round(hubProgress?.overall?.averageScore || 0)}%</Text>
                                <Text style={hubStyles.statLabel}>Average Score</Text>
                            </View>
                            <View style={hubStyles.statCard}>
                                <Icon name="trophy-outline" size={22} color="#F59E0B" />
                                <Text style={hubStyles.statNum}>{hubProgress?.overall?.highestScore || 0}</Text>
                                <Text style={hubStyles.statLabel}>Top Score</Text>
                            </View>
                        </View>

                        {hubTab === "AVAILABLE" ? (
                            <View>
                                <Text style={hubStyles.sectionHeader}>Available Practice & Model Papers</Text>
                                {hubPapers.length === 0 ? (
                                    <View style={hubStyles.emptyBox}>
                                        <Icon name="file-search-outline" size={54} color="#CBD5E1" />
                                        <Text style={hubStyles.emptyTitle}>No Pending Exams</Text>
                                        <Text style={hubStyles.emptySub}>You have attempted all currently available model papers for your enrolled subjects.</Text>
                                    </View>
                                ) : (
                                    hubPapers.map(paper => (
                                        <View key={paper.id} style={hubStyles.paperCard}>
                                            <View style={hubStyles.paperCardHeader}>
                                                <View style={hubStyles.paperTypePill}>
                                                    <Text style={hubStyles.paperTypePillText}>{paper.paperType || "MCQ"} PAPER</Text>
                                                </View>
                                                <Text style={hubStyles.paperDurationText}>⏱ {paper.durationMinutes || 60} mins</Text>
                                            </View>
                                            <Text style={hubStyles.paperTitle}>{paper.title}</Text>
                                            <Text style={hubStyles.paperSub}>{paper.courseTitle} {paper.batchName ? `• ${paper.batchName}` : ""}</Text>

                                            <View style={hubStyles.paperCardFooter}>
                                                <View style={hubStyles.badgeRow}>
                                                    <Icon name="help-circle-outline" size={14} color="#64748B" />
                                                    <Text style={hubStyles.badgeInfoText}>{paper.totalQuestions} Questions</Text>
                                                </View>

                                                <TouchableOpacity
                                                    activeOpacity={0.88}
                                                    style={hubStyles.startPaperBtn}
                                                    onPress={() => {
                                                        setActiveContentId(paper.contentId);
                                                        setActivePaperTitle(paper.title);
                                                        setActiveCourseTitle(paper.courseTitle);
                                                        setActiveThumbnail(paper.thumbnail);
                                                        loadPaper(paper.contentId);
                                                    }}
                                                >
                                                    <Text style={hubStyles.startPaperBtnText}>Start Exam</Text>
                                                    <Icon name="arrow-right" size={14} color="#FFFFFF" style={{ marginLeft: 4 }} />
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    ))
                                )}
                            </View>
                        ) : (
                            <View>
                                <Text style={hubStyles.sectionHeader}>Past Attempt History & Answers</Text>
                                {(hubProgress?.history || []).length === 0 ? (
                                    <View style={hubStyles.emptyBox}>
                                        <Icon name="history" size={54} color="#CBD5E1" />
                                        <Text style={hubStyles.emptyTitle}>No Completed Records</Text>
                                        <Text style={hubStyles.emptySub}>Complete your first exam to review detailed answer breakdowns and rankings.</Text>
                                    </View>
                                ) : (
                                    (hubProgress?.history || []).map((item, idx) => (
                                        <View key={item.id || idx} style={hubStyles.historyCard}>
                                            <View style={hubStyles.historyTopRow}>
                                                <View style={{ flex: 1, marginRight: 10 }}>
                                                    <Text style={hubStyles.historyTitle}>{item.testTitle || item.title || "Model Paper"}</Text>
                                                    <Text style={hubStyles.historyDate}>
                                                        {item.submittedAt ? new Date(item.submittedAt).toLocaleDateString() : "Completed"}
                                                    </Text>
                                                </View>
                                                <View style={hubStyles.historyScoreBox}>
                                                    <Text style={hubStyles.historyScoreText}>{item.score ?? 0}</Text>
                                                    <Text style={hubStyles.historyScoreSub}>PTS</Text>
                                                </View>
                                            </View>

                                            <View style={hubStyles.historyBottomRow}>
                                                <View style={{ flexDirection: "row", alignItems: "center" }}>
                                                    <Icon name="trophy-variant" size={14} color="#F59E0B" style={{ marginRight: 4 }} />
                                                    <Text style={hubStyles.historyRankText}>
                                                        Rank #{item.rank || 1} of {item.totalParticipants || 1}
                                                    </Text>
                                                </View>

                                                <TouchableOpacity
                                                    style={hubStyles.reviewBtn}
                                                    onPress={() => {
                                                        const targetCId = item.contentId || item.paper?.content?.id || item.paperId;
                                                        if (targetCId) {
                                                            setActiveContentId(targetCId);
                                                            setActivePaperTitle(item.testTitle || item.title);
                                                            loadPaper(targetCId);
                                                        }
                                                    }}
                                                >
                                                    <Text style={hubStyles.reviewBtnText}>Review Answers</Text>
                                                    <Icon name="chevron-right" size={14} color="#4F46E5" />
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    ))
                                )}
                            </View>
                        )}
                    </ScrollView>
                )}
            </View>
        );
    }

    if (loading) {
        return (
            <View style={[styles.centerContainer, { paddingTop: insets.top, backgroundColor: '#F8FAFC' }]}>
                <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={[styles.loadingText, { color: '#64748B' }]}>Loading exam details...</Text>
            </View>
        );
    }

    const handleExitExam = () => {
        const exitAction = () => {
            if (contentId) {
                navigation.goBack();
            } else {
                setActiveContentId(null);
                loadHubData();
            }
        };

        if (examStatus === 'IN_PROGRESS') {
            Alert.alert(
                "Leave Exam?",
                "Your exam timer is currently running! Are you sure you want to leave?",
                [
                    { text: "Cancel", style: "cancel" },
                    { text: "Leave", style: "destructive", onPress: exitAction }
                ]
            );
        } else {
            exitAction();
        }
    };

    return (
        <View style={[styles.container, { paddingTop: Math.max(insets.top, 20) + 8, paddingBottom: insets.bottom, backgroundColor: '#F8FAFC' }]}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

            {/* 🌟 TOP HEADER 🌟 */}
            <View style={[styles.header, { backgroundColor: '#FFFFFF', borderBottomColor: '#E2E8F0' }]}>
                <TouchableOpacity
                    onPress={handleExitExam}
                    style={[styles.headerBackBtn, { backgroundColor: '#F1F5F9' }]}
                >
                    <Icon name="arrow-left" size={22} color="#0F172A" />
                </TouchableOpacity>

                <View style={styles.headerTitleWrap}>
                    <Text style={[styles.headerSubBadge, { color: COLORS.primary }]}>MCQ Examination</Text>
                    <Text style={[styles.headerTitle, { color: '#0F172A' }]} numberOfLines={1}>
                        {paperData?.content?.title || activePaperTitle || "MCQ Paper"}
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
                                Alert.alert(
                                    "Exam Instructions",
                                    paperData?.paper?.instructions || "Read all questions carefully. Answers will automatically submit when time expires."
                                );
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
        backgroundColor: "#F8FAFC"
    },
    centerContainer: {
        flex: 1,
        backgroundColor: "#F8FAFC",
        justifyContent: "center",
        alignItems: "center",
        padding: 20
    },
    loadingText: {
        color: "#64748B",
        marginTop: 12,
        fontSize: 14,
        fontWeight: "600"
    },
    header: {
        minHeight: 56,
        paddingVertical: 8,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: "#E2E8F0",
        backgroundColor: "#FFFFFF",
        elevation: 2
    },
    headerBackBtn: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: "#F1F5F9",
        justifyContent: "center",
        alignItems: "center",
        marginRight: 10
    },
    headerTitleWrap: {
        flex: 1,
        justifyContent: "center",
        marginRight: 6
    },
    headerSubBadge: {
        fontSize: 10,
        fontWeight: "bold",
        color: COLORS.primary,
        textTransform: "uppercase",
        letterSpacing: 0.5
    },
    headerTitle: {
        fontSize: 15,
        fontWeight: "800",
        color: "#0F172A",
        lineHeight: 19
    },
    headerRightActions: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6
    },
    timerPill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 9,
        paddingVertical: 5,
        borderRadius: 12,
        backgroundColor: "#DCFCE7",
        borderWidth: 1,
        borderColor: "#86EFAC"
    },
    timerPillUrgent: {
        backgroundColor: "#FEE2E2",
        borderColor: "#FCA5A5"
    },
    timerText: {
        fontSize: 12,
        fontWeight: "900",
        color: "#16A34A"
    },
    timerTextUrgent: {
        color: "#DC2626"
    },
    paletteToggleBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: "#4F46E5",
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12
    },
    paletteToggleText: {
        fontSize: 11,
        fontWeight: "900",
        color: "#FFFFFF"
    },
    preStartScroll: {
        padding: 16,
        paddingBottom: 40
    },
    preStartContent: {
        backgroundColor: "#FFFFFF",
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        elevation: 2
    },
    thumbnailContainer: {
        width: "100%",
        height: 180,
        borderRadius: 14,
        overflow: "hidden",
        marginBottom: 16,
        backgroundColor: "#F1F5F9"
    },
    thumbnailImage: {
        width: "100%",
        height: "100%"
    },
    thumbnailPlaceholder: {
        width: "100%",
        height: "100%",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#EEF2FF"
    },
    thumbnailOverlayBadge: {
        position: "absolute",
        bottom: 10,
        left: 10,
        backgroundColor: "rgba(15, 23, 42, 0.75)",
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8
    },
    thumbnailOverlayText: {
        color: "#FFFFFF",
        fontSize: 10,
        fontWeight: "800"
    },
    preStartTitle: {
        fontSize: 20,
        fontWeight: "900",
        color: "#0F172A",
        marginBottom: 4
    },
    preStartCourse: {
        fontSize: 13,
        fontWeight: "700",
        color: "#64748B",
        marginBottom: 16
    },
    metricsGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 10,
        marginBottom: 20
    },
    metricCard: {
        width: (width - 74) / 2,
        backgroundColor: "#F8FAFC",
        borderRadius: 14,
        padding: 12,
        borderWidth: 1,
        borderColor: "#E2E8F0"
    },
    metricLabel: {
        color: "#64748B",
        fontSize: 11,
        fontWeight: "600"
    },
    metricValue: {
        color: "#0F172A",
        fontSize: 16,
        fontWeight: "900",
        marginTop: 4
    },
    instructionBox: {
        backgroundColor: "#F8FAFC",
        borderRadius: 14,
        padding: 14,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: "#E2E8F0"
    },
    instructionHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginBottom: 8
    },
    instructionHeaderText: {
        color: "#0F172A",
        fontSize: 13,
        fontWeight: "800"
    },
    instructionText: {
        color: "#475569",
        fontSize: 12,
        lineHeight: 18,
        marginBottom: 6
    },
    startBtn: {
        borderRadius: 14,
        overflow: "hidden"
    },
    startBtnGradient: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        paddingVertical: 14,
        borderRadius: 14
    },
    startBtnText: {
        color: "#FFFFFF",
        fontSize: 14,
        fontWeight: "900",
        letterSpacing: 0.5,
        marginLeft: 8
    },
    countdownCenterWrap: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        padding: 20
    },
    calendarIconCircle: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: "#FEF3C7",
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 16,
        borderWidth: 1,
        borderColor: "#FDE68A"
    },
    scheduledBadge: {
        color: "#D97706",
        fontSize: 11,
        fontWeight: "900",
        letterSpacing: 1,
        marginBottom: 6
    },
    scheduledTitle: {
        color: "#0F172A",
        fontSize: 20,
        fontWeight: "900",
        textAlign: "center",
        marginBottom: 6
    },
    scheduledSubtitle: {
        color: "#64748B",
        fontSize: 13,
        textAlign: "center",
        maxWidth: 280,
        marginBottom: 24
    },
    countdownCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 18,
        padding: 24,
        alignItems: "center",
        width: "100%",
        borderWidth: 1,
        borderColor: "#E2E8F0",
        elevation: 2
    },
    countdownCardLabel: {
        color: "#64748B",
        fontSize: 11,
        fontWeight: "800",
        letterSpacing: 1,
        marginBottom: 8
    },
    countdownValue: {
        color: "#4F46E5",
        fontSize: 28,
        fontWeight: "900",
        letterSpacing: 1
    },
    countdownCardNotice: {
        color: "#94A3B8",
        fontSize: 11,
        textAlign: "center",
        marginTop: 12
    },
    examScroll: {
        paddingBottom: 30
    },
    questionCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 18,
        padding: 18,
        marginHorizontal: 16,
        marginTop: 16,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        elevation: 2
    },
    qTopBar: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 14
    },
    qBadge: {
        backgroundColor: "#EEF2FF",
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8
    },
    qBadgeText: {
        color: "#4F46E5",
        fontSize: 11,
        fontWeight: "800"
    },
    qStatusBadge: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4
    },
    qStatusText: {
        color: "#64748B",
        fontSize: 11,
        fontWeight: "700"
    },
    questionText: {
        fontSize: 16,
        fontWeight: "700",
        color: "#0F172A",
        lineHeight: 24,
        marginBottom: 14
    },
    qImageBox: {
        width: "100%",
        height: 200,
        borderRadius: 12,
        overflow: "hidden",
        marginBottom: 14,
        backgroundColor: "#F8FAFC"
    },
    qImage: {
        width: "100%",
        height: "100%"
    },
    optionsWrap: {
        marginTop: 6
    },
    optionBtn: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#F8FAFC",
        borderRadius: 14,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1.5,
        borderColor: "#E2E8F0"
    },
    optionBtnSelected: {
        backgroundColor: "#EEF2FF",
        borderColor: "#4F46E5"
    },
    optionNumberCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: "#F1F5F9",
        justifyContent: "center",
        alignItems: "center",
        marginRight: 12,
        borderWidth: 1,
        borderColor: "#CBD5E1"
    },
    optionNumberCircleSelected: {
        backgroundColor: "#4F46E5",
        borderColor: "#4F46E5"
    },
    optionNumberText: {
        fontSize: 13,
        fontWeight: "800",
        color: "#475569"
    },
    optionText: {
        fontSize: 14,
        fontWeight: "600",
        color: "#334155",
        flex: 1,
        lineHeight: 20
    },
    optionTextSelected: {
        color: "#1E1B4B",
        fontWeight: "800"
    },
    emptyWrap: {
        padding: 40,
        alignItems: "center"
    },
    emptyText: {
        color: "#94A3B8",
        fontSize: 13,
        fontWeight: "600"
    },
    bottomActionBar: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: "#FFFFFF",
        borderTopWidth: 1,
        borderTopColor: "#E2E8F0"
    },
    navBtn: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#F1F5F9",
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12
    },
    navBtnDisabled: {
        opacity: 0.4
    },
    navBtnText: {
        color: "#334155",
        fontSize: 13,
        fontWeight: "700",
        marginLeft: 4
    },
    nextBtn: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#4F46E5",
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 12
    },
    nextBtnText: {
        color: "#FFFFFF",
        fontSize: 13,
        fontWeight: "800",
        marginRight: 4
    },
    submitExamBtn: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#16A34A",
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 12
    },
    submitExamBtnText: {
        color: "#FFFFFF",
        fontSize: 13,
        fontWeight: "800",
        marginLeft: 6
    },
    resultScroll: {
        padding: 16,
        paddingBottom: 50
    },
    scoreBanner: {
        backgroundColor: "#FFFFFF",
        borderRadius: 20,
        padding: 24,
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#E2E8F0",
        elevation: 2,
        marginBottom: 20
    },
    trophyCircle: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: "#D97706",
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 12
    },
    passFailBadge: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 8,
        marginBottom: 10
    },
    passBadge: {
        backgroundColor: "#DCFCE7"
    },
    failBadge: {
        backgroundColor: "#FEE2E2"
    },
    passFailText: {
        fontSize: 11,
        fontWeight: "900",
        color: "#16A34A"
    },
    scorePercentage: {
        fontSize: 42,
        fontWeight: "900",
        color: "#0F172A",
        marginBottom: 4
    },
    scoreDetail: {
        fontSize: 13,
        color: "#64748B",
        textAlign: "center",
        marginBottom: 18
    },
    resultStatsRow: {
        flexDirection: "row",
        width: "100%",
        backgroundColor: "#F8FAFC",
        borderRadius: 14,
        padding: 12,
        justifyContent: "space-around"
    },
    resultStatBox: {
        alignItems: "center"
    },
    statLabel: {
        fontSize: 10,
        fontWeight: "700",
        color: "#64748B"
    },
    statValue: {
        fontSize: 16,
        fontWeight: "900",
        color: "#0F172A",
        marginTop: 2
    },
    reviewHeader: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginBottom: 12
    },
    reviewHeaderText: {
        fontSize: 16,
        fontWeight: "900",
        color: "#0F172A"
    },
    reviewCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: "#E2E8F0"
    },
    reviewCardTop: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginBottom: 8
    },
    reviewQNum: {
        fontSize: 12,
        fontWeight: "800",
        color: "#4F46E5"
    },
    reviewQText: {
        fontSize: 14,
        fontWeight: "700",
        color: "#0F172A",
        lineHeight: 20,
        marginBottom: 12
    },
    reviewOptionsList: {
        gap: 8
    },
    reviewOpt: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#F8FAFC",
        borderRadius: 10,
        padding: 10,
        borderWidth: 1,
        borderColor: "#E2E8F0"
    },
    reviewOptCorrect: {
        backgroundColor: "#DCFCE7",
        borderColor: "#86EFAC"
    },
    reviewOptWrong: {
        backgroundColor: "#FEE2E2",
        borderColor: "#FCA5A5"
    },
    reviewOptCircle: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: "#E2E8F0",
        justifyContent: "center",
        alignItems: "center",
        marginRight: 8
    },
    reviewOptCircleText: {
        fontSize: 11,
        fontWeight: "800",
        color: "#475569"
    },
    reviewOptText: {
        fontSize: 13,
        fontWeight: "600",
        color: "#334155",
        flex: 1
    },
    correctPill: {
        backgroundColor: "#16A34A",
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6
    },
    correctPillText: {
        color: "#FFFFFF",
        fontSize: 9,
        fontWeight: "800"
    },
    wrongPill: {
        backgroundColor: "#DC2626",
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6
    },
    wrongPillText: {
        color: "#FFFFFF",
        fontSize: 9,
        fontWeight: "800"
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.5)",
        justifyContent: "center",
        alignItems: "center",
        padding: 20
    },
    paletteModalCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 20,
        padding: 20,
        width: "100%",
        maxHeight: "80%"
    },
    paletteModalHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 12
    },
    paletteModalTitle: {
        fontSize: 16,
        fontWeight: "900",
        color: "#0F172A"
    },
    paletteSummaryRow: {
        flexDirection: "row",
        justifyContent: "space-around",
        backgroundColor: "#F8FAFC",
        borderRadius: 12,
        padding: 10,
        marginBottom: 12
    },
    paletteLegend: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4
    },
    legendDot: {
        width: 10,
        height: 10,
        borderRadius: 5
    },
    legendText: {
        fontSize: 11,
        fontWeight: "700",
        color: "#64748B"
    },
    paletteGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        paddingVertical: 10
    },
    paletteItem: {
        width: (width - 100) / 5,
        height: 40,
        borderRadius: 10,
        backgroundColor: "#F1F5F9",
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#CBD5E1"
    },
    paletteItemAnswered: {
        backgroundColor: "#DCFCE7",
        borderColor: "#86EFAC"
    },
    paletteItemCurrent: {
        borderColor: "#4F46E5",
        borderWidth: 2
    },
    paletteItemText: {
        fontSize: 13,
        fontWeight: "800",
        color: "#0F172A"
    },
    paletteDoneBtn: {
        backgroundColor: "#4F46E5",
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: "center",
        marginTop: 10
    },
    paletteDoneBtnText: {
        color: "#FFFFFF",
        fontSize: 13,
        fontWeight: "800"
    },
    confirmModalCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 20,
        padding: 24,
        alignItems: "center",
        width: "100%"
    },
    confirmIconCircle: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: "#4F46E5",
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 14
    },
    confirmTitle: {
        fontSize: 18,
        fontWeight: "900",
        color: "#0F172A",
        marginBottom: 6
    },
    confirmMsg: {
        fontSize: 13,
        color: "#64748B",
        textAlign: "center",
        marginBottom: 16,
        lineHeight: 18
    },
    confirmStatsBox: {
        flexDirection: "row",
        justifyContent: "space-around",
        width: "100%",
        backgroundColor: "#F8FAFC",
        borderRadius: 12,
        padding: 12,
        marginBottom: 20
    },
    confirmStatText: {
        fontSize: 13,
        fontWeight: "700",
        color: "#0F172A"
    },
    confirmActionsRow: {
        flexDirection: "row",
        gap: 12,
        width: "100%"
    },
    confirmCancelBtn: {
        flex: 1,
        backgroundColor: "#F1F5F9",
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: "center"
    },
    confirmCancelText: {
        color: "#64748B",
        fontSize: 13,
        fontWeight: "800"
    },
    confirmSubmitBtn: {
        flex: 1,
        backgroundColor: "#16A34A",
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: "center"
    },
    confirmSubmitText: {
        color: "#FFFFFF",
        fontSize: 13,
        fontWeight: "800"
    }
});

const hubStyles = StyleSheet.create({
    tabContainer: {
        flexDirection: "row",
        backgroundColor: "#F1F5F9",
        marginHorizontal: 16,
        marginVertical: 10,
        borderRadius: 14,
        padding: 4,
        borderWidth: 1,
        borderColor: "#E2E8F0"
    },
    tabBtn: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 9,
        borderRadius: 10
    },
    tabBtnActive: {
        backgroundColor: "#4F46E5",
        elevation: 2
    },
    tabText: {
        color: "#64748B",
        fontSize: 12,
        fontWeight: "800"
    },
    tabTextActive: {
        color: "#FFFFFF"
    },
    statsGrid: {
        flexDirection: "row",
        gap: 10,
        marginBottom: 16
    },
    statCard: {
        flex: 1,
        backgroundColor: "#FFFFFF",
        borderRadius: 14,
        padding: 12,
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#E2E8F0",
        elevation: 1
    },
    statNum: {
        color: "#0F172A",
        fontSize: 18,
        fontWeight: "900",
        marginTop: 4
    },
    statLabel: {
        color: "#64748B",
        fontSize: 10,
        fontWeight: "700",
        marginTop: 2
    },
    sectionHeader: {
        color: "#0F172A",
        fontSize: 15,
        fontWeight: "900",
        marginBottom: 12
    },
    emptyBox: {
        backgroundColor: "#FFFFFF",
        borderRadius: 16,
        padding: 30,
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#E2E8F0"
    },
    emptyTitle: {
        color: "#0F172A",
        fontSize: 16,
        fontWeight: "800",
        marginTop: 10
    },
    emptySub: {
        color: "#64748B",
        fontSize: 12,
        textAlign: "center",
        marginTop: 4
    },
    paperCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        elevation: 1
    },
    paperCardHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 8
    },
    paperTypePill: {
        backgroundColor: "#EEF2FF",
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6
    },
    paperTypePillText: {
        color: "#4F46E5",
        fontSize: 9,
        fontWeight: "900"
    },
    paperDurationText: {
        color: "#64748B",
        fontSize: 11,
        fontWeight: "700"
    },
    paperTitle: {
        color: "#0F172A",
        fontSize: 15,
        fontWeight: "900",
        marginBottom: 4
    },
    paperSub: {
        color: "#64748B",
        fontSize: 11,
        fontWeight: "600",
        marginBottom: 12
    },
    paperCardFooter: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        borderTopWidth: 1,
        borderTopColor: "#F1F5F9",
        paddingTop: 10
    },
    badgeRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4
    },
    badgeInfoText: {
        color: "#64748B",
        fontSize: 11,
        fontWeight: "700"
    },
    startPaperBtn: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#10B981",
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 10
    },
    startPaperBtnText: {
        color: "#FFFFFF",
        fontSize: 11,
        fontWeight: "800"
    },
    historyCard: {
        backgroundColor: "#FFFFFF",
        borderRadius: 16,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        elevation: 1
    },
    historyTopRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 8
    },
    historyTitle: {
        color: "#0F172A",
        fontSize: 14,
        fontWeight: "800"
    },
    historyDate: {
        color: "#94A3B8",
        fontSize: 10,
        fontWeight: "600",
        marginTop: 2
    },
    historyScoreBox: {
        alignItems: "flex-end"
    },
    historyScoreText: {
        color: "#16A34A",
        fontSize: 16,
        fontWeight: "900"
    },
    historyScoreSub: {
        color: "#16A34A",
        fontSize: 8,
        fontWeight: "800"
    },
    historyBottomRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        borderTopWidth: 1,
        borderTopColor: "#F1F5F9",
        paddingTop: 8
    },
    historyRankText: {
        color: "#D97706",
        fontSize: 11,
        fontWeight: "700"
    },
    reviewBtn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 2
    },
    reviewBtnText: {
        color: "#4F46E5",
        fontSize: 11,
        fontWeight: "800"
    }
});
