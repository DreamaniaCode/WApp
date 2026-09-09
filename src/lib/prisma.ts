import path from 'path';

let PrismaClientClass: any;

try {
    if (process.versions.electron) {
        const electron = require('electron');
        const appPath = electron.app ? electron.app.getAppPath() : process.cwd();
        const unpackedPath = appPath.replace(/app\.asar$/, 'app.asar.unpacked');
        const unpackedPrisma = path.join(unpackedPath, 'node_modules', '@prisma', 'client');
        PrismaClientClass = require(unpackedPrisma).PrismaClient;
    } else {
        PrismaClientClass = require('@prisma/client').PrismaClient;
    }
} catch (e) {
    console.warn("Fallback to standard @prisma/client require:", e);
    PrismaClientClass = require('@prisma/client').PrismaClient;
}

const globalForPrisma = globalThis as unknown as { prisma: any };

export const prisma = globalForPrisma.prisma || new PrismaClientClass();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
