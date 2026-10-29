import React, { useState, useCallback, useEffect, useContext, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    ActivityIndicator, Modal, Alert, Linking, StatusBar, Platform, useWindowDimensions, Image
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import ReactNativeBlobUtil from 'react-native-blob-util';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';

import api from '../services/api';
import COLORS from '../constants/colors';
import GlobalDownloadWidget from '../components/GlobalDownloadWidget';
import downloadManager from '../services/downloadManager';
import { DeviceEventEmitter } from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import CustomAlert from '../components/CustomAlert';
import { AuthContext } from '../context/AuthContext';
import DownloadQualityModal from '../components/DownloadQualityModal';

const KNOWN_TABS = [
    { key: 'recordings', title: 'Recordings', type: 'recording', icon: 'video-outline' },
    { key: 'liveClasses', title: 'Live Classes', type: 'live', icon: 'broadcast' },
    { key: 'documents', title: 'Documents', type: 'document', icon: 'file-document-outline' },
    { key: 'papers', title: 'MCQ Papers', type: 'paper', icon: 'format-list-checks' },
    { key: 'sPapers', title: 'Structured Papers', type: 'sPaper', icon: 'text-box-outline' }
];

// 🔥 SECURE INTERNAL PATH DEFINITION 🔥
const secureStoragePath = Platform.OS === 'ios' ? RNFS.LibraryDirectoryPath : RNFS.DocumentDirectoryPath;

const SectionedContentList = ({ tabKey, type, data, contentGroups, onPlay, onShowAlert, courseTitle, onTakeExam }) => {
    const [openFolders, setOpenFolders] = useState({});
    const [downloadingItems, setDownloadingItems] = useState({});
    const [qualityModalItem, setQualityModalItem] = useState(null);
    const [downloadedItems, setDownloadedItems] = useState(new Set());

    const checkDownloadedItems = async () => {
        try {
            const res = await AsyncStorage.getItem('my_downloads');
            if (res) {
                const parsed = JSON.parse(res);
                const validIds = new Set();
                for (const d of parsed) {
                    const filePath = `${secureStoragePath}/f_${d.id}.mp4`;
                    if (await RNFS.exists(filePath)) {
                        const stat = await RNFS.stat(filePath);
                        if (Number(stat.size) > 2 * 1024 * 1024) {
                            validIds.add(d.id);
                        }
                    }
                }
                setDownloadedItems(validIds);
            } else {
                setDownloadedItems(new Set());
            }
        } catch (e) {
            console.log("Error checking downloads:", e);
        }
    };

    useEffect(() => {
        // Load active downloads
        const initialDownloads = downloadManager.getActiveDownloads();
        const initialItems = {};
        Object.keys(initialDownloads).forEach(id => {
            initialItems[id] = initialDownloads[id].progress;
        });
        setDownloadingItems(initialItems);

        const onProgress = (data) => {
            setDownloadingItems(prev => ({ ...prev, [data.itemId]: data.progress }));
        };

        const onComplete = (data) => {
            setDownloadingItems(prev => {
                const newState = { ...prev };
                delete newState[data.itemId];
                return newState;
            });
            setDownloadedItems(prev => new Set([...prev, data.itemId]));
            onShowAlert({ title: "Download Complete", msg: "Video has been saved successfully.", type: "success" });
        };

        const onError = (data) => {
            setDownloadingItems(prev => {
                const newState = { ...prev };
                delete newState[data.itemId];
                return newState;
            });
            onShowAlert({ title: "Download Error", msg: data.errorMsg || "Failed to download the video.", type: "error" });
        };

        const onExists = (data) => {
            onShowAlert({ title: "Already Downloaded", msg: "You can find this video in My Downloads section or Play Offline.", type: "warning" });
        };

        const onDeleted = (data) => {
            if (data?.itemId) {
                setDownloadedItems(prev => {
                    const updated = new Set(prev);
                    updated.delete(data.itemId);
                    return updated;
                });
            }
        };

        const onCancelled = (data) => {
            if (data?.itemId) {
                setDownloadingItems(prev => {
                    const newState = { ...prev };
                    delete newState[data.itemId];
                    return newState;
                });
            }
        };

        const onPaused = (data) => {
            if (data?.itemId) {
                setDownloadingItems(prev => ({
                    ...prev,
                    [data.itemId]: 'Paused'
                }));
            }
        };

        const progressSub = DeviceEventEmitter.addListener('DOWNLOAD_PROGRESS', onProgress);
        const completeSub = DeviceEventEmitter.addListener('DOWNLOAD_COMPLETE', onComplete);
        const errorSub = DeviceEventEmitter.addListener('DOWNLOAD_ERROR', onError);
        const existsSub = DeviceEventEmitter.addListener('DOWNLOAD_ALREADY_EXISTS', onExists);
        const deletedSub = DeviceEventEmitter.addListener('DOWNLOAD_DELETED', onDeleted);
        const cancelledSub = DeviceEventEmitter.addListener('DOWNLOAD_CANCELLED', onCancelled);
        const pausedSub = DeviceEventEmitter.addListener('DOWNLOAD_PAUSED', onPaused);

        checkDownloadedItems();

        return () => {
            progressSub.remove();
            completeSub.remove();
            errorSub.remove();
            existsSub.remove();
            deletedSub.remove();
            cancelledSub.remove();
            pausedSub.remove();
        };
    }, []);

    const toggleFolder = (folderId) => setOpenFolders(prev => ({
        ...prev,
        [folderId]: prev[folderId] === false ? true : false
    }));

    const isFolderOpen = (folderId) => openFolders[folderId] !== false;

    if (!data || data.length === 0) {
        return (
            <View style={styles.emptyContainer}>
                <View style={styles.emptyIconBox}><Icon name="folder-open-outline" size={50} color="#D1D5DB" /></View>
                <Text style={styles.emptyTitle}>No Content Yet</Text>
                <Text style={styles.emptyText}>Materials for this section will appear here once uploaded by the lecturer.</Text>
            </View>
        );
    }

    const isPaperType = type === 'paper';
    const isDocumentType = ['document', 'sPaper'].includes(type);
    const isLiveType = type === 'live' || tabKey === 'liveClasses';

    const handleOpenLive = async (item) => {
        const liveUrl = item.link || item.url || item.meetingUrl || item.zoomLink;
        if (!liveUrl) {
            onShowAlert({
                title: "Live Link Unavailable",
                msg: "The link for this live class has not been updated yet.",
                type: "warning"
            });
            return;
        }

        try {
            let formattedLink = liveUrl.trim();
            if (!formattedLink.startsWith('http://') && !formattedLink.startsWith('https://')) {
                formattedLink = 'https://' + formattedLink;
            }
            await Linking.openURL(formattedLink);
        } catch (error) {
            console.log("Error opening live class URL:", error);
            onShowAlert({
                title: "Could Not Open Link",
                msg: "Failed to open the live class link. Please make sure Zoom or a browser is installed.",
                type: "error"
            });
        }
    };

    const normalizeFolderTitle = (title) => {
        if (!title) return '';
        return title
            .toLowerCase()
            .replace(/[\s_-]+/g, ' ')
            .replace(/\b(month|batch|මාසය|මාස|පාඩම|පාඩම්)\b/gi, '')
            .trim();
    };

    const getTypeInt = (typeStr) => {
        switch (typeStr) {
            case 'live': return 1;
            case 'recording': return 2;
            case 'document': return 3;
            case 'sPaper': return 4;
            case 'paper': return 5;
            default: return 1;
        }
    };
    const targetTypeInt = getTypeInt(type);

    const allTypeFolders = (contentGroups || [])
        .filter(f => parseInt(f.type) === targetTypeInt)
        .sort((a, b) => parseInt(a.itemOrder || 1) - parseInt(b.itemOrder || 1));

    // Root folders: folders that do not have parentId or whose parent is not in allTypeFolders
    const rawRootFolders = allTypeFolders.filter(
        f => !f.parentId || !allTypeFolders.some(p => String(p.id) === String(f.parentId))
    );

    // Merge root folders with same normalized title or raw title to prevent duplicate boxes
    const mergedRootFoldersMap = new Map();
    rawRootFolders.forEach(f => {
        const normTitle = normalizeFolderTitle(f.title || f.name);
        const titleKey = normTitle || (f.title || f.name || '').trim().toLowerCase() || String(f.id);

        if (!mergedRootFoldersMap.has(titleKey)) {
            mergedRootFoldersMap.set(titleKey, {
                id: f.id,
                title: f.title || f.name,
                itemOrder: f.itemOrder || 1,
                ids: [String(f.id)],
                subFolderIds: [],
                titles: [f.title || f.name].filter(Boolean)
            });
        } else {
            const existing = mergedRootFoldersMap.get(titleKey);
            existing.ids.push(String(f.id));
            if ((f.title || f.name) && !existing.titles.includes(f.title || f.name)) {
                existing.titles.push(f.title || f.name);
            }
        }
    });

    // For each root folder, find all descendant subfolders so their items are directly displayed in the main folder
    const rootFolders = Array.from(mergedRootFoldersMap.values());
    rootFolders.forEach(rf => {
        const subFolders = allTypeFolders.filter(sf => sf.parentId && rf.ids.includes(String(sf.parentId)));
        subFolders.forEach(sf => {
            const sfIdStr = String(sf.id);
            if (!rf.subFolderIds.includes(sfIdStr)) {
                rf.subFolderIds.push(sfIdStr);
            }
            if (sf.title && !rf.titles.includes(sf.title)) {
                rf.titles.push(sf.title);
            }
        });
        rf.allFolderIds = [...rf.ids, ...rf.subFolderIds];
    });

    const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
    const sinhalaMonths = ["ජනවාරි", "පෙබරවාරි", "මාර්තු", "අප්‍රේල්", "මැයි", "ජූනි", "ජූලි", "අගෝස්තු", "සැප්තැම්බර්", "ඔක්තෝබර්", "නොවැම්බර්", "දෙසැම්බර්"];

    const isItemMatchFolder = (item, rf) => {
        const fId = String(item.contentGroupId ?? item.content_group_id ?? item.folder_id ?? '');
        if (fId && rf.allFolderIds.includes(fId)) {
            return true;
        }

        const itemParentId = String(item.group?.parentId ?? '');
        if (itemParentId && rf.ids.includes(itemParentId)) {
            return true;
        }

        const itemGroupTitle = item.groupTitle || item.group?.title;
        if (itemGroupTitle && rf.titles && rf.titles.length > 0) {
            const rawItem = itemGroupTitle.trim().toLowerCase();
            const normItem = normalizeFolderTitle(itemGroupTitle);
            for (const t of rf.titles) {
                if (t) {
                    const rawT = t.trim().toLowerCase();
                    const normT = normalizeFolderTitle(t);
                    if (rawItem === rawT || (normItem && normT && normItem === normT)) {
                        return true;
                    }
                }
            }
        }

        // Smart Month Fallback Matching
        if (rf.titles && rf.titles.length > 0) {
            let targetMonthIdx = -1;
            if (item.date) {
                try {
                    const d = new Date(item.date);
                    if (!isNaN(d.getTime())) targetMonthIdx = d.getMonth();
                } catch (err) {}
            }
            if (targetMonthIdx === -1 && item.title) {
                const titleLower = item.title.toLowerCase();
                targetMonthIdx = monthNames.findIndex(m => titleLower.includes(m));
                if (targetMonthIdx === -1) targetMonthIdx = sinhalaMonths.findIndex(m => titleLower.includes(m));
            }
            if (targetMonthIdx !== -1) {
                const engMonth = monthNames[targetMonthIdx];
                const sinMonth = sinhalaMonths[targetMonthIdx];
                for (const t of rf.titles) {
                    if (t) {
                        const tLower = t.toLowerCase();
                        const tNorm = normalizeFolderTitle(t);
                        if (tLower.includes(engMonth) || tLower.includes(sinMonth) ||
                            tNorm.includes(engMonth) || tNorm.includes(sinMonth)) {
                            return true;
                        }
                    }
                }
            }
        }

        return false;
    };

    const groupedItems = rootFolders.map(folder => ({
        folder,
        items: data
            .filter(item => isItemMatchFolder(item, folder))
            .sort((a, b) => parseInt(a.itemOrder || 1) - parseInt(b.itemOrder || 1))
    }));

    const uncategorizedItems = data
        .filter(item => !rootFolders.some(rf => isItemMatchFolder(item, rf)))
        .sort((a, b) => parseInt(a.itemOrder || 1) - parseInt(b.itemOrder || 1));

    const handleDocDownload = (item) => {
        const docUrl = item.link || item.url || item.file || item.fileName;
        if (!docUrl) return onShowAlert({ title: "Error", msg: "No document available to download.", type: "error" });

        let link = docUrl.startsWith('http') ? docUrl : `https://imacampus.online/storage/documents/${docUrl}`;

        if (Platform.OS === 'android') {
            onShowAlert({ title: "Downloading Started", msg: "Please check your notification panel to see the progress.", type: "success" });
            let ext = "pdf";
            if (docUrl.includes('.jpg') || docUrl.includes('.jpeg')) ext = "jpg";
            if (docUrl.includes('.png')) ext = "png";
            const fileName = item.title ? `${item.title.replace(/[^a-zA-Z0-9]/g, '_')}.${ext}` : `Document_${Date.now()}.${ext}`;

            ReactNativeBlobUtil.config({
                addAndroidDownloads: {
                    useDownloadManager: true, notification: true, title: fileName,
                    description: 'Downloading document', mime: `application/${ext}`, mediaScannable: true,
                    path: `${ReactNativeBlobUtil.fs.dirs.DownloadDir}/${fileName}`,
                }
            }).fetch('GET', link).catch(() => onShowAlert({ title: "Error", msg: "Download failed.", type: "error" }));
        } else {
            Linking.openURL(link);
        }
    };

    const handleVideoDownload = (item) => {
        setQualityModalItem(item);
    };

    const renderItemCard = (item) => {
        let imgUri = null;

        if (item.thumbnail && item.thumbnail !== 'default.png' && item.thumbnail !== 'null') {
            imgUri = item.thumbnail.startsWith('http')
                ? item.thumbnail
                : `https://imacampus.online/api/storage/documents/${item.thumbnail}`;
        } else if (item.fileName && /\.(jpg|jpeg|png|webp|gif)$/i.test(item.fileName)) {
            imgUri = `https://imacampus.online/api/storage/documents/${item.fileName}`;
        }

        const downloadProgress = downloadingItems[item.id];
        const isDownloading = downloadProgress !== undefined;
        // 🔥 NEW: මේ වීඩියෝ එක දැනටමත් Download වෙලාද කියලා බලනවා 🔥
        const isDownloaded = downloadedItems.has(item.id);

        const canDownloadVideo = !isDocumentType && !isLiveType && !isPaperType && item.link && item.meetingId;

        return (
            <View key={item.id} style={styles.itemCard}>

                {imgUri ? (
                    <Image source={{ uri: imgUri }} style={styles.landscapeImage} resizeMode="cover" />
                ) : (
                    <View style={[styles.landscapeImage, { backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' }]}>
                        <Image source={{ uri: 'https://imacampus.online/logo.png' }} style={{ width: 100, height: 100, opacity: 0.15 }} resizeMode="contain" />
                    </View>
                )}

                <View style={styles.itemInfo}>
                    <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
                    {item.date && <Text style={styles.itemDate}>{item.date.split('T')[0]}</Text>}
                    {item.startTime && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                            <Icon name="clock-outline" size={13} color="#6B7280" style={{ marginRight: 4 }} />
                            <Text style={styles.itemDate}>{item.startTime}{item.endTime ? ` - ${item.endTime}` : ''}</Text>
                        </View>
                    )}

                    <View style={styles.actionRow}>
                        {isPaperType ? (
                            <TouchableOpacity
                                onPress={() => onTakeExam && onTakeExam(item)}
                                style={[styles.takeExamBtn, { flex: 1 }]}
                                activeOpacity={0.8}
                            >
                                <Icon name="format-list-checks" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                                <Text style={styles.takeExamBtnText}>Take MCQ Exam</Text>
                            </TouchableOpacity>
                        ) : isLiveType ? (
                            <TouchableOpacity
                                onPress={() => handleOpenLive(item)}
                                style={[styles.watchBtn, { flex: 1, backgroundColor: '#059669', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]}
                                activeOpacity={0.8}
                            >
                                <Icon name="video" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                                <Text style={styles.watchBtnText}>Join Live Class</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity
                                onPress={() => {
                                    if (isDocumentType) {
                                        const docUrl = item.link || item.url || item.file || item.fileName;
                                        if (docUrl) {
                                            let link = docUrl.startsWith('http') ? docUrl : `https://imacampus.online/api/storage/documents/${docUrl}`;
                                            Linking.openURL(link).catch(err => onShowAlert({ title: "Error", msg: "Could not open document.", type: "error" }));
                                        }
                                    } else onPlay(item);
                                }}
                                style={[styles.watchBtn, { flex: 1 }]}
                            >
                                <Text style={styles.watchBtnText}>{isDocumentType ? 'View Document' : 'Play Recording'}</Text>
                            </TouchableOpacity>
                        )}

                        {isDocumentType && (
                            <TouchableOpacity onPress={() => handleDocDownload(item)} style={styles.docDownloadBtn}>
                                <Icon name="download" size={16} color={COLORS.primary} />
                                <Text style={styles.docDownloadText}>Save</Text>
                            </TouchableOpacity>
                        )}

                        {/* 🔥 NEW: බට්න් එකේ පාට සහ අකුරු වෙනස් වෙන කෑල්ල 🔥 */}
                        {canDownloadVideo && (
                            <TouchableOpacity
                                onPress={() => {
                                    if (isDownloaded) {
                                        onShowAlert({ title: "Already Downloaded", msg: "You can find this video in My Downloads section.", type: "warning" });
                                    } else if (downloadProgress === 'Paused') {
                                        downloadManager.resumeDownload(item.id);
                                    } else {
                                        handleVideoDownload(item);
                                    }
                                }}
                                style={[
                                    styles.docDownloadBtn,
                                    isDownloaded ? { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' } : {} // ඩවුන්ලෝඩ් වෙලා නම් කොළ පාට වෙනවා
                                ]}
                                disabled={isDownloading && downloadProgress !== 'Paused'}
                            >
                                {isDownloading ? (
                                    <>
                                        {downloadProgress !== 'Paused' && (
                                            <ActivityIndicator size="small" color={COLORS.primary} style={{ marginRight: 4 }} />
                                        )}
                                        {downloadProgress === 'Paused' && (
                                            <Icon name="pause-circle-outline" size={16} color="#6B7280" style={{ marginRight: 4 }} />
                                        )}
                                        <Text style={[styles.docDownloadText, downloadProgress === 'Paused' && { color: '#6B7280' }]}>
                                            {downloadProgress === '...'
                                                ? 'Extracting...'
                                                : downloadProgress === true
                                                    ? 'Starting...'
                                                    : downloadProgress === 'Paused'
                                                        ? 'Resume'
                                                        : `${downloadProgress}%`}
                                        </Text>
                                    </>
                                ) : isDownloaded ? (
                                    <>
                                        <Icon name="check-circle" size={16} color="#059669" />
                                        <Text style={[styles.docDownloadText, { color: '#059669' }]}>Downloaded</Text>
                                    </>
                                ) : (
                                    <>
                                        <Icon name="download" size={16} color={COLORS.primary} />
                                        <Text style={styles.docDownloadText}>Download</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        )}

                    </View>
                </View>
            </View>
        );
    };

    return (
        <>
            <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
                {groupedItems.map(({ folder, items }) => {
                    const isOpen = isFolderOpen(folder.id);
                    return (
                        <View key={`folder-${folder.id}`} style={styles.monthSection}>
                            <TouchableOpacity
                                style={[styles.monthHeader, { alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 }]}
                                onPress={() => toggleFolder(folder.id)} activeOpacity={0.7}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 10 }}>
                                    <Icon name="folder-open" size={18} color="white" style={{ marginRight: 10 }} />
                                    <Text style={[styles.monthHeaderText, { fontSize: 14 }]} numberOfLines={1}>{folder.title || folder.name}</Text>
                                </View>
                                <Icon name={isOpen ? "chevron-up" : "chevron-down"} size={22} color="white" />
                            </TouchableOpacity>

                            {isOpen && (
                                <View style={{ paddingLeft: 10, marginTop: 5 }}>
                                    {items.length === 0 ? (
                                        <Text style={{ color: '#9CA3AF', fontSize: 12, fontStyle: 'italic', marginBottom: 15, paddingLeft: 10 }}>This folder is empty.</Text>
                                    ) : (items.map(item => renderItemCard(item)))}
                                </View>
                            )}
                        </View>
                    );
                })}

                {uncategorizedItems.length > 0 && (
                    <View style={styles.monthSection}>
                        <View style={[styles.monthHeader, { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', backgroundColor: '#4B5563', paddingVertical: 10 }]}>
                            <Icon name="layers-outline" size={18} color="white" style={{ marginRight: 10 }} />
                            <Text style={[styles.monthHeaderText, { fontSize: 14 }]}>General Content</Text>
                        </View>
                        <View style={{ paddingLeft: 10, marginTop: 5 }}>
                            {uncategorizedItems.map(item => renderItemCard(item))}
                        </View>
                    </View>
                )}
            </ScrollView>

            <DownloadQualityModal
                visible={!!qualityModalItem}
                item={qualityModalItem}
                courseTitle={courseTitle}
                onClose={() => setQualityModalItem(null)}
                onSelectQuality={(selectedItem, quality) => {
                    downloadManager.startDownload(selectedItem, courseTitle, quality);
                }}
            />
        </>
    );
};

const CourseContentScreen = ({ route, navigation }) => {
    const { width } = useWindowDimensions();
    const { courseId, courseTitle, hasAccess } = route.params;
    const [content, setContent] = useState(null);
    const [loading, setLoading] = useState(true);

    const [playingItem, setPlayingItem] = useState(null);
    const [ytPlaying, setYtPlaying] = useState(true);
    const webViewRef = useRef(null);

    const [alertVisible, setAlertVisible] = useState(false);
    const [alertConfig, setAlertConfig] = useState({ title: '', msg: '', type: 'success' });
    const [activeTab, setActiveTab] = useState(route.params?.activeTab || 'recordings');

    const insets = useSafeAreaInsets();
    const { userInfo } = useContext(AuthContext);

    useFocusEffect(useCallback(() => {
        let isActive = true;
        api.get(`mobile/module/${courseId}`)
            .then(res => { if (isActive) setContent(res.data); })
            .catch(e => { })
            .finally(() => { if (isActive) setLoading(false); });
        return () => { isActive = false; };
    }, [courseId]));

    const saveToRecent = async (item) => {
        try {
            if (!userInfo?.id) return;
            const newItem = { courseId, title: item.title || "Course Item", courseTitle };
            const storageKey = `recent_activity_${userInfo.id}`;
            const existing = await AsyncStorage.getItem(storageKey);
            let history = existing ? JSON.parse(existing).filter(h => h.title !== newItem.title) : [];
            history.unshift(newItem);
            if (history.length > 5) history.pop();
            await AsyncStorage.setItem(storageKey, JSON.stringify(history));
        } catch (error) { }
    };

    const getYouTubeID = (url) => {
        if (!url) return null;
        const regex = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|live\/|shorts\/))([\w-]{11})/;
        const match = url.match(regex);
        return match ? match[1] : null;
    };

    // 🔥 OFFLINE PLAYBACK LOGIC ADDED HERE 🔥
    const handlePlayVideo = async (item) => {
        const videoLink = item.youtubeLink || item.link || item.url || item.file;
        if (!videoLink) return Alert.alert("Error", "Video link is unavailable.");

        saveToRecent(item);

        // Check if file is downloaded securely in App Internal Storage
        const securePath = `${secureStoragePath}/f_${item.id}.mp4`;
        try {
            const fileExists = await RNFS.exists(securePath);
            if (fileExists) {
                const stat = await RNFS.stat(securePath);
                if (stat.size > 2 * 1024 * 1024) { // Valid video file check
                    setPlayingItem({ ...item, link: `file://${securePath}`, isYouTube: false, isOffline: true });
                    return; // Play offline and exit function
                }
            }
        } catch (err) {
            console.log("Offline playback check error: ", err);
        }

        // If not downloaded, proceed with normal Online Playback
        const ytId = getYouTubeID(videoLink);
        if (ytId) {
            setPlayingItem({ ...item, isYouTube: true, ytId: ytId });
            setYtPlaying(true);
        } else {
            setPlayingItem({ ...item, link: videoLink, isYouTube: false, isOffline: false });
        }
    };

    if (loading) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

    let status = content ? parseInt(content.paidStatus) : 0;
    if (hasAccess && content) { status = 1; }

    if (status !== 1) {
        return (
            <View style={styles.container}>
                <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={true} />
                <LinearGradient colors={[COLORS.primary, '#9A0007']} start={{x: 0, y: 0}} end={{x: 1, y: 1}} style={[styles.redHeader, { paddingTop: insets.top + 15 }]}>
                    <Icon name="school" size={150} color="rgba(255,255,255,0.06)" style={{position: 'absolute', right: -30, top: -20, transform: [{rotate: '-15deg'}]}} />
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}><Icon name="arrow-left" size={24} color="white" /></TouchableOpacity>
                    <Text style={styles.headerTitle} numberOfLines={1}>{courseTitle}</Text>
                </LinearGradient>
                <View style={styles.messageContainer}>
                    <View style={[styles.emptyIconBox, { width: 120, height: 120, borderRadius: 60 }]}>
                        <Icon name={status === -1 ? "clock-time-four-outline" : "lock-alert"} size={60} color={status === -1 ? "#F59E0B" : COLORS.primary} />
                    </View>
                    <Text style={styles.messageTitle}>{status === -1 ? 'Payment Pending' : 'Access Denied'}</Text>
                    <Text style={styles.messageBody}>{status === -1 ? 'Your bank slip is currently under review. Access will be granted automatically once approved.' : 'You do not have access to this course. Please enroll to view content.'}</Text>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.goBackBtn}><Text style={styles.goBackText}>Go Back</Text></TouchableOpacity>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={true} />
            <CustomAlert isVisible={alertVisible} title={alertConfig.title} message={alertConfig.msg} type={alertConfig.type} onClose={() => setAlertVisible(false)} />

            <LinearGradient colors={[COLORS.primary, '#9A0007']} start={{x: 0, y: 0}} end={{x: 1, y: 1}} style={[styles.redHeader, { paddingTop: insets.top + 15 }]}>
                <Icon name="school" size={150} color="rgba(255,255,255,0.06)" style={{position: 'absolute', right: -30, top: -20, transform: [{rotate: '-15deg'}]}} />
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}><Icon name="arrow-left" size={24} color="white" /></TouchableOpacity>
                <Text style={styles.headerTitle} numberOfLines={1}>{courseTitle}</Text>
            </LinearGradient>

            <View style={styles.customTabBarContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.customTabBar}>
                    {KNOWN_TABS.map((tab) => (
                        <TouchableOpacity key={tab.key} style={[styles.customTab, activeTab === tab.key && styles.customTabActive]} onPress={() => setActiveTab(tab.key)}>
                            <Icon name={tab.icon} size={16} color={activeTab === tab.key ? COLORS.primary : '#6B7280'} style={{ marginBottom: 4 }} />
                            <Text style={[styles.customTabText, activeTab === tab.key && styles.customTabTextActive]}>{tab.title}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            <View style={{ flex: 1 }}>
                {activeTab && (() => {
                    const currentTabConfig = KNOWN_TABS.find(t => t.key === activeTab);
                    return <SectionedContentList
                        tabKey={activeTab}
                        type={currentTabConfig.type}
                        data={content[activeTab] || []}
                        contentGroups={content.lessonGroups || content.contentGroups || []}
                        onPlay={handlePlayVideo}
                        courseTitle={courseTitle}
                        onShowAlert={(config) => { setAlertConfig(config); setAlertVisible(true); }}
                        onTakeExam={(item) => navigation.navigate('MCQPaper', {
                            contentId: item.id,
                            courseTitle: courseTitle,
                            paperTitle: item.title,
                            thumbnail: item.thumbnail
                        })}
                    />;
                })()}
            </View>

            {/* 🔴 SECURE VIDEO PLAYER MODAL 🔴 */}
            <Modal visible={!!playingItem} animationType="slide" onRequestClose={() => { setPlayingItem(null); setYtPlaying(false); }}>
                <View style={{ flex: 1, backgroundColor: 'black' }}>

                    <View style={[styles.playerHeader, { paddingTop: insets.top + 15 }]}>
                        <TouchableOpacity onPress={() => { setPlayingItem(null); setYtPlaying(false); }} style={styles.backBtn}>
                            <Icon name="close" size={24} color="white" />
                        </TouchableOpacity>
                        <Text style={{ color: 'white', fontWeight: 'bold', flex: 1, fontSize: 16 }} numberOfLines={1}>
                            {playingItem?.isOffline ? `(Offline) ${playingItem?.title}` : playingItem?.title}
                        </Text>
                    </View>

                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' }}>
                        {playingItem?.isYouTube ? (
                            <View style={{ width: width, paddingBottom: 20 }}>
                                <View style={{ width: width, aspectRatio: 16 / 9, backgroundColor: 'black' }}>
                                    <WebView
                                        ref={webViewRef}
                                        source={{
                                            html: `
                                <!DOCTYPE html>
                                <html>
                                <head>
                                    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                                    <style>
                                        body { margin: 0; padding: 0; background-color: #000; overflow: hidden; display: flex; align-items: center; justify-content: center; height: 100vh; }
                                        .video-container { position: relative; width: 100vw; height: 56.25vw; pointer-events: none; }
                                        iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; }
                                    </style>
                                </head>
                                <body>
                                    <div class="video-container">
                                        <div id="player"></div>
                                    </div>
                                    <script>
                                        var tag = document.createElement('script');
                                        tag.src = "https://www.youtube.com/iframe_api";
                                        var firstScriptTag = document.getElementsByTagName('script')[0];
                                        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

                                        var player;
                                        function onYouTubeIframeAPIReady() {
                                            player = new YT.Player('player', {
                                                videoId: '${playingItem.ytId}',
                                                playerVars: {
                                                    'autoplay': 1, 'controls': 0, 'rel': 0, 'modestbranding': 1, 'playsinline': 1, 'fs': 0
                                                },
                                                events: {
                                                    'onReady': function(event) { event.target.playVideo(); },
                                                    'onStateChange': function(event) {
                                                        if(event.data === YT.PlayerState.PLAYING) {
                                                            window.ReactNativeWebView.postMessage(JSON.stringify({ event: 'playing' }));
                                                        } else if(event.data === YT.PlayerState.PAUSED) {
                                                            window.ReactNativeWebView.postMessage(JSON.stringify({ event: 'paused' }));
                                                        } else if(event.data === YT.PlayerState.ENDED) {
                                                            window.ReactNativeWebView.postMessage(JSON.stringify({ event: 'ended' }));
                                                        }
                                                    }
                                                }
                                            });
                                        }

                                        window.addEventListener('message', function(event) {
                                            if (event.data === 'play') player.playVideo();
                                            if (event.data === 'pause') player.pauseVideo();
                                        });
                                    </script>
                                </body>
                                </html>
                            ` }}
                                        style={{ flex: 1, backgroundColor: 'black' }}
                                        originWhitelist={['*']} javaScriptEnabled={true} domStorageEnabled={true}
                                        allowsInlineMediaPlayback={true} mediaPlaybackRequiresUserAction={false}
                                        scrollEnabled={false} bounces={false}
                                        onMessage={(event) => {
                                            try {
                                                const data = JSON.parse(event.nativeEvent.data);
                                                if (data.event === 'playing') setYtPlaying(true);
                                                if (data.event === 'paused') setYtPlaying(false);
                                                if (data.event === 'ended') setYtPlaying(false);
                                            } catch (e) { }
                                        }}
                                        onShouldStartLoadWithRequest={(request) => {
                                            if (request.url.startsWith('intent://') || request.url.startsWith('vnd.youtube')) return false;
                                            return true;
                                        }}
                                    />
                                </View>

                                <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 30 }}>
                                    <TouchableOpacity
                                        onPress={() => {
                                            const nextState = !ytPlaying;
                                            setYtPlaying(nextState);
                                            webViewRef.current?.injectJavaScript(`
                                    window.postMessage('${nextState ? 'play' : 'pause'}', '*');
                                    true;
                                `);
                                        }}
                                        style={{ backgroundColor: COLORS.primary, width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', elevation: 5 }}
                                    >
                                        <Icon name={ytPlaying ? "pause" : "play"} size={35} color="white" style={!ytPlaying ? { marginLeft: 5 } : {}} />
                                    </TouchableOpacity>
                                </View>

                            </View>
                        ) : (
                            // 🔥 FIX: Supports Both Online & Offline Video Playback through WebView 
                            <WebView
                                source={
                                    playingItem?.isOffline
                                        ? {
                                            html: `
                            <!DOCTYPE html>
                            <html>
                            <head>
                                <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
                                <style>
                                    body { margin: 0; background-color: #000; display: flex; align-items: center; justify-content: center; height: 100vh; }
                                    video { width: 100%; height: auto; max-height: 100vh; outline: none; }
                                </style>
                            </head>
                            <body>
                                <video controls autoplay controlsList="nodownload">
                                    <source src="${playingItem?.link}" type="video/mp4">
                                </video>
                            </body>
                            </html>
                        ` }
                                        : { uri: playingItem?.link }
                                }
                                style={{ width: width, flex: 1, backgroundColor: 'black' }}
                                allowsInlineMediaPlayback={true}
                                originWhitelist={['*']}
                                allowFileAccess={true}
                                allowFileAccessFromFileURLs={true}
                                allowUniversalAccessFromFileURLs={true}
                                javaScriptEnabled={true}
                                domStorageEnabled={true}
                            />
                        )}
                    </View>
                </View>
            </Modal>
            <GlobalDownloadWidget />
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F5F7FA' },
    redHeader: { paddingHorizontal: 20, paddingBottom: 25, borderBottomLeftRadius: 35, borderBottomRightRadius: 35, elevation: 8, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 , overflow: 'hidden'}, shadowOpacity: 0.3, shadowRadius: 10, zIndex: 10, flexDirection: 'row', alignItems: 'center' },
    backBtn: { marginRight: 15, padding: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12 },
    headerTitle: { fontSize: 20, fontWeight: '900', color: 'white', letterSpacing: 0.5, flex: 1 },
    customTabBarContainer: { marginTop: 15, marginBottom: 5 },
    customTabBar: { paddingHorizontal: 15, gap: 10 },
    customTab: { paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: 'white', borderWidth: 1, borderColor: '#F0F0F0', minWidth: 90 },
    customTabActive: { backgroundColor: '#FEF2F2', borderColor: COLORS.primary, elevation: 2 },
    customTabText: { fontWeight: '800', fontSize: 11, color: '#6B7280' },
    customTabTextActive: { color: COLORS.primary },
    tabContent: { flex: 1, padding: 20 },
    monthSection: { marginBottom: 25 },
    monthHeader: { backgroundColor: COLORS.primary, paddingVertical: 6, paddingHorizontal: 15, borderRadius: 8, marginBottom: 15, alignSelf: 'flex-start' },
    monthHeaderText: { color: 'white', fontWeight: '900', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
    itemCard: { backgroundColor: 'white', marginBottom: 20, borderRadius: 20, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 8, borderWidth: 1, borderColor: '#F3F4F6', overflow: 'hidden' },
    landscapeImage: { width: '100%', height: 160, backgroundColor: '#F9FAFB' },
    itemInfo: { padding: 15 },
    itemTitle: { fontSize: 16, fontWeight: '900', color: '#1A1A1A', marginBottom: 6, lineHeight: 22 },
    itemDate: { fontSize: 12, color: '#9CA3AF', fontWeight: '700', marginBottom: 15 },
    actionRow: { flexDirection: 'row', gap: 10 },
    takeExamBtn: { backgroundColor: '#059669', paddingVertical: 12, paddingHorizontal: 15, borderRadius: 12, flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', elevation: 2 },
    takeExamBtnText: { color: 'white', fontWeight: '900', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 },
    watchBtn: { backgroundColor: '#1A1A1A', paddingVertical: 12, paddingHorizontal: 15, borderRadius: 12, flex: 1, alignItems: 'center', justifyContent: 'center' },
    watchBtnText: { color: 'white', fontWeight: '800', fontSize: 12, textTransform: 'uppercase' },
    docDownloadBtn: { backgroundColor: '#FEF2F2', borderRadius: 12, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', borderWidth: 1, borderColor: '#FECACA' },
    docDownloadText: { color: COLORS.primary, fontWeight: '800', fontSize: 12, marginLeft: 6, textTransform: 'uppercase' },
    emptyContainer: { alignItems: 'center', marginTop: 60 },
    emptyIconBox: { width: 100, height: 100, borderRadius: 50, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center', marginBottom: 20, elevation: 2 },
    emptyTitle: { fontSize: 20, fontWeight: '900', color: '#1A1A1A', marginBottom: 10 },
    emptyText: { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 22, fontWeight: '700', paddingHorizontal: 20 },
    playerHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 15, backgroundColor: 'black' },
    messageContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
    messageTitle: { fontSize: 24, fontWeight: '900', color: '#1A1A1A', marginTop: 20, marginBottom: 10 },
    messageBody: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 30, fontWeight: '600' },
    goBackBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 30, paddingVertical: 14, borderRadius: 15, elevation: 4 },
    goBackText: { color: 'white', fontWeight: '900', fontSize: 15 },
});

export default CourseContentScreen;