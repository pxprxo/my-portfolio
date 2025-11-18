// Mobile sharing variables
let currentDetailEarthquake = null;
let currentDetailIndex = null;

// Mobile detail sharing functions with performance optimization
function shareMobileDetailToFacebook() {
    if (!currentDetailEarthquake) {
        console.log('No earthquake data available for sharing');
        return;
    }
    
    // Use requestAnimationFrame for smooth UI
    requestAnimationFrame(() => {
        const earthquake = currentDetailEarthquake;
        const magnitude = earthquake.magnitude !== 'N/A' ? earthquake.magnitude : 'ไม่ระบุ';
        const depth = earthquake.depth !== 'N/A' ? `${parseFloat(earthquake.depth).toFixed(1)} กม.` : 'ไม่ระบุ';
        
        // Cache formatted date to avoid recalculation
        let thaiDate = earthquake._cachedThaiDate;
        if (!thaiDate && typeof formatThaiDate === 'function') {
            thaiDate = formatThaiDate(earthquake.time);
            earthquake._cachedThaiDate = thaiDate; // Cache for future use
        }
        
        const dataSource = earthquake.source === 'TMD' ? 'กองเฝ้าระวังแผ่นดินไหว' : earthquake.source;
        
        const shareText = `🚨 รายงานแผ่นดินไหว
ตำแหน่ง: ${earthquake.location}
ขนาด: ${magnitude}
ความลึก: ${depth}
วันที่: ${thaiDate || 'ไม่ระบุ'}
แหล่งที่มา: ${dataSource}

รายละเอียดเพิ่มเติม: ${window.location.href}`;
        
        const url = encodeURIComponent(window.location.href);
        const text = encodeURIComponent(shareText);
        
        const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`;
        
        try {
            window.open(facebookUrl, 'facebook-share', 'width=600,height=400,scrollbars=yes,resizable=yes');
        } catch (error) {
            console.error('Error sharing to Facebook:', error);
            if (typeof copyToClipboard === 'function') {
                copyToClipboard(shareText + '\n\n' + window.location.href);
            }
            alert('ไม่สามารถเปิด Facebook ได้ ข้อมูลได้ถูกคัดลอกไปยังคลิปบอร์ดแล้ว');
        }
    });
}

function shareMobileDetailToTwitter() {
    if (!currentDetailEarthquake) {
        console.log('No earthquake data available for sharing');
        return;
    }
    
    requestAnimationFrame(() => {
        const earthquake = currentDetailEarthquake;
        const magnitude = earthquake.magnitude !== 'N/A' ? earthquake.magnitude : 'ไม่ระบุ';
        const depth = earthquake.depth !== 'N/A' ? `${parseFloat(earthquake.depth).toFixed(1)} กม.` : 'ไม่ระบุ';
        
        let thaiDate = earthquake._cachedThaiDate;
        if (!thaiDate && typeof formatThaiDate === 'function') {
            thaiDate = formatThaiDate(earthquake.time);
            earthquake._cachedThaiDate = thaiDate;
        }
        
        const dataSource = earthquake.source === 'TMD' ? 'กองเฝ้าระวังแผ่นดินไหว' : earthquake.source;
        
        const shareText = `🚨 รายงานแผ่นดินไหว
${earthquake.location}
ขนาด ${magnitude}
วันที่ ${thaiDate || 'ไม่ระบุ'}
แหล่งที่มา ${dataSource}
#แผ่นดินไหว #EarthquakeAlert #Thailand`;
        
        const url = encodeURIComponent(window.location.href);
        const text = encodeURIComponent(shareText);
        
        const twitterUrl = `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
        
        try {
            window.open(twitterUrl, 'twitter-share', 'width=600,height=400,scrollbars=yes,resizable=yes');
        } catch (error) {
            console.error('Error sharing to Twitter:', error);
            if (typeof copyToClipboard === 'function') {
                copyToClipboard(shareText + '\n\n' + window.location.href);
            }
            alert('ไม่สามารถเปิด Twitter ได้ ข้อมูลได้ถูกคัดลอกไปยังคลิปบอร์ดแล้ว');
        }
    });
}

function shareMobileDetailToLine() {
    if (!currentDetailEarthquake) {
        console.log('No earthquake data available for sharing');
        return;
    }
    
    requestAnimationFrame(() => {
        const earthquake = currentDetailEarthquake;
        const magnitude = earthquake.magnitude !== 'N/A' ? earthquake.magnitude : 'ไม่ระบุ';
        const depth = earthquake.depth !== 'N/A' ? `${parseFloat(earthquake.depth).toFixed(1)} กม.` : 'ไม่ระบุ';
        
        let thaiDate = earthquake._cachedThaiDate;
        if (!thaiDate && typeof formatThaiDate === 'function') {
            thaiDate = formatThaiDate(earthquake.time);
            earthquake._cachedThaiDate = thaiDate;
        }
        
        const dataSource = earthquake.source === 'TMD' ? 'กองเฝ้าระวังแผ่นดินไหว' : earthquake.source;
        
        const shareText = `🚨 รายงานแผ่นดินไหว

📍 สถานที่: ${earthquake.location}
📊 ขนาด: ${magnitude}
📏 ความลึก: ${depth}
📅 วันที่: ${thaiDate || 'ไม่ระบุ'}
📡 แหล่งที่มา: ${dataSource}

รายละเอียดเพิ่มเติม: ${window.location.href}`;
        
        const text = encodeURIComponent(shareText);
        const url = encodeURIComponent(window.location.href);
        
        const lineUrl = `https://social-plugins.line.me/lineit/share?url=${url}&text=${text}`;
        
        try {
            window.open(lineUrl, 'line-share', 'width=600,height=400,scrollbars=yes,resizable=yes');
        } catch (error) {
            console.error('Error sharing to Line:', error);
            if (typeof copyToClipboard === 'function') {
                copyToClipboard(shareText);
            }
            alert('ไม่สามารถเปิด Line ได้ ข้อมูลได้ถูกคัดลอกไปยังคลิปบอร์ดแล้ว');
        }
    });
}

// Set earthquake data for sharing
function setMobileDetailEarthquake(earthquake, index) {
    currentDetailEarthquake = earthquake;
    currentDetailIndex = index;
}

// Make functions globally available
window.shareMobileDetailToFacebook = shareMobileDetailToFacebook;
window.shareMobileDetailToTwitter = shareMobileDetailToTwitter;
window.shareMobileDetailToLine = shareMobileDetailToLine;
window.setMobileDetailEarthquake = setMobileDetailEarthquake;
