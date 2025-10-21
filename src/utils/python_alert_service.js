const fetch = require('node-fetch');
require('dotenv').config();

const PY_API_BASE_URL = process.env.PY_API_BASE_URL || 'https://py.mylunago.com';

async function createAlertHistory(payload) {
    const url = `${PY_API_BASE_URL}/api/alert-system/alert-history/create/`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
                // No auth headers per requirement (middleware allows anonymous)
            },
            body: JSON.stringify(payload),
            timeout: 10000
        });

        const text = await response.text();
        let data;
        try { data = JSON.parse(text); } catch (_) { data = { raw: text }; }

        if (!response.ok) {
            console.error('Failed to create alert history:', response.status, data);
            return { success: false, status: response.status, data };
        }

        return { success: true, status: response.status, data };
    } catch (error) {
        console.error('Error calling Python alert history API:', error.message);
        return { success: false, error: error.message };
    }
}

module.exports = { createAlertHistory };
