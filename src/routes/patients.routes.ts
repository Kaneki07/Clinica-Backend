import type { FastifyInstance } from 'fastify';
import { badRequest, conflict, notFound } from '../lib/http-errors.js';
import { prisma } from '../lib/prisma.js';
import { toPatientDto } from '../lib/serializers.js';
import { ageFromDate, parseDateOnly } from '../lib/validation.js';

interface CreatePatientBody {
  ci?: string;
  name: string;
  lastName: string;
  birthDate?: string;
  area: string;
  phone?: string;
  isMinor?: boolean;
  guardianName?: string;
  guardianCi?: string;
}

const createPatientSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'lastName', 'area'],
    properties: {
      ci: { type: 'string', maxLength: 30 },
      name: { type: 'string', minLength: 1, maxLength: 80 },
      lastName: { type: 'string', minLength: 1, maxLength: 80 },
      birthDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      area: { type: 'string', minLength: 1, maxLength: 80 },
      phone: { type: 'string', maxLength: 30 },
      isMinor: { type: 'boolean' },
      guardianName: { type: 'string', maxLength: 120 },
      guardianCi: { type: 'string', maxLength: 30 },
    },
  },
} as const;

export async function patientsRoutes(app: FastifyInstance) {
  app.get(
    '/patients',
    { preHandler: [app.authenticate] },
    async () => {
      const patients = await prisma.patient.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return patients.map(toPatientDto);
    },
  );

  app.post<{ Body: CreatePatientBody }>(
    '/patients',
    {
      preHandler: [
        app.authenticate,
        app.requireRoles('admin', 'recepcion'),
      ],
      schema: createPatientSchema,
    },
    async (request, reply) => {
      const body = request.body;
      const ci = body.ci?.trim() || null;
      const birthDate = body.birthDate
        ? parseDateOnly(body.birthDate)
        : null;
      const isMinor =
        body.isMinor ??
        (birthDate ? ageFromDate(birthDate) < 18 : false);

      if (isMinor && !body.guardianName?.trim()) {
        throw badRequest(
          'Debes indicar el nombre del representante para un menor de edad.',
        );
      }

      if (ci) {
        const existing = await prisma.patient.findUnique({ where: { ci } });
        if (existing) {
          throw conflict('Ya existe un paciente con esa cédula.');
        }
      }

      const patient = await prisma.patient.create({
        data: {
          ci,
          name: body.name.trim(),
          lastName: body.lastName.trim(),
          birthDate,
          area: body.area.trim(),
          phone: body.phone?.trim() || undefined,
          isMinor,
          guardianName: isMinor
            ? body.guardianName?.trim() || undefined
            : undefined,
          guardianCi: isMinor
            ? body.guardianCi?.trim() || undefined
            : undefined,
        },
      });

      return reply.code(201).send(toPatientDto(patient));
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/patients/:id',
    { preHandler: [app.authenticate, app.requireRoles('admin')] },
    async (request, reply) => {
      const patient = await prisma.patient.findUnique({
        where: { id: request.params.id },
      });

      if (!patient) {
        throw notFound('El paciente indicado no existe.');
      }

      await prisma.patient.delete({ where: { id: patient.id } });
      return reply.code(204).send();
    },
  );
}
