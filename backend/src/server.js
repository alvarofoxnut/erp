import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import connectDB, { disconnectDB } from './config/db.js';
import { validateEnv } from './config/validateEnv.js';
import errorHandler from './shared/middleware/errorHandler.js';
import { correlationId } from './shared/middleware/correlationId.js';
import logger from './shared/utils/logger.js';

import authRoutes from './modules/auth/auth.routes.js';
import userRoutes from './modules/users/user.routes.js';
import manufacturingRoutes from './modules/manufacturing/manufacturing.routes.js';
import tradingRoutes from './modules/trading/trading.routes.js';
import inventoryRoutes from './modules/inventory/inventory.routes.js';
import accountingRoutes from './modules/accounting/accounting.routes.js';
import reportsRoutes from './modules/reports/reports.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';
import damagesRoutes from './modules/damages/damages.routes.js';
import roleRoutes from './modules/roles/role.routes.js';
import auditRoutes from './modules/audit/audit.routes.js';
import importRoutes from './modules/import/import.routes.js';
import deletedRoutes from './modules/deleted/deletedRecords.routes.js';
import { seedDefaultRoles } from './config/seedRoles.js';
import { corsOriginDelegate } from './shared/utils/corsOrigins.js';

dotenv.config();
validateEnv();

const app = express();
app.disable('x-powered-by');

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

connectDB().then(async () => {
  await seedDefaultRoles();
}).catch((err) => logger.error(err.message));

app.use(correlationId);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  hsts: process.env.NODE_ENV === 'production'
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false,
  frameguard: { action: 'deny' },
}));
app.use(cors({
  origin: corsOriginDelegate,
  credentials: true,
}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.originalUrl.includes('/auth/login') || req.originalUrl.includes('/auth/refresh'),
  message: { success: false, message: 'Too many requests' },
});
app.use('/api', limiter);

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Makhana ERP API is running' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/manufacturing', manufacturingRoutes);
app.use('/api/trading', tradingRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/accounting', accountingRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/damages', damagesRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/import', importRoutes);
app.use('/api/deleted', deletedRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`Port ${PORT} is already in use. Stop the other process or set a different PORT in .env`);
    process.exit(1);
  }
  throw err;
});

const shutdown = async (signal) => {
  logger.info(`${signal} received — shutting down`);
  server.close(async () => {
    await disconnectDB();
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;
