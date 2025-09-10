const axios = require('axios');
const config = require('../config/mobileTopup');

class MobileTopupService {
  
  /**
   * Generate unique reference ID
   */
  generateReferenceId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10).toUpperCase();
    return `RCH_${timestamp}_${random}`;
  }

  /**
   * Validate amount based on SIM type
   */
  validateAmount(amount, simType) {
    const limits = config.mobileTopup.limits[simType];
    if (!limits) {
      throw new Error(`Invalid SIM type: ${simType}`);
    }
    
    if (amount < limits.min || amount > limits.max) {
      throw new Error(`Amount must be between ${limits.min} and ${limits.max} for ${simType.toUpperCase()}`);
    }
    
    return true;
  }

  /**
   * Validate phone number format
   */
  validatePhoneNumber(phone) {
    // Remove any non-digit characters
    const cleanPhone = phone.replace(/\D/g, '');
    
    // Check if it's a 10-digit number
    if (cleanPhone.length !== 10) {
      throw new Error('Phone number must be 10 digits');
    }
    
    
    return cleanPhone;
  }

  /**
   * Determine SIM type based on phone number
   */
  determineSimType(phone) {
    const cleanPhone = this.validatePhoneNumber(phone);
    const prefix = cleanPhone.substring(0, 3);
    
    // NTC prefixes
    if (['984', '985', '986'].includes(prefix)) {
      return 'ntc';
    }
    // Ncell prefixes
    else if (['980', '981', '982', '987', '988', '989'].includes(prefix)) {
      return 'ncell';
    }
    
    throw new Error('Unable to determine SIM type from phone number');
  }

  /**
   * Make top-up request to NTC
   */
  async topupNTC(phone, amount, reference) {
    try {
      const requestData = {
        token: config.mobileTopup.token,
        reference: reference,
        amount: amount.toString(),
        number: phone
      };

      console.log('NTC Top-up Request:', requestData);

      const response = await axios.post(config.mobileTopup.endpoints.ntc, requestData, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 seconds timeout
      });

      console.log('NTC Top-up Response:', response.data);

      return {
        success: response.data.Status,
        message: response.data.Message,
        data: response.data.Data,
        statusCode: response.data.StatusCode,
        state: response.data.State,
        description: response.data.Description
      };

    } catch (error) {
      console.error('NTC Top-up Error:', error.message);
      console.error('NTC Error Response:', error.response?.data);
      console.error('NTC Error Status:', error.response?.status);
      
      if (error.response) {
        return {
          success: false,
          message: error.response.data?.Message || 'NTC Top-up failed',
          data: error.response.data?.Data || null,
          statusCode: error.response.status,
          state: 'Failed',
          description: error.response.data?.Description || error.message
        };
      }
      
      return {
        success: false,
        message: 'Network error during NTC top-up',
        data: null,
        statusCode: 500,
        state: 'Failed',
        description: error.message
      };
    }
  }

  /**
   * Make top-up request to Ncell
   */
  async topupNcell(phone, amount, reference) {
    try {
      const requestData = {
        token: config.mobileTopup.token,
        reference: reference,
        amount: amount.toString(),
        number: phone
      };

      console.log('Ncell Top-up Request:', requestData);

      const response = await axios.post(config.mobileTopup.endpoints.ncell, requestData, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 seconds timeout
      });

      console.log('Ncell Top-up Response:', response.data);

      return {
        success: response.data.Status,
        message: response.data.Message,
        data: response.data.Data,
        statusCode: response.data.StatusCode,
        state: response.data.State,
        description: response.data.Description
      };

    } catch (error) {
      console.error('Ncell Top-up Error:', error.message);
      console.error('Ncell Error Response:', error.response?.data);
      console.error('Ncell Error Status:', error.response?.status);
      
      if (error.response) {
        return {
          success: false,
          message: error.response.data?.Message || 'Ncell Top-up failed',
          data: error.response.data?.Data || null,
          statusCode: error.response.status,
          state: 'Failed',
          description: error.response.data?.Description || error.message
        };
      }
      
      return {
        success: false,
        message: 'Network error during Ncell top-up',
        data: null,
        statusCode: 500,
        state: 'Failed',
        description: error.message
      };
    }
  }

  /**
   * Process mobile top-up based on SIM type
   */
  async processTopup(phone, amount, deviceSimType) {
    try {
      // Validate phone number
      const cleanPhone = this.validatePhoneNumber(phone);
      
      // Determine SIM type (use device SIM type or auto-detect)
      let simType;
      if (deviceSimType && config.mobileTopup.simTypes[deviceSimType]) {
        simType = config.mobileTopup.simTypes[deviceSimType];
      } else {
        simType = this.determineSimType(cleanPhone);
      }
      
      // Validate amount for the SIM type
      this.validateAmount(amount, simType);
      
      // Generate unique reference
      const reference = this.generateReferenceId();
      
      console.log(`Processing ${simType.toUpperCase()} top-up:`, { phone: cleanPhone, amount, reference, simType });
      
      // Make the appropriate API call
      let result;
      if (simType === 'ntc') {
        result = await this.topupNTC(cleanPhone, amount, reference);
      } else if (simType === 'ncell') {
        result = await this.topupNcell(cleanPhone, amount, reference);
      } else {
        throw new Error(`Unsupported SIM type: ${simType}`);
      }
      
      // Add additional metadata
      result.simType = simType.toUpperCase();
      result.phone = cleanPhone;
      result.amount = amount;
      result.reference = reference;
      result.timestamp = new Date().toISOString();
      
      return result;
      
    } catch (error) {
      console.error('Mobile Top-up Processing Error:', error.message);
      
      return {
        success: false,
        message: error.message,
        data: null,
        statusCode: 400,
        state: 'Failed',
        description: error.message,
        simType: deviceSimType || 'UNKNOWN',
        phone: phone,
        amount: amount,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = new MobileTopupService();
