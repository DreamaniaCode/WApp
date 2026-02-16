
export function formatPhoneNumber(number: string): string {
    // Remove all non-numeric characters
    let cleaned = number.replace(/\D/g, "");

    // Moroccan Number Logic
    // If it starts with 06 or 07 and length is 10, replace 0 with 212
    if ((cleaned.startsWith("06") || cleaned.startsWith("07")) && cleaned.length === 10) {
        cleaned = "212" + cleaned.substring(1);
    }

    // If it starts with 212 and length is 12, it's already good (usually)
    // You might want to ensure it has the suffix for whatsapp-web.js if this is used directly for sending
    // But usually for the UI we just want the clean number.
    // The backend adds @c.us

    return cleaned;
}

export function isValidMoroccanNumber(number: string): boolean {
    const cleaned = number.replace(/\D/g, "");
    // Check for 2126... or 2127... (total 12 digits) or 06.../07... (total 10 digits)
    return /^212[67]\d{8}$/.test(cleaned) || /^0[67]\d{8}$/.test(cleaned);
}
