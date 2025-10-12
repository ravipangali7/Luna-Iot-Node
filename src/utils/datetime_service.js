class DateTimeService {
    nepalTimeDate() {
        return new Date();
    }

    getNepalDateTime(givenDate) {
        return new Date(givenDate);
    }
}

module.exports = new DateTimeService();