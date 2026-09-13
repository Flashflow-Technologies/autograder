import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';

import { swaggerSpec } from './config/swagger.js';
import { morganStream } from './utils/logger.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { requestContext } from './middleware/requestContext.js';

import authRoutes from './routes/authRoutes.js';
import examRoutes from './routes/examRoutes.js';
import submissionRoutes from './routes/submissionRoutes.js';
import evaluationRoutes from './routes/evaluationRoutes.js';
import licenseRoutes from './routes/licenseRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import clientLogRoutes from './routes/clientLogRoutes.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
  app.use(express.json({ limit: '2mb' }));
  app.use(requestContext); // assign x-request-id, log request lifecycle
  app.use(morgan('combined', { stream: morganStream })); // HTTP logs -> winston

  // Basic rate limit on the API surface
  app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false }));

  app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

  // Swagger UI + raw spec
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { customSiteTitle: 'Exam Eval API' }));
  app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));

  // Mount routes
  app.use('/api/auth', authRoutes);
  app.use('/api', clientLogRoutes); // /client-logs
  app.use('/api', examRoutes); // /courses, /exams
  app.use('/api/submissions', submissionRoutes);
  app.use('/api', evaluationRoutes); // /scoring, /review, /attainment, /results
  app.use('/api', licenseRoutes); // /license/status, /license/install
  app.use('/api', adminRoutes); // /admin/users, /admin/audit

  // 404 + central error handler (must be last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
