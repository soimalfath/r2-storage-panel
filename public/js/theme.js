// Universal Theme Management
class ThemeManager {
    constructor() {
        // Apply theme immediately (before DOM ready) to avoid flash
        this.currentTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', this.currentTheme);
    }

    init() {
        this.createToggleButton();
        this.updateToggleIcon();
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
        const headerActions = document.querySelector('header .flex.items-center.justify-end.gap-2');
        const headerGap = document.querySelector('header .flex.items-center.gap-2');
        const header = document.querySelector('header');
        
        if (headerActions) {
            // Insert before the last button in header actions
            headerActions.insertBefore(toggleBtn, headerActions.lastElementChild);
        } else if (headerGap) {
            // Append to header gap container
            headerGap.appendChild(toggleBtn);
        } else if (header) {
            // Create a container for the toggle if header exists but no suitable container
            const container = document.createElement('div');
            container.className = 'absolute top-4 right-4';
            container.appendChild(toggleBtn);
            header.appendChild(container);
        } else {
            // Fallback: floating toggle — safe, never inside page content
            toggleBtn.className += ' fixed top-4 right-4 z-50 shadow-lg';
            toggleBtn.style.backgroundColor = 'var(--bg-primary)';
            toggleBtn.style.borderColor = 'var(--border-color)';
            toggleBtn.style.color = 'var(--text-primary)';
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
    window.themeManager.init();
    // Expose global shortcut for inline onclick handlers
    window.toggleTheme = () => window.themeManager.toggleTheme();
});

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ThemeManager;
}
