import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import type { CreatableRole } from '../lib/constants.js';
import { badRequest, conflict, notFound } from '../lib/http-errors.js';
import { prisma } from '../lib/prisma.js';
import { toUserDto } from '../lib/serializers.js';
import { normalizeEmail } from '../lib/validation.js';

interface CreateUserBody {
  ci: string;
  name: string;
  lastName: string;
  email: string;
  role: CreatableRole;
  specialty?: string;
  area?: string;
  phone?: string;
  password: string;
}

interface UpdateUserBody {
  active: boolean;
}

const createUserSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['ci', 'name', 'lastName', 'email', 'role', 'password'],
    properties: {
      ci: { type: 'string', minLength: 3, maxLength: 30 },
      name: { type: 'string', minLength: 1, maxLength: 80 },
      lastName: { type: 'string', minLength: 1, maxLength: 80 },
      email: { type: 'string', minLength: 5, maxLength: 120 },
      role: { type: 'string', enum: ['doctor', 'recepcion'] },
      specialty: { type: 'string', maxLength: 80 },
      area: { type: 'string', maxLength: 80 },
      phone: { type: 'string', maxLength: 30 },
      password: { type: 'string', minLength: 8, maxLength: 200 },
    },
  },
} as const;

const updateUserSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['active'],
    properties: {
      active: { type: 'boolean' },
    },
  },
} as const;

export async function usersRoutes(app: FastifyInstance) {
  app.get(
    '/users',
    { preHandler: [app.authenticate, app.requireRoles('admin')] },
    async () => {
      const users = await prisma.user.findMany({
        orderBy: [{ role: 'asc' }, { name: 'asc' }],
      });
      return users.map(toUserDto);
    },
  );

  app.post<{ Body: CreateUserBody }>(
    '/users',
    {
      preHandler: [app.authenticate, app.requireRoles('admin')],
      schema: createUserSchema,
    },
    async (request, reply) => {
      const body = request.body;
      const email = normalizeEmail(body.email);
      const ci = body.ci.trim();

      if (body.role === 'doctor' && !body.specialty?.trim()) {
        throw badRequest('La especialidad es obligatoria para un doctor.');
      }

      const existing = await prisma.user.findFirst({
        where: {
          OR: [{ email }, { ci }],
        },
      });

      if (existing) {
        throw conflict(
          existing.email === email
            ? 'Ya existe una cuenta con ese correo.'
            : 'Ya existe una cuenta con esa cédula.',
        );
      }

      const passwordHash = await bcrypt.hash(body.password, 12);

      const user = await prisma.user.create({
        data: {
          ci,
          name: body.name.trim(),
          lastName: body.lastName.trim(),
          email,
          passwordHash,
          role: body.role,
          specialty:
            body.role === 'doctor' ? body.specialty?.trim() : undefined,
          area:
            body.role === 'recepcion'
              ? body.area?.trim() || 'Recepción'
              : undefined,
          phone: body.phone?.trim() || undefined,
          active: true,
        },
      });

      return reply.code(201).send(toUserDto(user));
    },
  );

  app.patch<{ Params: { id: string }; Body: UpdateUserBody }>(
    '/users/:id',
    {
      preHandler: [app.authenticate, app.requireRoles('admin')],
      schema: updateUserSchema,
    },
    async (request, reply) => {
      const { id } = request.params;

      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) {
        throw notFound('La cuenta indicada no existe.');
      }

      if (user.role === 'admin') {
        throw badRequest(
          'Las cuentas administrativas no se pueden desactivar desde este panel.',
        );
      }

      if (user.id === request.currentUser.id) {
        throw badRequest('No puedes desactivar tu propia cuenta.');
      }

      await prisma.user.update({
        where: { id },
        data: { active: request.body.active },
      });

      return reply.code(204).send();
    },
  );
}
