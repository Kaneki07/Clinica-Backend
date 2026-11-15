import type { User } from '@prisma/client';
import type { preHandlerHookHandler } from 'fastify';
import '@fastify/jwt';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; role: string };
    user: { sub: string; role: string };
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    currentUser: User;
  }

  interface FastifyInstance {
    authenticate: preHandlerHookHandler;
    requireRoles: (...roles: string[]) => preHandlerHookHandler;
  }
}
