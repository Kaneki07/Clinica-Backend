import type { FastifyInstance } from 'fastify';
import type { DoctorAvailability } from '../lib/constants.js';
import { badRequest, forbidden, notFound } from '../lib/http-errors.js';
import { prisma } from '../lib/prisma.js';
import {
  toDoctorStatusDto,
  toUserDto,
} from '../lib/serializers.js';

interface StatusBody {
  status: DoctorAvailability;
}

const statusSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['status'],
    properties: {
      status: {
        type: 'string',
        enum: ['disponible', 'en_consulta', 'ausente'],
      },
    },
  },
} as const;

export async function doctorsRoutes(app: FastifyInstance) {
  app.get(
    '/doctors',
    { preHandler: [app.authenticate] },
    async () => {
      const doctors = await prisma.user.findMany({
        where: { role: 'doctor', active: true },
        orderBy: [{ lastName: 'asc' }, { name: 'asc' }],
      });
      return doctors.map(toUserDto);
    },
  );

  app.get(
    '/doctors/status',
    { preHandler: [app.authenticate] },
    async () => {
      const statuses = await prisma.doctorStatus.findMany({
        orderBy: { updatedAt: 'desc' },
      });
      return statuses.map(toDoctorStatusDto);
    },
  );

  app.patch<{ Params: { id: string }; Body: StatusBody }>(
    '/doctors/:id/status',
    {
      preHandler: [app.authenticate],
      schema: statusSchema,
    },
    async (request, reply) => {
      const { id } = request.params;
      const doctor = await prisma.user.findUnique({ where: { id } });

      if (!doctor || doctor.role !== 'doctor') {
        throw notFound('El doctor indicado no existe.');
      }

      if (!doctor.active) {
        throw badRequest('El doctor no se encuentra activo.');
      }

      if (
        request.currentUser.role === 'doctor' &&
        request.currentUser.id !== id
      ) {
        throw forbidden('Solo puedes cambiar tu propia disponibilidad.');
      }

      await prisma.doctorStatus.upsert({
        where: { doctorId: id },
        update: { status: request.body.status },
        create: { doctorId: id, status: request.body.status },
      });

      return reply.code(204).send();
    },
  );
}
