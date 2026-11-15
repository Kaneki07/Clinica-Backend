import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { env } from '../env.js';
import { prisma } from '../lib/prisma.js';
import { toUserDto } from '../lib/serializers.js';
import { normalizeEmail } from '../lib/validation.js';

interface LoginBody {
  email: string;
  password: string;
}

const loginSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', minLength: 3, maxLength: 120 },
      password: { type: 'string', minLength: 1, maxLength: 200 },
    },
  },
} as const;

export async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: LoginBody }>(
    '/auth/login',
    {
      schema: loginSchema,
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const email = normalizeEmail(request.body.email);
      const user = await prisma.user.findUnique({ where: { email } });

      if (!user || !user.active) {
        return reply
          .code(401)
          .send({ message: 'Correo o contraseña incorrectos.' });
      }

      const passwordMatches = await bcrypt.compare(
        request.body.password,
        user.passwordHash,
      );

      if (!passwordMatches) {
        return reply
          .code(401)
          .send({ message: 'Correo o contraseña incorrectos.' });
      }

      const token = await reply.jwtSign(
        { sub: user.id, role: user.role },
        { expiresIn: env.JWT_EXPIRES_IN },
      );

      reply.setCookie(env.COOKIE_NAME, token, {
        httpOnly: true,
        secure: env.COOKIE_SECURE,
        sameSite: env.COOKIE_SAME_SITE,
        path: '/',
        maxAge: env.COOKIE_MAX_AGE_SECONDS,
      });

      return {
        user: toUserDto(user),
        token,
      };
    },
  );

  app.post('/auth/logout', async (_request, reply) => {
    reply.clearCookie(env.COOKIE_NAME, { path: '/' });
    return reply.code(204).send();
  });

  app.get(
    '/auth/me',
    { preHandler: [app.authenticate] },
    async (request) => ({
      user: toUserDto(request.currentUser),
    }),
  );
}
