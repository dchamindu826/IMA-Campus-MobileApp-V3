import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, DeviceEventEmitter, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import COLORS from '../constants/colors';
import downloadManager from '../services/downloadManager';

const GlobalDownloadWidget = () => {
    const [downloads, setDownloads] = useState({});
    const [slideAnim] = useState(new Animated.Value(100)); // Initial position off-screen

    useEffect(() => {
        // Load initial state
        const initialDownloads = downloadManager.getActiveDownloads();
        setDownloads({ ...initialDownloads });

        const onProgress = (data) => {
            setDownloads(prev => ({ ...prev, [data.itemId]: data }));
        };

        const onComplete = (data) => {
            setDownloads(prev => {
                const newDownloads = { ...prev };
                delete newDownloads[data.itemId];
                return newDownloads;
            });
        };

        const onError = (data) => {
            setDownloads(prev => {
                const newDownloads = { ...prev };
                delete newDownloads[data.itemId];
                return newDownloads;
            });
        };

        const onCancelled = (data) => {
            setDownloads(prev => {
                const newDownloads = { ...prev };
                delete newDownloads[data.itemId];
                return newDownloads;
            });
        };

        const onPaused = (data) => {
            setDownloads(prev => {
                if (!prev[data.itemId]) return prev;
                return {
                    ...prev,
                    [data.itemId]: {
                        ...prev[data.itemId],
                        isPaused: true,
                        detailText: 'Paused'
                    }
                };
            });
        };

        const onResumed = (data) => {
            setDownloads(prev => {
                if (!prev[data.itemId]) return prev;
                return {
                    ...prev,
                    [data.itemId]: {
                        ...prev[data.itemId],
                        isPaused: false,
                        detailText: 'Resuming...'
                    }
                };
            });
        };

        const progressSub = DeviceEventEmitter.addListener('DOWNLOAD_PROGRESS', onProgress);
        const completeSub = DeviceEventEmitter.addListener('DOWNLOAD_COMPLETE', onComplete);
        const errorSub = DeviceEventEmitter.addListener('DOWNLOAD_ERROR', onError);
        const cancelledSub = DeviceEventEmitter.addListener('DOWNLOAD_CANCELLED', onCancelled);
        const pausedSub = DeviceEventEmitter.addListener('DOWNLOAD_PAUSED', onPaused);
        const resumedSub = DeviceEventEmitter.addListener('DOWNLOAD_RESUMED', onResumed);

        return () => {
            progressSub.remove();
            completeSub.remove();
            errorSub.remove();
            cancelledSub.remove();
            pausedSub.remove();
            resumedSub.remove();
        };
    }, []);

    const hasDownloads = Object.keys(downloads).length > 0;

    useEffect(() => {
        if (hasDownloads) {
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 300,
                useNativeDriver: true,
            }).start();
        } else {
            Animated.timing(slideAnim, {
                toValue: 100,
                duration: 300,
                useNativeDriver: true,
            }).start();
        }
    }, [hasDownloads, slideAnim]);

    if (!hasDownloads) return null;

    // Show only the latest/first download or aggregate them
    const activeItems = Object.values(downloads);
    const firstItem = activeItems[0];
    const moreCount = activeItems.length - 1;

    let progressPercentage = 0;
    let progressText = '';
    if (firstItem.progress === '...') {
        progressText = firstItem.detailText || 'Preparing...';
    } else {
        progressPercentage = typeof firstItem.progress === 'number' ? firstItem.progress : 0;
        progressText = firstItem.detailText ? `${firstItem.detailText} (${progressPercentage}%)` : `${progressPercentage}%`;
    }

    return (
        <Animated.View style={[styles.container, { transform: [{ translateY: slideAnim }] }]}>
            <View style={styles.content}>
                <View style={[styles.iconBox, firstItem.isPaused && styles.iconBoxPaused]}>
                    <Icon
                        name={firstItem.isPaused ? "pause" : "cloud-download-outline"}
                        size={22}
                        color={firstItem.isPaused ? "#6B7280" : COLORS.primary}
                    />
                </View>
                <View style={styles.textContainer}>
                    <Text style={styles.title} numberOfLines={1}>
                        {firstItem.isPaused ? 'Paused: ' : 'Downloading: '}{firstItem.title}
                    </Text>
                    <View style={styles.progressBarBg}>
                        <View style={[
                            styles.progressBarFill,
                            { width: `${progressPercentage}%` },
                            firstItem.isPaused && styles.progressBarPaused
                        ]} />
                    </View>
                    <View style={styles.progressInfoRow}>
                        <Text style={styles.subtitle} numberOfLines={1}>
                            {firstItem.isPaused ? `Paused (${progressPercentage}%)` : progressText}
                        </Text>
                        {moreCount > 0 && (
                            <Text style={styles.moreText}>
                                +{moreCount} more
                            </Text>
                        )}
                    </View>
                </View>

                {/* 🔥 Action Buttons: Pause/Play & Cancel 🔥 */}
                <View style={styles.actionsRow}>
                    <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() => downloadManager.togglePauseResume(firstItem.itemId)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        activeOpacity={0.7}
                    >
                        <Icon
                            name={firstItem.isPaused ? "play" : "pause"}
                            size={18}
                            color={firstItem.isPaused ? COLORS.primary : "#374151"}
                        />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.actionBtn, styles.cancelBtn]}
                        onPress={() => downloadManager.cancelDownload(firstItem.itemId)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        activeOpacity={0.7}
                    >
                        <Icon name="close" size={18} color="#EF4444" />
                    </TouchableOpacity>
                </View>
            </View>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 20,
        left: 20,
        right: 20,
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 15,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
        elevation: 8,
        borderWidth: 1,
        borderColor: '#F3F4F6',
        zIndex: 9999,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconBox: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#FEF2F2',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    iconBoxPaused: {
        backgroundColor: '#F3F4F6',
    },
    textContainer: {
        flex: 1,
        justifyContent: 'center',
    },
    title: {
        color: '#1F2937',
        fontSize: 14,
        fontWeight: '800',
        marginBottom: 6,
    },
    progressBarBg: {
        width: '100%',
        height: 6,
        backgroundColor: '#F3F4F6',
        borderRadius: 3,
        overflow: 'hidden',
        marginBottom: 5,
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: COLORS.primary,
        borderRadius: 3,
    },
    progressBarPaused: {
        backgroundColor: '#9CA3AF',
    },
    progressInfoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    subtitle: {
        color: '#6B7280',
        fontSize: 11,
        fontWeight: '700',
        flex: 1,
    },
    moreText: {
        color: COLORS.primary,
        fontSize: 11,
        fontWeight: '800',
        marginLeft: 6,
    },
    actionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginLeft: 10,
    },
    actionBtn: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    cancelBtn: {
        marginLeft: 6,
        backgroundColor: '#FEE2E2',
    },
});

export default GlobalDownloadWidget;
