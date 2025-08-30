const axios = require('axios');

const smsConfig = {
    API_KEY: '568383D0C5AA82',
    API_URL: 'https://sms.kaichogroup.com/smsapi/index.php',
    CAMPAIGN_ID: '9148',
    ROUTE_ID: '130',
    SENDER_ID: 'SMSBit'
};

class SMSService {
    constructor() {
        this.config = smsConfig;
    }

    async sendSMS(phoneNumber, message) {
        try {
            const params = new URLSearchParams({
                key: this.config.API_KEY,
                campaign: this.config.CAMPAIGN_ID,
                routeid: this.config.ROUTE_ID,
                type: 'text',
                contacts: phoneNumber,
                senderid: this.config.SENDER_ID,
                msg: message
            });

            const url = `${this.config.API_URL}?${params.toString()}`;
            
            const response = await axios.get(url);
            
            // Check if SMS was sent successfully
            // The API returns "SMS-SHOOT-ID/..." when successful
            if (response.data && response.data.includes('SMS-SHOOT-ID')) {
                return { success: true, message: 'SMS sent successfully' };
            } else if (response.data && response.data.includes('ERR:')) {
                return { success: false, message: 'SMS service error: ' + response.data };
            } else {
                return { success: false, message: 'Failed to send SMS' };
            }
        } catch (error) {
            console.error('SMS sending error:', error);
            return { success: false, message: 'SMS service error' };
        }
    }

    async sendOTP(phoneNumber, otp) {
        const message = `Your Luna IoT verification code is: ${otp}. Valid for 10 minutes.`;
        return await this.sendSMS(phoneNumber, message);
    }
}

module.exports = new SMSService();