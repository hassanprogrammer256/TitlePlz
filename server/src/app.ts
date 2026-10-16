import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { config } from './config/env.js';
import { logger } from './lib/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { attachUser } from './middleware/auth.js';
import { requestId } from './middleware/requestId.js';
import { createAuthRouter } from './routes/auth.js';
import { analyticsRouter } from './routes/analytics.js';
import { createCreditsRouter } from './routes/credits.js';
import { dropsRouter } from './routes/drops.js';
import { leaderboardRouter } from './routes/leaderboard.js';
import { playRouter } from './routes/play.js';
import { scoutsRouter } from './routes/scouts.js';
import { uploadsRouter } from './routes/uploads.js';
import { systemRouter } from './routes/system.js';
import { usersRouter } from './routes/users.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  if (config.TRUST_PROXY > 0) app.set('trust proxy', config.TRUST_PROXY);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => req.id ?? '',
      // health probes would drown the logs
      autoLogging: { ignore: (req) => req.url === '/api/healthz' },
    }),
  );
  app.use(helmet());
  app.use(cors({ origin: config.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // Local-disk media (dev). In production with STORAGE_DRIVER=s3 files are served by the bucket/CDN instead.
  if (config.STORAGE_DRIVER === 'local') {
    app.use(
      '/media',
      (_req, res, next) => {
        // helmet defaults to same-origin; media must load from the separately hosted client too.
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        next();
      },
      express.static(path.resolve(config.LOCAL_MEDIA_DIR), { index: false, dotfiles: 'deny', immutable: true, maxAge: '365d' }),
    );
  }

  app.use('/api', apiLimiter);
  app.use('/api', systemRouter);

  // Everything below may use req.user.
  app.use('/api', attachUser);
  app.use('/api', createAuthRouter({ devTools: config.isDev }));
  app.use('/api', usersRouter);
  app.use('/api', uploadsRouter);
  app.use('/api', dropsRouter);
  app.use('/api', playRouter);
  app.use('/api', leaderboardRouter);
  app.use('/api', scoutsRouter);
  app.use('/api', analyticsRouter);
  app.use('/api', createCreditsRouter({ allowFakePurchases: config.allowFakePurchases }));
  // Further routers (drops, credits, ...) are mounted here as phases land.

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}
