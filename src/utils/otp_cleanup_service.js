const OtpModel = require('../database/models/OtpModel');

class OtpCleanupService {
    constructor() {
        this.otpModel = new OtpModel();
    }

    async cleanupExpiredOTPs() {
        try {
            const count = await this.otpModel.cleanupExpiredOTPs();
            console.log(`Cleaned up ${count} expired OTPs`);
            return count;
        } catch (error) {
            console.error('OTP cleanup error:', error);
        }
    }

    // Run cleanup every 10 minutes
    startCleanupScheduler() {
        setInterval(async () => {
            await this.cleanupExpiredOTPs();
        }, 10 * 60 * 1000); // 10 minutes
    }
}

module.exports = new OtpCleanupService();