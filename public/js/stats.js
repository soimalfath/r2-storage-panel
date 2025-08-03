document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const loadingState = document.getElementById('loadingState');
    const mainContent = document.getElementById('mainContent');
    const refreshBtn = document.getElementById('refreshBtn');
    const errorState = document.getElementById('errorState');
    const warningBanner = document.getElementById('warningBanner');
    const warningMessage = document.getElementById('warningMessage');

    // Stats cards
    const totalSizeCard = document.getElementById('totalSizeCard');
    const totalFilesCard = document.getElementById('totalFilesCard');
    const usagePercentCard = document.getElementById('usagePercentCard');
    const remainingSpaceCard = document.getElementById('remainingSpaceCard');
    const usageBarCard = document.getElementById('usageBarCard');
    const largestFilesTable = document.getElementById('largestFilesTable');

    // Charts
    let storageChart = null;
    let fileTypesChart = null;
    let currentData = null; // Store current data for theme updates

    // Initialize
    console.log('Stats page loaded, attempting to fetch data...');
    loadStats();
    refreshBtn.addEventListener('click', loadStats);
    
    // Add retry button listener
    const retryBtn = document.getElementById('retryBtn');
    if (retryBtn) {
        retryBtn.addEventListener('click', loadStats);
    }
    
    // Listen for theme changes to update charts
    const themeObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
                if (currentData) {
                    updateStorageChart(currentData.storage);
                    updateFileTypesChart(currentData.fileTypes);
                }
            }
        });
    });
    
    themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme']
    });

    async function loadStats() {
        try {
            console.log('Starting loadStats...');
            showLoading(true);
            
            // Debug: test endpoint first
            console.log('Testing /api/stats/test endpoint...');
            try {
                const testResponse = await fetch('/api/stats/test', {
                    credentials: 'include'
                });
                console.log('Test response status:', testResponse.status);
                const testText = await testResponse.text();
                console.log('Test response:', testText);
            } catch (testError) {
                console.error('Test endpoint failed:', testError);
            }
            
            console.log('Fetching /api/stats/storage...');
            const response = await fetch('/api/stats/storage', {
                credentials: 'include'
            });

            console.log('Response status:', response.status);
            console.log('Response headers:', [...response.headers.entries()]);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Response error:', errorText);
                throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
            }

            const result = await response.json();
            console.log('API result:', result);

            if (!result.success) {
                throw new Error(result.error || 'Failed to load statistics');
            }

            displayStats(result.data);
            showLoading(false);

        } catch (error) {
            console.error('Stats error:', error);
            
            // Check if it's authentication error
            if (error.message.includes('Authentication') || error.message.includes('401')) {
                showError('Authentication required. Please login first.');
                
                // Redirect to login after 3 seconds
                setTimeout(() => {
                    window.location.href = '/login';
                }, 3000);
            } else {
                showError(error.message || 'Failed to load statistics');
            }
        }
    }

    function displayStats(data) {
        console.log('Displaying stats:', data);
        
        // Update cards
        totalSizeCard.textContent = data.storage.totalSizeFormatted;
        totalFilesCard.textContent = data.storage.totalFiles.toLocaleString();
        usagePercentCard.textContent = `${data.storage.usagePercent}% of free tier`;
        remainingSpaceCard.textContent = data.storage.remainingSizeFormatted;

        // Update usage bar
        const usagePercent = Math.min(data.storage.usagePercent, 100);
        usageBarCard.style.width = `${usagePercent}%`;
        
        // Set bar color based on usage
        if (usagePercent < 70) {
            usageBarCard.className = 'h-2 rounded-full transition-all duration-300 bg-green-500';
        } else if (usagePercent < 90) {
            usageBarCard.className = 'h-2 rounded-full transition-all duration-300 bg-yellow-500';
        } else {
            usageBarCard.className = 'h-2 rounded-full transition-all duration-300 bg-red-500';
        }

        // Show warning if needed
        if (data.storage.isNearLimit || data.storage.isOverLimit) {
            warningBanner.classList.remove('hidden');
            if (data.storage.isOverLimit) {
                warningMessage.textContent = 'You have exceeded the free tier storage limit! Consider upgrading or deleting some files.';
                warningBanner.className = 'bg-red-50 border border-red-200 rounded-lg p-4';
            } else {
                warningMessage.textContent = 'You are approaching the free tier storage limit. Consider monitoring your usage closely.';
            }
        } else {
            warningBanner.classList.add('hidden');
        }

        // Update charts
        currentData = data; // Store current data for theme updates
        updateStorageChart(data.storage);
        updateFileTypesChart(data.fileTypes);
        updateLargestFilesTable(data.largestFiles);
    }

    function updateStorageChart(storage) {
        const ctx = document.getElementById('storageChart').getContext('2d');
        
        if (storageChart) {
            storageChart.destroy();
        }

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const textColor = isDark ? '#ffffff' : '#111827';  // Use pure white for better contrast in dark mode
        const gridColor = isDark ? '#374151' : '#e5e7eb';

        const usedSize = storage.totalSize;
        const remainingSize = storage.remainingSize > 0 ? storage.remainingSize : 0;

        storageChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Used', 'Remaining'],
                datasets: [{
                    data: [usedSize, remainingSize],
                    backgroundColor: [
                        storage.usagePercent > 90 ? '#ef4444' : storage.usagePercent > 70 ? '#f59e0b' : '#10b981',
                        isDark ? '#374151' : '#e5e7eb'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: textColor,
                            font: {
                                size: 14,
                                weight: 'bold'
                            },
                            generateLabels: function(chart) {
                                const data = chart.data;
                                return data.labels.map((label, i) => ({
                                    text: `${label}: ${formatBytes(data.datasets[0].data[i])}`,
                                    fillStyle: data.datasets[0].backgroundColor[i],
                                    strokeStyle: data.datasets[0].backgroundColor[i],
                                    fontColor: textColor,
                                    lineWidth: 0,
                                    index: i
                                }));
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: isDark ? '#1f2937' : '#ffffff',
                        titleColor: textColor,
                        bodyColor: textColor,
                        borderColor: gridColor,
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                const label = context.label;
                                const value = formatBytes(context.raw);
                                const percent = ((context.raw / (usedSize + remainingSize)) * 100).toFixed(1);
                                return `${label}: ${value} (${percent}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    function updateFileTypesChart(fileTypes) {
        const ctx = document.getElementById('fileTypesChart').getContext('2d');
        
        if (fileTypesChart) {
            fileTypesChart.destroy();
        }

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const textColor = isDark ? '#ffffff' : '#111827';  // Use pure white for better contrast in dark mode
        const gridColor = isDark ? '#374151' : '#e5e7eb';

        // Sort file types by count and take top 10
        const sortedTypes = Object.entries(fileTypes)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10);

        const labels = sortedTypes.map(([type]) => type.toUpperCase());
        const data = sortedTypes.map(([,count]) => count);
        
        // Generate colors
        const colors = [
            '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
            '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#6b7280'
        ];

        fileTypesChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors.slice(0, labels.length),
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: isDark ? '#1f2937' : '#ffffff',
                        titleColor: textColor,
                        bodyColor: textColor,
                        borderColor: gridColor,
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                return `${context.label}: ${context.raw} files`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            color: textColor
                        },
                        grid: {
                            color: gridColor
                        }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1,
                            color: textColor
                        },
                        grid: {
                            color: gridColor
                        }
                    }
                }
            }
        });
    }

    function updateLargestFilesTable(largestFiles) {
        largestFilesTable.innerHTML = '';
        
        if (largestFiles.length === 0) {
            largestFilesTable.innerHTML = `
                <tr>
                    <td colspan="3" class="px-6 py-4 text-center" style="color: var(--text-secondary);">
                        No files found
                    </td>
                </tr>
            `;
            return;
        }

        largestFiles.forEach((file, index) => {
            const row = document.createElement('tr');
            // Use CSS variables instead of hard-coded colors
            row.style.backgroundColor = index % 2 === 0 ? 'var(--bg-secondary)' : 'var(--bg-primary)';
            
            row.innerHTML = `
                <td class="px-6 py-4 text-sm font-medium truncate max-w-xs" style="color: var(--text-primary);">
                    ${escapeHtml(file.key)}
                </td>
                <td class="px-6 py-4 text-sm" style="color: var(--text-secondary);">
                    ${file.sizeFormatted}
                </td>
                <td class="px-6 py-4 text-sm" style="color: var(--text-secondary);">
                    ${new Date(file.lastModified).toLocaleDateString()}
                </td>
            `;
            
            largestFilesTable.appendChild(row);
        });
    }

    function showLoading(show) {
        if (show) {
            loadingState.classList.remove('hidden');
            mainContent.classList.add('hidden');
            errorState.classList.add('hidden');
        } else {
            loadingState.classList.add('hidden');
            mainContent.classList.remove('hidden');
            errorState.classList.add('hidden');
        }
    }

    function showError(message) {
        loadingState.classList.add('hidden');
        mainContent.classList.add('hidden');
        errorState.classList.remove('hidden');
        
        const errorMessage = document.getElementById('errorMessage');
        errorMessage.textContent = message;
    }

    function formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Listen for theme changes from ThemeManager
    document.addEventListener('click', (e) => {
        if (e.target.id === 'theme-toggle' || e.target.closest('#theme-toggle')) {
            // Re-render charts with new theme after a short delay
            setTimeout(() => {
                if (storageChart && storageChart.data) {
                    const storage = {
                        totalSize: storageChart.data.datasets[0].data[0],
                        remainingSize: storageChart.data.datasets[0].data[1],
                        usagePercent: (storageChart.data.datasets[0].data[0] / (storageChart.data.datasets[0].data[0] + storageChart.data.datasets[0].data[1])) * 100
                    };
                    updateStorageChart(storage);
                }
                if (fileTypesChart && fileTypesChart.data) {
                    const fileTypes = {};
                    fileTypesChart.data.labels.forEach((label, i) => {
                        fileTypes[label.toLowerCase()] = fileTypesChart.data.datasets[0].data[i];
                    });
                    updateFileTypesChart(fileTypes);
                }
            }, 100);
        }
    });
});
