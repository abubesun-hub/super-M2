import { createApp } from './app.js';
import { env } from './config/env.js';
import { initializeDataAccess, getStorageInfo } from './data/index.js';
import { networkInterfaces } from 'node:os';
function getAccessibleApiUrls(port) {
    const urls = new Set([
        `http://localhost:${port}`,
        `http://127.0.0.1:${port}`,
    ]);
    const interfaces = networkInterfaces();
    for (const entries of Object.values(interfaces)) {
        for (const entry of entries ?? []) {
            if (entry.family !== 'IPv4' || entry.internal) {
                continue;
            }
            urls.add(`http://${entry.address}:${port}`);
        }
    }
    return [...urls];
}
async function startServer() {
    await initializeDataAccess();
    const app = createApp();
    app.listen(env.PORT, '0.0.0.0', () => {
        console.log('Super M2 API listening on:');
        for (const url of getAccessibleApiUrls(env.PORT)) {
            console.log(`  ${url}`);
        }
        console.log(getStorageInfo().message);
    });
}
startServer().catch((error) => {
    console.error('Failed to start Super M2 API', error);
    process.exit(1);
});
