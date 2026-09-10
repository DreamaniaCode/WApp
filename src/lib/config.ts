export const getApiUrl = (): string => {
    if (typeof window !== 'undefined') {
        const custom = localStorage.getItem('wapp_custom_api_url');
        if (custom && custom.startsWith('http')) {
            return custom.replace(/\/+$/, '');
        }
        const origin = window.location.origin;
        if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
            return origin;
        }
    }
    return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
};

export const API_URL = getApiUrl();

