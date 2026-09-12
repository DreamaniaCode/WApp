
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

/**
 * Checks whether a phone number corresponds to a landline / fixed line ("numéro fixe").
 * Identifies Moroccan landlines (05... / 2125...) as well as standard international fixed lines.
 */
export function isLandlineNumber(number: string, defaultCountryCode?: string): boolean {
    if (!number) return false;
    const formatted = formatPhoneNumber(number, { defaultCountryCode });
    const clean = formatted.replace(/\D/g, "");

    // 1. Morocco (+212): All landlines start with 2125 (12 digits) or local 05 (10 digits)
    if (clean.startsWith("2125") && clean.length === 12) return true;
    if (clean.startsWith("2128") && clean.length === 12) return true; // Special / toll service
    if (clean.startsWith("05") && clean.length === 10) return true;
    if (clean.startsWith("5") && clean.length === 9) return true;

    // 2. France (+33): 01-05 are landlines
    if (clean.startsWith("33") && clean.length === 11 && /^33[1-5]/.test(clean)) return true;
    if (clean.startsWith("0") && clean.length === 10 && /^0[1-5]/.test(clean)) return true;

    // 3. Spain (+34): 8 and 9 are landlines
    if (clean.startsWith("34") && clean.length === 11 && /^34[89]/.test(clean)) return true;

    // 4. UK (+44): 01 and 02 are landlines
    if (clean.startsWith("44") && clean.length >= 11 && /^44[12]/.test(clean)) return true;

    // 5. Algeria (+213): 02, 03, 04 are landlines
    if (clean.startsWith("213") && clean.length === 12 && /^213[234]/.test(clean)) return true;

    // 6. Tunisia (+216): 7 is landline
    if (clean.startsWith("216") && clean.length === 11 && /^2167/.test(clean)) return true;

    // 7. UAE (+971): 2, 3, 4, 6, 7, 9 are landlines
    if (clean.startsWith("971") && clean.length >= 11 && /^971[234679]/.test(clean)) return true;

    // 8. Saudi (+966): 1 is landline
    if (clean.startsWith("966") && clean.length >= 11 && /^9661/.test(clean)) return true;

    return false;
}

/**
 * Checks whether a phone number corresponds to a smartphone / mobile number.
 * Smartphone numbers are capable of receiving WhatsApp messages.
 */
export function isMobileNumber(number: string, defaultCountryCode?: string): boolean {
    if (!number) return false;
    const formatted = formatPhoneNumber(number, { defaultCountryCode });
    const clean = formatted.replace(/\D/g, "");

    // If it's a confirmed landline, it's NOT a mobile number
    if (isLandlineNumber(number, defaultCountryCode)) return false;

    // 1. Morocco (+212): Mobile numbers start with 2126 or 2127 (12 digits)
    if ((clean.startsWith("2126") || clean.startsWith("2127")) && clean.length === 12) return true;
    if ((clean.startsWith("06") || clean.startsWith("07")) && clean.length === 10) return true;
    if ((clean.startsWith("6") || clean.startsWith("7")) && clean.length === 9) return true;

    // 2. France (+33): 06, 07
    if (clean.startsWith("33") && clean.length === 11 && /^33[67]/.test(clean)) return true;

    // 3. Spain (+34): 6, 7
    if (clean.startsWith("34") && clean.length === 11 && /^34[67]/.test(clean)) return true;

    // 4. UK (+44): 07
    if (clean.startsWith("44") && clean.length >= 11 && /^447/.test(clean)) return true;

    // 5. Algeria (+213): 05, 06, 07
    if (clean.startsWith("213") && clean.length === 12 && /^213[567]/.test(clean)) return true;

    // 6. Tunisia (+216): 2, 4, 5, 9
    if (clean.startsWith("216") && clean.length === 11 && /^216[2459]/.test(clean)) return true;

    // 7. UAE (+971): 05...
    if (clean.startsWith("971") && clean.length >= 11 && /^9715/.test(clean)) return true;

    // 8. Saudi (+966): 05...
    if (clean.startsWith("966") && clean.length >= 11 && /^9665/.test(clean)) return true;

    // If not definitively known, check if it doesn't match any landline
    return !isLandlineNumber(number, defaultCountryCode);
}

/**
 * Returns phone type classification: 'mobile' | 'landline' | 'unknown'
 */
export function getPhoneType(number: string, defaultCountryCode?: string): 'mobile' | 'landline' | 'unknown' {
    if (!number) return 'unknown';
    if (isLandlineNumber(number, defaultCountryCode)) return 'landline';
    if (isMobileNumber(number, defaultCountryCode)) return 'mobile';
    return 'unknown';
}

/**
 * Filters a list of phone numbers, separating smartphone/mobile numbers from landlines.
 */
export function filterMobileNumbers(numbers: string[], defaultCountryCode?: string): { mobiles: string[]; landlines: string[] } {
    const mobiles: string[] = [];
    const landlines: string[] = [];

    numbers.forEach(num => {
        const trimmed = num.trim();
        if (!trimmed) return;
        if (isLandlineNumber(trimmed, defaultCountryCode)) {
            landlines.push(trimmed);
        } else {
            mobiles.push(trimmed);
        }
    });

    return { mobiles, landlines };
}

