import { createApp } from './app.js';
import { env } from './config/env.js';
import { initializeDataAccess, getStorageInfo } from './data/index.js';
async function startServer() {
    await initializeDataAccess();
    const app = createApp();
    app.listen(env.PORT, () => {
        console.log(`Super M2 API listening on http://localhost:${env.PORT}`);
        console.log(getStorageInfo().message);
    });
}
startServer().catch((error) => {
    console.error('Failed to start Super M2 API', error);
    process.exit(1);
});
