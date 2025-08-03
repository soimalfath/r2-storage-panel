document.addEventListener('DOMContentLoaded', () => {
    // Apply dark mode styling overrides
    function applyDarkModeOverrides() {
        // Apply styling to all background elements
        const whiteElements = document.querySelectorAll('.bg-white');
        whiteElements.forEach(el => {
            el.style.backgroundColor = 'var(--bg-primary)';
        });

        const grayBgElements = document.querySelectorAll('.bg-gray-50, .bg-gray-100');
        grayBgElements.forEach(el => {
            el.style.backgroundColor = 'var(--bg-secondary)';
        });

        // Apply styling to text elements
        const textElements = {
            '.text-gray-800': 'var(--text-primary)',
            '.text-gray-700': 'var(--text-primary)', 
            '.text-gray-600': 'var(--text-secondary)',
            '.text-gray-500': 'var(--text-secondary)'
        };

        Object.entries(textElements).forEach(([selector, color]) => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                el.style.color = color;
            });
        });

        // Apply styling to borders
        const borderElements = document.querySelectorAll('.border-gray-200, .border-gray-300');
        borderElements.forEach(el => {
            el.style.borderColor = 'var(--border-color)';
        });

        // Apply styling to info/warning boxes
        const blueBoxes = document.querySelectorAll('.bg-blue-50');
        blueBoxes.forEach(el => {
            el.style.backgroundColor = 'var(--info-bg)';
        });

        const blueBorders = document.querySelectorAll('.border-blue-200');
        blueBorders.forEach(el => {
            el.style.borderColor = 'var(--info-border)';
        });

        const blueText = document.querySelectorAll('.text-blue-800, .text-blue-700');
        blueText.forEach(el => {
            if (el.classList.contains('text-blue-800')) {
                el.style.color = 'var(--info-text-strong)';
            } else {
                el.style.color = 'var(--info-text)';
            }
        });

        // Apply styling to endpoint cards
        const endpointCards = document.querySelectorAll('.endpoint-card');
        endpointCards.forEach(el => {
            el.style.backgroundColor = 'var(--bg-primary)';
        });
    }

    // Apply initial styling
    applyDarkModeOverrides();

    // Listen for theme changes
    const themeObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
                applyDarkModeOverrides();
            }
        });
    });

    themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme']
    });
    // Configuration
    // Ambil API_KEY dari endpoint backend agar selalu sinkron dengan env
    let DEFAULT_API_KEY = 'your-api-key-change-this';
    fetch('/api/apikey')
      .then(r => r.json())
      .then(d => {
        if (d.apiKey) DEFAULT_API_KEY = d.apiKey;
        else showToast('Gagal mengambil API key dari backend', 'error');
      })
     .catch(() => showToast('Gagal mengambil API key dari backend', 'error'));

    // DOM Elements
    const generateApiKeyBtn = document.getElementById('generateApiKeyBtn');
    const apiKeySection = document.getElementById('apiKeySection');
    const apiKeyDisplay = document.getElementById('apiKeyDisplay');
    const toggleApiKeyBtn = document.getElementById('toggleApiKeyBtn');
    const copyApiKeyBtn = document.getElementById('copyApiKeyBtn');
    const copyBaseUrlBtn = document.getElementById('copyBaseUrlBtn');
    const baseUrlElement = document.getElementById('baseUrl');

    let isApiKeySectionVisible = false;

    // --- Functions ---

    const showToast = (message, type = 'info') => {
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
        toast.innerHTML = `
            <div class="flex items-center gap-3">
                <i class="fas ${icons[type]} text-lg"></i>
                <span>${message}</span>
            </div>
        `;

        toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.remove();
        }, 4000);
    };
    
    const copyToClipboard = (text, successMessage) => {
        // Use the Clipboard API for modern browsers
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(() => {
                showToast(successMessage, 'success');
            }).catch(err => {
                console.error('Copy failed:', err);
                showToast('Failed to copy to clipboard', 'error');
            });
        } else {
            // Fallback for older browsers
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed"; // Avoid scrolling to bottom
            textArea.style.left = "-9999px";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                document.execCommand('copy');
                showToast(successMessage, 'success');
            } catch (err) {
                console.error('Fallback copy failed:', err);
                showToast('Failed to copy to clipboard', 'error');
            }
            document.body.removeChild(textArea);
        }
    };
    

    const toggleApiKeySection = () => {
        isApiKeySectionVisible = !isApiKeySectionVisible;
        if (isApiKeySectionVisible) {
            apiKeySection.classList.remove('hidden');
            // Ambil API key terbaru dari backend jika belum ada
            if (!DEFAULT_API_KEY || DEFAULT_API_KEY === 'your-api-key-change-this') {
                fetch('/api/apikey').then(r => r.json()).then(d => {
                    apiKeyDisplay.value = d.apiKey || 'your-api-key-change-this';
                });
            } else {
                apiKeyDisplay.value = DEFAULT_API_KEY;
            }
            generateApiKeyBtn.querySelector('span').textContent = 'Hide API Key';
            showToast('API Key displayed. Keep it secure!', 'warning');
        } else {
            apiKeySection.classList.add('hidden');
            generateApiKeyBtn.querySelector('span').textContent = 'Show API Key';
        }
    };

    const toggleApiKeyVisibility = () => {
        const isVisible = apiKeyDisplay.type === 'text';
        apiKeyDisplay.type = isVisible ? 'password' : 'text';
        const icon = toggleApiKeyBtn.querySelector('i');
        icon.className = isVisible ? 'fas fa-eye' : 'fas fa-eye-slash';
    };


    // --- Event Listeners ---

    if (generateApiKeyBtn) {
        generateApiKeyBtn.addEventListener('click', toggleApiKeySection);
    }

    if (toggleApiKeyBtn) {
        toggleApiKeyBtn.addEventListener('click', toggleApiKeyVisibility);
    }

    if (copyApiKeyBtn) {
        copyApiKeyBtn.addEventListener('click', () => {
           copyToClipboard(apiKeyDisplay.value, 'API Key copied to clipboard!');
        });
    }

    if (copyBaseUrlBtn) {
        copyBaseUrlBtn.addEventListener('click', () => {
            copyToClipboard(baseUrlElement.textContent.replace('Base URL: ', ''), 'Base URL copied to clipboard!');
        });
    }

    // --- Initial Setup ---

    if (baseUrlElement) {
        baseUrlElement.textContent = `${window.location.origin}/api`;
    }
});