import { prisma } from '../lib/prisma';
import fs from 'fs-extra';

export interface RemoteAuthStore {
    sessionExists(options: { session: string }): Promise<boolean>;
    save(options: { session: string }): Promise<void>;
    extract(options: { session: string, path: string }): Promise<void>;
    delete(options: { session: string }): Promise<void>;
}

export class PostgresStore implements RemoteAuthStore {
    constructor() {}

    async sessionExists(options: { session: string }) {
        const session = await prisma.whatsAppSession.findUnique({
            where: { id: options.session }
        });
        return !!session;
    }

    async save(options: { session: string }) {
        const filePath = options.session;
        const zipPath = `${options.session}.zip`;
        const sessionId = options.session.split(/[/\\]/).pop() || 'default';

        // Wait for file creation if needed (RemoteAuth might be async in saving zip)
        // logic...
        
        if (await fs.pathExists(zipPath)) {
            const data = await fs.readFile(zipPath, { encoding: 'base64' });
            await prisma.whatsAppSession.upsert({
                where: { id: sessionId },
                update: { data },
                create: { id: sessionId, data }
            });
        }
    }

    async extract(options: { session: string, path: string }) {
        const session = await prisma.whatsAppSession.findUnique({
            where: { id: options.session }
        });

        if (session && session.data) {
            await fs.writeFile(options.path, session.data, { encoding: 'base64' });
        }
    }

    async delete(options: { session: string }) {
        await prisma.whatsAppSession.delete({
            where: { id: options.session }
        }).catch(() => {});
    }
}
