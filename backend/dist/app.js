import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { apiRouter } from './routes/index.js';
import { getStorageInfo } from './data/index.js';
export function createApp() {
    const app = express();
    app.use(helmet());
    app.use(cors());
    app.use(express.json({ limit: '2mb' }));
    app.use((request, _response, next) => {
        console.log(`${request.method} ${request.originalUrl}`);
        next();
    });
    app.get('/', (_request, response) => {
        response.json({
            name: 'Super M2 API',
            version: '0.1.0',
            message: 'Backend scaffold is ready for auth, products, inventory, and sales modules.',
            storage: getStorageInfo(),
        });
    });
    app.use('/api', apiRouter);
    return app;
}
