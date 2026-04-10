import { env } from '../config/env.js';
import { createMemoryDataAccess } from './memory-repositories.js';
import { initializePostgresPool } from './postgres.js';
import { createPostgresDataAccess, ensureDefaultAdminAccount } from './postgres-repositories.js';
const memoryDataAccess = createMemoryDataAccess();
let activeDataAccess = memoryDataAccess;
let storageInfo = {
    driver: 'memory',
    persistence: false,
    connected: true,
    message: 'التطبيق يعمل حالياً على التخزين في الذاكرة.',
};
let initializationPromise = null;
export function getDataAccess() {
    return activeDataAccess;
}
export function getStorageInfo() {
    return storageInfo;
}
export async function initializeDataAccess() {
    if (initializationPromise) {
        await initializationPromise;
        return;
    }
    initializationPromise = (async () => {
        if (!env.DATABASE_URL) {
            storageInfo = {
                driver: 'memory',
                persistence: false,
                connected: true,
                message: 'لم يتم تحديد DATABASE_URL، لذلك يعمل الخادم على التخزين في الذاكرة.',
            };
            return;
        }
        try {
            const pool = await initializePostgresPool();
            if (!pool) {
                return;
            }
            await ensureDefaultAdminAccount(pool);
            activeDataAccess = createPostgresDataAccess(pool);
            storageInfo = {
                driver: 'postgres',
                persistence: true,
                connected: true,
                message: 'تم تفعيل PostgreSQL بنجاح للتخزين الدائم.',
            };
            console.log('Storage driver: PostgreSQL');
        }
        catch (error) {
            activeDataAccess = memoryDataAccess;
            storageInfo = {
                driver: 'memory',
                persistence: false,
                connected: false,
                message: error instanceof Error
                    ? `فشل الاتصال بـ PostgreSQL وتم الرجوع إلى الذاكرة: ${error.message}`
                    : 'فشل الاتصال بـ PostgreSQL وتم الرجوع إلى الذاكرة.',
            };
            console.error(storageInfo.message);
        }
    })();
    await initializationPromise;
}
