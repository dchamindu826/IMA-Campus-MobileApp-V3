import AsyncStorage from '@react-native-async-storage/async-storage';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { DeviceEventEmitter, Platform } from 'react-native';
import RNFS from 'react-native-fs';
import notifee, { AndroidImportance } from '@notifee/react-native';
import { MOBILE_API_URL } from './api';

const secureStoragePath = Platform.OS === 'ios' ? RNFS.LibraryDirectoryPath : RNFS.DocumentDirectoryPath;

class DownloadManager {
    constructor() {
        this.activeDownloads = {};
        this.downloadTasks = {};
        this.urlCache = {}; // In-memory cache for resolved URLs to eliminate extraction delay on retries/resumes
    }

    async init() {
        if (!(await RNFS.exists(secureStoragePath))) {
            await RNFS.mkdir(secureStoragePath);
        }

        if (Platform.OS === 'android') {
            try {
                await notifee.requestPermission();
                await notifee.createChannel({
                    id: 'download_channel',
                    name: 'Downloads',
                    importance: AndroidImportance.LOW,
                });
            } catch (e) {
                console.log("[DownloadManager] Notifee init error:", e);
            }
        }
    }

    getActiveDownloads() {
        return this.activeDownloads;
    }

    async fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeoutId);
            return res;
        } catch (err) {
            clearTimeout(timeoutId);
            throw err;
        }
    }

    async showNotification(itemId, title, body, progress = null) {
        if (Platform.OS !== 'android') return;

        try {
            const androidConfig = {
                channelId: 'download_channel',
                onlyAlertOnce: true,
                smallIcon: 'ic_launcher',
            };

            if (progress !== null && typeof progress === 'number') {
                androidConfig.progress = {
                    max: 100,
                    current: progress,
                };
            }

            await notifee.displayNotification({
                id: String(itemId),
                title: title,
                body: body,
                android: androidConfig,
            });
        } catch (e) {
            console.log("[DownloadManager] Notification error:", e);
        }
    }

    async cancelNotification(itemId) {
        if (Platform.OS !== 'android') return;
        try {
            await notifee.cancelNotification(String(itemId));
        } catch (e) {
            console.log("[DownloadManager] Cancel notification error:", e);
        }
    }

    emitProgress(itemId, progress, title, detailText = '', quality = '720p') {
        this.activeDownloads[itemId] = { itemId, progress, title, detailText, quality };
        DeviceEventEmitter.emit('DOWNLOAD_PROGRESS', { itemId, progress, title, detailText, quality });

        if (typeof progress === 'number') {
            const body = detailText ? `${detailText} (${progress}%)` : `Progress: ${progress}%`;
            this.showNotification(itemId, 'Downloading ' + title, body, progress);
        } else {
            this.showNotification(itemId, 'Downloading ' + title, String(detailText || progress || 'Starting...'), null);
        }
    }

    emitComplete(itemId, title) {
        delete this.activeDownloads[itemId];
        delete this.downloadTasks[itemId];
        DeviceEventEmitter.emit('DOWNLOAD_COMPLETE', { itemId, title });
        this.showNotification(itemId, 'Download Complete', title, null);
    }

    emitError(itemId, title, errorMsg) {
        delete this.activeDownloads[itemId];
        delete this.downloadTasks[itemId];
        DeviceEventEmitter.emit('DOWNLOAD_ERROR', { itemId, title, errorMsg });
        this.showNotification(itemId, 'Download Failed', title, null);
    }

    emitCancelled(itemId, title) {
        delete this.activeDownloads[itemId];
        delete this.downloadTasks[itemId];
        DeviceEventEmitter.emit('DOWNLOAD_CANCELLED', { itemId, title });
        this.cancelNotification(itemId);
    }

    cancelDownload(itemId) {
        console.log(`[DownloadManager] Cancelling download for item ${itemId}`);
        const taskInfo = this.downloadTasks[itemId];
        if (taskInfo) {
            taskInfo.isCancelled = true;
            if (taskInfo.task && typeof taskInfo.task.cancel === 'function') {
                try {
                    taskInfo.task.cancel();
                } catch (e) {}
            }
        }

        const itemTitle = this.activeDownloads[itemId]?.title || 'Download';
        delete this.activeDownloads[itemId];
        delete this.downloadTasks[itemId];

        const partPath = `${secureStoragePath}/f_${itemId}.mp4.part`;
        RNFS.exists(partPath).then(exists => {
            if (exists) RNFS.unlink(partPath).catch(() => {});
        }).catch(() => {});

        DeviceEventEmitter.emit('DOWNLOAD_CANCELLED', { itemId, title: itemTitle });
        this.cancelNotification(itemId);
    }

    pauseDownload(itemId) {
        console.log(`[DownloadManager] Pausing download for item ${itemId}`);
        const taskInfo = this.downloadTasks[itemId];
        if (taskInfo) {
            taskInfo.isPaused = true;
            if (taskInfo.task && typeof taskInfo.task.cancel === 'function') {
                try {
                    taskInfo.task.cancel();
                } catch (e) {}
            }
        }

        if (this.activeDownloads[itemId]) {
            this.activeDownloads[itemId].isPaused = true;
            this.activeDownloads[itemId].detailText = 'Paused';
        }

        const currentProg = this.activeDownloads[itemId]?.progress ?? 0;
        DeviceEventEmitter.emit('DOWNLOAD_PAUSED', { itemId, progress: currentProg });
        DeviceEventEmitter.emit('DOWNLOAD_PROGRESS', {
            itemId,
            progress: currentProg,
            title: this.activeDownloads[itemId]?.title || '',
            detailText: 'Paused',
            isPaused: true,
            quality: this.activeDownloads[itemId]?.quality || '720p'
        });
        this.showNotification(itemId, 'Download Paused', this.activeDownloads[itemId]?.title || '', null);
    }

    resumeDownload(itemId) {
        console.log(`[DownloadManager] Resuming download for item ${itemId}`);
        const taskInfo = this.downloadTasks[itemId];
        if (!taskInfo || !taskInfo.item) {
            console.warn(`[DownloadManager] Cannot resume: item info missing for ${itemId}`);
            return;
        }

        const { item, courseTitle, quality } = taskInfo;
        taskInfo.isPaused = false;

        delete this.downloadTasks[itemId];
        if (this.activeDownloads[itemId]) {
            this.activeDownloads[itemId].isPaused = false;
            this.activeDownloads[itemId].detailText = 'Resuming...';
        }

        DeviceEventEmitter.emit('DOWNLOAD_RESUMED', { itemId });
        this.startDownload(item, courseTitle, quality);
    }

    togglePauseResume(itemId) {
        const active = this.activeDownloads[itemId];
        const taskInfo = this.downloadTasks[itemId];
        if (active?.isPaused || taskInfo?.isPaused) {
            this.resumeDownload(itemId);
        } else {
            this.pauseDownload(itemId);
        }
    }

    async resolveVideoUrl(item, token, quality = '720p') {
        const videoUrl = item.link || item.url || item.file;
        if (!videoUrl) throw new Error("Invalid video link.");

        const cacheKey = `${item.id}_${quality}`;
        const cached = this.urlCache[cacheKey];
        if (cached && (Date.now() - cached.timestamp < 2 * 60 * 60 * 1000)) {
            console.log(`[DownloadManager] Using cached URL for item ${item.id} (${quality})`);
            return { finalUrl: cached.finalUrl, finalHeaders: cached.finalHeaders };
        }

        let finalUrl = videoUrl;
        let finalHeaders = {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari/604.1'
        };

        if (videoUrl.includes('zoom.us/rec/share') || videoUrl.includes('zoom.us/rec/play')) {
            try {
                this.emitProgress(item.id, '...', item.title || 'Video', `Resolving ${quality} stream...`, quality);
                const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

                // 🔥 OPTIMIZATION: If meetingId is already known on item, skip the initial 8s page fetch!
                let meetingId = item.meetingId;
                if (!meetingId) {
                    const res1 = await this.fetchWithTimeout(videoUrl, { headers: { 'User-Agent': ua } }, 8000);
                    const html1 = await res1.text();
                    const mIdMatch = html1.match(/meetingId:\s*'([^']+)'/);
                    if (!mIdMatch) throw new Error("Could not find meetingId in Zoom page.");
                    meetingId = mIdMatch[1];
                }

                const res2 = await this.fetchWithTimeout(`https://zoom.us/nws/recording/1.0/play/share-info/${meetingId}`, {
                    headers: { 'User-Agent': ua, 'Referer': videoUrl }
                }, 8000);
                const json2 = await res2.json();
                if (!json2.result || !json2.result.redirectUrl) throw new Error("Failed to get redirect URL from Zoom API.");
                const redirectUrl = json2.result.redirectUrl;

                const res3 = await this.fetchWithTimeout(`https://zoom.us${redirectUrl}`, {
                    headers: { 'User-Agent': ua, 'Referer': videoUrl }
                }, 8000);
                const html3 = await res3.text();

                const fIdMatch = html3.match(/fileId:\s*'([^']+)'/);
                if (!fIdMatch) throw new Error("Could not find fileId in Zoom redirect page.");
                const fileId = fIdMatch[1];

                const res4 = await this.fetchWithTimeout(`https://zoom.us/nws/recording/1.0/play/info/${fileId}?continueMode=true`, {
                    headers: { 'User-Agent': ua, 'Referer': `https://zoom.us${redirectUrl}` }
                }, 8000);
                const json4 = await res4.json();
                if (!json4.result) throw new Error("Failed to extract Zoom info.");

                // 🔥 Check for resolution variants if provided by Zoom
                let chosenUrl = null;
                const targetRes = quality === '480p' ? 480 : quality === '1080p' ? 1080 : 720;

                if (Array.isArray(json4.result.resolutions)) {
                    const match = json4.result.resolutions.find(r => r.resolution === targetRes || String(r.resolution).includes(String(targetRes)));
                    if (match && (match.downloadUrl || match.viewMp4Url || match.url)) {
                        chosenUrl = match.downloadUrl || match.viewMp4Url || match.url;
                    }
                }

                if (!chosenUrl && Array.isArray(json4.result.clipResolutions)) {
                    const match = json4.result.clipResolutions.find(r => r.resolution === targetRes || String(r.resolution).includes(String(targetRes)));
                    if (match && (match.downloadUrl || match.viewMp4Url || match.url)) {
                        chosenUrl = match.downloadUrl || match.viewMp4Url || match.url;
                    }
                }

                finalUrl = chosenUrl || json4.result.viewMp4Url || json4.result.downloadUrl;
                if (!finalUrl) throw new Error("Failed to extract MP4 URL.");

                finalHeaders = {
                    'User-Agent': ua,
                    'Referer': `https://zoom.us${redirectUrl}`
                };
                console.log(`[DownloadManager] Zoom direct URL resolved successfully for ${quality}.`);
            } catch (zoomErr) {
                console.warn(`[DownloadManager] Direct Zoom extraction failed (${zoomErr.message}). Falling back to backend proxy...`);
                finalUrl = `${MOBILE_API_URL}download-rec/${item.id}?quality=${quality}`;
                finalHeaders = {
                    'Authorization': `Bearer ${token}`,
                    'Accept': '*/*'
                };
            }
        } else if (!videoUrl.includes('cloudfront.net') && !videoUrl.includes('awssdk.com')) {
            if (token) {
                finalHeaders['Authorization'] = `Bearer ${token}`;
            }
        }

        // Save in cache
        this.urlCache[cacheKey] = { finalUrl, finalHeaders, timestamp: Date.now() };
        return { finalUrl, finalHeaders };
    }

    async startDownload(item, courseTitle, quality = '720p') {
        if (!item || !item.id) return;

        if (this.activeDownloads[item.id] && !this.activeDownloads[item.id].isPaused) {
            console.log(`[DownloadManager] Download already in progress for item ${item.id}`);
            return;
        }

        this.downloadTasks[item.id] = {
            task: null,
            isCancelled: false,
            isPaused: false,
            item,
            courseTitle,
            quality
        };

        const itemTitle = item.title || item.fileName || 'Video Lesson';
        const securePath = `${secureStoragePath}/f_${item.id}.mp4`;

        // Check if already completely downloaded with valid size (> 2MB)
        try {
            const res = await AsyncStorage.getItem('my_downloads');
            const existingDownloads = res ? JSON.parse(res) : [];
            const isDownloaded = existingDownloads.find(d => String(d.id) === String(item.id));

            if (isDownloaded && (await RNFS.exists(securePath))) {
                const stat = await RNFS.stat(securePath);
                if (Number(stat.size) > 2 * 1024 * 1024) {
                    DeviceEventEmitter.emit('DOWNLOAD_ALREADY_EXISTS', { itemId: item.id, title: itemTitle });
                    return;
                } else {
                    // Corrupted or incomplete file in storage - remove to allow fresh download
                    await RNFS.unlink(securePath);
                    const cleanList = existingDownloads.filter(d => String(d.id) !== String(item.id));
                    await AsyncStorage.setItem('my_downloads', JSON.stringify(cleanList));
                }
            }
        } catch (e) {
            console.log("[DownloadManager] Error checking existing downloads:", e);
        }

        this.emitProgress(item.id, 0, itemTitle, `Preparing download (${quality})...`, quality);
        await this.performDownloadWithRetry(item, itemTitle, courseTitle, quality);
    }

    async performDownloadWithRetry(item, itemTitle, courseTitle, quality = '720p', maxRetries = 3) {
        const securePath = `${secureStoragePath}/f_${item.id}.mp4`;
        const partPath = `${secureStoragePath}/f_${item.id}.mp4.part`;
        const token = await AsyncStorage.getItem('userToken');

        let finalUrl, finalHeaders;
        try {
            const resolved = await this.resolveVideoUrl(item, token, quality);
            finalUrl = resolved.finalUrl;
            finalHeaders = resolved.finalHeaders;
        } catch (resolveErr) {
            console.error(`[DownloadManager] URL resolution error:`, resolveErr);
            this.emitError(item.id, itemTitle, resolveErr.message || "Failed to resolve video URL.");
            return;
        }

        let attempt = 0;
        let success = false;
        let lastError = null;

        while (attempt < maxRetries && !success) {
            attempt++;

            if (this.downloadTasks[item.id]?.isCancelled) {
                if (await RNFS.exists(partPath)) await RNFS.unlink(partPath);
                this.emitCancelled(item.id, itemTitle);
                return;
            }

            if (this.downloadTasks[item.id]?.isPaused) {
                console.log(`[DownloadManager] Download paused before attempt ${attempt} for ${itemTitle}`);
                return;
            }

            try {
                if (attempt > 1) {
                    console.log(`[DownloadManager] Auto-retrying download for ${itemTitle} (Attempt ${attempt}/${maxRetries})...`);
                    this.emitProgress(item.id, '...', `${itemTitle}`, `Retrying (Attempt ${attempt}/${maxRetries})...`, quality);
                    await new Promise(r => setTimeout(r, 2000));
                }

                let existingBytes = 0;
                if (await RNFS.exists(partPath)) {
                    const stat = await RNFS.stat(partPath);
                    existingBytes = Number(stat.size) || 0;
                }

                const requestHeaders = { ...finalHeaders };
                let isResume = false;

                if (existingBytes > 0) {
                    requestHeaders['Range'] = `bytes=${existingBytes}-`;
                    isResume = true;
                    console.log(`[DownloadManager] Resuming download from byte: ${existingBytes} (${(existingBytes / (1024 * 1024)).toFixed(1)} MB)`);
                }

                let downloadConfig = {
                    path: partPath,
                    fileCache: true,
                    overwrite: !isResume, // When false, appends to partPath on iOS & Android
                    followRedirect: true,
                    timeout: 3600000,
                };


                const task = ReactNativeBlobUtil.config(downloadConfig)
                    .fetch('GET', finalUrl, requestHeaders);

                this.downloadTasks[item.id] = {
                    task,
                    isCancelled: false,
                    isPaused: false,
                    item,
                    courseTitle,
                    quality
                };

                let lastTime = Date.now();
                let lastBytes = existingBytes;

                const formatSize = (b) => {
                    const mb = b / (1024 * 1024);
                    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
                    return `${mb.toFixed(1)} MB`;
                };

                // Use interval of 1000ms (1 second) to prevent bridge flooding and iOS crash
                task.progress({ interval: 1000 }, (received, total) => {
                    if (this.downloadTasks[item.id]?.isCancelled || this.downloadTasks[item.id]?.isPaused) return;
                    const r = Number(received) || 0;
                    const t = Number(total) || 0;

                    const now = Date.now();
                    const currentReceived = isResume ? (existingBytes + r) : r;
                    const currentTotal = isResume ? (existingBytes + t) : t;

                    const elapsed = Math.max((now - lastTime) / 1000, 0.5);
                    const bytesSinceLast = Math.max(currentReceived - lastBytes, 0);
                    const speedBytesPerSec = bytesSinceLast / elapsed;
                    lastTime = now;
                    lastBytes = currentReceived;

                    const speedText = `${(speedBytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;

                    let percentage = 0;
                    if (currentTotal > 0) {
                        percentage = Math.min(Math.max(Math.floor((currentReceived / currentTotal) * 100), 0), 100);
                        const detailText = `${formatSize(currentReceived)} / ${formatSize(currentTotal)} • ${speedText}`;
                        this.emitProgress(item.id, percentage, itemTitle, detailText, quality);
                    } else if (currentReceived > 0) {
                        const detailText = `${formatSize(currentReceived)} • ${speedText}`;
                        this.emitProgress(item.id, '...', itemTitle, detailText, quality);
                    } else {
                        this.emitProgress(item.id, isResume ? 'Resuming...' : 0, itemTitle, isResume ? 'Resuming download...' : 'Starting download...', quality);
                    }
                });

                const response = await task;

                if (this.downloadTasks[item.id]?.isCancelled) {
                    if (await RNFS.exists(partPath)) await RNFS.unlink(partPath);
                    this.emitCancelled(item.id, itemTitle);
                    return;
                }

                if (this.downloadTasks[item.id]?.isPaused) {
                    console.log(`[DownloadManager] Download paused for ${itemTitle}. Preserving partial file.`);
                    return;
                }

                const status = response.info().status;
                console.log(`[DownloadManager] Server responded with HTTP status: ${status}`);

                if (status === 416) {
                    console.warn("[DownloadManager] HTTP 416 Range Not Satisfiable. Resetting part file...");
                    if (await RNFS.exists(partPath)) await RNFS.unlink(partPath);
                    continue;
                }

                if (status >= 400) {
                    delete this.urlCache[`${item.id}_${quality}`]; // Invalidate cache
                    if (!finalUrl.includes(`${MOBILE_API_URL}download-rec/${item.id}`)) {
                        console.warn(`[DownloadManager] Direct URL returned ${status}. Switching to backend proxy...`);
                        finalUrl = `${MOBILE_API_URL}download-rec/${item.id}?quality=${quality}`;
                        finalHeaders = {
                            'Authorization': `Bearer ${token}`,
                            'Accept': '*/*'
                        };
                        if (await RNFS.exists(partPath)) await RNFS.unlink(partPath);
                        continue;
                    }
                    throw new Error(`Server returned HTTP ${status}`);
                }

                if (await RNFS.exists(partPath)) {
                    const stat = await RNFS.stat(partPath);
                    console.log(`[DownloadManager] Downloaded file size: ${(stat.size / (1024 * 1024)).toFixed(2)} MB`);

                    // Check minimum valid video size (> 500 KB)
                    if (stat.size < 500 * 1024) {
                        throw new Error("Downloaded file is incomplete or invalid.");
                    }

                    // Move part file to final destination
                    if (await RNFS.exists(securePath)) {
                        await RNFS.unlink(securePath);
                    }
                    await RNFS.moveFile(partPath, securePath);

                    // Save to AsyncStorage my_downloads
                    const myDownloads = await AsyncStorage.getItem('my_downloads');
                    let downloads = myDownloads ? JSON.parse(myDownloads) : [];

                    downloads = downloads.filter(d => String(d.id) !== String(item.id));

                    const itemToSave = {
                        id: item.id,
                        title: itemTitle,
                        subjectName: item.subjectName || courseTitle || 'Subject',
                        type: item.link ? 'video' : 'document',
                        downloadedAt: new Date().toISOString(),
                        fileName: `f_${item.id}.mp4`,
                        thumbnail: item.thumbnail,
                        quality: quality || '720p',
                        resolution: quality || '720p',
                    };

                    downloads.push(itemToSave);
                    await AsyncStorage.setItem('my_downloads', JSON.stringify(downloads));

                    success = true;
                    this.emitComplete(item.id, itemTitle);
                    console.log(`[DownloadManager] Download completed and saved: ${itemTitle} (${quality})`);
                    return;
                } else {
                    throw new Error("Failed to save downloaded file on disk.");
                }

            } catch (err) {
                lastError = err;
                console.warn(`[DownloadManager] Attempt ${attempt} failed:`, err?.message || err);

                if (this.downloadTasks[item.id]?.isCancelled) {
                    if (await RNFS.exists(partPath)) await RNFS.unlink(partPath);
                    this.emitCancelled(item.id, itemTitle);
                    return;
                }

                if (this.downloadTasks[item.id]?.isPaused) {
                    console.log(`[DownloadManager] Download paused for ${itemTitle}. Preserving partial file.`);
                    return;
                }

                const errMsg = String(err?.message || err);
                if (errMsg.toLowerCase().includes('no space left') || errMsg.toLowerCase().includes('storage')) {
                    console.error("[DownloadManager] Storage is full! Aborting download.");
                    if (await RNFS.exists(partPath)) await RNFS.unlink(partPath);
                    this.emitError(item.id, itemTitle, "Storage full! Please free up space on your device.");
                    return;
                }

                delete this.urlCache[`${item.id}_${quality}`];

                if (!finalUrl.includes(`${MOBILE_API_URL}download-rec/${item.id}`)) {
                    console.warn(`[DownloadManager] Switching to backend proxy for next retry...`);
                    finalUrl = `${MOBILE_API_URL}download-rec/${item.id}?quality=${quality}`;
                    finalHeaders = {
                        'Authorization': `Bearer ${token}`,
                        'Accept': '*/*'
                    };
                    if (await RNFS.exists(partPath)) await RNFS.unlink(partPath);
                }
            }
        }

        if (!success) {
            console.error(`[DownloadManager] Download failed after ${maxRetries} attempts:`, lastError);
            this.emitError(item.id, itemTitle, lastError?.message || "Download interrupted. Tap download to resume.");
        }
    }
}

const downloadManager = new DownloadManager();
export default downloadManager;
