import React, { useState } from 'react';
import {
    View, Text, StyleSheet, Modal, TouchableOpacity,
    Platform, Dimensions, TouchableWithoutFeedback
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import LinearGradient from 'react-native-linear-gradient';
import COLORS from '../constants/colors';

const { width } = Dimensions.get('window');

/**
 * Calculates realistic estimated file sizes for different resolutions based on duration.
 */
export const getEstimatedSizes = (item) => {
    let durationMins = 90; // Default 1.5 hour lecture

    if (item?.durationMinutes) {
        durationMins = Number(item.durationMinutes) || 90;
    } else if (item?.duration) {
        const d = String(item.duration);
        if (d.includes(':')) {
            const parts = d.split(':').map(Number);
            if (parts.length === 3) durationMins = parts[0] * 60 + parts[1];
            else if (parts.length === 2) durationMins = parts[0];
        } else if (!isNaN(Number(d)) && Number(d) > 0) {
            durationMins = Number(d);
        }
    } else if (item?.paperTime) {
        durationMins = Number(item.paperTime) || 90;
    }

    // Realistic video bitrate estimations:
    // 480p: ~3.8 MB per minute
    // 720p: ~7.6 MB per minute
    // 1080p: ~15.2 MB per minute
    const size480 = Math.max(Math.round(durationMins * 3.8), 180);
    const size720 = Math.max(Math.round(durationMins * 7.6), 380);
    const size1080 = Math.max(Math.round(durationMins * 15.2), 760);

    const formatSize = (mb) => {
        if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
        return `${mb} MB`;
    };

    return [
        {
            quality: '480p',
            title: '480p SD',
            badge: 'Data Saver',
            badgeColor: '#D97706',
            badgeBg: '#FEF3C7',
            description: 'Low data usage • Faster download',
            sizeText: formatSize(size480),
            sizeMB: size480,
            recommended: false,
            icon: 'video-outline',
        },
        {
            quality: '720p',
            title: '720p HD',
            badge: 'Recommended',
            badgeColor: '#059669',
            badgeBg: '#ECFDF5',
            description: 'Balanced quality • Clear lecture slides',
            sizeText: formatSize(size720),
            sizeMB: size720,
            recommended: true,
            icon: 'high-definition',
        },
        {
            quality: '1080p',
            title: '1080p Full HD',
            badge: 'Best Visuals',
            badgeColor: '#2563EB',
            badgeBg: '#EFF6FF',
            description: 'Highest detail • Sharpest text & board',
            sizeText: formatSize(size1080),
            sizeMB: size1080,
            recommended: false,
            icon: 'star-circle-outline',
        },
    ];
};

const DownloadQualityModal = ({ visible, onClose, item, courseTitle, onSelectQuality }) => {
    const [selectedQuality, setSelectedQuality] = useState('720p');

    if (!item) return null;

    const options = getEstimatedSizes(item);
    const selectedOption = options.find(opt => opt.quality === selectedQuality) || options[1];

    const handleConfirm = () => {
        if (onSelectQuality) {
            onSelectQuality(item, selectedQuality);
        }
        onClose();
    };

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            onRequestClose={onClose}
        >
            <TouchableWithoutFeedback onPress={onClose}>
                <View style={styles.backdrop}>
                    <TouchableWithoutFeedback>
                        <View style={styles.sheetContainer}>
                            {/* Drag Indicator */}
                            <View style={styles.dragIndicator} />

                            {/* Header */}
                            <View style={styles.header}>
                                <View style={styles.headerIconBox}>
                                    <Icon name="download-box-outline" size={24} color={COLORS.primary} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.headerTitle}>Select Download Quality</Text>
                                    <Text style={styles.headerSubTitle} numberOfLines={1}>
                                        {item.title || 'Video Recording'}
                                    </Text>
                                </View>
                                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                                    <Icon name="close" size={20} color="#6B7280" />
                                </TouchableOpacity>
                            </View>

                            {/* Options List */}
                            <View style={styles.optionsList}>
                                {options.map((opt) => {
                                    const isSelected = selectedQuality === opt.quality;

                                    return (
                                        <TouchableOpacity
                                            key={opt.quality}
                                            activeOpacity={0.85}
                                            onPress={() => setSelectedQuality(opt.quality)}
                                            style={[
                                                styles.optionCard,
                                                isSelected && styles.optionCardSelected,
                                                opt.recommended && !isSelected && styles.optionCardRecommended
                                            ]}
                                        >
                                            {/* Radio Button */}
                                            <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                                                {isSelected && <View style={styles.radioInner} />}
                                            </View>

                                            {/* Content */}
                                            <View style={styles.optionContent}>
                                                <View style={styles.optionTitleRow}>
                                                    <Text style={[styles.optionTitle, isSelected && styles.optionTitleSelected]}>
                                                        {opt.title}
                                                    </Text>
                                                    <View style={[styles.optionBadge, { backgroundColor: opt.badgeBg }]}>
                                                        <Text style={[styles.optionBadgeText, { color: opt.badgeColor }]}>
                                                            {opt.badge}
                                                        </Text>
                                                    </View>
                                                </View>
                                                <Text style={styles.optionDesc}>{opt.description}</Text>
                                            </View>

                                            {/* Size */}
                                            <View style={styles.sizeBox}>
                                                <Text style={[styles.sizeText, isSelected && styles.sizeTextSelected]}>
                                                    ~{opt.sizeText}
                                                </Text>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            {/* Storage Note */}
                            <View style={styles.infoBanner}>
                                <Icon name="shield-check-outline" size={16} color="#059669" style={{ marginRight: 6 }} />
                                <Text style={styles.infoText}>
                                    Encrypted & saved for offline watching without data charges.
                                </Text>
                            </View>

                            {/* CTA Button */}
                            <TouchableOpacity
                                activeOpacity={0.85}
                                onPress={handleConfirm}
                                style={styles.ctaButton}
                            >
                                <LinearGradient
                                    colors={[COLORS.primary, '#8B0000']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 0 }}
                                    style={styles.ctaGradient}
                                >
                                    <Icon name="download" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                                    <Text style={styles.ctaText}>
                                        Download Now ({selectedOption.quality} • ~{selectedOption.sizeText})
                                    </Text>
                                </LinearGradient>
                            </TouchableOpacity>
                        </View>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
};

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        justifyContent: 'flex-end',
    },
    sheetContainer: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: Platform.OS === 'ios' ? 40 : 25,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 16,
        elevation: 20,
    },
    dragIndicator: {
        width: 40,
        height: 5,
        backgroundColor: '#E5E7EB',
        borderRadius: 3,
        alignSelf: 'center',
        marginBottom: 14,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 18,
    },
    headerIconBox: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: '#FEF2F2',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: '#111827',
        letterSpacing: 0.2,
    },
    headerSubTitle: {
        fontSize: 13,
        color: '#6B7280',
        marginTop: 2,
        fontWeight: '500',
    },
    closeBtn: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    optionsList: {
        gap: 10,
        marginBottom: 16,
    },
    optionCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: '#E5E7EB',
        backgroundColor: '#FFFFFF',
    },
    optionCardSelected: {
        borderColor: COLORS.primary,
        backgroundColor: '#FFF5F5',
    },
    optionCardRecommended: {
        borderColor: '#D1FAE5',
        backgroundColor: '#F9FAFB',
    },
    radioCircle: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: '#D1D5DB',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    radioCircleSelected: {
        borderColor: COLORS.primary,
    },
    radioInner: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: COLORS.primary,
    },
    optionContent: {
        flex: 1,
    },
    optionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 2,
    },
    optionTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#1F2937',
    },
    optionTitleSelected: {
        color: COLORS.primary,
        fontWeight: '800',
    },
    optionBadge: {
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 6,
    },
    optionBadgeText: {
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 0.2,
    },
    optionDesc: {
        fontSize: 12,
        color: '#6B7280',
        fontWeight: '500',
    },
    sizeBox: {
        marginLeft: 10,
        alignItems: 'flex-end',
    },
    sizeText: {
        fontSize: 14,
        fontWeight: '800',
        color: '#374151',
    },
    sizeTextSelected: {
        color: COLORS.primary,
    },
    infoBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F0FDF4',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 10,
        marginBottom: 16,
    },
    infoText: {
        fontSize: 11,
        color: '#166534',
        fontWeight: '600',
        flex: 1,
    },
    ctaButton: {
        borderRadius: 14,
        overflow: 'hidden',
        elevation: 3,
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
    },
    ctaGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 15,
        paddingHorizontal: 20,
    },
    ctaText: {
        fontSize: 15,
        fontWeight: '800',
        color: '#FFFFFF',
        letterSpacing: 0.3,
    },
});

export default DownloadQualityModal;
