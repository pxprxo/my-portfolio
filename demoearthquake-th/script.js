function updateDateTime() {
    const now = new Date();
    
    // Thailand timezone (UTC+7)
    const thailandTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Bangkok"}));
    
    // Thai months array
    const thaiMonths = [
        'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
        'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];
    
    // Get date components
    const day = thailandTime.getDate();
    const month = thaiMonths[thailandTime.getMonth()];
    const year = thailandTime.getFullYear() + 543; // Convert to Buddhist Era
    
    // Time 24-hour format
    const hours = thailandTime.getHours().toString().padStart(2, '0');
    const minutes = thailandTime.getMinutes().toString().padStart(2, '0');
    
    document.getElementById('date').textContent = `${day} ${month} ${year}`;
    document.getElementById('time').innerHTML = `เวลา ${hours}:${minutes} น. <span style="font-size: 12px;">(ประเทศไทย)</span>`;
}

// Global cache for earthquake data (prevents re-fetching on dropdown change)
let cachedEarthquakeData = {
    tmd: null,
    usgs: null,
    combined: null,
    lastFetch: 0
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Fetch earthquake data from TMD RSS feed only
async function fetchTMDEarthquakeData() {
    try {
        // Check cache first
        const cacheAge = Date.now() - cachedEarthquakeData.lastFetch;
        if (cacheAge < CACHE_DURATION && cachedEarthquakeData.tmd) {
            console.log('✅ Using cached TMD data');
            displayEarthquakeData(cachedEarthquakeData.tmd);
            addEarthquakeMarkersToMap(cachedEarthquakeData.tmd);
            return;
        }
        
        const tmdData = await getTMDEarthquakeData();
        cachedEarthquakeData.tmd = tmdData;
        cachedEarthquakeData.lastFetch = Date.now();
        
        displayEarthquakeData(tmdData);
        addEarthquakeMarkersToMap(tmdData);
    } catch (error) {
        console.error('Error fetching TMD earthquake data:', error);
        // Fallback to sample data if API fails
        displaySampleData();
    }
}

// Fetch from USGS and filter for Thailand impact
async function fetchUSGSEarthquakeData() {
    console.log('🔍 Starting USGS data fetch...');
    
    try {
        // Safari-specific detection and handling
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        console.log('Browser is Safari:', isSafari);
        
        // Use CORS proxy to avoid CORS issues
        const proxyUrl = 'https://api.allorigins.win/get?url=';
        const usgsUrl = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';
        const fullUrl = proxyUrl + encodeURIComponent(usgsUrl);
        
        console.log('📡 Fetching from:', fullUrl);
        
        // Check cache first
        const cacheKey = 'usgs_earthquake_data';
        const cacheExpiry = 5 * 60 * 1000; // 5 minutes
        const cached = localStorage.getItem(cacheKey);
        const cacheTime = localStorage.getItem(cacheKey + '_time');
        
        if (cached && cacheTime && (Date.now() - parseInt(cacheTime) < cacheExpiry)) {
            console.log('✅ Using cached USGS data');
            try {
                const cachedData = JSON.parse(cached);
                if (cachedData && cachedData.length > 0) {
                    return cachedData;
                }
            } catch (e) {
                console.warn('Cache parse error:', e);
            }
        }
        
        // Optimized fetch options with reasonable timeout
        const fetchOptions = {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            },
            cache: 'default', // Use browser cache
            credentials: 'omit'
        };
        
        const response = await Promise.race([
            fetch(fullUrl, fetchOptions),
            new Promise(function(_, reject) {
                setTimeout(function() {
                    reject(new Error('Fetch timeout after 10 seconds'));
                }, 10000); // Reduced from 15 to 10 seconds
            })
        ]);
        
        console.log('📥 Response received:', response.status, response.statusText);
        
        if (!response.ok) {
            throw new Error('HTTP error! status: ' + response.status + ' ' + response.statusText);
        }
        
        const result = await response.json();
        console.log('✅ JSON parsed, checking contents...');
        console.log('Result type:', typeof result);
        console.log('Has contents:', result && result.contents ? 'YES' : 'NO');
        
        if (!result || !result.contents) {
            console.error('❌ No contents in result:', result);
            throw new Error('No contents in proxy response');
        }
        
        let data;
        try {
            data = JSON.parse(result.contents);
        } catch (parseError) {
            console.error('❌ Failed to parse contents:', parseError);
            throw new Error('Failed to parse earthquake data: ' + parseError.message);
        }
        
        console.log('✅ Data parsed successfully');
        console.log('Data type:', typeof data);
        console.log('Has features:', data && data.features ? 'YES' : 'NO');
        console.log('Features count:', data && data.features ? data.features.length : 0);
        
        // Validate data structure
        if (!data || !data.features || !Array.isArray(data.features)) {
            console.error('❌ Invalid data structure:', data);
            throw new Error('Invalid earthquake data structure');
        }
        
        if (data.features.length === 0) {
            console.warn('⚠️ No earthquake features found in USGS data');
            return getSampleUSGSData();
        }
        
        // Thailand coordinates for distance calculation
        const thailandLat = 13.7563;
        const thailandLng = 100.5018;
        
        // Filter earthquakes that might affect Thailand
        console.log('🔍 Starting to filter', data.features.length, 'earthquakes...');
        
        const significantEarthquakes = data.features
            .filter(function(eq) {
                // Safari-compatible null checks
                if (!eq || !eq.geometry || !eq.geometry.coordinates || !eq.properties) {
                    console.log('⚠️ Skipping invalid earthquake structure');
                    return false;
                }
                
                const lat = eq.geometry.coordinates[1];
                const lng = eq.geometry.coordinates[0];
                const magnitude = eq.properties.mag;
                const place = eq.properties.place ? String(eq.properties.place).toLowerCase() : '';
                
                // Safari-compatible null/undefined checks
                if (typeof lat !== 'number' || typeof lng !== 'number' || typeof magnitude !== 'number') {
                    return false;
                }
                
                // Lower threshold to 3.0 to catch more earthquakes
                if (magnitude <= 3.0) {
                    return false;
                }
                
                // Priority 1: Include earthquakes in key neighboring countries (regardless of distance)
                const priorityCountries = [
                    'thailand', 'myanmar', 'laos', 'cambodia', 'vietnam', 
                    'malaysia', 'indonesia', 'philippines', 'singapore'
                ];
                
                for (let i = 0; i < priorityCountries.length; i++) {
                    if (place.includes(priorityCountries[i])) {
                        return true;
                    }
                }
                
                // Priority 2: Calculate distance from Thailand for other earthquakes
                const thailandLat = 13.7563;
                const thailandLng = 100.5018;
                const distance = calculateDistance(thailandLat, thailandLng, lat, lng);
                
                // Filter criteria for other earthquakes:
                if (magnitude >= 6.0 && distance <= 3000) return true;
                if (magnitude >= 5.0 && distance <= 2000) return true;
                if (magnitude >= 4.0 && distance <= 1500) return true;
                if (magnitude > 3.0 && distance <= 1000) return true;
                
                return false;
            })
            .sort(function(a, b) {
                // Sort by most recent first (date/time descending) - Safari-compatible
                const dateA = a.properties && a.properties.time ? new Date(a.properties.time).getTime() : 0;
                const dateB = b.properties && b.properties.time ? new Date(b.properties.time).getTime() : 0;
                return dateB - dateA;
            })
            .slice(0, 15) // Limit to 15 most recent earthquakes
            .map(function(eq) {
                const mapped = {
                    title: eq.properties.place || 'Unknown location',
                    latitude: eq.geometry.coordinates[1],
                    longitude: eq.geometry.coordinates[0],
                    depth: eq.geometry.coordinates[2] || 'N/A',
                    magnitude: eq.properties.mag || 'N/A',
                    time: new Date(eq.properties.time).toISOString(),
                    location: extractLocationFromUSGS(eq.properties.place),
                    source: 'USGS'
                };
                return mapped;
            });
        
        console.log('✅ USGS data processed:', significantEarthquakes.length, 'earthquakes');
        if (significantEarthquakes.length > 0) {
            console.log('📋 Sample earthquakes:');
            for (let i = 0; i < Math.min(3, significantEarthquakes.length); i++) {
                const eq = significantEarthquakes[i];
                console.log('   ' + (i + 1) + '. ' + eq.location + ' M' + eq.magnitude + ' at ' + eq.time);
            }
            
            // Cache the processed data
            try {
                localStorage.setItem(cacheKey, JSON.stringify(significantEarthquakes));
                localStorage.setItem(cacheKey + '_time', Date.now().toString());
                console.log('💾 Cached USGS data');
            } catch (e) {
                console.warn('Cache storage error:', e);
            }
        } else {
            console.warn('⚠️ No earthquakes found after filtering!');
        }
        return significantEarthquakes;
        
    } catch (error) {
        console.error('❌ Error fetching USGS earthquake data:', error);
        console.error('Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });
        
        // Safari: Show user-friendly error message
        const earthquakeList = document.querySelector('.earthquake-list');
        if (earthquakeList) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            errorDiv.style.cssText = 'padding: 15px; margin: 10px; background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 5px; color: #856404;';
            errorDiv.innerHTML = '<strong>⚠️ Cannot connect to USGS:</strong> ' + error.message + '<br><small>Showing sample data instead</small>';
            earthquakeList.prepend(errorDiv);
        }
        
        // Return sample data as fallback
        console.log('⚠️ Returning sample USGS data as fallback');
        return getSampleUSGSData();
    }
}

// Get sample USGS data as fallback
function getSampleUSGSData() {
    return [
        {
            title: 'Philippines',
            latitude: 14.5995,
            longitude: 120.9842,
            depth: 15.2,
            magnitude: 4.1,
            time: new Date(Date.now() - 3600000).toISOString(),
            location: 'ประเทศฟิลิปปินส์',
            source: 'USGS'
        },
        {
            title: 'Indonesia',
            latitude: -6.2088,
            longitude: 106.8456,
            depth: 25.5,
            magnitude: 4.5,
            time: new Date(Date.now() - 7200000).toISOString(),
            location: 'ประเทศอินโดนีเซีย',
            source: 'USGS'
        },
        {
            title: 'Myanmar',
            latitude: 19.991,
            longitude: 95.874,
            depth: 10.0,
            magnitude: 3.9,
            time: new Date(Date.now() - 10800000).toISOString(),
            location: 'ประเทศเมียนมา',
            source: 'USGS'
        }
    ];
}

// Fetch combined data from both TMD and USGS sources
async function fetchCombinedEarthquakeData() {
    try {
        console.log('Fetching combined earthquake data from TMD and USGS...');
        
        // Show loading state immediately
        const earthquakeList = document.querySelector('.earthquake-list');
        earthquakeList.innerHTML = '<div class="loading" style="display: flex; flex-direction: column; align-items: center; padding: 40px 20px;"><div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #CB140F; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 15px;"></div><p style="color: #666; font-size: 14px; margin: 0;">กำลังโหลดข้อมูล...</p></div>';
        
        // Fetch both sources in parallel with race condition for faster display
        console.log('⚡ Fetching TMD and USGS data in parallel...');
        const startTime = Date.now();
        
        // Use Promise.allSettled to handle failures gracefully and continue with available data
        const results = await Promise.allSettled([
            getTMDEarthquakeData().catch(function(error) {
                console.log('TMD data fetch failed, using sample data:', error);
                return getSampleTMDData();
            }),
            fetchUSGSEarthquakeData().catch(function(error) {
                console.log('USGS data fetch failed, continuing with TMD only:', error);
                return [];
            })
        ]);
        
        const tmdEarthquakes = results[0].status === 'fulfilled' ? results[0].value : [];
        const usgsEarthquakes = results[1].status === 'fulfilled' ? results[1].value : [];
        
        const loadTime = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log('✅ Data received in ' + loadTime + 's: TMD=' + (tmdEarthquakes ? tmdEarthquakes.length : 0) + ', USGS=' + (usgsEarthquakes ? usgsEarthquakes.length : 0));
        
        // Combine and sort by date/time (most recent first)
        const validTmd = Array.isArray(tmdEarthquakes) ? tmdEarthquakes : [];
        const validUsgs = Array.isArray(usgsEarthquakes) ? usgsEarthquakes : [];
        console.log('🔄 Combining', validTmd.length, 'TMD +', validUsgs.length, 'USGS earthquakes...');
        const combinedEarthquakes = validTmd.concat(validUsgs)
            .filter(function(earthquake) {
                // Show earthquakes with magnitude > 3.0
                const magnitude = earthquake.magnitude !== 'N/A' ? parseFloat(earthquake.magnitude) : 0;
                return magnitude > 3.0;
            })
            .sort(function(a, b) {
                // Parse dates for comparison - Safari-compatible
                const dateA = a.time ? new Date(a.time).getTime() : 0;
                const dateB = b.time ? new Date(b.time).getTime() : 0;
                
                // Sort by most recent first (descending order)
                return dateB - dateA;
            })
            .slice(0, 20); // Show top 20 most recent earthquakes with magnitude > 3.5
        
        console.log('✅ Combined data: ' + validTmd.length + ' TMD + ' + validUsgs.length + ' USGS = ' + combinedEarthquakes.length + ' total');
        console.log('Sample combined earthquake:', combinedEarthquakes[0]);
        
        // Cache the data for fast filtering (in-memory)
        cachedEarthquakeData.tmd = validTmd;
        cachedEarthquakeData.usgs = validUsgs;
        cachedEarthquakeData.combined = combinedEarthquakes;
        cachedEarthquakeData.lastFetch = Date.now();
        
        // Also cache to localStorage for persistence across page loads
        try {
            localStorage.setItem('combined_earthquake_cache', JSON.stringify(combinedEarthquakes));
            localStorage.setItem('combined_earthquake_cache_time', Date.now().toString());
            console.log('💾 Cached earthquake data to memory and localStorage');
        } catch (e) {
            console.warn('Failed to cache to localStorage:', e);
            console.log('💾 Cached earthquake data to memory only');
        }
        
        displayEarthquakeData(combinedEarthquakes);
        
    } catch (error) {
        console.error('Error fetching combined earthquake data:', error);
        displayErrorMessage('ไม่สามารถโหลดข้อมูลแผ่นดินไหวได้');
    }
}

// Get TMD earthquake data (extracted from fetchTMDEarthquakeData)
async function getTMDEarthquakeData() {
    console.log('Starting TMD data fetch...');
    
    // Try multiple CORS proxy options
    const proxyOptions = [
        'https://api.allorigins.win/raw?url=',
        'https://cors-anywhere.herokuapp.com/',
        'https://api.codetabs.com/v1/proxy?quest='
    ];
    
    const rssUrl = 'https://earthquake.tmd.go.th/feed/rss_tmd.xml';
    let response = null;
    let xmlText = null;
    
    // Try each proxy until one works
    for (let i = 0; i < proxyOptions.length; i++) {
        try {
            console.log(`Trying proxy ${i + 1}: ${proxyOptions[i]}`);
            const proxyUrl = proxyOptions[i];
            const fullUrl = proxyUrl + encodeURIComponent(rssUrl);
            
            response = await fetch(fullUrl);
            
            if (response.ok) {
                xmlText = await response.text();
                console.log('Successfully fetched TMD data with proxy', i + 1);
                break;
            }
        } catch (proxyError) {
            console.log(`Proxy ${i + 1} failed:`, proxyError);
            continue;
        }
    }
    
    if (!xmlText) {
        throw new Error('All CORS proxies failed');
    }
    
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    
    // Check for parsing errors
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
        throw new Error('XML parsing error: ' + parserError.textContent);
    }
    
    const items = xmlDoc.querySelectorAll('item');
    console.log('Found', items.length, 'TMD earthquake items');
    
    if (items.length === 0) {
        throw new Error('No earthquake items found in TMD RSS feed');
    }
    
    const earthquakes = Array.from(items).slice(0, 10).map((item, index) => {
        // Extract data from RSS item
        const title = item.querySelector('title')?.textContent || 'ไม่ระบุ';
        
        // Try different selectors for geo data
        const lat = item.querySelector('geo\\:lat') || 
                  item.querySelector('lat') || 
                  item.querySelector('[nodeName="geo:lat"]');
        const long = item.querySelector('geo\\:long') || 
                    item.querySelector('long') || 
                    item.querySelector('[nodeName="geo:long"]');
        const depth = item.querySelector('tmd\\:depth') || 
                     item.querySelector('depth') || 
                     item.querySelector('[nodeName="tmd:depth"]');
        const magnitude = item.querySelector('tmd\\:magnitude') || 
                         item.querySelector('magnitude') || 
                         item.querySelector('[nodeName="tmd:magnitude"]');
        const time = item.querySelector('tmd\\:time') || 
                    item.querySelector('time') || 
                    item.querySelector('[nodeName="tmd:time"]');
        const pubDate = item.querySelector('pubDate')?.textContent;
        
        // Better date extraction
        let dateString = null;
        if (time && time.textContent) {
            dateString = time.textContent;
        } else if (pubDate) {
            dateString = pubDate;
        }
        
        return {
            title: title,
            latitude: lat ? parseFloat(lat.textContent) : null,
            longitude: long ? parseFloat(long.textContent) : null,
            depth: depth ? parseFloat(depth.textContent) : 'N/A',
            magnitude: magnitude ? parseFloat(magnitude.textContent) : 'N/A',
            time: dateString,
            location: extractLocation(title),
            source: 'TMD'
        };
    }).filter(earthquake => {
        // Only show earthquakes with magnitude > 3.5
        const magnitude = earthquake.magnitude !== 'N/A' ? parseFloat(earthquake.magnitude) : 0;
        return magnitude > 3.5;
    }).sort((a, b) => {
        // Sort TMD data by most recent first
        const dateA = a.time ? new Date(a.time).getTime() : 0;
        const dateB = b.time ? new Date(b.time).getTime() : 0;
        return dateB - dateA;
    });
    
    return earthquakes;
}

// Get sample TMD data as fallback
function getSampleTMDData() {
    return [
        {
            title: 'ประเทศเมียนมา (Myanmar)',
            latitude: 19.991,
            longitude: 95.874,
            depth: 10,
            magnitude: 3.8,
            time: new Date().toISOString(), // Most recent
            location: 'ประเทศเมียนมา',
            source: 'TMD'
        },
        {
            title: 'ต.กื้ดช้าง อ.แม่แตง จ.เชียงใหม่',
            latitude: 19.232,
            longitude: 98.822,
            depth: 3,
            magnitude: 3.6,
            time: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
            location: 'ประเทศไทย - ต.กื้ดช้าง อ.แม่แตง จ.เชียงใหม่',
            source: 'TMD'
        },
        {
            title: 'ประเทศอินโดนีเซีย (Indonesia)',
            latitude: -6.2088,
            longitude: 106.8456,
            depth: 25,
            magnitude: 4.5,
            time: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
            location: 'ประเทศอินโดนีเซีย',
            source: 'TMD'
        }
    ];
}

// Calculate distance between two points (Haversine formula)
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    return distance;
}

// Extract location from title
function extractLocation(title) {
    if (title.includes('ประเทศ')) {
        // Remove English names in parentheses
        let cleanTitle = title.replace(/\s*\([^)]*\)/g, '');
        return cleanTitle;
    } else if (title.includes('จ.')) {
        // Remove English names in parentheses for Thai locations
        let cleanTitle = title.replace(/\s*\([^)]*\)/g, '');
        return `ประเทศไทย - ${cleanTitle}`;
    } else {
        // For other locations, try to convert to Thai
        return convertToThaiLocation(title);
    }
}

// Convert English location names to Thai
function convertToThaiLocation(title) {
    // Common location mappings
    const locationMap = {
        'Myanmar': 'ประเทศเมียนมา',
        'Indonesia': 'ประเทศอินโดนีเซีย',
        'Philippines': 'ประเทศฟิลิปปินส์',
        'Japan': 'ประเทศญี่ปุ่น',
        'China': 'ประเทศจีน',
        'India': 'ประเทศอินเดีย',
        'Thailand': 'ประเทศไทย',
        'Malaysia': 'ประเทศมาเลเซีย',
        'Singapore': 'ประเทศสิงคโปร์',
        'Vietnam': 'ประเทศเวียดนาม',
        'Laos': 'ประเทศลาว',
        'Cambodia': 'ประเทศกัมพูชา'
    };
    
    // Remove English names in parentheses first
    let cleanTitle = title.replace(/\s*\([^)]*\)/g, '');
    
    // Try to find and replace English country names - Safari-compatible
    const cleanLower = cleanTitle.toLowerCase();
    for (const english in locationMap) {
        if (locationMap.hasOwnProperty(english)) {
            if (cleanLower.includes(english.toLowerCase())) {
                return locationMap[english];
            }
        }
    }
    
    return cleanTitle;
}

// Extract location from USGS place string
function extractLocationFromUSGS(place) {
    if (!place) return 'ไม่ระบุสถานที่';
    
    // Common country mappings
    const countryMap = {
        'Japan': 'ประเทศญี่ปุ่น',
        'Indonesia': 'ประเทศอินโดนีเซีย',
        'Philippines': 'ประเทศฟิลิปปินส์',
        'Myanmar': 'ประเทศเมียนมา',
        'China': 'ประเทศจีน',
        'India': 'ประเทศอินเดีย',
        'Thailand': 'ประเทศไทย',
        'Malaysia': 'ประเทศมาเลเซีย',
        'Singapore': 'ประเทศสิงคโปร์',
        'Vietnam': 'ประเทศเวียดนาม',
        'Laos': 'ประเทศลาว',
        'Cambodia': 'ประเทศกัมพูชา',
        'Taiwan': 'ประเทศไต้หวัน',
        'South Korea': 'ประเทศเกาหลีใต้',
        'North Korea': 'ประเทศเกาหลีเหนือ',
        'Nepal': 'ประเทศเนปาล',
        'Bangladesh': 'ประเทศบังกลาเทศ',
        'Sri Lanka': 'ประเทศศรีลังกา'
    };
    
    // Try to identify country and return only Thai name - Safari-compatible
    const placeLower = place.toLowerCase();
    for (const english in countryMap) {
        if (countryMap.hasOwnProperty(english)) {
            if (placeLower.includes(english.toLowerCase())) {
                return countryMap[english];
            }
        }
    }
    
    // If no match found, try to extract region and convert
    const cleanPlace = place.replace(/\d+km.*?of\s*/i, '').trim();
    return convertToThaiLocation(cleanPlace) || 'ไม่ระบุสถานที่';
}

// Display sample data as fallback
function displaySampleData() {
    console.log('Displaying sample earthquake data as fallback');
    
    const sampleEarthquakes = [
        {
            title: 'ประเทศเมียนมา (Myanmar)',
            latitude: 19.991,
            longitude: 95.874,
            depth: 10,
            magnitude: 3.8,
            time: new Date().toISOString(), // Most recent
            location: 'ประเทศเมียนมา',
            source: 'TMD'
        },
        {
            title: 'ต.กื้ดช้าง อ.แม่แตง จ.เชียงใหม่',
            latitude: 19.232,
            longitude: 98.822,
            depth: 3,
            magnitude: 3.6,
            time: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
            location: 'ประเทศไทย - ต.กื้ดช้าง อ.แม่แตง จ.เชียงใหม่',
            source: 'TMD'
        },
        {
            title: 'ประเทศอินโดนีเซีย (Indonesia)',
            latitude: -6.2088,
            longitude: 106.8456,
            depth: 25,
            magnitude: 4.5,
            time: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
            location: 'ประเทศอินโดนีเซีย',
            source: 'TMD'
        }
    ];
    
    displayEarthquakeData(sampleEarthquakes);
}

// Display earthquake data in the list
function displayEarthquakeData(earthquakes) {
    const earthquakeList = document.querySelector('.earthquake-list');
    
    if (!earthquakes || earthquakes.length === 0) {
        earthquakeList.innerHTML = '<div class="no-data">ไม่มีข้อมูลแผ่นดินไหวมากกว่าขนาด 3.5 ในขณะนี้</div>';
        // Clear map markers when no data
        if (typeof clearMapMarkers === 'function') {
            clearMapMarkers();
        }
        // Clear mobile map markers
        clearMobileMapMarkers();
        return;
    }
    
    // Store current earthquakes for mobile map
    currentEarthquakes = earthquakes;
    
    // Clear existing content
    earthquakeList.innerHTML = '';
    
    // Create earthquake items
    earthquakes.forEach((earthquake, index) => {
        const earthquakeItem = createEarthquakeItem(earthquake, index);
        earthquakeList.appendChild(earthquakeItem);
    });
    
    // Add markers to desktop map
    if (typeof addEarthquakeMarkersToMap === 'function') {
        addEarthquakeMarkersToMap(earthquakes);
    }
    
    // Add markers to mobile map if it exists and is currently visible
    if (mobileMap && document.querySelector('.content').classList.contains('mobile-view-map')) {
        addEarthquakeMarkersToMobileMap(earthquakes);
    }
}

// Create earthquake item HTML element
function createEarthquakeItem(earthquake, index) {
    const item = document.createElement('div');
    item.className = 'earthquake-item';
    
    // Add click handler for map navigation on desktop and detail view on mobile
    item.style.cursor = 'pointer';
    item.addEventListener('click', () => {
        if (window.innerWidth < 768) {
            // Mobile: show detail view
            showEarthquakeDetail(earthquake, index);
        } else {
            // Desktop: focus on earthquake marker on map
            if (map && earthquakeMarkers[index]) {
                map.setCenter(earthquakeMarkers[index].getPosition());
                map.setZoom(8);
                // Open info window for the selected earthquake
                if (earthquakeMarkers[index].infoWindow) {
                    earthquakeMarkers[index].infoWindow.open(map, earthquakeMarkers[index]);
                }
            }
        }
    });
    
    // Add hover effect
    item.addEventListener('mouseenter', () => {
        item.style.backgroundColor = '#e8e9ea';
    });
    
    item.addEventListener('mouseleave', () => {
        const magnitudeValue = earthquake.magnitude !== 'N/A' ? parseFloat(earthquake.magnitude) : 0;
        if (magnitudeValue >= 5.0) {
            item.style.backgroundColor = '#FFBAB8';
        } else {
            item.style.backgroundColor = '#F4F5F3';
        }
    });
    
    // Check if magnitude is >= 5.0 to apply special background
    const magnitudeValue = earthquake.magnitude !== 'N/A' ? parseFloat(earthquake.magnitude) : 0;
    if (magnitudeValue >= 5.0) {
        item.style.backgroundColor = '#FFBAB8';
    }
    
    // Format date to Thai format with fallback
    let thaiDate = formatThaiDate(earthquake.time);
    if (thaiDate === 'ไม่ระบุ' || thaiDate.includes('NaN')) {
        // Use current date and time as fallback
        const now = new Date();
        const thailandTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Bangkok"}));
        const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
                           'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
        const day = thailandTime.getDate();
        const month = thaiMonths[thailandTime.getMonth()];
        const year = thailandTime.getFullYear() + 543;
        const hours = thailandTime.getHours().toString().padStart(2, '0');
        const minutes = thailandTime.getMinutes().toString().padStart(2, '0');
        thaiDate = `${day} ${month} ${year} เวลา ${hours}:${minutes} น.`;
    }
    
    // Format depth with 1 decimal place
    const depth = earthquake.depth !== 'N/A' ? `${parseFloat(earthquake.depth).toFixed(1)} กม.` : 'ไม่ระบุ';
    
    // Format magnitude
    const magnitude = earthquake.magnitude !== 'N/A' ? earthquake.magnitude : 'ไม่ระบุ';
    
    // Get data source with proper Thai translation
    const dataSource = earthquake.source === 'TMD' ? 'กองเฝ้าระวังแผ่นดินไหว' :
                      earthquake.source === 'USGS' ? 'USGS' : 
                      getCurrentDataSource();
    
    item.innerHTML = `
        <div class="earthquake-header">
            <h3 class="country">${earthquake.location}</h3>
        </div>
        <div class="earthquake-details">
            <div class="detail-column">
                <p class="magnitude">ขนาด: ${magnitude}</p>
                <p class="depth">ความลึก: ${depth}</p>
            </div>
            <div class="detail-column">
                <p class="date">วันที่: ${thaiDate}</p>
                <p class="source">แหล่งที่มา: ${dataSource}</p>
            </div>
        </div>
    `;
    
    return item;
}

// Format date to Thai format
function formatThaiDate(dateString) {
    if (!dateString) return 'ไม่ระบุ';
    
    const thaiMonths = [
        'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
        'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
    ];
    
    try {
        let date;
        
        // Handle different date formats
        if (dateString.includes('UTC')) {
            // Format: "2025-08-20 07:43:46 UTC"
            date = new Date(dateString);
        } else if (dateString.includes('+')) {
            // Format: "Wed, 20 Aug 2025 14:43:46 +0700"
            date = new Date(dateString);
        } else {
            // Try parsing as is
            date = new Date(dateString);
        }
        
        // Check if date is valid
        if (isNaN(date.getTime())) {
            return 'ไม่ระบุ';
        }
        
        // Convert to Thailand timezone
        const thailandTime = new Date(date.toLocaleString("en-US", {timeZone: "Asia/Bangkok"}));
        
        const day = thailandTime.getDate();
        const month = thaiMonths[thailandTime.getMonth()];
        const year = thailandTime.getFullYear() + 543;
        
        // Format time in 24-hour format
        const hours = thailandTime.getHours().toString().padStart(2, '0');
        const minutes = thailandTime.getMinutes().toString().padStart(2, '0');
        
        return `${day} ${month} ${year} เวลา ${hours}:${minutes} น.`;
    } catch (error) {
        console.error('Date parsing error:', error, 'for date:', dateString);
        return 'ไม่ระบุ';
    }
}

// Get current data source
function getCurrentDataSource() {
    const dropdown = document.getElementById('data-source');
    return dropdown?.value === 'usgs' ? 'USGS' : 'กองเฝ้าระวังแผ่นดินไหว';
}

// Display error message
function displayErrorMessage(message = 'ไม่สามารถโหลดข้อมูลแผ่นดินไหวได้') {
    const earthquakeList = document.querySelector('.earthquake-list');
    earthquakeList.innerHTML = `
        <div class="error-message" style="text-align: center; padding: 20px; color: #666;">
            <p style="margin-bottom: 10px; font-size: 16px;">${message}</p>
            <p style="margin-bottom: 15px; font-size: 14px;">กรุณาลองใหม่อีกครั้ง หรือเปลี่ยนแหล่งข้อมูล</p>
            <button onclick="location.reload()" style="margin-top: 10px; padding: 10px 20px; background-color: #F54848; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; transition: background-color 0.3s;" onmouseover="this.style.backgroundColor='#d63838'" onmouseout="this.style.backgroundColor='#F54848'">โหลดข้อมูลใหม่</button>
        </div>
    `;
}

// Handle dropdown change
function handleDataSourceChange() {
    const dataSource = document.getElementById('data-source').value;
    console.log('Data source changed to:', dataSource);
    
    // Check if we have cached data
    const cacheAge = Date.now() - cachedEarthquakeData.lastFetch;
    const isCacheValid = cacheAge < CACHE_DURATION;
    
    if (isCacheValid && cachedEarthquakeData.combined) {
        console.log('✅ Using cached data (age: ' + Math.round(cacheAge / 1000) + 's)');
        
        // Filter cached data instantly - no loading needed!
        let dataToDisplay;
        if (dataSource === 'tmd') {
            dataToDisplay = cachedEarthquakeData.combined.filter(eq => eq.source === 'TMD');
            console.log('Filtering TMD data:', dataToDisplay.length, 'earthquakes');
        } else if (dataSource === 'usgs') {
            dataToDisplay = cachedEarthquakeData.combined.filter(eq => eq.source === 'USGS');
            console.log('Filtering USGS data:', dataToDisplay.length, 'earthquakes');
        } else {
            // combined - show all data
            dataToDisplay = cachedEarthquakeData.combined;
            console.log('Showing combined data:', dataToDisplay.length, 'earthquakes');
        }
        
        // Display immediately without loading state
        displayEarthquakeData(dataToDisplay);
        addEarthquakeMarkersToMap(dataToDisplay);
        
        // Update mobile map if it exists and is visible
        if (mobileMap && window.innerWidth < 768) {
            const displayOption = document.getElementById('display-option').value;
            if (displayOption === 'map') {
                console.log('Updating mobile map with filtered data');
                addEarthquakeMarkersToMobileMap(dataToDisplay);
            }
        }
        
        return;
    }
    
    // Cache miss or expired - show loading and fetch
    const earthquakeList = document.querySelector('.earthquake-list');
    earthquakeList.innerHTML = '<div class="loading">กำลังโหลดข้อมูล...</div>';
    
    console.log('⚠️ Cache miss or expired, fetching fresh data...');
    
    if (dataSource === 'tmd') {
        fetchTMDEarthquakeData();
    } else if (dataSource === 'usgs') {
        fetchUSGSEarthquakeData().then(data => {
            displayEarthquakeData(data);
            addEarthquakeMarkersToMap(data);
            
            // Update mobile map if visible
            if (mobileMap && window.innerWidth < 768) {
                const displayOption = document.getElementById('display-option').value;
                if (displayOption === 'map') {
                    addEarthquakeMarkersToMobileMap(data);
                }
            }
        }).catch(error => {
            console.error('Error loading USGS data:', error);
            displayErrorMessage('ไม่สามารถโหลดข้อมูลจาก USGS ได้');
        });
    } else if (dataSource === 'combined') {
        fetchCombinedEarthquakeData();
    }
}

// Mobile map variables
let mobileMap;
let mobileEarthquakeMarkers = [];

// Mobile detail map variables
let detailMap;
let detailMarker;

// Handle display option change (mobile only)
function handleDisplayOptionChange() {
    console.log('Display option changed, screen width:', window.innerWidth);
    
    // Only apply on mobile devices (screen width < 768px)
    if (window.innerWidth >= 768) {
        console.log('Skipping - desktop/tablet view');
        return; // Exit early on desktop/tablet
    }
    
    const displayOption = document.getElementById('display-option').value;
    const content = document.querySelector('.content');
    const earthquakeListContainer = document.querySelector('.earthquake-list-container');
    const mobileMapContainer = document.querySelector('.mobile-map-container');
    const mobileDetailContainer = document.querySelector('.mobile-detail-container');
    
    console.log('Selected option:', displayOption);
    
    // Remove existing mobile view classes
    content.classList.remove('mobile-view-list', 'mobile-view-map', 'mobile-view-detail');
    
    if (displayOption === 'list') {
        // Show list view on mobile
        content.classList.add('mobile-view-list');
        
        // Show list container, hide others
        if (earthquakeListContainer) earthquakeListContainer.style.display = 'block';
        if (mobileMapContainer) mobileMapContainer.style.display = 'none';
        if (mobileDetailContainer) mobileDetailContainer.style.display = 'none';
        
        console.log('Showing list view');
        
    } else if (displayOption === 'map') {
        // Show map view on mobile
        content.classList.add('mobile-view-map');
        
        // Show map container, hide others
        if (earthquakeListContainer) earthquakeListContainer.style.display = 'none';
        if (mobileMapContainer) mobileMapContainer.style.display = 'block';
        if (mobileDetailContainer) mobileDetailContainer.style.display = 'none';
        
        console.log('Showing map view');
        
        // Get filtered data based on current data source selection
        const dataSource = document.getElementById('data-source').value;
        let earthquakesToShow = currentEarthquakes;
        
        // Apply data source filter if cached data is available
        if (cachedEarthquakeData.combined) {
            if (dataSource === 'tmd') {
                earthquakesToShow = cachedEarthquakeData.combined.filter(eq => eq.source === 'TMD');
                console.log('Mobile map: Filtering for TMD data -', earthquakesToShow.length, 'earthquakes');
            } else if (dataSource === 'usgs') {
                earthquakesToShow = cachedEarthquakeData.combined.filter(eq => eq.source === 'USGS');
                console.log('Mobile map: Filtering for USGS data -', earthquakesToShow.length, 'earthquakes');
            } else {
                earthquakesToShow = cachedEarthquakeData.combined;
                console.log('Mobile map: Showing combined data -', earthquakesToShow.length, 'earthquakes');
            }
        }
        
        // Initialize mobile map if not already created
        if (!mobileMap) {
            console.log('Initializing mobile map...');
            setTimeout(() => {
                initMobileMap();
                
                // Add filtered earthquake markers to mobile map after initialization
                if (earthquakesToShow && earthquakesToShow.length > 0) {
                    console.log('Adding filtered markers to mobile map:', earthquakesToShow.length);
                    addEarthquakeMarkersToMobileMap(earthquakesToShow);
                }
            }, 100);
        } else {
            // Map already exists, just trigger resize and update markers
            setTimeout(() => {
                console.log('Triggering map resize and updating markers...');
                google.maps.event.trigger(mobileMap, 'resize');
                
                // Add filtered earthquake markers to mobile map
                if (earthquakesToShow && earthquakesToShow.length > 0) {
                    console.log('Adding filtered markers to mobile map:', earthquakesToShow.length);
                    addEarthquakeMarkersToMobileMap(earthquakesToShow);
                }
                
                // Re-center and fit bounds if there are markers
                if (mobileEarthquakeMarkers.length > 0) {
                    const bounds = new google.maps.LatLngBounds();
                    mobileEarthquakeMarkers.forEach(marker => {
                        bounds.extend(marker.getPosition());
                    });
                    bounds.extend({ lat: 13.7563, lng: 100.5018 }); // Include Thailand center
                    mobileMap.fitBounds(bounds);
                } else {
                    // If no markers, center on Thailand
                    mobileMap.setCenter({ lat: 13.7563, lng: 100.5018 });
                    mobileMap.setZoom(5);
                }
            }, 300);
        }
    }
}

// Initialize mobile map
function initMobileMap() {
    const mobileMapElement = document.getElementById("mobile-earthquake-map");
    if (!mobileMapElement) {
        console.error('Mobile map element not found');
        return;
    }
    
    const thailandCenter = { lat: 13.7563, lng: 100.5018 };
    
    try {
        mobileMap = new google.maps.Map(mobileMapElement, {
            zoom: 5,
            center: thailandCenter,
            mapTypeId: 'terrain',
            styles: [
                {
                    featureType: 'poi',
                    elementType: 'labels',
                    stylers: [{ visibility: 'off' }]
                }
            ]
        });
        
        console.log('Mobile Google Map initialized successfully');
        
        // Trigger resize multiple times to ensure proper display
        setTimeout(() => {
            google.maps.event.trigger(mobileMap, 'resize');
        }, 100);
        
        setTimeout(() => {
            google.maps.event.trigger(mobileMap, 'resize');
            mobileMap.setCenter(thailandCenter);
        }, 300);
        
        setTimeout(() => {
            google.maps.event.trigger(mobileMap, 'resize');
        }, 500);
        
    } catch (error) {
        console.error('Error initializing mobile map:', error);
    }
}

// Add earthquake markers to mobile map
function addEarthquakeMarkersToMobileMap(earthquakes) {
    if (!mobileMap) {
        console.error('Mobile map not initialized');
        return;
    }
    
    // Clear existing mobile markers
    mobileEarthquakeMarkers.forEach(marker => marker.setMap(null));
    mobileEarthquakeMarkers = [];
    
    earthquakes.forEach((earthquake, index) => {
        if (earthquake.latitude && earthquake.longitude) {
            // Create custom SVG marker
            const magnitude = earthquake.magnitude !== 'N/A' ? parseFloat(earthquake.magnitude) : 0;
            const markerColor = magnitude >= 5.0 ? '#ff0000' : '#ff6600';
            
            const marker = new google.maps.Marker({
                position: { lat: earthquake.latitude, lng: earthquake.longitude },
                map: mobileMap,
                title: `${earthquake.location} - ขนาด ${magnitude}`,
                icon: {
                    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                        <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
                            <circle cx="15" cy="15" r="13" fill="${markerColor}" stroke="#FFFFFF" stroke-width="2"/>
                            <text x="15" y="19" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="10" font-weight="bold">${magnitude.toFixed(1)}</text>
                        </svg>
                    `),
                    scaledSize: new google.maps.Size(30, 30),
                    anchor: new google.maps.Point(15, 15)
                }
            });

            // Format the data for mobile info window
            const formattedMagnitude = earthquake.magnitude !== 'N/A' ? earthquake.magnitude : 'ไม่ระบุ';
            const formattedDepth = earthquake.depth !== 'N/A' ? `${earthquake.depth} กม.` : 'ไม่ระบุ';
            const formattedSource = earthquake.source === 'TMD' ? 'กองเฝ้าระวังแผ่นดินไหว' : earthquake.source;
            
            // Format date with error handling for mobile popup
            let formattedDate = 'ไม่ระบุ';
            try {
                if (earthquake.time) {
                    formattedDate = formatThaiDate(earthquake.time);
                    
                    // If date formatting failed, create a fallback date
                    if (formattedDate === 'ไม่ระบุ' || formattedDate.includes('NaN') || formattedDate.includes('Invalid')) {
                        console.log('Mobile popup date formatting failed for:', earthquake.time, 'creating fallback');
                        const now = new Date();
                        const thailandTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Bangkok"}));
                        const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
                                           'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
                        const day = thailandTime.getDate();
                        const month = thaiMonths[thailandTime.getMonth()];
                        const year = thailandTime.getFullYear() + 543;
                        const hours = thailandTime.getHours().toString().padStart(2, '0');
                        const minutes = thailandTime.getMinutes().toString().padStart(2, '0');
                        formattedDate = `${day} ${month} ${year} เวลา ${hours}:${minutes} น.`;
                    }
                } else {
                    console.log('No time data available for earthquake in mobile popup:', earthquake);
                }
            } catch (error) {
                console.error('Error formatting date for mobile popup:', error, 'earthquake time:', earthquake.time);
                formattedDate = 'ไม่ระบุ';
            }

            // Facebook SVG icon
            const facebookIcon = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#1877f2">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
            `)}`;

            // Twitter/X SVG icon
            const twitterIcon = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#000000">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
            `)}`;

            // Line icon
            const lineIcon = `/my-portfolio/demoearthquake-th/picture/line.png`;
            const lineFallbackIcon = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#00c300"><path d="M12 0C5.373 0 0 4.977 0 11.111c0 3.497 1.745 6.616 4.472 8.652L4.014 24l4.7-2.82C9.456 21.384 10.71 21.556 12 21.556c6.627 0 12-4.977 12-11.111S18.627 0 12 0z"/></svg>`)}`;

            // Create mobile-optimized info window
            const mobileInfoWindow = new google.maps.InfoWindow({
                content: `
                    <div style="font-family: Arial, sans-serif; max-width: 280px; font-size: 14px;">
                        <h4 style="margin: 0 0 8px 0; color: #333; font-size: 16px; line-height: 1.3;">${earthquake.location}</h4>
                        <div style="margin-bottom: 12px;">
                            <p style="margin: 3px 0; font-size: 13px;"><strong>ขนาด:</strong> ${formattedMagnitude}</p>
                            <p style="margin: 3px 0; font-size: 13px;"><strong>ความลึก:</strong> ${formattedDepth}</p>
                            <p style="margin: 3px 0; font-size: 13px;"><strong>วันที่:</strong> ${formattedDate}</p>
                            <p style="margin: 3px 0; font-size: 13px;"><strong>แหล่งที่มา:</strong> ${formattedSource}</p>
                        </div>
                        
                        <div style="border-top: 1px solid #eee; padding-top: 10px;">
                            <p style="margin: 0 0 8px 0; font-weight: bold; font-size: 13px; text-align: center;">แชร์ข้อมูลแผ่นดินไหว</p>
                            <div style="display: flex; gap: 6px; justify-content: center;">
                                <button onclick="shareEarthquakeToFacebook(${index})" 
                                        style="padding: 6px; border: 1px solid #1877f2; background: white; border-radius: 4px; cursor: pointer; transition: all 0.3s; display: flex; align-items: center; justify-content: center; min-width: 36px; height: 36px;"
                                        onmouseover="this.style.backgroundColor='#60a3f9';"
                                        onmouseout="this.style.backgroundColor='white';"
                                        title="แชร์ไปยัง Facebook">
                                    <img src="${facebookIcon}" alt="Facebook" style="width: 18px; height: 18px;">
                                </button>
                                <button onclick="shareEarthquakeToTwitter(${index})" 
                                        style="padding: 6px; border: 1px solid #000000; background: white; border-radius: 4px; cursor: pointer; transition: all 0.3s; display: flex; align-items: center; justify-content: center; min-width: 36px; height: 36px;"
                                        onmouseover="this.style.backgroundColor='#8f8d8d';"
                                        onmouseout="this.style.backgroundColor='white';"
                                        title="แชร์ไปยัง Twitter/X">
                                    <img src="${twitterIcon}" alt="Twitter" style="width: 18px; height: 18px;">
                                </button>
                                <button onclick="shareEarthquakeToLine(${index})" 
                                        style="padding: 6px; border: 1px solid #00c300; background: white; border-radius: 4px; cursor: pointer; transition: all 0.3s; display: flex; align-items: center; justify-content: center; min-width: 36px; height: 36px;"
                                        onmouseover="this.style.backgroundColor='#63dd63';"
                                        onmouseout="this.style.backgroundColor='white';"
                                        title="แชร์ไปยัง Line">
                                    <img src="${lineIcon}" alt="Line" style="width: 18px; height: 18px;" onerror="this.src='${lineFallbackIcon}'; this.onerror=null;">
                                </button>
                            </div>
                        </div>
                    </div>
                `
            });

            // Add click listener for mobile markers - show popup instead of detail page
            marker.addListener('click', () => {
                // Close any open mobile info windows
                mobileEarthquakeMarkers.forEach(m => {
                    if (m.mobileInfoWindow) {
                        m.mobileInfoWindow.close();
                    }
                });
                
                mobileInfoWindow.open(mobileMap, marker);
            });

            // Store reference to mobile info window
            marker.mobileInfoWindow = mobileInfoWindow;
            mobileEarthquakeMarkers.push(marker);
        }
    });
    
    console.log(`Added ${mobileEarthquakeMarkers.length} earthquake markers to mobile map with popups`);
}

// Main map variables
let map;
let earthquakeMarkers = [];
let currentEarthquakes = [];

// Initialize main earthquake map
function initMap() {
    const mapElement = document.getElementById("earthquake-map");
    if (!mapElement) {
        console.error('Main map element not found');
        return;
    }

    try {
        // Thailand center coordinates
        const thailandCenter = { lat: 13.7563, lng: 100.5018 };
        
        map = new google.maps.Map(mapElement, {
            zoom: 5,
            center: thailandCenter,
            mapTypeId: 'terrain',
            styles: [
                {
                    featureType: 'poi',
                    elementType: 'labels',
                    stylers: [{ visibility: 'off' }]
                }
            ]
        });
        
        console.log('Main map initialized successfully');
        
        // Trigger resize after initialization
        setTimeout(() => {
            google.maps.event.trigger(map, 'resize');
            map.setCenter(thailandCenter);
        }, 300);
        
    } catch (error) {
        console.error('Error initializing main map:', error);
    }
}

// Add earthquake markers to main map
function addEarthquakeMarkersToMap(earthquakes) {
    if (!map) {
        console.error('Main map not initialized');
        return;
    }
    
    // Clear existing markers
    earthquakeMarkers.forEach(marker => marker.setMap(null));
    earthquakeMarkers = [];
    
    earthquakes.forEach((earthquake, index) => {
        if (earthquake.latitude && earthquake.longitude) {
            // Create custom SVG marker based on magnitude
            const magnitude = earthquake.magnitude !== 'N/A' ? parseFloat(earthquake.magnitude) : 0;
            let markerColor = '#ff6600'; // Default orange
            
            if (magnitude >= 6.0) {
                markerColor = '#ff0000'; // Red for high magnitude
            } else if (magnitude >= 5.0) {
                markerColor = '#ff3300'; // Dark orange for medium-high
            } else if (magnitude >= 4.0) {
                markerColor = '#ff6600'; // Orange for medium
            } else {
                markerColor = '#ffaa00'; // Yellow-orange for low
            }
            
            const marker = new google.maps.Marker({
                position: { lat: earthquake.latitude, lng: earthquake.longitude },
                map: map,
                title: `${earthquake.location} - ขนาด ${magnitude}`,
                icon: {
                    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
                            <circle cx="16" cy="16" r="14" fill="${markerColor}" stroke="#FFFFFF" stroke-width="2"/>
                            <text x="16" y="20" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="10" 
                            font-weight="bold">${magnitude.toFixed(1)}</text>
                        </svg>
                    `),
                    scaledSize: new google.maps.Size(32, 32),
                    anchor: new google.maps.Point(16, 16)
                }
            });

            // Format the data for info window with better date handling
            const formattedMagnitude = earthquake.magnitude !== 'N/A' ? earthquake.magnitude : 'ไม่ระบุ';
            const formattedDepth = earthquake.depth !== 'N/A' ? `${earthquake.depth} กม.` : 'ไม่ระบุ';
            const formattedSource = earthquake.source === 'TMD' ? 'กองเฝ้าระวังแผ่นดินไหว' : earthquake.source;
            
            // Format date with better error handling for map popup
            let formattedDate = 'ไม่ระบุ';
            try {
                if (earthquake.time) {
                    formattedDate = formatThaiDate(earthquake.time);
                    
                    // If date formatting failed, create a fallback date
                    if (formattedDate === 'ไม่ระบุ' || formattedDate.includes('NaN') || formattedDate.includes('Invalid')) {
                        console.log('Map popup date formatting failed for:', earthquake.time, 'creating fallback');
                        const now = new Date();
                        const thailandTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Bangkok"}));
                        const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
                                           'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
                        const day = thailandTime.getDate();
                        const month = thaiMonths[thailandTime.getMonth()];
                        const year = thailandTime.getFullYear() + 543;
                        const hours = thailandTime.getHours().toString().padStart(2, '0');
                        const minutes = thailandTime.getMinutes().toString().padStart(2, '0');
                        formattedDate = `${day} ${month} ${year} เวลา ${hours}:${minutes} น.`;
                    }
                } else {
                    console.log('No time data available for earthquake in map popup:', earthquake);
                }
            } catch (error) {
                console.error('Error formatting date for map popup:', error, 'earthquake time:', earthquake.time);
                formattedDate = 'ไม่ระบุ';
            }
            
            console.log('Map popup formatted date:', formattedDate, 'for earthquake:', earthquake.location);

            // Facebook SVG icon
            const facebookIcon = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#1877f2">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
            `)}`;

            // Twitter/X SVG icon
            const twitterIcon = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#000000">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
            `)}`;

            // Line icon (keep existing one if it works, or create SVG fallback)
            const lineIcon = `/my-portfolio/demoearthquake-th/picture/line.png`;
            const lineFallbackIcon = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#00c300"><path d="M12 0C5.373 0 0 4.977 0 11.111c0 3.497 1.745 6.616 4.472 8.652L4.014 24l4.7-2.82C9.456 21.384 10.71 21.556 12 21.556c6.627 0 12-4.977 12-11.111S18.627 0 12 0z"/></svg>`)}`;

            // Add info window with sharing buttons using SVG icons
            const infoWindow = new google.maps.InfoWindow({
                content: `
                    <div style="font-family: Arial, sans-serif; max-width: 300px;">
                        <h4 style="margin: 0 0 8px 0; color: #333;">${earthquake.location}</h4>
                        <p style="margin: 4px 0;"><strong>ขนาด:</strong> ${formattedMagnitude}</p>
                        <p style="margin: 4px 0;"><strong>ความลึก:</strong> ${formattedDepth}</p>
                        <p style="margin: 4px 0;"><strong>วันที่:</strong> ${formattedDate}</p>
                        <p style="margin: 4px 0;"><strong>แหล่งที่มา:</strong> ${formattedSource}</p>
                        
                        <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid #eee;">
                            <p style="margin: 0 0 8px 0; font-weight: bold; font-size: 14px;">แชร์ข้อมูลแผ่นดินไหว:</p>
                            <div style="display: flex; gap: 8px; justify-content: flex-start;">
                                <button onclick="shareEarthquakeToFacebook(${index})" 
                                        style="padding: 8px; border: 1px solid #1877f2; background: white; border-radius: 4px; cursor: pointer; transition: all 0.3s; display: flex; align-items: center; justify-content: center;"
                                        onmouseover="this.style.backgroundColor='#60a3f9';"
                                        onmouseout="this.style.backgroundColor='white';"
                                        title="แชร์ไปยัง Facebook">
                                    <img src="${facebookIcon}" alt="Facebook" style="width: 20px; height: 20px;">
                                </button>
                                <button onclick="shareEarthquakeToTwitter(${index})" 
                                        style="padding: 8px; border: 1px solid #000000; background: white; border-radius: 4px; cursor: pointer; transition: all 0.3s; display: flex; align-items: center; justify-content: center;"
                                        onmouseover="this.style.backgroundColor='#8f8d8d';"
                                        onmouseout="this.style.backgroundColor='white';"
                                        title="แชร์ไปยัง Twitter/X">
                                    <img src="${twitterIcon}" alt="Twitter" style="width: 20px; height: 20px;">
                                </button>
                                <button onclick="shareEarthquakeToLine(${index})" 
                                        style="padding: 8px; border: 1px solid #00c300; background: white; border-radius: 4px; cursor: pointer; transition: all 0.3s; display: flex; align-items: center; justify-content: center;"
                                        onmouseover="this.style.backgroundColor='#63dd63';"
                                        onmouseout="this.style.backgroundColor='white';"
                                        title="แชร์ไปยัง Line">
                                    <img src="${lineIcon}" alt="Line" style="width: 20px; height: 20px;" onerror="this.src='${lineFallbackIcon}'; this.onerror=null;">
                                </button>
                            </div>
                        </div>
                    </div>
                `
            });

            // Add click listener
            marker.addListener('click', () => {
                // Close any open info windows
                earthquakeMarkers.forEach(m => {
                    if (m.infoWindow) {
                        m.infoWindow.close();
                    }
                });
                
                infoWindow.open(map, marker);
            });

            // Store reference to info window
            marker.infoWindow = infoWindow;
            earthquakeMarkers.push(marker);
        }
    });
    
    console.log(`Added ${earthquakeMarkers.length} earthquake markers to main map`);
}

// Social Media Sharing Functions for Map Markers
function shareEarthquakeToFacebook(index) {
    if (!currentEarthquakes || !currentEarthquakes[index]) {
        console.log('No earthquake data available for sharing');
        return;
    }
    
    const earthquake = currentEarthquakes[index];
    const magnitude = earthquake.magnitude !== 'N/A' ? earthquake.magnitude : 'ไม่ระบุ';
    const depth = earthquake.depth !== 'N/A' ? `${earthquake.depth} กม.` : 'ไม่ระบุ';
    const thaiDate = formatThaiDate(earthquake.time);
    const dataSource = earthquake.source === 'TMD' ? 'กองเฝ้าระวังแผ่นดินไหว' : earthquake.source;
    
    const shareText = `🚨 รายงานแผ่นดินไหว
ตำแหน่ง: ${earthquake.location}
ขนาด: ${magnitude}
ความลึก: ${depth}
วันที่: ${thaiDate}
แหล่งที่มา: ${dataSource}

รายละเอียดเพิ่มเติม: ${window.location.href}`;
    
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(shareText);
    
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`;
    
    try {
        window.open(facebookUrl, 'facebook-share', 'width=600,height=400,scrollbars=yes,resizable=yes');
    } catch (error) {
        console.error('Error sharing to Facebook:', error);
        copyToClipboard(shareText + '\n\n' + window.location.href);
        alert('ไม่สามารถเปิด Facebook ได้ ข้อมูลได้ถูกคัดลอกไปยังคลิปบอร์ดแล้ว');
    }
}

function shareEarthquakeToTwitter(index) {
    if (!currentEarthquakes || !currentEarthquakes[index]) {
        console.log('No earthquake data available for sharing');
        return;
    }
    
    const earthquake = currentEarthquakes[index];
    const magnitude = earthquake.magnitude !== 'N/A' ? earthquake.magnitude : 'ไม่ระบุ';
    const depth = earthquake.depth !== 'N/A' ? `${earthquake.depth} กม.` : 'ไม่ระบุ';
    const thaiDate = formatThaiDate(earthquake.time);
    const dataSource = earthquake.source === 'TMD' ? 'กองเฝ้าระวังแผ่นดินไหว' : earthquake.source;
    
    const shareText = `🚨 รายงานแผ่นดินไหว
${earthquake.location}
ขนาด ${magnitude}
วันที่ ${thaiDate}
แหล่งที่มา ${dataSource}
#แผ่นดินไหว #EarthquakeAlert #Thailand`;
    
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(shareText);
    
    const twitterUrl = `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
    
    try {
        window.open(twitterUrl, 'twitter-share', 'width=600,height=400,scrollbars=yes,resizable=yes');
    } catch (error) {
        console.error('Error sharing to Twitter:', error);
        copyToClipboard(shareText + '\n\n' + window.location.href);
        alert('ไม่สามารถเปิด Twitter ได้ ข้อมูลได้ถูกคัดลอกไปยังคลิปบอร์ดแล้ว');
    }
}

function shareEarthquakeToLine(index) {
    if (!currentEarthquakes || !currentEarthquakes[index]) {
        console.log('No earthquake data available for sharing');
        return;
    }
    
    const earthquake = currentEarthquakes[index];
    const magnitude = earthquake.magnitude !== 'N/A' ? earthquake.magnitude : 'ไม่ระบุ';
    const depth = earthquake.depth !== 'N/A' ? `${earthquake.depth} กม.` : 'ไม่ระบุ';
    const thaiDate = formatThaiDate(earthquake.time);
    const dataSource = earthquake.source === 'TMD' ? 'กองเฝ้าระวังแผ่นดินไหว' : earthquake.source;
    
    const shareText = `🚨 รายงานแผ่นดินไหว

📍 สถานที่: ${earthquake.location}
📊 ขนาด: ${magnitude}
📏 ความลึก: ${depth}
📅 วันที่: ${thaiDate}
📡 แหล่งที่มา: ${dataSource}

รายละเอียดเพิ่มเติม: ${window.location.href}`;
    
    const text = encodeURIComponent(shareText);
    const url = encodeURIComponent(window.location.href);
    
    const lineUrl = `https://social-plugins.line.me/lineit/share?url=${url}&text=${text}`;
    
    try {
        window.open(lineUrl, 'line-share', 'width=600,height=400,scrollbars=yes,resizable=yes');
    } catch (error) {
        console.error('Error sharing to Line:', error);
        copyToClipboard(shareText);
        alert('ไม่สามารถเปิด Line ได้ ข้อมูลได้ถูกคัดลอกไปยังคลิปบอร์ดแล้ว');
    }
}

// Make new sharing functions globally available
window.shareEarthquakeToFacebook = shareEarthquakeToFacebook;
window.shareEarthquakeToTwitter = shareEarthquakeToTwitter;
window.shareEarthquakeToLine = shareEarthquakeToLine;

// Remove the old mobile sharing functions and variables
// Keep only the utility functions for clipboard operations

// Utility function to copy text to clipboard
function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(() => {
            console.log('Text copied to clipboard');
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            fallbackCopyToClipboard(text);
        });
    } else {
        fallbackCopyToClipboard(text);
    }
}

// Fallback copy function for older browsers
function fallbackCopyToClipboard(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        document.execCommand('copy');
        console.log('Text copied to clipboard using fallback method');
    } catch (err) {
        console.error('Fallback copy failed: ', err);
    }
    
    document.body.removeChild(textArea);
}

// Enhanced format function for sharing (ensures consistent formatting)
function formatEarthquakeDataForSharing(earthquake) {
    const magnitude = earthquake.magnitude !== 'N/A' ? earthquake.magnitude : 'ไม่ระบุ';
    const depth = earthquake.depth !== 'N/A' ? `${earthquake.depth} กม.` : 'ไม่ระบุ';
    const thaiDate = formatThaiDate(earthquake.time);
    const dataSource = earthquake.source === 'TMD' ? 'กองเฝ้าระวังแผ่นดินไหว' : earthquake.source;
    
    return {
        magnitude,
        depth,
        thaiDate,
        dataSource,
        location: earthquake.location
    };
}

// Main initialization function called by Google Maps API
function initMapAndData() {
    console.log('Initializing maps and data...');
    
    // Initialize main map
    initMap();
    
    // Set up event listeners
    setupEventListeners();
    
    // Update date/time and set interval
    updateDateTime();
    setInterval(updateDateTime, 60000); // Update every minute
    
    // Check if we have cached data from previous session to display immediately
    const cacheKey = 'combined_earthquake_cache';
    const cacheTimeKey = 'combined_earthquake_cache_time';
    const cachedData = localStorage.getItem(cacheKey);
    const cacheTime = localStorage.getItem(cacheTimeKey);
    const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
    
    if (cachedData && cacheTime && (Date.now() - parseInt(cacheTime) < CACHE_DURATION_MS)) {
        try {
            const parsedCache = JSON.parse(cachedData);
            console.log('✅ Displaying cached earthquake data immediately');
            displayEarthquakeData(parsedCache);
            addEarthquakeMarkersToMap(parsedCache);
            
            // Store in memory cache too
            cachedEarthquakeData.combined = parsedCache;
            cachedEarthquakeData.lastFetch = parseInt(cacheTime);
        } catch (e) {
            console.warn('Failed to parse cached data:', e);
        }
    }
    
    // Load fresh earthquake data (combined sources by default)
    // This will update the display when new data arrives
    fetchCombinedEarthquakeData();
}

// Set up all event listeners
function setupEventListeners() {
    console.log('Setting up event listeners...');
    
    // Data source dropdown change
    const dataSourceDropdown = document.getElementById('data-source');
    if (dataSourceDropdown) {
        console.log('Data source dropdown found, adding event listener');
        dataSourceDropdown.addEventListener('change', handleDataSourceChange);
    } else {
        console.error('Data source dropdown not found!');
    }
    
    // Display option dropdown change (mobile)
    const displayOptionDropdown = document.getElementById('display-option');
    if (displayOptionDropdown) {
        console.log('Display option dropdown found, adding event listener');
        displayOptionDropdown.addEventListener('change', handleDisplayOptionChange);
    } else {
        console.warn('Display option dropdown not found (this is normal for desktop)');
    }
    
    // Window resize handler for responsive design
    window.addEventListener('resize', () => {
        if (map) {
            google.maps.event.trigger(map, 'resize');
        }
        if (mobileMap) {
            google.maps.event.trigger(mobileMap, 'resize');
        }
        if (detailMap) {
            google.maps.event.trigger(detailMap, 'resize');
        }
    });
    
    console.log('Event listeners setup completed');
}

// Handle display option change (mobile only)
function handleDisplayOptionChange() {
    console.log('Display option changed, screen width:', window.innerWidth);
    
    // Only apply on mobile devices (screen width < 768px)
    if (window.innerWidth >= 768) {
        console.log('Skipping - desktop/tablet view');
        return; // Exit early on desktop/tablet
    }
    
    const displayOption = document.getElementById('display-option').value;
    const content = document.querySelector('.content');
    const earthquakeListContainer = document.querySelector('.earthquake-list-container');
    const mobileMapContainer = document.querySelector('.mobile-map-container');
    const mobileDetailContainer = document.querySelector('.mobile-detail-container');
    
    console.log('Selected option:', displayOption);
    
    // Remove existing mobile view classes
    content.classList.remove('mobile-view-list', 'mobile-view-map', 'mobile-view-detail');
    
    if (displayOption === 'list') {
        // Show list view on mobile
        content.classList.add('mobile-view-list');
        
        // Show list container, hide others
        if (earthquakeListContainer) earthquakeListContainer.style.display = 'block';
        if (mobileMapContainer) mobileMapContainer.style.display = 'none';
        if (mobileDetailContainer) mobileDetailContainer.style.display = 'none';
        
        console.log('Showing list view');
        
    } else if (displayOption === 'map') {
        // Show map view on mobile
        content.classList.add('mobile-view-map');
        
        // Show map container, hide others
        if (earthquakeListContainer) earthquakeListContainer.style.display = 'none';
        if (mobileMapContainer) mobileMapContainer.style.display = 'block';
        if (mobileDetailContainer) mobileDetailContainer.style.display = 'none';
        
        console.log('Showing map view');
        
        // Initialize mobile map if not already created
        if (!mobileMap) {
            console.log('Initializing mobile map...');
            setTimeout(() => {
                initMobileMap();
                
                // Add current earthquake markers to mobile map after initialization
                if (currentEarthquakes && currentEarthquakes.length > 0) {
                    console.log('Adding markers to mobile map:', currentEarthquakes.length);
                    addEarthquakeMarkersToMobileMap(currentEarthquakes);
                }
            }, 100);
        } else {
            // Map already exists, just trigger resize and update markers
            setTimeout(() => {
                console.log('Triggering map resize and updating markers...');
                google.maps.event.trigger(mobileMap, 'resize');
                
                // Add current earthquake markers to mobile map
                if (currentEarthquakes && currentEarthquakes.length > 0) {
                    console.log('Adding markers to mobile map:', currentEarthquakes.length);
                    addEarthquakeMarkersToMobileMap(currentEarthquakes);
                }
                
                // Re-center and fit bounds if there are markers
                if (mobileEarthquakeMarkers.length > 0) {
                    const bounds = new google.maps.LatLngBounds();
                    mobileEarthquakeMarkers.forEach(marker => {
                        bounds.extend(marker.getPosition());
                    });
                    bounds.extend({ lat: 13.7563, lng: 100.5018 }); // Include Thailand center
                    mobileMap.fitBounds(bounds);
                } else {
                    // If no markers, center on Thailand
                    mobileMap.setCenter({ lat: 13.7563, lng: 100.5018 });
                    mobileMap.setZoom(5);
                }
            }, 300);
        }
    }
}

// Initialize detail map
function initDetailMap(earthquake) {
    const detailMapElement = document.getElementById("detail-earthquake-map");
    if (!detailMapElement) {
        console.error('Detail map element not found');
        return;
    }
    
    if (!earthquake.latitude || !earthquake.longitude) {
        detailMapElement.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #6c757d;">ไม่มีข้อมูลตำแหน่ง</div>';
        return;
    }
    
    const earthquakePosition = { lat: earthquake.latitude, lng: earthquake.longitude };
    
    try {
        // Clear existing marker
        if (detailMarker) {
            detailMarker.setMap(null);
            detailMarker = null;
        }
        
        // Clear existing map
        if (detailMap) {
            detailMap = null;
        }
        
        console.log('Initializing detail map for earthquake at:', earthquakePosition);
        
        detailMap = new google.maps.Map(detailMapElement, {
            zoom: 8,
            center: earthquakePosition,
            mapTypeId: 'terrain',
            styles: [
                {
                    featureType: 'poi',
                    elementType: 'labels',
                    stylers: [{ visibility: 'off' }]
                }
            ]
        });
        
        // Create marker for the earthquake
        const magnitude = earthquake.magnitude !== 'N/A' ? parseFloat(earthquake.magnitude) : 0;
        const markerColor = magnitude >= 5.0 ? '#ff0000' : '#F54848';
        
        detailMarker = new google.maps.Marker({
            position: earthquakePosition,
            map: detailMap,
            title: `${earthquake.location} - ขนาด ${magnitude}`,
            icon: {
                url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
                        <circle cx="20" cy="20" r="18" fill="${markerColor}" stroke="#FFFFFF" stroke-width="3"/>
                        <text x="20" y="26" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="12" font-weight="bold">${magnitude.toFixed(1)}</text>
                    </svg>
                `),
                scaledSize: new google.maps.Size(40, 40),
                anchor: new google.maps.Point(20, 20)
            }
        });
        
        // Trigger resize multiple times to ensure proper display
        setTimeout(() => {
            google.maps.event.trigger(detailMap, 'resize');
            detailMap.setCenter(earthquakePosition);
            console.log('Detail map resize triggered (100ms)');
        }, 100);
        
        setTimeout(() => {
            google.maps.event.trigger(detailMap, 'resize');
            detailMap.setCenter(earthquakePosition);
            detailMap.setZoom(8);
            console.log('Detail map resize triggered (300ms)');
        }, 300);
        
        setTimeout(() => {
            google.maps.event.trigger(detailMap, 'resize');
            detailMap.setCenter(earthquakePosition);
            console.log('Detail map resize triggered (500ms)');
        }, 500);
        
        console.log('Detail map initialized successfully');
        
    } catch (error) {
        console.error('Error initializing detail map:', error);
        detailMapElement.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #dc3545;">เกิดข้อผิดพลาดในการโหลดแผนที่</div>';
    }
}

// Show earthquake detail view (mobile only)
function showEarthquakeDetail(earthquake, index) {
    // Only show detail view on mobile
    if (window.innerWidth >= 768) {
        return;
    }
    
    console.log('Showing earthquake detail for:', earthquake.location);
    
    const content = document.querySelector('.content');
    content.classList.remove('mobile-view-list', 'mobile-view-map');
    content.classList.add('mobile-view-detail');
    
    // Hide all containers and show detail
    const earthquakeListContainer = document.querySelector('.earthquake-list-container');
    const mobileMapContainer = document.querySelector('.mobile-map-container');
    const mobileDetailContainer = document.querySelector('.mobile-detail-container');
    
    if (earthquakeListContainer) earthquakeListContainer.style.display = 'none';
    if (mobileMapContainer) mobileMapContainer.style.display = 'none';
    if (mobileDetailContainer) mobileDetailContainer.style.display = 'block';
    
    // Populate detail information with clickable back arrow before location text
    const detailCountryElement = document.getElementById('detail-country');
    if (detailCountryElement) {
        detailCountryElement.innerHTML = `<span onclick="showEarthquakeList()" style="cursor: pointer; margin-right: 4px; font-size: 18px; font-weight: bold; user-select: none;">&lt;</span>${earthquake.location}`;
    }
    
    // Create the new detail layout with sharing buttons inline with source
    const detailEarthquakeDetails = document.querySelector('.detail-earthquake-details');
    if (detailEarthquakeDetails) {
        // Format all values
        const magnitude = earthquake.magnitude !== 'N/A' ? earthquake.magnitude : 'ไม่ระบุ';
        const depth = earthquake.depth !== 'N/A' ? `${parseFloat(earthquake.depth).toFixed(1)} กม.` : 'ไม่ระบุ';
        
        let thaiDate = formatThaiDate(earthquake.time);
        if (thaiDate === 'ไม่ระบุ' || thaiDate.includes('NaN')) {
            const now = new Date();
            const thailandTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Bangkok"}));
            const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
                               'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
            const day = thailandTime.getDate();
            const month = thaiMonths[thailandTime.getMonth()];
            const year = thailandTime.getFullYear() + 543;
            const hours = thailandTime.getHours().toString().padStart(2, '0');
            const minutes = thailandTime.getMinutes().toString().padStart(2, '0');
            thaiDate = `${day} ${month} ${year} เวลา ${hours}:${minutes} น.`;
        }
        
        const dataSource = earthquake.source === 'TMD' ? 'กองเฝ้าระวังแผ่นดินไหว' : earthquake.source;
        
        // Create the new layout with sharing buttons inline with source
        detailEarthquakeDetails.innerHTML = `
            <div class="detail-info-vertical">
                <div class="detail-info-row">
                    <p class="magnitude">ขนาด: ${magnitude}</p>
                    <p class="date">วันที่: ${thaiDate}</p>
                </div>
                <p class="depth">ความลึก: ${depth}</p>
                <div class="source-share-row">
                    <p class="source">แหล่งที่มา: ${dataSource}</p>
                    <div class="mobile-detail-share-section">
                        <span class="mobile-detail-share-label">แชร์ข้อมูล:</span>
                        <div class="mobile-detail-share-buttons">
                            <button onclick="shareMobileDetailToFacebook()" 
                                    class="mobile-detail-share-button facebook-share"
                                    title="แชร์ไปยัง Facebook">
                                <img src="https://cdn-icons-png.flaticon.com/512/124/124010.png" alt="Facebook" class="mobile-detail-share-icon">
                            </button>
                            <button onclick="shareMobileDetailToTwitter()" 
                                    class="mobile-detail-share-button twitter-share"
                                    title="แชร์ไปยัง X (Twitter)">
                                <img src="https://cdn-icons-png.flaticon.com/512/5968/5968830.png" alt="X" class="mobile-detail-share-icon">
                            </button>
                            <button onclick="shareMobileDetailToLine()" 
                                    class="mobile-detail-share-button line-share"
                                    title="แชร์ไปยัง Line">
                                <img src="/my-portfolio/demoearthquake-th/picture/line.png" alt="Line" class="mobile-detail-share-icon" onerror="this.style.backgroundColor='#00c300'; this.alt='L';">
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Remove existing detail map container if it exists
    const existingMapContainer = document.querySelector('.detail-map-container');
    if (existingMapContainer) {
        existingMapContainer.remove();
    }
    
    // Remove existing back button container if it exists
    const existingBackButtonContainer = document.querySelector('.detail-back-button-container');
    if (existingBackButtonContainer) {
        existingBackButtonContainer.remove();
    }
    
    // Create new detail map container after the earthquake info
    const earthquakeInfo = document.querySelector('.detail-earthquake-info');
    if (earthquakeInfo && earthquakeInfo.parentNode) {
        const mapContainer = document.createElement('div');
        mapContainer.className = 'detail-map-container';
        mapContainer.innerHTML = `
            <div class="detail-map-header">
                <h3 class="map-title">ตำแหน่งแผ่นดินไหว</h3>
            </div>
            <div class="detail-map-content">
                <div id="detail-earthquake-map"></div>
            </div>
        `;
        
        // Insert after the earthquake info container
        earthquakeInfo.parentNode.insertBefore(mapContainer, earthquakeInfo.nextSibling);
        
        // Create back button container after the map container
        const backButtonContainer = document.createElement('div');
        backButtonContainer.className = 'detail-back-button-container';
        backButtonContainer.innerHTML = `
            <button class="detail-back-button" onclick="showEarthquakeList()" title="กลับไปยังรายการ">
                กลับ
            </button>
        `;
        
        // Insert after the map container
        earthquakeInfo.parentNode.insertBefore(backButtonContainer, mapContainer.nextSibling);
    }
    
    // Set earthquake data for sharing
    if (typeof setMobileDetailEarthquake === 'function') {
        setMobileDetailEarthquake(earthquake, index);
    }
    
    // Initialize detail map with longer delay to ensure container is fully visible
    setTimeout(() => {
        console.log('Initializing detail map with coordinates:', earthquake.latitude, earthquake.longitude);
        initDetailMap(earthquake);
    }, 200);
}

// Show earthquake list (back from detail view)
function showEarthquakeList() {
    const content = document.querySelector('.content');
    content.classList.remove('mobile-view-detail', 'mobile-view-map');
    content.classList.add('mobile-view-list');
    
    // Show list container, hide others
    const earthquakeListContainer = document.querySelector('.earthquake-list-container');
    const mobileMapContainer = document.querySelector('.mobile-map-container');
    const mobileDetailContainer = document.querySelector('.mobile-detail-container');
    
    if (earthquakeListContainer) earthquakeListContainer.style.display = 'block';
    if (mobileMapContainer) mobileMapContainer.style.display = 'none';
    if (mobileDetailContainer) mobileDetailContainer.style.display = 'none';
    
    // Reset dropdown to list view
    const displayOptionDropdown = document.getElementById('display-option');
    if (displayOptionDropdown) {
        displayOptionDropdown.value = 'list';
    }
    
    // The CSS will handle showing dropdowns when mobile-view-detail class is removed
    // No need for additional JavaScript showing
}

// Initialize detail map
function initDetailMap(earthquake) {
    const detailMapElement = document.getElementById("detail-earthquake-map");
    if (!detailMapElement) {
        console.error('Detail map element not found');
        return;
    }
    
    if (!earthquake.latitude || !earthquake.longitude) {
        detailMapElement.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #6c757d;">ไม่มีข้อมูลตำแหน่ง</div>';
        return;
    }
    
    const earthquakePosition = { lat: earthquake.latitude, lng: earthquake.longitude };
    
    try {
        // Clear existing marker
        if (detailMarker) {
            detailMarker.setMap(null);
            detailMarker = null;
        }
        
        // Clear existing map
        if (detailMap) {
            detailMap = null;
        }
        
        console.log('Initializing detail map for earthquake at:', earthquakePosition);
        
        detailMap = new google.maps.Map(detailMapElement, {
            zoom: 8,
            center: earthquakePosition,
            mapTypeId: 'terrain',
            styles: [
                {
                    featureType: 'poi',
                    elementType: 'labels',
                    stylers: [{ visibility: 'off' }]
                }
            ]
        });
        
        // Create marker for the earthquake
        const magnitude = earthquake.magnitude !== 'N/A' ? parseFloat(earthquake.magnitude) : 0;
        const markerColor = magnitude >= 5.0 ? '#ff0000' : '#F54848';
        
        detailMarker = new google.maps.Marker({
            position: earthquakePosition,
            map: detailMap,
            title: `${earthquake.location} - ขนาด ${magnitude}`,
            icon: {
                url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
                        <circle cx="20" cy="20" r="18" fill="${markerColor}" stroke="#FFFFFF" stroke-width="3"/>
                        <text x="20" y="26" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="12" font-weight="bold">${magnitude.toFixed(1)}</text>
                    </svg>
                `),
                scaledSize: new google.maps.Size(40, 40),
                anchor: new google.maps.Point(20, 20)
            }
        });
        
        // Trigger resize multiple times to ensure proper display
        setTimeout(() => {
            google.maps.event.trigger(detailMap, 'resize');
            detailMap.setCenter(earthquakePosition);
            console.log('Detail map resize triggered (100ms)');
        }, 100);
        
        setTimeout(() => {
            google.maps.event.trigger(detailMap, 'resize');
            detailMap.setCenter(earthquakePosition);
            detailMap.setZoom(8);
            console.log('Detail map resize triggered (300ms)');
        }, 300);
        
        setTimeout(() => {
            google.maps.event.trigger(detailMap, 'resize');
            detailMap.setCenter(earthquakePosition);
            console.log('Detail map resize triggered (500ms)');
        }, 500);
        
        console.log('Detail map initialized successfully');
        
    } catch (error) {
        console.error('Error initializing detail map:', error);
        detailMapElement.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #dc3545;">เกิดข้อผิดพลาดในการโหลดแผนที่</div>';
    }
}

// Ensure the function is available globally for the Google Maps callback
window.initMapAndData = initMapAndData;

// Make handleDataSourceChange globally available for inline onchange
window.handleDataSourceChange = handleDataSourceChange;

// Make showEarthquakeList globally available for mobile back button
window.showEarthquakeList = showEarthquakeList;
