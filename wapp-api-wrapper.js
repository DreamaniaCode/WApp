/**
 * Official WhatsApp Business API Wrapper
 * This provides an alternative to whatsapp-web.js using the official Cloud API
 * Requires Meta Business Account setup and phone number verification
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

class WhatsAppBusinessAPI {
    constructor(accessToken, phoneNumberId, version = 'v18.0') {
        this.accessToken = accessToken;
        this.phoneNumberId = phoneNumberId;
        this.version = version;
        this.baseURL = `https://graph.facebook.com/${version}`;
    }

    /**
     * Send a text message
     * @param {string} to - Phone number in international format
     * @param {string} message - Message text
     * @returns {Promise<Object>} - API response
     */
    async sendTextMessage(to, message) {
        const data = JSON.stringify({
            messaging_product: 'whatsapp',
            to: to,
            type: 'text',
            text: { body: message }
        });

        return this._makeRequest('POST', `/${this.phoneNumberId}/messages`, data);
    }

    /**
     * Send a template message
     * @param {string} to - Phone number in international format
     * @param {string} templateName - Name of the approved template
     * @param {Object} components - Template components (header, body, buttons)
     * @returns {Promise<Object>} - API response
     */
    async sendTemplateMessage(to, templateName, components = {}) {
        const data = JSON.stringify({
            messaging_product: 'whatsapp',
            to: to,
            type: 'template',
            template: {
                name: templateName,
                language: { code: 'en_US' },
                ...components
            }
        });

        return this._makeRequest('POST', `/${this.phoneNumberId}/messages`, data);
    }

    /**
     * Send media message
     * @param {string} to - Phone number in international format
     * @param {string} mediaType - Type of media (image, video, document, audio)
     * @param {string} mediaId - Media ID uploaded to WhatsApp servers
     * @param {string} caption - Optional caption
     * @returns {Promise<Object>} - API response
     */
    async sendMediaMessage(to, mediaType, mediaId, caption = '') {
        const data = JSON.stringify({
            messaging_product: 'whatsapp',
            to: to,
            type: mediaType,
            [mediaType]: { id: mediaId, ...(caption && { caption }) }
        });

        return this._makeRequest('POST', `/${this.phoneNumberId}/messages`, data);
    }

    /**
     * Upload media to WhatsApp servers
     * @param {Buffer} mediaBuffer - Media file buffer
     * @param {string} mimeType - MIME type of media
     * @returns {Promise<string>} - Media ID
     */
    async uploadMedia(mediaBuffer, mimeType) {
        // This would require multipart/form-data implementation
        // For simplicity, we'll note this requires additional implementation
        throw new Error('Media upload not implemented in this wrapper');
    }

    /**
     * Get message status
     * @param {string} messageId - WhatsApp message ID
     * @returns {Promise<Object>} - Message status
     */
    async getMessageStatus(messageId) {
        return this._makeRequest('GET', `/${messageId}`);
    }

    /**
     * Make HTTP request to WhatsApp Business API
     * @param {string} method - HTTP method
     * @param {string} endpoint - API endpoint
     * @param {string} data - JSON data string
     * @returns {Promise<Object>} - Parsed response
     */
    _makeRequest(method, endpoint, data = null) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'graph.facebook.com',
                port: 443,
                path: `${this.baseURL}${endpoint}`,
                method: method,
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json',
                    ...(data && { 'Content-Length': Buffer.byteLength(data) })
                }
            };

            const req = https.request(options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(responseData);
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(parsed);
                        } else {
                            reject(new Error(`API Error: ${parsed.error?.message || 'Unknown error'}`));
                        }
                    } catch (e) {
                        reject(new Error(`Invalid JSON response: ${responseData}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            if (data) {
                req.write(data);
            }

            req.end();
        });
    }
}

module.exports = { WhatsAppBusinessAPI };