export const API_URL = (() => {
    if (typeof window !== 'undefined') {
        const origin = window.location.origin;
        if (origin && origin.startsWith('http')) {
            return origin;
        }
    }
    return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
})();
