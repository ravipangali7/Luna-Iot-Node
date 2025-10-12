class DateTimeService {
    nepalTimeDate() {
        const now = new Date();
        // Convert from CST (UTC+8) to Nepal time (UTC+5:45)
        // Nepal is 2 hours 15 minutes behind CST
        const nepalTime = new Date(now.getTime() - (2 * 60 + 15) * 60000);
        return nepalTime;
    }

    getNepalDateTime(givenDate) {
        const date = new Date(givenDate);
        // Convert from CST (UTC+8) to Nepal time (UTC+5:45)
        // Nepal is 2 hours 15 minutes behind CST
        const nepalTime = new Date(date.getTime() - (2 * 60 + 15) * 60000);
        return nepalTime;
    }
}

module.exports = new DateTimeService();