const moment = require('moment-timezone');

class DateTimeService {
    nepalTimeDate() {
        const now = new Date();
        const nepalTime = new Date(now.getTime() + (5 * 60 + 45) * 60000);
        return nepalTime;
    }

    getNepalDateTime(givenDate) {
        const date = new Date(givenDate);
        const nepalTime = new Date(date.getTime() + (5 * 60 + 45) * 60000);
        return nepalTime;
    }
}

module.exports = new DateTimeService();