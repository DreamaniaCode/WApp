/**
 * Official WhatsApp Business API Types and Wrapper
 * Provides integration with Meta's official Cloud API
 */

export interface OfficialWhatsAppConfig {
    accessToken: string;
    phoneNumberId: string;
    businessAccountId?: string;
    apiVersion?: string;
}

export interface MessageResponse {
    messages?: Array<{
        id: string;
        message_state: string;
    }>;
    contacts?: Array<{
        input: string;
        wa_id: string;
        status?: string;
    }>;
    error?: {
        message: string;
        type: string;
        code: number;
    };
}

export interface TemplateComponent {
    type: 'header' | 'body' | 'button';
    format?: string;
    text?: string;
    example?: {
        header_handle?: string[];
        body_text?: string[][];
        buttons?: Array<{ type: string; url?: string }>;
    };
}

export interface TemplateMessage {
    messaging_product: 'whatsapp';
    to: string;
    type: 'template';
    template: {
        name: string;
        language: { code: string; policy?: string };
        components?: TemplateComponent[];
    };
}

export class OfficialWhatsAppAPI {
    private accessToken: string;
    private phoneNumberId: string;
    private businessAccountId?: string;
    private version: string;

    constructor(config: OfficialWhatsAppConfig) {
        this.accessToken = config.accessToken;
        this.phoneNumberId = config.phoneNumberId;
        this.businessAccountId = config.businessAccountId;
        this.version = config.apiVersion || 'v18.0';
    }

    /**
     * Send a text message via WhatsApp Business API
     */
    async sendTextMessage(to: string, text: string): Promise<MessageResponse> {
        const response = await this._request(`/v${this.version}/${this.phoneNumberId}/messages`, {
            messaging_product: 'whatsapp',
            to,
            type: 'text',
            text: { body: text }
        });
        return response;
    }

    /**
     * Send a template message
     */
    async sendTemplateMessage(to: string, templateName: string, languageCode = 'en_US'): Promise<MessageResponse> {
        const response = await this._request(`/v${this.version}/${this.phoneNumberId}/messages`, {
            messaging_product: 'whatsapp',
            to,
            type: 'template',
            template: {
                name: templateName,
                language: { code: languageCode }
            }
        });
        return response;
    }

    /**
     * Check if a phone number is registered on WhatsApp
     */
    async isRegistered(number: string): Promise<boolean> {
        try {
            const response = await this._request(`/v${this.version}/${this.phoneNumberId}/contacts`, {
                messaging_product: 'whatsapp',
                contacts: [{ input: number, type: 'PHONE_NUMBER' }]
            });
            return response.contacts?.[0]?.wa_id !== undefined;
        } catch {
            return false;
        }
    }

    private async _request(endpoint: string, data: unknown): Promise<MessageResponse> {
        const url = `https://graph.facebook.com${endpoint}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error?.message || 'API request failed');
        }

        return result;
    }
}