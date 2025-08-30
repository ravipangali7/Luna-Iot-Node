// Haversine formula to calculate distance between two GPS coordinates
function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const toRad = deg => deg * Math.PI / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

// Main function to calculate total distance from ordered GPS points
function calculateTotalDistance(gpsPoints) {
    if (!Array.isArray(gpsPoints) || gpsPoints.length < 2) {
        return 0; // Need at least 2 points to calculate distance
    }

    let totalDistance = 0;

    for (let i = 1; i < gpsPoints.length; i++) {
        const prev = gpsPoints[i - 1];
        const curr = gpsPoints[i];

        const distance = haversine(prev.lat, prev.lon, curr.lat, curr.lon);
        totalDistance += distance;
    }

    return totalDistance; // in kilometers
}

// Calculate distance from location data (accepts location objects with latitude/longitude)
function calculateDistanceFromLocationData(locationData) {
    if (!Array.isArray(locationData) || locationData.length < 2) {
        return 0;
    }

    // Convert location data to the format expected by calculateTotalDistance
    const gpsPoints = locationData.map(location => ({
        lat: location.latitude,
        lon: location.longitude
    }));

    return calculateTotalDistance(gpsPoints);
}

module.exports = {
    calculateTotalDistance,
    calculateDistanceFromLocationData
}