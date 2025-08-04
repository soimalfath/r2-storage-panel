// Universal Theme Management
class ThemeManager {
    constructor() {
        this.init();
    }

    init() {
        // Get saved theme or default to light
        this.currentTheme = localStorage.getItem('theme') || 'light';
        this.applyTheme(this.currentTheme);
        this.createToggleButton();
        this.bindEvents();
    }

    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        this.currentTheme = theme;
        localStorage.setItem('theme', theme);
        this.updateToggleIcon();
    }

    toggleTheme() {
        const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        this.applyTheme(newTheme);
    }

    createToggleButton() {
        // Check if toggle button already exists
        if (document.getElementById('theme-toggle')) return;

        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'theme-toggle';
        toggleBtn.className = 'theme-toggle p-2.5 rounded-lg transition-colors';
        toggleBtn.title = 'Toggle Dark/Light Mode';
        toggleBtn.innerHTML = '<i class="fas fa-sun"></i>';

        // Find a suitable place to insert the toggle button
        this.insertToggleButton(toggleBtn);
    }

    insertToggleButton(toggleBtn) {
        // Try different locations based on page structure
        const headerActions = document.querySelector('.flex.items-center.justify-end.gap-2');
        const headerGap = document.querySelector('.flex.items-center.gap-2');
        const header = document.querySelector('header');
        
        if (headerActions) {
            // Insert before the last button (usually logout)
            const lastButton = headerActions.lastElementChild;
            headerActions.insertBefore(toggleBtn, lastButton);
        } else if (headerGap) {
            headerGap.appendChild(toggleBtn);
        } else if (header) {
            header.appendChild(toggleBtn);
        } else {
            // Fallback: create floating toggle
            toggleBtn.className += ' fixed top-4 right-4 z-50 bg-white border border-gray-300 shadow-lg';
            document.body.appendChild(toggleBtn);
        }
    }

    updateToggleIcon() {
        const toggleBtn = document.getElementById('theme-toggle');
        if (!toggleBtn) return;

        const icon = toggleBtn.querySelector('i');
        if (this.currentTheme === 'dark') {
            icon.className = 'fas fa-moon';
            toggleBtn.title = 'Switch to Light Mode';
        } else {
            icon.className = 'fas fa-sun';
            toggleBtn.title = 'Switch to Dark Mode';
        }
    }

    bindEvents() {
        document.addEventListener('click', (e) => {
            if (e.target.id === 'theme-toggle' || e.target.closest('#theme-toggle')) {
                this.toggleTheme();
            }
        });

        // Listen for system theme changes
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
                if (!localStorage.getItem('theme')) {
                    this.applyTheme(e.matches ? 'dark' : 'light');
                }
            });
        }
    }

    // Method to update Chart.js themes
    updateChartTheme(chart) {
        if (!chart) return;

        const isDark = this.currentTheme === 'dark';
        const textColor = isDark ? '#f9fafb' : '#111827';
        const gridColor = isDark ? '#374151' : '#e5e7eb';

        chart.options.plugins.legend.labels.color = textColor;
        chart.options.scales.x.ticks.color = textColor;
        chart.options.scales.y.ticks.color = textColor;
        chart.options.scales.x.grid.color = gridColor;
        chart.options.scales.y.grid.color = gridColor;
        
        chart.update();
    }
}

// Initialize theme manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.themeManager = new ThemeManager();
});

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ThemeManager;
}
