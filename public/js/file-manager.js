/**
 * File Manager JavaScript
 * Handles file upload, display, and management functionality
 */

document.addEventListener('DOMContentLoaded', () => {
    // Configuration & State
    let isLoading = false;
    let hasMoreFiles = true;
    let nextToken = '';
    let allFiles = [];
    let currentFilter = 'all';
    let currentSearch = '';
    let currentShareFile = null;
    let zoomLevel = 1;
    let confirmCallback = null;
    let popperInstance = null; // Popper.js instance
    let selectedFiles = new Set();

    // DOM Elements
    const dropArea = document.getElementById('dropArea');
    const fileInput = document.getElementById('fileInput');
    const browseButton = document.getElementById('browseButton');
    const filesGrid = document.getElementById('filesGrid');
    const loadingDiv = document.getElementById('loading-indicator');
    const emptyStateDiv = document.getElementById('empty-state');
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    
    // Selection mode elements
    const bulkActions = document.getElementById('bulkActions');
    const selectAllToggleBtn = document.getElementById('selectAllToggleBtn');
    const convertSelectedBtn = document.getElementById('convertSelectedBtn');
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    const cancelSelectionBtn = document.getElementById('cancelSelectionBtn');
    const convertModal = document.getElementById('convertModal');
    const convertCount = document.getElementById('convertCount');
    const convertQuality = document.getElementById('convertQuality');
    const convertQualityValue = document.getElementById('convertQualityValue');
    const deleteOriginalCheckbox = document.getElementById('deleteOriginalCheckbox');
    const convertCancelBtn = document.getElementById('convertCancelBtn');
    const convertConfirmBtn = document.getElementById('convertConfirmBtn');
    
    // Enhanced Preview Modal Elements
    const filePreviewModal = document.getElementById('file-preview-modal');
    const previewHeader = document.getElementById('preview-header');
    const previewFileIcon = document.getElementById('preview-file-icon');
    const previewFileName = document.getElementById('preview-file-name');
    const previewFileInfo = document.getElementById('preview-file-info');
    const previewContent = document.getElementById('preview-content');
    const previewDownloadBtn = document.getElementById('preview-download-btn');
    
    // Preview content elements
    const imagePreview = document.getElementById('image-preview');
    const previewImageEl = document.getElementById('preview-image');
    const videoPreview = document.getElementById('video-preview');
    const previewVideoEl = document.getElementById('preview-video');
    const audioPreview = document.getElementById('audio-preview');
    const previewAudioEl = document.getElementById('preview-audio');
    const pdfPreview = document.getElementById('pdf-preview');
    const previewPdfEl = document.getElementById('preview-pdf');
    const textPreview = document.getElementById('text-preview');
    const previewTextEl = document.getElementById('preview-text');
    const documentPreview = document.getElementById('document-preview');
    const documentIcon = document.getElementById('document-icon');
    const documentDownloadBtn = document.getElementById('document-download-btn');
    
    // Image controls
    const imageControls = document.getElementById('image-controls');
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    const zoomResetBtn = document.getElementById('zoom-reset-btn');
    const zoomLevelDisplay = document.getElementById('zoom-level');
    const closePreviewBtn = document.getElementById('close-preview-btn');
    
    const sharePopover = document.getElementById('share-popover');
    const confirmModal = document.getElementById('confirm-modal');

    // --- Authentication ---
    async function checkAuth() {
        try {
            let response = await fetch('/auth/status', { credentials: 'include' });
            let data = null;
            if (response.ok) {
                data = await response.json();
            }
            let isAuthenticated = data && ((data.data && data.data.authenticated) || data.user);
            if (response.ok && data.success && isAuthenticated) {
                return true;
            }
            // Try refresh if not authenticated
            const refreshResp = await fetch('/auth/refresh', { method: 'POST', credentials: 'include' });
            if (refreshResp.ok) {
                // Try status again
                response = await fetch('/auth/status', { credentials: 'include' });
                if (response.ok) {
                    data = await response.json();
                    isAuthenticated = (data.data && data.data.authenticated) || data.user;
                    if (data.success && isAuthenticated) {
                        return true;
                    }
                }
            }
            window.location.href = '/login';
            return false;
        } catch (error) {
            showToast('Pengecekan otentikasi gagal. Mengalihkan ke halaman login.', 'error');
            setTimeout(() => window.location.href = '/login', 1500);
            return false;
        }
    }

    async function handleLogout() {
        try {
            const response = await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
            const data = await response.json();
            if (data.success) {
                showToast('Berhasil keluar!', 'success');
                setTimeout(() => window.location.href = '/login', 1000);
            } else {
                showToast('Gagal keluar: ' + (data.error || 'Kesalahan tidak diketahui'), 'error');
            }
        } catch (error) {
            showToast('Gagal keluar: ' + error.message, 'error');
        }
    }

    // --- Helper: fetch with auto refresh ---
    async function fetchWithAutoRefresh(url, options = {}, retry = true) {
        // Set default timeout to 10 minutes for upload, 30s for others
        let timeoutMs = 30000;
        if (url.includes('/upload')) timeoutMs = 10 * 60 * 1000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            let response = await fetch(url, { ...options, credentials: 'include', signal: controller.signal });
            if (response.status === 401 && retry) {
                // Coba refresh token
                const refreshResp = await fetch('/auth/refresh', { method: 'POST', credentials: 'include' });
                if (refreshResp.ok) {
                    response = await fetch(url, { ...options, credentials: 'include', signal: controller.signal });
                    if (response.status !== 401) return response;
                }
                window.location.href = '/login';
                throw new Error('Session expired, please login again.');
            }
            return response;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    // --- File Loading & Display ---
    async function loadFiles(isRefresh = false) {
        if (isLoading) return;
        isLoading = true;
        if (isRefresh) {
            filesGrid.innerHTML = '';
            nextToken = '';
            allFiles = [];
        }
        loadingDiv.classList.remove('hidden');
        emptyStateDiv.classList.add('hidden');

        try {
            const params = new URLSearchParams({ limit: '30', token: nextToken || '' });
            if (typeof currentFilter !== 'undefined' && currentFilter !== 'all') {
                params.set('type', currentFilter);
            }
            const searchValue = document.getElementById('searchInput')?.value.trim();
            if (searchValue) {
                params.set('search', searchValue);
            }
            const response = await fetchWithAutoRefresh(`/r2/files?${params}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = await response.json();

            let files = [];
            if (Array.isArray(result.files)) {
                files = result.files;
                nextToken = result.nextToken || null;
                hasMoreFiles = !!result.isTruncated;
            } else if (result.success && result.data) {
                files = result.data.files || [];
                nextToken = result.data.pagination?.nextToken;
                hasMoreFiles = !!nextToken;
            }
            allFiles = isRefresh ? files : [...allFiles, ...files];

            filterAndDisplayFiles();
            updateFilterCounts();

        } catch (error) {
            showToast(`Gagal memuat file: ${error.message}`, 'error');
        } finally {
            isLoading = false;
            loadingDiv.classList.add('hidden');
            loadMoreBtn.disabled = false;
            loadMoreBtn.classList.toggle('hidden', !hasMoreFiles);
        }
    }
    
    function filterAndDisplayFiles() {
        const filteredFiles = allFiles.filter(file => {
            const typeMatch = currentFilter === 'all' || getFileType(file.contentType) === currentFilter;
            const searchMatch = !currentSearch || file.key.toLowerCase().includes(currentSearch);
            return typeMatch && searchMatch;
        });
        
        filesGrid.innerHTML = ''; // Clear previous results
        if (filteredFiles.length > 0) {
            filteredFiles.forEach(file => {
                const fileCard = createFileCard(file);
                if (fileCard) filesGrid.appendChild(fileCard);
            });
             emptyStateDiv.classList.add('hidden');
        } else {
            emptyStateDiv.classList.remove('hidden');
        }
    }
    
    function createFileCard(file) {
        const div = document.createElement('div');
        div.className = 'file-card bg-white rounded-lg shadow-sm hover:shadow-xl overflow-hidden flex flex-col';
        div.dataset.fileKey = file.key;
        const isImage = file.contentType?.startsWith('image/');
        const fileSize = formatFileSize(file.size);
        const fileIcon = getFileIcon(file.contentType);
        const fileDate = formatDate(file.lastModified);
        
        div.innerHTML = `
            <div class="relative group">
                <div class="aspect-square w-full bg-gray-100 flex items-center justify-center">
                    ${isImage ? `
                        <img src="${file.url}" alt="${file.key}" class="w-full h-full object-cover" loading="lazy"
                             onerror="this.parentElement.innerHTML = '<i class=&quot;${fileIcon} text-gray-400 text-4xl&quot;></i>';">
                    ` : `
                        <i class="${fileIcon} text-gray-400 text-4xl"></i>
                    `}
                </div>
                
                <!-- Selection Checkbox - Always visible in corner -->
                <div class="absolute top-2 left-2 z-10">
                    <input type="checkbox" class="file-checkbox h-5 w-5 text-indigo-600 rounded cursor-pointer border-2 border-white shadow-lg bg-white/90 backdrop-blur-sm hover:scale-110 transition-transform" 
                           data-file-key="${file.key}" data-file-type="${file.contentType}">
                </div>
                
                <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all flex items-center justify-center action-buttons">
                    <button class="preview-btn opacity-0 group-hover:opacity-100 transform group-hover:scale-100 scale-90 transition-all bg-white/80 text-black rounded-full h-10 w-10" 
                            data-url="${file.url}" data-name="${file.key}" data-size="${fileSize}" data-type="${file.contentType}" title="Pratinjau">
                        <i class="fas fa-eye"></i>
                    </button>
                </div>
                 <div class="absolute top-2 right-2 flex flex-col gap-2 action-buttons">
                    <button class="share-btn bg-white/70 text-gray-800 backdrop-blur-sm p-1.5 rounded-full shadow hover:bg-white text-xs transition-transform hover:scale-110" data-file='${JSON.stringify(file)}' title="Bagikan">
                        <i class="fas fa-share-alt"></i>
                    </button>
                    <button class="download-btn bg-white/70 text-gray-800 backdrop-blur-sm p-1.5 rounded-full shadow hover:bg-white text-xs transition-transform hover:scale-110" title="Unduh" data-key="${file.key}" data-url="${file.downloadUrl}">
                        <i class="fas fa-download"></i>
                    </button>
                    <button class="delete-btn bg-red-500/80 text-white backdrop-blur-sm p-1.5 rounded-full shadow hover:bg-red-500 text-xs transition-transform hover:scale-110" data-key="${file.key}" title="Hapus">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="p-3 flex flex-col flex-grow">
                <h3 class="font-semibold text-gray-800 text-sm truncate" title="${file.key}">${file.key}</h3>
                <div class="mt-auto pt-2 flex justify-between items-center text-xs text-gray-500">
                    <span>${fileSize}</span>
                    <span>${fileDate}</span>
                </div>
            </div>
        `;
        
        // Add checkbox change listener
        const checkbox = div.querySelector('.file-checkbox');
        
        if (checkbox) {
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();
                if (e.target.checked) {
                    selectedFiles.add(file.key);
                    div.classList.add('ring-2', 'ring-indigo-400');
                } else {
                    selectedFiles.delete(file.key);
                    div.classList.remove('ring-2', 'ring-indigo-400');
                }
                updateBulkActionsState();
            });
            
            // Prevent checkbox click from triggering other events
            checkbox.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }
        
        return div;
    }

    // --- UI Interactions ---
    function setupEventListeners() {
        browseButton.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => uploadFiles(Array.from(e.target.files)));
        dropArea.addEventListener('dragover', (e) => { e.preventDefault(); dropArea.classList.add('drag-active'); });
        dropArea.addEventListener('dragleave', (e) => { e.preventDefault(); dropArea.classList.remove('drag-active'); });
        dropArea.addEventListener('drop', (e) => { e.preventDefault(); dropArea.classList.remove('drag-active'); uploadFiles(Array.from(e.dataTransfer.files)); });
        
        loadMoreBtn.addEventListener('click', () => loadFiles());
        document.getElementById('logoutBtn').addEventListener('click', handleLogout);
        document.getElementById('refreshBtn').addEventListener('click', () => loadFiles(true));
        
        filesGrid.addEventListener('click', e => {
            const previewBtn = e.target.closest('.preview-btn');
            const deleteBtn = e.target.closest('.delete-btn');
            const shareBtn = e.target.closest('.share-btn');
            const downloadBtn = e.target.closest('.download-btn');
            if (previewBtn) openFilePreview(previewBtn.dataset.url, previewBtn.dataset.name, previewBtn.dataset.size, previewBtn.dataset.type);
            if (deleteBtn) handleDeleteClick(deleteBtn.dataset.key);
            if (shareBtn) showSharePopover(e, JSON.parse(shareBtn.dataset.file));
            if (downloadBtn) downloadFile(downloadBtn.dataset.key, downloadBtn.dataset.url);
        });

        document.getElementById('close-preview-btn').addEventListener('click', closeFilePreview);
        filePreviewModal.addEventListener('click', (e) => e.target === filePreviewModal && closeFilePreview());
        document.getElementById('zoom-in-btn').addEventListener('click', () => zoomImage(1.2));
        document.getElementById('zoom-out-btn').addEventListener('click', () => zoomImage(0.8));
        document.getElementById('zoom-reset-btn').addEventListener('click', () => resetZoom());

        document.getElementById('copy-cdn-btn').addEventListener('click', () => copyToClipboard(currentShareFile.url, 'URL Publik'));
        document.getElementById('copy-presigned-btn').addEventListener('click', () => copyToClipboard(currentShareFile.presignedUrl, 'URL Sementara'));
        document.addEventListener('click', (e) => { 
            if (!sharePopover.contains(e.target) && !e.target.closest('.share-btn')) {
                hideSharePopover();
            }
        });

        document.querySelectorAll('.filter-btn').forEach(btn => btn.addEventListener('click', () => handleFilterClick(btn)));

        // Debounce search input
        let searchDebounceTimeout = null;
        document.getElementById('searchInput').addEventListener('input', (e) => {
            currentSearch = e.target.value.toLowerCase();
            if (searchDebounceTimeout) clearTimeout(searchDebounceTimeout);
            loadingDiv.classList.remove('hidden');
            searchDebounceTimeout = setTimeout(() => {
                loadFiles(true);
            }, 400);
        });
        
        document.getElementById('confirm-cancel-btn').addEventListener('click', hideConfirmModal);
        document.getElementById('confirm-ok-btn').addEventListener('click', () => {
            if (confirmCallback) confirmCallback();
            hideConfirmModal();
        });
        confirmModal.addEventListener('click', (e) => e.target === confirmModal && hideConfirmModal());
        
        // Selection mode listeners
        selectAllToggleBtn.addEventListener('click', toggleSelectAll);
        cancelSelectionBtn.addEventListener('click', clearSelection);
        convertSelectedBtn.addEventListener('click', showConvertModal);
        deleteSelectedBtn.addEventListener('click', handleBulkDelete);
        
        // Convert modal listeners
        convertQuality.addEventListener('input', () => {
            convertQualityValue.textContent = convertQuality.value;
        });
        convertCancelBtn.addEventListener('click', hideConvertModal);
        convertConfirmBtn.addEventListener('click', handleBulkConvert);
        convertModal.addEventListener('click', (e) => e.target === convertModal && hideConvertModal());
    }

    // --- File Actions ---
    function handleDeleteClick(fileKey) {
        showConfirmModal(
            'Hapus File',
            `Anda yakin ingin menghapus "${fileKey}"? Aksi ini permanen.`,
            () => deleteFile(fileKey)
        );
    }
    
    async function deleteFile(fileKey) {
        try {
            const response = await fetchWithAutoRefresh(`/r2/files/${encodeURIComponent(fileKey)}`, { method: 'DELETE' });
            const result = await response.json();
            if (result.success || result.message === 'File deleted successfully') {
                showToast('File berhasil dihapus', 'success');
                allFiles = allFiles.filter(f => f.key !== fileKey);
                filterAndDisplayFiles();
                updateFilterCounts();
            } else {
                throw new Error(result.error || 'Kesalahan tidak diketahui');
            }
        } catch (error) {
            showToast(`Gagal menghapus file: ${error.message}`, 'error');
        }
    }

    function downloadFile(fileName, url) {
        showToast(`Mengunduh ${fileName}...`, 'info');

        // Metode 1: Anchor download (paling andal)
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName; // set fileName as the downloaded file name
        a.rel = 'noopener noreferrer';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        
        // Hapus elemen anchor setelah klik
        setTimeout(() => {
            document.body.removeChild(a);
        }, 100);
    }
    
    async function uploadFiles(files) {
        if (files.length === 0) return;

        // Sembunyikan pesan "Tidak ada file" jika ada
        emptyStateDiv.classList.add('hidden');

        // Tampilkan kartu placeholder untuk setiap file
        const placeholderCards = files.map(file => {
            const card = createUploadingFileCard(file);
            filesGrid.prepend(card); // Prepend agar muncul di paling atas
            return { file, card };
        });

        // Buat array promise untuk setiap unggahan file
        const uploadPromises = placeholderCards.map(async ({ file, card }) => {
            const maxSize = 50 * 1024 * 1024; // 50MB
            if (file.size > maxSize) {
                showToast(`File ${file.name} terlalu besar (> 50MB).`, 'error');
                card.innerHTML = `
                    <div class="p-4 text-center text-red-600">
                        <i class="fas fa-exclamation-circle text-2xl mb-2"></i>
                        <p class="text-xs font-bold truncate" title="${file.name}">${file.name}</p>
                        <p class="text-xs">Terlalu Besar</p>
                    </div>`;
                return; // Lewati file ini
            }

            const formData = new FormData();
            formData.append('file', file);

            try {
                const response = await fetchWithAutoRefresh('/r2/upload', { method: 'POST', body: formData });
                const result = await response.json();
                
                if (result.success && result.data && result.data.file) {
                    const newFile = result.data.file;
                    const newCard = createFileCard(newFile);
                    
                    // Ganti placeholder dengan kartu yang sebenarnya
                    card.replaceWith(newCard);

                    // Tambahkan ke data global dan perbarui hitungan
                    allFiles.unshift(newFile); // Tambahkan ke awal array
                    updateFilterCounts();
                    showToast(`${file.name} berhasil diunggah!`, 'success');
                } else {
                    throw new Error(result.error || 'Respons server tidak valid');
                }
            } catch (error) {
                showToast(`Gagal mengunggah ${file.name}: ${error.message}`, 'error');
                // Perbarui kartu untuk menunjukkan error
                card.classList.add('border-red-500');
                card.innerHTML = `
                    <div class="p-4 text-center text-red-600 flex flex-col items-center justify-center h-full">
                        <i class="fas fa-exclamation-triangle text-3xl mb-2"></i>
                        <p class="font-semibold text-xs truncate" title="${file.name}">${file.name}</p>
                        <p class="text-xs">Gagal</p>
                    </div>`;
            }
        });

        // Tunggu semua proses unggah (berhasil atau gagal) selesai
        await Promise.all(uploadPromises);
    }

    // --- Modals & Popovers ---
    function showConfirmModal(title, message, callback) {
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = message;
        confirmCallback = callback;
        confirmModal.classList.remove('hidden');
        setTimeout(() => confirmModal.classList.remove('opacity-0'), 10);
    }
    
    function hideConfirmModal() {
        confirmModal.classList.add('opacity-0');
        setTimeout(() => {
            confirmModal.classList.add('hidden');
            confirmCallback = null;
        }, 300);
    }

    function openFilePreview(url, name, size, contentType) {
        // Hide all preview content first
        hideAllPreviewContent();
        
        // Set common elements
        previewFileName.textContent = name;
        previewFileInfo.textContent = `${size} • ${contentType || 'Unknown type'}`;
        previewFileIcon.className = getFileIcon(contentType);
        previewDownloadBtn.href = url;
        previewDownloadBtn.download = name;
        
        const fileType = getFileType(contentType);
        
        // Show appropriate preview based on file type
        switch (fileType) {
            case 'image':
                showImagePreview(url, name);
                break;
            case 'video':
                showVideoPreview(url, contentType);
                break;
            case 'audio':
                showAudioPreview(url, contentType);
                break;
            case 'doc':
                if (contentType === 'application/pdf') {
                    showPdfPreview(url);
                } else if (contentType.includes('text/') || name.match(/\.(txt|js|css|html|json|xml|md|log|csv)$/i)) {
                    showTextPreview(url, name);
                } else {
                    showDocumentPreview(name, url, contentType);
                }
                break;
            default:
                showDocumentPreview(name, url, contentType);
        }
        
        // Show modal
        filePreviewModal.classList.remove('hidden');
        setTimeout(() => filePreviewModal.classList.remove('opacity-0'), 10);
    }
    
    function hideAllPreviewContent() {
        imagePreview.classList.add('hidden');
        videoPreview.classList.add('hidden');
        audioPreview.classList.add('hidden');
        pdfPreview.classList.add('hidden');
        textPreview.classList.add('hidden');
        documentPreview.classList.add('hidden');
        imageControls.classList.add('hidden');
    }
    
    function showImagePreview(url, name) {
        previewImageEl.src = url;
        previewImageEl.alt = name;
        zoomLevel = 1;
        previewImageEl.style.transform = `scale(${zoomLevel})`;
        updateZoomDisplay();
        imagePreview.classList.remove('hidden');
        imageControls.classList.remove('hidden');
    }
    
    function showVideoPreview(url, contentType) {
        previewVideoEl.src = url;
        previewVideoEl.load(); // Reload video element
        videoPreview.classList.remove('hidden');
    }
    
    function showAudioPreview(url, contentType) {
        previewAudioEl.src = url;
        previewAudioEl.load(); // Reload audio element
        audioPreview.classList.remove('hidden');
    }
    
    function showPdfPreview(url) {
        previewPdfEl.src = url + '#toolbar=1&navpanes=1&scrollbar=1';
        pdfPreview.classList.remove('hidden');
    }
    
    async function showTextPreview(url, name) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('Failed to fetch file');
            
            const text = await response.text();
            previewTextEl.textContent = text;
            
            // Apply basic syntax highlighting based on file extension
            const extension = name.split('.').pop().toLowerCase();
            previewTextEl.className = `text-green-400 font-mono text-sm p-4 whitespace-pre-wrap language-${extension}`;
            
            textPreview.classList.remove('hidden');
        } catch (error) {
            showDocumentPreview(name, url, 'text/plain');
        }
    }
    
    function showDocumentPreview(name, url, contentType) {
        documentIcon.className = getFileIcon(contentType);
        documentDownloadBtn.href = url;
        documentDownloadBtn.download = name;
        documentPreview.classList.remove('hidden');
    }

    function closeFilePreview() {
        // Stop any playing media
        if (previewVideoEl.src) {
            previewVideoEl.pause();
            previewVideoEl.src = '';
        }
        if (previewAudioEl.src) {
            previewAudioEl.pause();
            previewAudioEl.src = '';
        }
        if (previewPdfEl.src) {
            previewPdfEl.src = '';
        }
        
        filePreviewModal.classList.add('opacity-0');
        setTimeout(() => filePreviewModal.classList.add('hidden'), 300);
    }

    function zoomImage(factor) {
        if (!imagePreview.classList.contains('hidden')) {
            zoomLevel = Math.max(0.25, Math.min(5, zoomLevel * factor));
            previewImageEl.style.transform = `scale(${zoomLevel})`;
            updateZoomDisplay();
        }
    }
    
    function resetZoom() {
        if (!imagePreview.classList.contains('hidden')) {
            zoomLevel = 1;
            previewImageEl.style.transform = `scale(${zoomLevel})`;
            updateZoomDisplay();
        }
    }
    
    function updateZoomDisplay() {
        zoomLevelDisplay.textContent = Math.round(zoomLevel * 100) + '%';
    }
    
    function hideSharePopover() {
        if (popperInstance) {
            popperInstance.destroy();
            popperInstance = null;
        }
        sharePopover.classList.add('opacity-0', 'scale-95');
        setTimeout(() => {
            sharePopover.classList.add('hidden');
        }, 200);
    }
    
    function showSharePopover(event, file) {
        event.stopPropagation();
        
        if (sharePopover.classList.contains('hidden') || currentShareFile?.key !== file.key) {
            currentShareFile = file;
            const button = event.target.closest('button');

            if (popperInstance) {
                popperInstance.destroy();
            }

            popperInstance = Popper.createPopper(button, sharePopover, {
                placement: 'bottom',
                modifiers: [
                    { name: 'offset', options: { offset: [0, 8] } },
                    { name: 'preventOverflow', options: { padding: 8 } },
                    { name: 'flip', options: { fallbackPlacements: ['top', 'right', 'left'] } },
                ],
            });

            sharePopover.classList.remove('hidden');
            setTimeout(() => {
                sharePopover.classList.remove('opacity-0', 'scale-95');
            }, 10);

        } else {
            hideSharePopover();
        }
    }
    
    // --- Filtering ---
    function handleFilterClick(button) {
        document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        currentFilter = button.dataset.filter;
        filterAndDisplayFiles();
    }

    function updateFilterCounts() {
        const counts = { all: 0, image: 0, doc: 0, audio: 0, video: 0, archive: 0 };
        allFiles.forEach(file => {
            counts.all++;
            const type = getFileType(file.contentType);
            if (counts.hasOwnProperty(type)) {
                counts[type]++;
            }
        });
        for (const type in counts) {
            const el = document.getElementById(`count${type.charAt(0).toUpperCase() + type.slice(1)}`);
            if (el) el.textContent = counts[type];
        }
    }

    // --- Utility Functions ---
    function createUploadingFileCard(file) {
        const div = document.createElement('div');
        // Beri ID unik untuk kartu ini agar mudah ditemukan dan diganti nanti
        div.id = `uploading-${file.name}-${file.size}`;
        div.className = 'file-card bg-white rounded-lg shadow-sm overflow-hidden flex flex-col border-2 border-indigo-200';
        const fileName = file.name.length > 25 ? `${file.name.substring(0, 22)}...` : file.name;

        div.innerHTML = `
            <div class="aspect-square w-full bg-gray-50 flex items-center justify-center">
                <i class="fas fa-spinner fa-spin text-indigo-500 text-4xl"></i>
            </div>
            <div class="p-3 flex flex-col flex-grow">
                <h3 class="font-semibold text-gray-700 text-sm truncate" title="${file.name}">${fileName}</h3>
                <div class="mt-auto pt-2 flex flex-col items-center text-xs text-gray-500">
                    <span>Mengunggah...</span>
                    <div class="w-full bg-gray-200 rounded-full h-1.5 mt-2">
                       <div class="bg-indigo-500 h-1.5 rounded-full animate-pulse"></div>
                    </div>
                </div>
            </div>
        `;
        return div;
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    }

    function formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' });
    }
    
    function getFileType(contentType = '') {
        if (contentType.startsWith('image/')) return 'image';
        if (contentType.startsWith('video/')) return 'video';
        if (contentType.startsWith('audio/')) return 'audio';
        if (contentType === 'application/pdf') return 'doc';
        if (contentType.includes('pdf') || contentType.includes('document') || contentType.includes('text') || 
            contentType.includes('msword') || contentType.includes('wordprocessing') ||
            contentType.includes('spreadsheet') || contentType.includes('presentation')) return 'doc';
        if (contentType.includes('zip') || contentType.includes('archive') || contentType.includes('rar') ||
            contentType.includes('gzip') || contentType.includes('7z') || contentType.includes('tar')) return 'archive';
        return 'other';
    }

    function getFileIcon(contentType = '') {
        switch(getFileType(contentType)) {
            case 'image': return 'fas fa-file-image text-green-500';
            case 'video': return 'fas fa-file-video text-red-500';
            case 'audio': return 'fas fa-file-audio text-purple-500';
            case 'doc': 
                if (contentType === 'application/pdf') return 'fas fa-file-pdf text-red-600';
                if (contentType.includes('word')) return 'fas fa-file-word text-blue-600';
                if (contentType.includes('excel') || contentType.includes('spreadsheet')) return 'fas fa-file-excel text-green-600';
                if (contentType.includes('powerpoint') || contentType.includes('presentation')) return 'fas fa-file-powerpoint text-orange-600';
                return 'fas fa-file-alt text-gray-600';
            case 'archive': return 'fas fa-file-archive text-yellow-600';
            default: return 'fas fa-file text-gray-500';
        }
    }

    function copyToClipboard(text, type) {
        navigator.clipboard.writeText(text).then(() => {
            showToast(`${type} berhasil disalin!`, 'success');
            hideSharePopover();
        }).catch(() => showToast('Gagal menyalin', 'error'));
    }

    function showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toast-container');
        if (!toastContainer) return;
        const toast = document.createElement('div');
        const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
        const colors = { success: 'bg-green-500', error: 'bg-red-500', warning: 'bg-yellow-500', info: 'bg-blue-500' };
        toast.className = `toast px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium max-w-sm ${colors[type]}`;
        toast.innerHTML = `<div class="flex items-center gap-3"><i class="fas ${icons[type]} text-lg"></i><span>${message}</span></div>`;
        toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    // --- Selection Mode Functions ---
    function toggleSelectionMode(enable = null) {
        selectionMode = enable !== null ? enable : !selectionMode;
        
        if (selectionMode) {
            // Enable selection mode
            selectionModeBtn.classList.add('bg-indigo-600', 'text-white');
            selectionModeBtn.classList.remove('bg-purple-200', 'text-purple-700');
            bulkActions.classList.remove('hidden');
            
            // Show checkboxes and add cursor pointer to cards
            document.querySelectorAll('.selection-overlay').forEach(el => el.classList.remove('hidden'));
            document.querySelectorAll('.action-buttons').forEach(el => el.classList.add('hidden'));
            document.querySelectorAll('.file-card').forEach(card => {
                card.classList.add('cursor-pointer', 'transition-all', 'hover:scale-105');
            });
        } else {
            // Disable selection mode
            selectionModeBtn.classList.remove('bg-indigo-600', 'text-white');
            selectionModeBtn.classList.add('bg-purple-200', 'text-purple-700');
            bulkActions.classList.add('hidden');
            
            // Hide checkboxes and clear selection
            document.querySelectorAll('.selection-overlay').forEach(el => el.classList.add('hidden'));
            document.querySelectorAll('.action-buttons').forEach(el => el.classList.remove('hidden'));
            document.querySelectorAll('.file-checkbox').forEach(cb => cb.checked = false);
            document.querySelectorAll('.file-card').forEach(card => {
                card.classList.remove('ring-4', 'ring-indigo-500', 'bg-indigo-50', 'cursor-pointer', 'hover:scale-105');
            });
            selectedFiles.clear();
        }
        
        updateBulkActionsState();
    }
    
    function updateBulkActionsState() {
        const count = selectedFiles.size;
        const totalFiles = document.querySelectorAll('.file-card').length;
        
        // Auto show/hide bulk actions based on selection
        if (count > 0) {
            bulkActions.classList.remove('hidden');
        } else {
            bulkActions.classList.add('hidden');
        }
        
        convertSelectedBtn.disabled = count === 0;
        deleteSelectedBtn.disabled = count === 0;
        
        // Update Select All button
        if (count === totalFiles && totalFiles > 0) {
            selectAllToggleBtn.innerHTML = `<i class="fas fa-times-circle"></i> <span class="hidden md:inline">None</span>`;
            selectAllToggleBtn.title = 'Deselect All';
        } else {
            selectAllToggleBtn.innerHTML = `<i class="fas fa-check-double"></i> <span class="hidden md:inline">All</span>`;
            selectAllToggleBtn.title = 'Select All';
        }
        
        if (count > 0) {
            convertSelectedBtn.innerHTML = `<i class="fas fa-magic"></i> <span class="hidden md:inline">Convert (${count})</span>`;
            deleteSelectedBtn.innerHTML = `<i class="fas fa-trash"></i> <span class="hidden md:inline">Delete (${count})</span>`;
        } else {
            convertSelectedBtn.innerHTML = `<i class="fas fa-magic"></i> <span class="hidden md:inline">Convert</span>`;
            deleteSelectedBtn.innerHTML = `<i class="fas fa-trash"></i> <span class="hidden md:inline">Delete</span>`;
        }
    }
    
    function clearSelection() {
        document.querySelectorAll('.file-checkbox').forEach(cb => {
            cb.checked = false;
            cb.dispatchEvent(new Event('change'));
        });
    }
    
    function toggleSelectAll() {
        const allCheckboxes = document.querySelectorAll('.file-checkbox');
        const allSelected = selectedFiles.size === allCheckboxes.length && allCheckboxes.length > 0;
        
        allCheckboxes.forEach(cb => {
            cb.checked = !allSelected;
            cb.dispatchEvent(new Event('change'));
        });
    }
    
    function showConvertModal() {
        if (selectedFiles.size === 0) {
            showToast('Pilih minimal 1 file untuk dikonversi', 'warning');
            return;
        }
        
        // Filter only images
        const imageFiles = Array.from(selectedFiles).filter(key => {
            const checkbox = document.querySelector(`.file-checkbox[data-file-key="${key}"]`);
            return checkbox && checkbox.dataset.fileType.startsWith('image/');
        });
        
        if (imageFiles.length === 0) {
            showToast('Tidak ada file gambar yang dipilih', 'warning');
            return;
        }
        
        convertCount.textContent = imageFiles.length;
        convertModal.classList.remove('hidden');
        setTimeout(() => convertModal.classList.remove('opacity-0'), 10);
    }
    
    function hideConvertModal() {
        convertModal.classList.add('opacity-0');
        setTimeout(() => convertModal.classList.add('hidden'), 300);
    }
    
    async function handleBulkConvert() {
        const imageFiles = Array.from(selectedFiles).filter(key => {
            const checkbox = document.querySelector(`.file-checkbox[data-file-key="${key}"]`);
            return checkbox && checkbox.dataset.fileType.startsWith('image/');
        });
        
        if (imageFiles.length === 0) return;
        
        hideConvertModal();
        
        const quality = convertQuality.value;
        const deleteOriginal = deleteOriginalCheckbox.checked;
        
        showToast(`Memulai konversi ${imageFiles.length} file...`, 'info');
        
        let successCount = 0;
        let errorCount = 0;
        let skippedCount = 0;
        
        for (const fileKey of imageFiles) {
            try {
                const response = await fetchWithAutoRefresh('/api/convert-existing', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        keys: [fileKey],
                        quality: parseInt(quality),
                        replace: deleteOriginal
                    })
                });
                
                if (!response.ok) throw new Error('Conversion failed');
                
                const result = await response.json();
                if (result.success) {
                    if (result.data.converted.length > 0) {
                        successCount++;
                    } else if (result.data.skippedCount > 0) {
                        skippedCount++;
                    } else if (result.data.errors.length > 0) {
                        errorCount++;
                    }
                } else {
                    errorCount++;
                }
            } catch (error) {
                console.error(`Error converting ${fileKey}:`, error);
                errorCount++;
            }
        }
        
        // Show results
        if (successCount > 0) {
            showToast(`${successCount} file berhasil dikonversi!`, 'success');
            loadFiles(true); // Refresh file list
        }
        
        if (skippedCount > 0) {
            showToast(`${skippedCount} file dilewati (sudah WebP atau bukan gambar)`, 'info');
        }
        
        if (errorCount > 0) {
            showToast(`${errorCount} file gagal dikonversi`, 'error');
        }
        
        if (successCount === 0 && skippedCount === 0 && errorCount === 0) {
            showToast('Tidak ada file yang diproses', 'warning');
        }
        
        clearSelection();
    }
    
    function handleBulkDelete() {
        if (selectedFiles.size === 0) {
            showToast('Pilih minimal 1 file untuk dihapus', 'warning');
            return;
        }
        
        showConfirmModal(
            'Hapus File Terpilih',
            `Anda yakin ingin menghapus ${selectedFiles.size} file? Aksi ini permanen.`,
            async () => {
                const filesToDelete = Array.from(selectedFiles);
                let successCount = 0;
                let errorCount = 0;
                
                for (const fileKey of filesToDelete) {
                    try {
                        const response = await fetchWithAutoRefresh(`/r2/files/${encodeURIComponent(fileKey)}`, { method: 'DELETE' });
                        const result = await response.json();
                        
                        if (result.success || result.message === 'File deleted successfully') {
                            successCount++;
                        } else {
                            errorCount++;
                        }
                    } catch (error) {
                        console.error(`Error deleting ${fileKey}:`, error);
                        errorCount++;
                    }
                }
                
                if (successCount > 0) {
                    showToast(`${successCount} file berhasil dihapus`, 'success');
                    loadFiles(true);
                }
                
                if (errorCount > 0) {
                    showToast(`${errorCount} file gagal dihapus`, 'error');
                }
                
                clearSelection();
            }
        );
    }

    // --- App Initialization ---
    async function init() {
        const isAuthenticated = await checkAuth();
        if (isAuthenticated) {
            setupEventListeners();
            loadFiles(true);
        }
    }

    init();
});