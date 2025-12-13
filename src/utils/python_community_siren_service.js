const fetch = require('node-fetch');
require('dotenv').config();

const PY_API_BASE_URL = process.env.PY_API_BASE_URL || 'https://py.mylunago.com';

async function createCommunitySirenHistory(payload) {
    const url = `${PY_API_BASE_URL}/api/community-siren/community-siren-history/create/`;

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
            console.error('Failed to create community siren history:', response.status, data);
            return { success: false, status: response.status, data };
        }

        return { success: true, status: response.status, data };
    } catch (error) {
        console.error('Error calling Python community siren history API:', error.message);
        return { success: false, error: error.message };
    }
}

module.exports = { createCommunitySirenHistory };

