// Performance optimization system for the earthquake monitoring site
class PerformanceOptimizer {
    constructor() {
        this.loadStartTime = performance.now();
        this.criticalResourcesLoaded = false;
        this.lazyLoadObserver = null;
        this.preloadQueue = [];
        this.cacheVersion = '1.0.0';
        
        // Don't block header rendering
        requestIdleCallback(() => this.init(), { timeout: 100 });
    }

    init() {
        // Defer non-critical optimizations to not block header
        setTimeout(() => {
            this.setupResourceHints();
            this.initializeLazyLoading();
            this.optimizeImages();
            this.setupServiceWorker();
            this.minimizeMainThreadBlocking();
        }, 200);
        
        // Setup performance monitoring immediately but non-blocking
        setTimeout(() => this.setupPerformanceMonitoring(), 500);
        
        console.log('Performance optimizer initialized (non-blocking)');
    }

    // Optimize critical rendering path
    optimizeCriticalPath() {
        // Minimize initial render blocking
        const style = document.createElement('style');
        style.textContent = `
            /* Critical CSS - above the fold styles */
            body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; }
            .header { background: linear-gradient(to bottom, #530504, #CB140F); color: white; min-height: 100px; }
            .loading-spinner { 
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                border: 4px solid #f3f3f3; border-top: 4px solid #CB140F;
                border-radius: 50%; width: 50px; height: 50px; animation: spin 1s linear infinite;
                z-index: 9999;
            }
            @keyframes spin { 0% { transform: translate(-50%, -50%) rotate(0deg); } 
                             100% { transform: translate(-50%, -50%) rotate(360deg); } }
        `;
        document.head.insertBefore(style, document.head.firstChild);

        // Show loading spinner immediately
        this.showLoadingSpinner();
    }

    // Setup resource hints for faster loading
    setupResourceHints() {
        const hints = [
            { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
            { rel: 'preconnect', href: 'https://maps.googleapis.com' },
            { rel: 'preconnect', href: 'https://earthquake.usgs.gov' },
            { rel: 'dns-prefetch', href: 'https://api.allorigins.win' },
            { rel: 'dns-prefetch', href: 'https://earthquake.tmd.go.th' }
        ];

        hints.forEach(hint => {
            const link = document.createElement('link');
            link.rel = hint.rel;
            link.href = hint.href;
            if (hint.crossorigin) link.crossOrigin = hint.crossorigin;
            document.head.appendChild(link);
        });
    }

    // Initialize lazy loading for images and non-critical resources
    initializeLazyLoading() {
        if ('IntersectionObserver' in window) {
            this.lazyLoadObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        this.loadLazyResource(entry.target);
                        this.lazyLoadObserver.unobserve(entry.target);
                    }
                });
            }, {
                rootMargin: '50px 0px',
                threshold: 0.01
            });
        }

        // Setup lazy loading for existing elements
        setTimeout(() => this.setupLazyElements(), 100);
    }

    // Setup elements for lazy loading
    setupLazyElements() {
        // Lazy load images only if not in viewport and browser doesn't support native lazy loading
        if (!('loading' in HTMLImageElement.prototype)) {
            document.querySelectorAll('img[src]').forEach(img => {
                if (!this.isInViewport(img)) {
                    const src = img.src;
                    img.dataset.src = src;
                    img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMSIgaGVpZ2h0PSIxIiB2aWV3Qm94PSIwIDAgMSAxIiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiIGZpbGw9IiNmNWY1ZjUiLz48L3N2Zz4=';
                    img.classList.add('lazy-load');
                    
                    if (this.lazyLoadObserver) {
                        this.lazyLoadObserver.observe(img);
                    }
                }
            });
        } else {
            // Use native lazy loading for supported browsers
            document.querySelectorAll('img').forEach(img => {
                if (!img.hasAttribute('loading')) {
                    img.setAttribute('loading', 'lazy');
                }
            });
        }

        // Lazy load non-critical scripts
        document.querySelectorAll('script[data-lazy]').forEach(script => {
            if (this.lazyLoadObserver) {
                this.lazyLoadObserver.observe(script);
            }
        });
    }

    // Load lazy resource
    loadLazyResource(element) {
        if (element.tagName === 'IMG' && element.dataset.src) {
            const img = new Image();
            img.onload = () => {
                element.src = element.dataset.src;
                element.classList.add('loaded');
            };
            img.src = element.dataset.src;
        } else if (element.tagName === 'SCRIPT' && element.dataset.src) {
            element.src = element.dataset.src;
        }
    }

    // Check if element is in viewport
    isInViewport(element) {
        const rect = element.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
    }

    // Optimize images
    optimizeImages() {
        // Add loading="lazy" to images that don't have it
        document.querySelectorAll('img').forEach(img => {
            // Add native lazy loading attribute to HTML, not CSS
            if (!img.hasAttribute('loading')) {
                img.setAttribute('loading', 'lazy');
            }
            
            // Add decoding attribute for better performance
            if (!img.hasAttribute('decoding')) {
                img.setAttribute('decoding', 'async');
            }
            
            // Optimize image rendering
            img.style.imageRendering = '-webkit-optimize-contrast';
        });

        // Handle images with data-src for lazy loading fallback
        if ('loading' in HTMLImageElement.prototype) {
            // Browser supports native lazy loading
            document.querySelectorAll('img[data-src]').forEach(img => {
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
            });
        }
    }

    // Setup service worker for caching
    setupServiceWorker() {
        // Temporarily disable service worker to debug Safari issues
        console.log('⚠️ Service Worker disabled for debugging');
        
        // Unregister any existing service workers
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(function(registrations) {
                for (let registration of registrations) {
                    registration.unregister();
                    console.log('Unregistered service worker:', registration);
                }
            });
        }
        
        return;
        
        // Original code (disabled)
        /*
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(registration => {
                    console.log('Service Worker registered:', registration);
                })
                .catch(error => {
                    console.log('Service Worker registration failed:', error);
                });
        }
        */
    }

    // Preload critical assets
    preloadCriticalAssets() {
        const criticalAssets = [
            { href: '/picture/Ellipse 3.png', as: 'image' },
            { href: '/picture/line.png', as: 'image' },
            { href: '/picture/telegram.png', as: 'image' },
            { href: '/picture/discord.png', as: 'image' }
        ];

        criticalAssets.forEach(asset => {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.href = asset.href;
            link.as = asset.as;
            document.head.appendChild(link);
        });
    }

    // Show loading spinner
    showLoadingSpinner() {
        const spinner = document.createElement('div');
        spinner.className = 'loading-spinner';
        spinner.id = 'global-spinner';
        document.body.appendChild(spinner);
    }

    // Hide loading spinner
    hideLoadingSpinner() {
        const spinner = document.getElementById('global-spinner');
        if (spinner) {
            spinner.style.opacity = '0';
            setTimeout(() => {
                if (spinner.parentNode) {
                    spinner.parentNode.removeChild(spinner);
                }
            }, 100); // Reduced from 300ms
        }
    }

    // Optimize font loading
    optimizeFontLoading() {
        // Use font-display: swap for better performance
        const fontStyle = document.createElement('style');
        fontStyle.textContent = `
            @font-face {
                font-family: 'Arial';
                font-display: swap;
            }
        `;
        document.head.appendChild(fontStyle);
    }

    // Setup performance monitoring
    setupPerformanceMonitoring() {
        // Monitor Core Web Vitals
        if ('web-vitals' in window) {
            // This would require the web-vitals library
            // For now, use basic performance API
        }

        // Monitor page load performance
        window.addEventListener('load', () => {
            const loadTime = performance.now() - this.loadStartTime;
            console.log(`Page loaded in ${loadTime.toFixed(2)}ms`);
            
            // Hide loading spinner
            this.hideLoadingSpinner();
            
            // Report performance metrics
            this.reportPerformanceMetrics(loadTime);
        });

        // Monitor LCP (Largest Contentful Paint)
        if ('PerformanceObserver' in window) {
            try {
                const observer = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        if (entry.entryType === 'largest-contentful-paint') {
                            console.log(`LCP: ${entry.startTime.toFixed(2)}ms`);
                        }
                    }
                });
                observer.observe({ entryTypes: ['largest-contentful-paint'] });
            } catch (e) {
                console.log('Performance Observer not supported');
            }
        }
    }

    // Report performance metrics
    reportPerformanceMetrics(loadTime) {
        const metrics = {
            loadTime: loadTime,
            domContentLoaded: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd || 0,
            firstPaint: performance.getEntriesByName('first-paint')[0]?.startTime || 0,
            firstContentfulPaint: performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0
        };

        console.log('Performance Metrics:', metrics);
        
        // Could send to analytics service
        // this.sendToAnalytics(metrics);
    }

    // Optimize JavaScript execution
    optimizeJavaScript() {
        // Defer non-critical JavaScript
        document.querySelectorAll('script:not([async]):not([defer])').forEach(script => {
            if (!script.src.includes('maps.googleapis.com') && 
                !script.src.includes('critical')) {
                script.defer = true;
            }
        });
    }

    // Optimize CSS delivery
    optimizeCSS() {
        // Load non-critical CSS asynchronously
        const nonCriticalCSS = document.querySelectorAll('link[rel="stylesheet"][data-non-critical]');
        nonCriticalCSS.forEach(link => {
            link.media = 'print';
            link.onload = () => {
                link.media = 'all';
            };
        });
    }

    // Minimize main thread blocking
    minimizeMainThreadBlocking() {
        // Use requestIdleCallback for non-critical tasks
        const scheduleWork = (callback) => {
            if ('requestIdleCallback' in window) {
                requestIdleCallback(callback);
            } else {
                setTimeout(callback, 1);
            }
        };

        // Schedule non-critical initialization
        scheduleWork(() => {
            this.optimizeFontLoading();
            this.optimizeJavaScript();
            this.optimizeCSS();
        });
    }

    // Preload next page resources
    preloadNextPage() {
        // This could preload resources for likely next pages
        // For a single-page app, preload data or components
        scheduleWork(() => {
            // Preload earthquake data
            if (window.fastLoader) {
                window.fastLoader.preloadData();
            }
        });
    }

    // Optimize for mobile performance
    optimizeForMobile() {
        if (window.innerWidth < 768) {
            // Reduce image quality on mobile
            document.querySelectorAll('img').forEach(img => {
                if (img.src && !img.dataset.optimized) {
                    // Could implement image optimization
                    img.dataset.optimized = 'true';
                }
            });

            // Reduce animation complexity on mobile
            document.documentElement.style.setProperty('--animation-duration', '0.2s');
        }
    }

    // Cache management
    setupCaching() {
        // Use localStorage for data caching
        const cacheData = (key, data, ttl = 300000) => { // 5 minutes default
            const item = {
                data: data,
                timestamp: Date.now(),
                ttl: ttl
            };
            try {
                localStorage.setItem(`cache_${key}`, JSON.stringify(item));
            } catch (e) {
                console.log('Cache storage failed:', e);
            }
        };

        const getCachedData = (key) => {
            try {
                const item = JSON.parse(localStorage.getItem(`cache_${key}`));
                if (item && (Date.now() - item.timestamp) < item.ttl) {
                    return item.data;
                }
            } catch (e) {
                console.log('Cache retrieval failed:', e);
            }
            return null;
        };

        // Make caching functions globally available
        window.cacheData = cacheData;
        window.getCachedData = getCachedData;
    }
}

// Initialize with requestIdleCallback to not block header
if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
        window.performanceOptimizer = new PerformanceOptimizer();
    }, { timeout: 100 });
} else {
    setTimeout(() => {
        window.performanceOptimizer = new PerformanceOptimizer();
    }, 100);
}

// Make it globally available
window.performanceOptimizer = performanceOptimizer;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PerformanceOptimizer;
}
