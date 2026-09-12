
export interface FormatOptions {
    defaultCountryCode?: string; // e.g. "212"
    includePlus?: boolean;        // default false (pure digits for WhatsApp)
}

export function formatPhoneNumber(number: string, options?: FormatOptions): string {
    if (!number) return "";
    let raw = number.trim();
    
    // Read user saved default country if in browser
    let defaultCountry = options?.defaultCountryCode;
    if (!defaultCountry && typeof window !== "undefined") {
        defaultCountry = localStorage.getItem("wapp_default_country") || "212";
    }
    if (!defaultCountry) defaultCountry = "212";

    const includePlus = options?.includePlus ?? false;

    // Remove all non-digit characters
    let cleaned = raw.replace(/\D/g, "");

    // 1. Fix redundant zero after country code (e.g., 21206... -> 2126..., 3306... -> 336...)
    if (cleaned.startsWith(`${defaultCountry}0`) && cleaned.length >= defaultCountry.length + 9) {
        cleaned = defaultCountry + cleaned.substring(defaultCountry.length + 1);
    }

    // 2. Local 9-digit format starting with 5, 6, 7, 8 (e.g. 524420559 or 639320092)
    if (cleaned.length === 9 && /^[5678]/.test(cleaned)) {
        cleaned = `${defaultCountry}${cleaned}`;
    }
    // 3. Local 10-digit format with leading zero (e.g. 0524420559, 0639320092, 07..., 01...)
    else if (cleaned.length === 10 && cleaned.startsWith("0")) {
        cleaned = `${defaultCountry}${cleaned.substring(1)}`;
    }

    if (includePlus && cleaned.length >= 8) {
        return `+${cleaned}`;
    }

    return cleaned;
}

export function isValidMoroccanNumber(number: string): boolean {
    const cleaned = number.replace(/\D/g, "");
    // Check for 2125..., 2126..., 2127... (total 12 digits) or 05..., 06..., 07... (total 10 digits)
    return /^212[5678]\d{8}$/.test(cleaned) || /^0[5678]\d{8}$/.test(cleaned);
}

