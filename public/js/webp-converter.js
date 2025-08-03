/**
 * WebP Converter JavaScript
 * Handles image conversion to WebP format
 */

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const dropArea = document.getElementById('dropArea');
    const fileInput = document.getElementById('fileInput');
    const browseButton = document.getElementById('browseButton');
    const previewContainer = document.getElementById('filePreview'); // Fixed ID
    const previewContent = document.getElementById('previewContent');
    const qualitySlider = document.getElementById('qualitySlider');
    const qualityValue = document.getElementById('qualityValue');
    const uploadButton = document.getElementById('uploadButton');
    const uploadSpinner = document.getElementById('uploadSpinner');
    const uploadText = document.getElementById('uploadText');
    const progressContainer = document.getElementById('progressSection'); // Fixed ID
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const resultContainer = document.getElementById('resultSection'); // Fixed ID
    
    // State
    let selectedFile = null;
    let isUploading = false;
    
    // --- Authentication ---
    async function checkAuth() {
        try {
            const response = await fetch('/auth/status', { credentials: 'include' });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }

            const data = await response.json();

            if (data.success && data.data && data.data.authenticated) {
                // User is authenticated
                localStorage.setItem('userData', JSON.stringify(data.data));
                return true;
            } else {
                // User is not authenticated, redirect to login
                localStorage.removeItem('userData');
                window.location.href = '/loginW';
                return false;
            }
        } catch (error) {
            console.error('Authentication check failed:', error);
            localStorage.removeItem('userData');
            showToast('Sesi Anda telah berakhir. Mengalihkan ke halaman login.', 'error');
            setTimeout(() => {
                window.location.href = '/login';
            }, 1500);
            return false;
        }
    }

    async function handleLogout() {
        try {
            const response = await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
            const data = await response.json();
            if (data.success) {
                // Hapus data user dari localStorage
                localStorage.removeItem('userData');
                showToast('Berhasil keluar!', 'success');
                setTimeout(() => window.location.href = '/login', 1000);
            } else {
                showToast('Gagal keluar: ' + (data.error || 'Kesalahan tidak diketahui'), 'error');
            }
        } catch (error) {
            showToast('Gagal keluar: ' + error.message, 'error');
        }
    }
    
    // --- File Selection ---
    function setupEventListeners() {
        // File selection
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
                handleFile(e.dataTransfer.files[0]);
            }
        });
        
        // Quality slider
        qualitySlider.addEventListener('input', () => {
            qualityValue.textContent = qualitySlider.value;
        });
        
        // Upload button
        uploadButton.addEventListener('click', uploadImage);
        
        // Logout button
        document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    }
    
    function handleFileSelect(e) {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    }
    
    function handleFile(file) {
        // Check if file is an image
        if (!file.type.match('image.*')) {
            showToast('Hanya file gambar yang diperbolehkan', 'error');
            return;
        }
        
        // Check file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
            showToast('Ukuran file terlalu besar (maksimal 10MB)', 'error');
            return;
        }
        
        selectedFile = file;
        
        // Show preview
        const reader = new FileReader();
        reader.onload = (e) => {
            // Create preview content
            previewContent.innerHTML = `
                <div class="flex-shrink-0">
                    <img src="${e.target.result}" alt="Preview" class="h-24 w-auto rounded-lg shadow-sm">
                </div>
                <div class="flex-1">
                    <p class="font-medium text-gray-800">${file.name}</p>
                    <p class="text-sm text-gray-500">${formatFileSize(file.size)}</p>
                    <p class="text-sm text-gray-500">${file.type}</p>
                </div>
            `;
            previewContainer.classList.remove('hidden');
            uploadButton.disabled = false;
            
            // Show quality section
            document.getElementById('qualitySection').classList.remove('hidden');
        };
        reader.readAsDataURL(file);
        
        // Update UI
        dropArea.classList.add('hidden');
    }
    
    // --- Upload & Convert ---
    async function uploadImage() {
        if (!selectedFile || isUploading) return;
        
        isUploading = true;
        setUploadingState(true);
        
        // Show progress container
        progressContainer.classList.remove('hidden');
        progressBar.style.width = '0%';
        progressText.textContent = '0%';
        
        // Create FormData
        const formData = new FormData();
        formData.append('image', selectedFile);
        formData.append('quality', qualitySlider.value);
        
        try {
            // Create XMLHttpRequest to track progress
            const xhr = new XMLHttpRequest();
            
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percentComplete = Math.round((e.loaded / e.total) * 100);
                    progressBar.style.width = percentComplete + '%';
                    progressText.textContent = percentComplete + '%';
                }
            });
            
            xhr.addEventListener('load', () => {
                if (xhr.status === 200) {
                    const response = JSON.parse(xhr.responseText);
                    if (response.success) {
                        // The response structure is { success: true, data: { file: {...} } }
                        showSuccessResult(response.data.file);
                    } else {
                        showErrorResult(response.error || 'Konversi gagal');
                    }
                } else {
                    showErrorResult('Kesalahan server: ' + xhr.status);
                }
                isUploading = false;
                setUploadingState(false);
            });
            
            xhr.addEventListener('error', () => {
                showErrorResult('Koneksi gagal');
                isUploading = false;
                setUploadingState(false);
            });
            
            xhr.addEventListener('abort', () => {
                showErrorResult('Unggahan dibatalkan');
                isUploading = false;
                setUploadingState(false);
            });
            
            // Open connection and send data
            xhr.open('POST', '/r2/upload-webp', true);
            xhr.withCredentials = true;
            xhr.send(formData);
            
        } catch (error) {
            showErrorResult(error.message);
            isUploading = false;
            setUploadingState(false);
        }
    }
    
    function setUploadingState(isLoading) {
        if (isLoading) {
            uploadButton.disabled = true;
            uploadButton.innerHTML = '<i class="fas fa-spinner animate-spin mr-2"></i>Mengonversi...';
        } else {
            uploadButton.disabled = false;
            uploadButton.innerHTML = '<i class="fas fa-magic mr-2"></i>Convert & Upload to CDN';
        }
    }
    
    function showSuccessResult(data) {
        // Hide progress container
        progressContainer.classList.add('hidden');
        
        // Show result container
        resultContainer.classList.remove('hidden');
        
        // Create result content if it doesn't exist
        const resultContent = document.getElementById('resultContent');
        if (resultContent) {
            // Clear previous content
            resultContent.innerHTML = `
                <h2 class="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <i class="fas fa-check-circle text-green-600"></i>
                    Conversion Successful
                </h2>
                
                <div class="mb-6">
                    <img id="resultPreview" src="${data.url}" alt="Converted image" class="rounded-lg shadow-md max-h-64 mx-auto">
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div class="bg-gray-50 rounded-lg p-4">
                        <h3 class="font-semibold text-gray-800 mb-3">Original Image</h3>
                        <ul class="space-y-2">
                            <li class="flex justify-between">
                                <span class="text-gray-600">Filename:</span>
                                <span id="originalName" class="font-medium">${data.originalName}</span>
                            </li>
                            <li class="flex justify-between">
                                <span class="text-gray-600">Size:</span>
                                <span id="originalSize" class="font-medium">${data.originalSize ? formatFileSize(data.originalSize) : 'Unknown'}</span>
                            </li>
                            <li class="flex justify-between">
                                <span class="text-gray-600">Format:</span>
                                <span id="originalFormat" class="font-medium">${getFileExtension(data.originalName).toUpperCase()}</span>
                            </li>
                        </ul>
                    </div>
                    
                    <div class="bg-gray-50 rounded-lg p-4">
                        <h3 class="font-semibold text-gray-800 mb-3">Converted Image</h3>
                        <ul class="space-y-2">
                            <li class="flex justify-between">
                                <span class="text-gray-600">Filename:</span>
                                <span id="convertedName" class="font-medium">${data.key}</span>
                            </li>
                            <li class="flex justify-between">
                                <span class="text-gray-600">Size:</span>
                                <span id="convertedSize" class="font-medium">${formatFileSize(data.size)}</span>
                            </li>
                            <li class="flex justify-between">
                                <span class="text-gray-600">Format:</span>
                                <span id="convertedFormat" class="font-medium">WebP</span>
                            </li>
                            <li class="flex justify-between">
                                <span class="text-gray-600">Reduction:</span>
                                <span id="sizeReduction" class="font-medium text-green-600">${data.originalSize ? ((data.originalSize - data.size) / data.originalSize * 100).toFixed(2) : '0'}%</span>
                            </li>
                        </ul>
                    </div>
                </div>
                
                <div class="bg-gray-50 rounded-lg p-4 mb-6">
                    <h3 class="font-semibold text-gray-800 mb-3">CDN URL</h3>
                    <div class="flex">
                        <a id="fileUrl" href="${data.url}" target="_blank" class="flex-1 bg-white border border-gray-300 rounded-l-lg py-2 px-3 text-sm overflow-x-auto whitespace-nowrap">${data.url}</a>
                        <button id="copyUrlBtn" class="bg-indigo-600 text-white px-3 rounded-r-lg hover:bg-indigo-700 transition-colors">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                </div>
                
                <div class="flex justify-between">
                    <button id="resetBtn" class="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors">
                        <i class="fas fa-redo mr-2"></i>Convert Another
                    </button>
                    <a href="${data.url}" download class="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors">
                        <i class="fas fa-download mr-2"></i>Download
                    </a>
                </div>
            `;
            
            // Add event listener to the new copy button
            const copyUrlBtn = document.getElementById('copyUrlBtn');
            if (copyUrlBtn) {
                copyUrlBtn.addEventListener('click', () => {
                    const fileUrl = document.getElementById('fileUrl');
                    if (fileUrl) {
                        copyToClipboard(fileUrl.textContent);
                    }
                });
            }
            
            // Add event listener to reset button
            const resetBtn = document.getElementById('resetBtn');
            if (resetBtn) {
                resetBtn.addEventListener('click', resetUpload);
            }
        }
        
        // Show success message
        showToast('Konversi berhasil!', 'success');
    }
    
    function showErrorResult(errorMessage) {
        // Hide progress container
        progressContainer.classList.add('hidden');
        
        // Show error message
        showToast(errorMessage, 'error');
        
        // Reset upload button
        setUploadingState(false);
    }
    
    function resetUpload() {
        // Reset state
        selectedFile = null;
        isUploading = false;
        
        // Reset UI
        previewContainer.classList.add('hidden');
        resultContainer.classList.add('hidden');
        progressContainer.classList.add('hidden');
        document.getElementById('qualitySection').classList.add('hidden');
        dropArea.classList.remove('hidden');
        
        // Reset form
        fileInput.value = '';
        qualitySlider.value = 80;
        qualityValue.textContent = '80';
        
        // Reset buttons
        uploadButton.disabled = true;
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
    
    function getFileExtension(filename) {
        return filename.split('.').pop().toLowerCase();
    }
    
    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('URL berhasil disalin!', 'success');
        }).catch(() => {
            showToast('Gagal menyalin URL', 'error');
        });
    }
    
    // Event listeners for copy buttons are now added dynamically in showSuccessResult function
    
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
                // checkAuth already handles redirection, but as a fallback:
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