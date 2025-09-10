// Validation utility functions

/**
 * Validates required fields in request data
 * @param {Object} data - The data object to validate
 * @param {Array} requiredFields - Array of required field names
 * @returns {Object} - { isValid: boolean, message: string }
 */
function validateRequiredFields(data, requiredFields) {
    const missingFields = [];
    
    for (const field of requiredFields) {
        if (data[field] === undefined || data[field] === null || data[field] === '') {
            missingFields.push(field);
        }
    }
    
    if (missingFields.length > 0) {
        return {
            isValid: false,
            message: `Missing required fields: ${missingFields.join(', ')}`
        };
    }
    
    return {
        isValid: true,
        message: 'All required fields are present'
    };
}

/**
 * Validates email format
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid email format
 */
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Validates phone number format (basic validation)
 * @param {string} phone - Phone number to validate
 * @returns {boolean} - True if valid phone format
 */
function validatePhone(phone) {
    const phoneRegex = /^[\+]?[0-9\s\-\(\)]{10,}$/;
    return phoneRegex.test(phone);
}

/**
 * Validates numeric value
 * @param {any} value - Value to validate
 * @returns {boolean} - True if valid number
 */
function validateNumber(value) {
    return !isNaN(value) && !isNaN(parseFloat(value));
}

/**
 * Validates positive number
 * @param {any} value - Value to validate
 * @returns {boolean} - True if valid positive number
 */
function validatePositiveNumber(value) {
    return validateNumber(value) && parseFloat(value) > 0;
}

module.exports = {
    validateRequiredFields,
    validateEmail,
    validatePhone,
    validateNumber,
    validatePositiveNumber
};
