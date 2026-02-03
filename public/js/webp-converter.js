/**
 * WebP Converter JavaScript - Multiple Files with Selection
 * Handles image conversion to WebP format with checkbox selection
 */

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const dropArea = document.getElementById('dropArea');
    const fileInput = document.getElementById('fileInput');
    const browseButton = document.getElementById('browseButton');
    const previewContainer = document.getElementById('filePreview');
    const previewContent = document.getElementById('previewContent');
    const qualitySlider = document.getElementById('qualitySlider');
    const qualityValue = document.getElementById('qualityValue');
    const uploadButton = document.getElementById('uploadButton');
    const progressContainer = document.getElementById('progressSection');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const resultContainer = document.getElementById('resultSection');
    const selectedCount = document.getElementById('selectedCount');
    
    // State
    let selectedFiles = [];
    let isUploading = false;
    
    // --- Authentication ---
    async function checkAuth() {
        try {
            const response = await fetch('/auth/status', { credentials: 'include' });
            if (!response.ok) throw new Error('Auth check failed');
            const data = await response.json();
            
            if (data.success && data.data && data.data.authenticated) {
                return true;
            } else {
                window.location.href = '/login?redirect=/webp-converter';
                return false;
            }
        } catch (error) {
            console.error('Auth error:', error);
            window.location.href = '/login';
            return false;
        }
    }

    async function handleLogout() {
        try {
            await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
            window.location.href = '/login';
        } catch (error) {
            console.error('Logout failed:', error);
        }
    }
    
    // --- File Selection ---
    function setupEventListeners() {
        browseButton.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', handleFileSelect);
        
        // Drag and drop
        dropArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropArea.classList.add('drag-active');
        });
        
        dropArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropArea.classList.remove('drag-active');
        });
        
        dropArea.addEventListener('drop', (e) => {
            e.preventDefault();
            dropArea.classList.remove('drag-active');
            
            if (e.dataTransfer.files.length > 0) {
                handleFiles(Array.from(e.dataTransfer.files));
            }
        });
        
        // Quality slider
        qualitySlider.addEventListener('input', () => {
            qualityValue.textContent = qualitySlider.value;
        });
        
        // Upload button
        uploadButton.addEventListener('click', uploadSelectedImages);
        
        // Logout button
        document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    }
    
    function handleFileSelect(e) {
        if (e.target.files.length > 0) {
            handleFiles(Array.from(e.target.files));
        }
    }
    
    function handleFiles(files) {
        // Filter only images
        const imageFiles = files.filter(file => file.type.match('image.*'));
        
        if (imageFiles.length === 0) {
            showToast('Hanya file gambar yang diperbolehkan', 'error');
            return;
        }
        
        // Check file sizes
        const validFiles = imageFiles.filter(file => {
            if (file.size > 10 * 1024 * 1024) {
                showToast(`${file.name} terlalu besar (maksimal 10MB)`, 'warning');
                return false;
            }
            return true;
        });
        
        if (validFiles.length === 0) return;
        
        selectedFiles = validFiles;
        displayFilePreviews();
        
        // Show preview and quality sections
        previewContainer.classList.remove('hidden');
        document.getElementById('qualitySection').classList.remove('hidden');
        
        // Hide drop area
        dropArea.classList.add('hidden');
    }
    
    function displayFilePreviews() {
        previewContent.innerHTML = '';
        
        selectedFiles.forEach((file, index) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const card = createFileCard(file, index, e.target.result);
                previewContent.appendChild(card);
                updateSelectedCount();
            };
            reader.readAsDataURL(file);
        });
    }
    
    function createFileCard(file, index, dataUrl) {
        const div = document.createElement('div');
        div.className = 'relative bg-white rounded-lg shadow-sm border-2 border-gray-200 overflow-hidden hover:border-indigo-400 transition-all';
        
        div.innerHTML = `
            <div class="absolute top-2 left-2 z-10">
                <input type="checkbox" class="file-checkbox h-5 w-5 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer" 
                       data-index="${index}" checked>
            </div>
            <div class="aspect-square w-full bg-gray-100 flex items-center justify-center overflow-hidden">
                <img src="${dataUrl}" alt="${file.name}" class="w-full h-full object-cover">
            </div>
            <div class="p-2">
                <p class="text-xs font-medium text-gray-800 truncate" title="${file.name}">${file.name}</p>
                <p class="text-xs text-gray-500">${formatFileSize(file.size)}</p>
            </div>
        `;
        
        // Add checkbox listener
        const checkbox = div.querySelector('.file-checkbox');
        checkbox.addEventListener('change', updateSelectedCount);
        
        return div;
    }
    
    function updateSelectedCount() {
        const checked = document.querySelectorAll('.file-checkbox:checked').length;
        selectedCount.textContent = checked;
        uploadButton.disabled = checked === 0;
    }
    
    // --- Upload & Convert ---
    async function uploadSelectedImages() {
        if (isUploading) return;
        
        const checkedBoxes = document.querySelectorAll('.file-checkbox:checked');
        if (checkedBoxes.length === 0) {
            showToast('Pilih minimal 1 gambar untuk dikonversi', 'warning');
            return;
        }
        
        isUploading = true;
        setUploadingState(true);
        
        // Show progress container
        progressContainer.classList.remove('hidden');
        resultContainer.classList.add('hidden');
        
        const filesToUpload = Array.from(checkedBoxes).map(cb => {
            const index = parseInt(cb.dataset.index);
            return selectedFiles[index];
        });
        
        const quality = qualitySlider.value;
        const results = [];
        const errors = [];
        
        for (let i = 0; i < filesToUpload.length; i++) {
            const file = filesToUpload[i];
            const progress = Math.round(((i + 1) / filesToUpload.length) * 100);
            
            progressBar.style.width = progress + '%';
            progressText.textContent = `Converting ${i + 1}/${filesToUpload.length}: ${file.name}`;
            
            try {
                const formData = new FormData();
                formData.append('image', file);
                formData.append('quality', quality);
                
                const response = await fetch('/r2/upload-webp', {
                    method: 'POST',
                    credentials: 'include',
                    body: formData
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || `Server error: ${response.status}`);
                }
                
                const data = await response.json();
                if (data.success && data.data && data.data.file) {
                    results.push(data.data.file);
                } else {
                    throw new Error('Invalid response format');
                }
                
            } catch (error) {
                console.error(`Error converting ${file.name}:`, error);
                errors.push({ file: file.name, error: error.message });
            }
        }
        
        // Show results
        showResults(results, errors);
        isUploading = false;
        setUploadingState(false);
    }
    
    function setUploadingState(isLoading) {
        if (isLoading) {
            uploadButton.disabled = true;
            uploadButton.innerHTML = '<i class="fas fa-spinner animate-spin mr-2"></i>Converting...';
        } else {
            uploadButton.innerHTML = '<i class="fas fa-magic mr-2"></i>Convert Selected & Upload to CDN';
            updateSelectedCount();
        }
    }
    
    function showResults(results, errors) {
        progressContainer.classList.add('hidden');
        resultContainer.classList.remove('hidden');
        
        const resultContent = document.getElementById('resultContent');
        let html = '';
        
        if (results.length > 0) {
            html += `
                <h2 class="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <i class="fas fa-check-circle text-green-600"></i>
                    Conversion Successful
                </h2>
                <p class="text-gray-600 mb-4">${results.length} image(s) converted successfully!</p>
                <div class="space-y-4">
            `;
            
            results.forEach(file => {
                const reduction = file.originalSize ? ((file.originalSize - file.size) / file.originalSize * 100).toFixed(2) : '0';
                html += `
                    <div class="bg-gray-50 rounded-lg p-4">
                        <div class="flex items-start gap-4">
                            <img src="${file.url}" alt="${file.key}" class="w-24 h-24 object-cover rounded">
                            <div class="flex-1">
                                <h3 class="font-semibold text-gray-800">${file.originalName}</h3>
                                <p class="text-sm text-gray-600">Converted to: ${file.convertedName || file.key}</p>
                                <p class="text-sm text-green-600 font-medium">Size reduced by ${reduction}%</p>
                                <div class="flex gap-2 mt-2">
                                    <button onclick="copyToClipboard('${file.url}')" class="text-xs bg-indigo-100 text-indigo-700 px-3 py-1 rounded hover:bg-indigo-200">
                                        <i class="fas fa-copy mr-1"></i> Copy URL
                                    </button>
                                    <a href="${file.url}" download class="text-xs bg-green-100 text-green-700 px-3 py-1 rounded hover:bg-green-200">
                                        <i class="fas fa-download mr-1"></i> Download
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            });
            
            html += '</div>';
        }
        
        if (errors.length > 0) {
            html += `
                <div class="mt-6">
                    <h3 class="text-lg font-bold text-red-600 mb-2">
                        <i class="fas fa-exclamation-triangle mr-2"></i>
                        ${errors.length} Error(s)
                    </h3>
                    <div class="space-y-2">
            `;
            
            errors.forEach(err => {
                html += `
                    <div class="bg-red-50 border border-red-200 rounded p-3">
                        <p class="text-sm font-medium text-red-800">${err.file}</p>
                        <p class="text-xs text-red-600">${err.error}</p>
                    </div>
                `;
            });
            
            html += '</div></div>';
        }
        
        html += `
            <div class="mt-6 flex justify-center">
                <button id="resetBtn" class="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
                    <i class="fas fa-redo mr-2"></i>Convert More Images
                </button>
            </div>
        `;
        
        resultContent.innerHTML = html;
        
        // Add reset listener
        document.getElementById('resetBtn').addEventListener('click', resetUpload);
    }
    
    function resetUpload() {
        selectedFiles = [];
        fileInput.value = '';
        previewContent.innerHTML = '';
        previewContainer.classList.add('hidden');
        resultContainer.classList.add('hidden');
        progressContainer.classList.add('hidden');
        document.getElementById('qualitySection').classList.add('hidden');
        dropArea.classList.remove('hidden');
        qualitySlider.value = 80;
        qualityValue.textContent = '80';
        setUploadingState(false);
    }
    
    // --- Utility Functions ---
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    }
    
    window.copyToClipboard = function(text) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('URL berhasil disalin!', 'success');
        }).catch(() => {
            showToast('Gagal menyalin URL', 'error');
        });
    };
    
    function showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toast-container');
        if (!toastContainer) return;
        
        const toast = document.createElement('div');
        const icons = { 
            success: 'fa-check-circle', 
            error: 'fa-times-circle', 
            warning: 'fa-exclamation-triangle', 
            info: 'fa-info-circle' 
        };
        const colors = { 
            success: 'bg-green-500', 
            error: 'bg-red-500', 
            warning: 'bg-yellow-500', 
            info: 'bg-blue-500' 
        };
        
        toast.className = `toast px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium max-w-sm ${colors[type]}`;
        toast.innerHTML = `<div class="flex items-center gap-3"><i class="fas ${icons[type]} text-lg"></i><span>${message}</span></div>`;
        
        toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }
    
    // --- Initialization ---
    async function init() {
        const authSection = document.getElementById('authSection');
        const mainContent = document.getElementById('mainContent');
        const loginSection = document.getElementById('loginSection');

        try {
            const isAuthenticated = await checkAuth();
            if (isAuthenticated) {
                authSection.classList.add('hidden');
                mainContent.classList.remove('hidden');
                loginSection.classList.add('hidden');
                setupEventListeners();
            } else {
                authSection.classList.add('hidden');
                mainContent.classList.add('hidden');
                loginSection.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Initialization error:', error);
            authSection.classList.add('hidden');
            mainContent.classList.add('hidden');
            loginSection.classList.remove('hidden');
            showToast('Terjadi kesalahan saat inisialisasi.', 'error');
        }
    }
    
    init();
});