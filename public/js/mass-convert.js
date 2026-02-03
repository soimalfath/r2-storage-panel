/**
 * Mass WebP Converter JavaScript
 * Handles mass image conversion logic
 */

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const replaceCheckbox = document.getElementById('replaceCheckbox');
    const prefixInput = document.getElementById('prefixInput');
    const limitInput = document.getElementById('limitInput');
    const logContainer = document.getElementById('logContainer');
    const clearLogsBtn = document.getElementById('clearLogsBtn');
    const statsSection = document.getElementById('statsSection');
    const processingIndicator = document.getElementById('processingIndicator');
    
    // Stats Elements
    const statScanned = document.getElementById('statScanned');
    const statConverted = document.getElementById('statConverted');
    const statSkipped = document.getElementById('statSkipped');
    const statErrors = document.getElementById('statErrors');
    
    // State
    let isProcessing = false;
    let shouldStop = false;
    let continuationToken = null;
    let stats = {
        scanned: 0,
        converted: 0,
        skipped: 0,
        errors: 0
    };

    // --- Authentication ---
    async function checkAuth() {
        try {
            const response = await fetch('/auth/status', { credentials: 'include' });
            if (!response.ok) throw new Error('Auth check failed');
            const data = await response.json();
            
            if (data.success && data.data && data.data.authenticated) {
                return true;
            } else {
                window.location.href = '/login?redirect=/mass-convert.html';
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

    // --- Logging & UI Updates ---
    function addLog(message, type = 'info') {
        const div = document.createElement('div');
        const timestamp = new Date().toLocaleTimeString();
        
        let colorClass = 'text-gray-300';
        if (type === 'success') colorClass = 'text-green-400';
        if (type === 'warning') colorClass = 'text-yellow-400';
        if (type === 'error') colorClass = 'text-red-400';
        
        div.className = `${colorClass} border-b border-gray-800 pb-1 mb-1`;
        div.innerHTML = `<span class="text-gray-600">[${timestamp}]</span> ${message}`;
        
        logContainer.appendChild(div);
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    function updateStats() {
        statScanned.textContent = stats.scanned;
        statConverted.textContent = stats.converted;
        statSkipped.textContent = stats.skipped;
        statErrors.textContent = stats.errors;
    }

    function resetStats() {
        stats = { scanned: 0, converted: 0, skipped: 0, errors: 0 };
        updateStats();
        logContainer.innerHTML = '<div class="text-gray-500 italic">Starting new process...</div>';
    }

    // --- Core Logic ---
    async function processBatch() {
        if (shouldStop) {
            isProcessing = false;
            stopBtn.disabled = true;
            startBtn.disabled = false;
            startBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            processingIndicator.classList.add('hidden');
            addLog('Process stopped by user.', 'warning');
            return;
        }

        const prefix = prefixInput.value.trim();
        const limit = parseInt(limitInput.value);
        const replace = replaceCheckbox.checked;

        try {
            addLog('Fetching batch...', 'info');
            
            const response = await fetch('/api/convert-existing', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prefix,
                    limit,
                    replace,
                    continuationToken
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }

            const data = await response.json();
            const result = data.data;

            // Update stats logic
            // Note: The API returns `converted` array, `errors` array, `skippedCount`
            // But it doesn't give precise "Total Scanned" in this batch directly other than implicit
            // Let's infer scanned count from result length (converted + skipped + errors) if possible
            // Actually API result message says "Processed X files" but data structure might vary.
            // Let's check `api/convert-existing.js` response structure.
            // It returns: { converted: [], errors: [], skippedCount: number, nextContinuationToken: ... }
            
            const batchConverted = result.converted.length;
            const batchErrors = result.errors.length;
            const batchSkipped = result.skippedCount || 0;
            const batchScanned = batchConverted + batchErrors + batchSkipped; // Approximate

            stats.scanned += batchScanned;
            stats.converted += batchConverted;
            stats.errors += batchErrors;
            stats.skipped += batchSkipped;
            
            updateStats();

            // Log details
            if (batchConverted > 0) {
                addLog(`Converted ${batchConverted} files in this batch.`, 'success');
                result.converted.forEach(item => {
                    const saved = ((item.originalSize - item.newSize) / 1024).toFixed(2);
                    addLog(`✓ ${item.oldKey} -> ${item.newKey} (Saved ${saved}KB)`, 'success');
                });
            }

            if (batchErrors > 0) {
                addLog(`${batchErrors} errors occurred.`, 'error');
                result.errors.forEach(err => {
                    addLog(`✗ ${err.key}: ${err.error}`, 'error');
                });
            }
            
            if (batchSkipped > 0) {
                addLog(`Skipped ${batchSkipped} files (already WebP or not supported).`, 'info');
            }

            // Check for continuation
            if (result.nextContinuationToken) {
                continuationToken = result.nextContinuationToken;
                // Add a small delay to not hammer the server too hard
                setTimeout(processBatch, 1000);
            } else {
                // Done
                finishProcess();
            }

        } catch (error) {
            addLog(`Error: ${error.message}`, 'error');
            stopBtn.disabled = true;
            startBtn.disabled = false;
            processingIndicator.classList.add('hidden');
            isProcessing = false;
        }
    }

    function finishProcess() {
        isProcessing = false;
        continuationToken = null;
        startBtn.disabled = false;
        startBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        stopBtn.disabled = true;
        processingIndicator.classList.add('hidden');
        addLog('All files processed!', 'success');
        addLog('-----------------------------------');
        addLog(`Total Scanned: ${stats.scanned}`);
        addLog(`Total Converted: ${stats.converted}`);
        addLog(`Total Errors: ${stats.errors}`);
    }

    // --- Initialization ---
    async function init() {
        const authSection = document.getElementById('authSection');
        const mainContent = document.getElementById('mainContent');
        const loginSection = document.getElementById('loginSection');

        const isAuthenticated = await checkAuth();
        if (isAuthenticated) {
            authSection.classList.add('hidden');
            mainContent.classList.remove('hidden');
            
            // Event Listeners
            startBtn.addEventListener('click', () => {
                if (isProcessing) return;
                isProcessing = true;
                shouldStop = false;
                continuationToken = null;
                
                // UI updates
                startBtn.disabled = true;
                startBtn.classList.add('opacity-50', 'cursor-not-allowed');
                stopBtn.disabled = false;
                statsSection.classList.remove('hidden');
                processingIndicator.classList.remove('hidden');
                
                resetStats();
                processBatch();
            });

            stopBtn.addEventListener('click', () => {
                shouldStop = true;
                addLog('Stopping after current batch...', 'warning');
            });

            clearLogsBtn.addEventListener('click', () => {
                logContainer.innerHTML = '';
            });

            document.getElementById('logoutBtn').addEventListener('click', handleLogout);
        } else {
            authSection.classList.add('hidden');
            loginSection.classList.remove('hidden');
        }
    }

    init();
});
