class DateTimeService {
    nepalTimeDate() {
        // VPS system time is already in Nepal timezone (UTC+5:45)
        // JavaScript Date objects store time internally as UTC but represent the correct moment
        // Since system is already in Nepal timezone, use system time directly
        return new Date();
    }

    getNepalDateTime(givenDate) {
        // VPS system time is already in Nepal timezone (UTC+5:45)
        // If givenDate is provided, create Date object from it
        // The Date object will correctly represent the moment in time
        if (givenDate) {
            return new Date(givenDate);
        }
        // Otherwise return current time (already in Nepal timezone)
        return new Date();
    }
}

module.exports = new DateTimeService();