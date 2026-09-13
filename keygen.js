#!/usr/bin/env node
/**
 * DreamaniaCode WApp Manager Leads Pro — License Key Generator
 * 
 * Usage:
 *   node keygen.js [MACHINE_ID] [plan]
 * 
 * Plans:
 *   lifetime (default) -> Lifetime Enterprise Pass
 *   1year (365d)       -> 1 Year Enterprise Pass
 *   6months (180d)     -> 6 Months Enterprise Pass
 *   1month (30d)       -> 1 Month Enterprise Pass
 * 
 * Examples:
 *   node keygen.js 1B20F79AC08E1F39 lifetime
 *   node keygen.js 1B20F79AC08E1F39 1year
 *   node keygen.js
 */

const crypto = require("crypto");
const os = require("os");

const LICENSE_SALT = "DreamaniaWApp2026SecureKeySalt#";

function getLocalMachineId() {
    const rawId = `${os.hostname()}-${os.platform()}-${os.arch()}-${os.cpus().length}`;
    return crypto.createHash("sha256").update(rawId).digest("hex").slice(0, 16).toUpperCase();
}

function generateKey(machineId, planId) {
    const raw = `${String(machineId).toUpperCase().trim()}:${String(planId).toUpperCase().trim()}:${LICENSE_SALT}`;
    const hash = crypto.createHash("sha256").update(raw).digest("hex").toUpperCase();
    const p = String(planId).toUpperCase().trim();
    const prefix = p === "30D" ? "W30D" : p === "180D" ? "W180" : p === "365D" ? "W365" : "WAPP";
    return `${prefix}-${hash.slice(0, 4)}-${hash.slice(4, 8)}-${hash.slice(8, 12)}`;
}

const args = process.argv.slice(2);
let targetMachineId = args[0] ? args[0].trim().toUpperCase() : getLocalMachineId();
let planArg = (args[1] || "all").toLowerCase();

const plans = [
    { id: "LIFETIME", name: "Lifetime Enterprise Pass", code: "lifetime" },
    { id: "365D", name: "1 Year Pass (365 Days)", code: "1year" },
    { id: "180D", name: "6 Months Pass (180 Days)", code: "6months" },
    { id: "30D", name: "1 Month Pass (30 Days)", code: "1month" }
];

console.log("==================================================================");
console.log("     DREAMANIACODE — WApp Manager Leads Pro License Generator     ");
console.log("==================================================================");
console.log(`Target Machine ID: ${targetMachineId}`);
console.log("------------------------------------------------------------------");

if (planArg === "all") {
    plans.forEach(p => {
        const key = generateKey(targetMachineId, p.id);
        console.log(`  [${p.name}]`);
        console.log(`  Key: ${key}\n`);
    });
} else {
    const matched = plans.find(p => p.code === planArg || p.id.toLowerCase() === planArg);
    if (matched) {
        const key = generateKey(targetMachineId, matched.id);
        console.log(`  Plan: ${matched.name}`);
        console.log(`  Key : ${key}\n`);
    } else {
        console.error(`Unknown plan: "${planArg}". Valid options: lifetime, 1year, 6months, 1month`);
    }
}
console.log("==================================================================");
console.log("Master / Owner VIP Keys (Works on all machines):");
console.log("  DREAMANIA-VIP-2026");
console.log("  Dreamania2026!");
console.log("==================================================================");
