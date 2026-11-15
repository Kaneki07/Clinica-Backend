import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { Prisma } from '@prisma/client';
import { env } from './env.js';
import { HttpError } from './lib/http-errors.js';
import { prisma } from './lib/prisma.js';
import { authRoutes } from './routes/auth.routes.js';
import { appointmentsRoutes } from './routes/appointments.routes.js';
import { doctorsRoutes } from './routes/doctors.routes.js';
import { notificationsRoutes } from './routes/notifications.routes.js';
import { patientsRoutes } from './routes/patients.routes.js';
import { usersRoutes } from './routes/users.routes.js';

export async function buildApp() {
  const app = Fastify({
    logger:
      env.NODE_ENV === 'development'
        ? {
            level: 'info',
            transport: {
              target: 'pino-pretty',
              options: {
                translateTime: 'HH:MM:ss',
                ignore: 'pid,hostname',
                colorize: true,
              },
            },
          }
        : { level: 'info' },
    trustProxy: true,
  });

  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
  });

  await app.register(cookie);
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
    cookie: {
      cookieName: env.COOKIE_NAME,
      signed: false,
    },
  });

  app.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      await reply.code(401).send({ message: 'Sesión no válida o expirada.' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: request.user.sub },
    });

    if (!user || !user.active) {
      await reply
        .code(401)
        .send({ message: 'La cuenta no existe o está desactivada.' });
      return;
    }

    request.currentUser = user;
  });

  app.decorate('requireRoles', (...roles: string[]) => {
    return async (request, reply) => {
      if (!request.currentUser) {
        await reply.code(401).send({ message: 'No autenticado.' });
        return;
      }

      if (!roles.includes(request.currentUser.role)) {
        await reply
          .code(403)
          .send({ message: 'No tienes permisos para esta acción.' });
      }
    };
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.validation) {
      return reply.code(400).send({
        message: 'Datos inválidos.',
        details: error.validation,
      });
    }

    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        const target = Array.isArray(error.meta?.target)
          ? error.meta.target.join(', ')
          : String(error.meta?.target ?? 'registro');
        return reply.code(409).send({
          message: `Ya existe un registro con ese valor único (${target}).`,
        });
      }

      if (error.code === 'P2025') {
        return reply.code(404).send({ message: 'Registro no encontrado.' });
      }
    }

    if (error.statusCode && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ message: error.message });
    }

    request.log.error(error);
    return reply.code(500).send({ message: 'Error interno del servidor.' });
  });

  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({
      message: `Ruta ${request.method} ${request.url} no encontrada.`,
    });
  });

  app.get('/', async () => ({
    name: 'Clínica Dr. Francisco Hidalgo API',
    version: '1.0.0',
    docs: '/api/health',
  }));

  app.get('/api/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  await app.register(authRoutes, { prefix: '/api' });
  await app.register(usersRoutes, { prefix: '/api' });
  await app.register(doctorsRoutes, { prefix: '/api' });
  await app.register(patientsRoutes, { prefix: '/api' });
  await app.register(appointmentsRoutes, { prefix: '/api' });
  await app.register(notificationsRoutes, { prefix: '/api' });

  return app;
}
