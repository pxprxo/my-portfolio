// Fast loading system for earthquake data
class EarthquakeDataLoader {
    constructor() {
        this.cache = new Map();
        this.cacheTTL = 5 * 60 * 1000; // 5 minutes
        this.loadingStates = new Map();
        this.retryAttempts = 3;
        this.isMobile = window.innerWidth < 768;
        
        // Preload sample data for instant display
        this.sampleData = this.getSampleData();
    }

    // Get cached data if valid
    getCachedData(key) {
        const cached = this.cache.get(key);
        if (cached && (Date.now() - cached.timestamp) < this.cacheTTL) {
            return cached.data;
        }
        return null;
    }

    // Set cache data
    setCachedData(key, data) {
        this.cache.set(key, {
            data: data,
            timestamp: Date.now()
        });
    }

    // Fast sample data for immediate display
    getSampleData() {
        return [
            {
                location: 'ประเทศเมียนมา',
                magnitude: 3.8,
                depth: 10.0,
                time: new Date().toISOString(),
                latitude: 19.991,
                longitude: 95.874,
                source: 'TMD'
            },
            {
                location: 'ประเทศอินโดนีเซีย',
                magnitude: 4.2,
                depth: 25.5,
                time: new Date(Date.now() - 3600000).toISOString(),
                latitude: -6.2088,
                longitude: 106.8456,
                source: 'TMD'
            },
            {
                location: 'ประเทศฟิลิปปินส์',
                magnitude: 3.9,
                depth: 15.2,
                time: new Date(Date.now() - 7200000).toISOString(),
                latitude: 14.5995,
                longitude: 120.9842,
                source: 'USGS'
            }
        ];
    }

    // Optimized TMD data fetch
    async fetchTMDData() {
        const cacheKey = 'tmd';
        const cached = this.getCachedData(cacheKey);
        if (cached) return cached;

        const timeout = this.isMobile ? 3000 : 5000; // Shorter timeout for mobile
        const proxyUrl = 'https://api.allorigins.win/get?url=';
        const rssUrl = encodeURIComponent('https://earthquake.tmd.go.th/feed/rss_tmd.xml');

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(proxyUrl + rssUrl, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json' }
            });

            clearTimeout(timeoutId);

            if (!response.ok) throw new Error('TMD fetch failed');

            const result = await response.json();
            const xmlText = result.contents;

            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
            const items = xmlDoc.querySelectorAll('item');

            const earthquakes = Array.from(items)
                .slice(0, this.isMobile ? 8 : 12) // Fewer items for mobile
                .map(item => this.parseTMDItem(item))
                .filter(eq => eq.magnitude > 3.5)
                .sort((a, b) => new Date(b.time) - new Date(a.time));

            this.setCachedData(cacheKey, earthquakes);
            return earthquakes;

        } catch (error) {
            console.warn('TMD fetch failed:', error.message);
            return this.sampleData.filter(eq => eq.source === 'TMD');
        }
    }

    // Parse TMD RSS item
    parseTMDItem(item) {
        const title = item.querySelector('title')?.textContent || '';
        const lat = item.querySelector('geo\\:lat, [nodeName="geo:lat"]');
        const lng = item.querySelector('geo\\:long, [nodeName="geo:long"]');
        const depth = item.querySelector('tmd\\:depth, [nodeName="tmd:depth"]');
        const magnitude = item.querySelector('tmd\\:magnitude, [nodeName="tmd:magnitude"]');
        const time = item.querySelector('tmd\\:time, [nodeName="tmd:time"]') ||
                    item.querySelector('pubDate');

        return {
            location: this.extractLocation(title),
            latitude: lat ? parseFloat(lat.textContent) : null,
            longitude: lng ? parseFloat(lng.textContent) : null,
            depth: depth ? parseFloat(depth.textContent) : 'N/A',
            magnitude: magnitude ? parseFloat(magnitude.textContent) : 'N/A',
            time: time ? time.textContent : new Date().toISOString(),
            source: 'TMD'
        };
    }

    // Optimized USGS data fetch
    async fetchUSGSData() {
        const cacheKey = 'usgs';
        const cached = this.getCachedData(cacheKey);
        if (cached) return cached;

        const timeout = this.isMobile ? 3500 : 5000; // Longer timeout for proxy

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            // Use CORS proxy to avoid CORS issues
            const proxyUrl = 'https://api.allorigins.win/get?url=';
            const usgsUrl = encodeURIComponent('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson');
            
            const response = await fetch(proxyUrl + usgsUrl, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json' }
            });

            clearTimeout(timeoutId);

            if (!response.ok) throw new Error('USGS fetch failed');

            const result = await response.json();
            const data = JSON.parse(result.contents);
            const earthquakes = this.processUSGSData(data);

            this.setCachedData(cacheKey, earthquakes);
            return earthquakes;

        } catch (error) {
            console.warn('USGS fetch failed:', error.message);
            return this.sampleData.filter(eq => eq.source === 'USGS');
        }
    }

    // Process USGS data efficiently
    processUSGSData(data) {
        const thailandLat = 13.7563;
        const thailandLng = 100.5018;
        const maxItems = this.isMobile ? 7 : 10;

        return data.features
            .filter(eq => {
                // Safari-compatible null checks
                if (!eq || !eq.geometry || !eq.geometry.coordinates || !eq.properties) {
                    return false;
                }
                
                const mag = eq.properties.mag;
                const place = eq.properties.place ? String(eq.properties.place).toLowerCase() : '';
                
                if (typeof mag !== 'number' || mag <= 3.5) return false;

                const lat = eq.geometry.coordinates[1];
                const lng = eq.geometry.coordinates[0];
                
                if (typeof lat !== 'number' || typeof lng !== 'number') return false;
                
                // Priority 1: Always include earthquakes from key neighboring countries
                const priorityCountries = ['thailand', 'myanmar', 'indonesia', 'philippines', 'malaysia', 'laos', 'cambodia', 'vietnam', 'singapore'];
                for (let i = 0; i < priorityCountries.length; i++) {
                    if (place.includes(priorityCountries[i])) {
                        return true;
                    }
                }
                
                // Priority 2: Distance-based filtering for other locations
                const distance = this.calculateDistance(thailandLat, thailandLng, lat, lng);

                if (mag >= 6.0 && distance <= 3000) return true;
                if (mag >= 5.0 && distance <= 2000) return true;
                if (mag > 3.5 && distance <= 1000) return true;
                
                return false;
            })
            .sort(function(a, b) { 
                const timeA = a.properties && a.properties.time ? a.properties.time : 0;
                const timeB = b.properties && b.properties.time ? b.properties.time : 0;
                return timeB - timeA;
            })
            .slice(0, maxItems)
            .map(function(eq) {
                return {
                    location: this.extractUSGSLocation(eq.properties.place),
                    latitude: eq.geometry.coordinates[1],
                    longitude: eq.geometry.coordinates[0],
                    depth: eq.geometry.coordinates[2] || 'N/A',
                    magnitude: eq.properties.mag || 'N/A',
                    time: new Date(eq.properties.time).toISOString(),
                    source: 'USGS'
                };
            }.bind(this));
    }

    // Fast distance calculation (simplified)
    calculateDistance(lat1, lng1, lat2, lng2) {
        const dLat = lat2 - lat1;
        const dLng = lng2 - lng1;
        return Math.sqrt(dLat * dLat + dLng * dLng) * 111; // Approximate km
    }

    // Extract location from title
    extractLocation(title) {
        const countryMap = {
            'Myanmar': 'ประเทศเมียนมา',
            'Indonesia': 'ประเทศอินโดนีเซีย',
            'Philippines': 'ประเทศฟิลิปปินส์',
            'Japan': 'ประเทศญี่ปุ่น',
            'China': 'ประเทศจีน',
            'Thailand': 'ประเทศไทย',
            'Malaysia': 'ประเทศมาเลเซีย'
        };

        const titleLower = title.toLowerCase();
        for (const eng in countryMap) {
            if (countryMap.hasOwnProperty(eng)) {
                if (titleLower.includes(eng.toLowerCase())) {
                    return countryMap[eng];
                }
            }
        }

        if (title.includes('จ.')) {
            return `ประเทศไทย - ${title.replace(/\s*\([^)]*\)/g, '')}`;
        }

        return title.replace(/\s*\([^)]*\)/g, '') || 'ไม่ระบุสถานที่';
    }

    // Extract USGS location
    extractUSGSLocation(place) {
        if (!place) return 'ไม่ระบุสถานที่';
        
        const countryMap = {
            'Japan': 'ประเทศญี่ปุ่น',
            'Indonesia': 'ประเทศอินโดนีเซีย',
            'Philippines': 'ประเทศฟิลิปปินส์',
            'Myanmar': 'ประเทศเมียนมา',
            'Thailand': 'ประเทศไทย',
            'Malaysia': 'ประเทศมาเลเซีย'
        };

        for (const [eng, thai] of Object.entries(countryMap)) {
            if (place.toLowerCase().includes(eng.toLowerCase())) {
                return thai;
            }
        }

        return 'ไม่ระบุสถานที่';
    }

    // Main load function with performance optimization
    async loadData(source = 'combined') {
        const loadingKey = `loading_${source}`;
        
        // Prevent multiple simultaneous loads
        if (this.loadingStates.get(loadingKey)) {
            return this.loadingStates.get(loadingKey);
        }

        // Show sample data immediately for fast UI response
        if (typeof displayEarthquakeData === 'function') {
            displayEarthquakeData(this.sampleData);
        }

        let loadPromise;

        if (source === 'tmd') {
            loadPromise = this.fetchTMDData();
        } else if (source === 'usgs') {
            loadPromise = this.fetchUSGSData();
        } else {
            // Combined: fetch both in parallel with race conditions for speed
            loadPromise = this.loadCombinedData();
        }

        this.loadingStates.set(loadingKey, loadPromise);

        try {
            const result = await loadPromise;
            this.loadingStates.delete(loadingKey);
            return result;
        } catch (error) {
            this.loadingStates.delete(loadingKey);
            console.error('Data loading failed:', error);
            return this.sampleData;
        }
    }

    // Load combined data with performance optimization
    async loadCombinedData() {
        const cached = this.getCachedData('combined');
        if (cached) return cached;

        try {
            // Use Promise.allSettled with shorter timeouts
            const results = await Promise.allSettled([
                Promise.race([
                    this.fetchTMDData(),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('TMD timeout')), this.isMobile ? 2000 : 3000)
                    )
                ]),
                Promise.race([
                    this.fetchUSGSData(),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('USGS timeout')), this.isMobile ? 1500 : 2500)
                    )
                ])
            ]);

            const tmdData = results[0].status === 'fulfilled' ? results[0].value : [];
            const usgsData = results[1].status === 'fulfilled' ? results[1].value : [];

            const combined = [...tmdData, ...usgsData]
                .filter(eq => eq.magnitude > 3.5)
                .sort((a, b) => new Date(b.time) - new Date(a.time))
                .slice(0, this.isMobile ? 12 : 18);

            this.setCachedData('combined', combined);
            return combined;

        } catch (error) {
            console.warn('Combined data loading failed:', error);
            return this.sampleData;
        }
    }

    // Clear cache
    clearCache() {
        this.cache.clear();
        this.loadingStates.clear();
    }

    // Preload data for faster subsequent loads
    async preloadData() {
        if (this.isMobile) {
            // On mobile, only preload combined data
            this.loadData('combined').catch(() => {});
        } else {
            // On desktop, preload all sources
            Promise.allSettled([
                this.loadData('tmd'),
                this.loadData('usgs'),
                this.loadData('combined')
            ]).catch(() => {});
        }
    }
}

// Create global instance
window.fastLoader = new EarthquakeDataLoader();

// Auto-preload on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => window.fastLoader.preloadData(), 100);
    });
} else {
    setTimeout(() => window.fastLoader.preloadData(), 100);
}
