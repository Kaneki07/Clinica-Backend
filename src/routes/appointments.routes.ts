import type { FastifyInstance } from 'fastify';
import type { AppointmentStatus } from '../lib/constants.js';
import {
  isAppointmentStatus,
  STATUS_TRANSITIONS,
} from '../lib/constants.js';
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
} from '../lib/http-errors.js';
import { prisma } from '../lib/prisma.js';
import { toAppointmentDto } from '../lib/serializers.js';
import { isTime, parseDateOnly } from '../lib/validation.js';

interface ListQuery {
  date?: string;
  doctorId?: string;
  status?: string;
}

interface CreateAppointmentBody {
  patientId: string;
  doctorId: string;
  date: string;
  time: string;
  note?: string;
  specialty?: string;
  createdBy?: string;
}

interface UpdateStatusBody {
  status: AppointmentStatus;
}

interface OrderBody {
  direction: 'up' | 'down';
}

const listSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      doctorId: { type: 'string' },
      status: {
        type: 'string',
        enum: [
          'pendiente',
          'confirmada',
          'en_sala',
          'atendida',
          'cancelada',
          'no_asistio',
        ],
      },
    },
  },
} as const;

const createSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['patientId', 'doctorId', 'date', 'time'],
    properties: {
      patientId: { type: 'string' },
      doctorId: { type: 'string' },
      date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      time: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
      note: { type: 'string', maxLength: 500 },
      specialty: { type: 'string', maxLength: 80 },
      createdBy: { type: 'string' },
    },
  },
} as const;

const statusSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['status'],
    properties: {
      status: {
        type: 'string',
        enum: [
          'pendiente',
          'confirmada',
          'en_sala',
          'atendida',
          'cancelada',
          'no_asistio',
        ],
      },
    },
  },
} as const;

const orderSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['direction'],
    properties: {
      direction: { type: 'string', enum: ['up', 'down'] },
    },
  },
} as const;

export async function appointmentsRoutes(app: FastifyInstance) {
  app.get<{ Querystring: ListQuery }>(
    '/appointments',
    {
      preHandler: [app.authenticate],
      schema: listSchema,
    },
    async (request) => {
      const { date, doctorId, status } = request.query;

      const appointments = await prisma.appointment.findMany({
        where: {
          ...(date ? { date: parseDateOnly(date) } : {}),
          ...(doctorId ? { doctorId } : {}),
          ...(status && isAppointmentStatus(status) ? { status } : {}),
        },
        orderBy: [{ date: 'asc' }, { time: 'asc' }, { order: 'asc' }],
      });

      return appointments.map(toAppointmentDto);
    },
  );

  app.post<{ Body: CreateAppointmentBody }>(
    '/appointments',
    {
      preHandler: [app.authenticate, app.requireRoles('admin')],
      schema: createSchema,
    },
    async (request, reply) => {
      const body = request.body;

      if (!isTime(body.time)) {
        throw badRequest('La hora debe tener el formato HH:mm.');
      }

      const date = parseDateOnly(body.date);
      const patient = await prisma.patient.findUnique({
        where: { id: body.patientId },
      });

      if (!patient) {
        throw notFound('El paciente indicado no existe.');
      }

      const doctor = await prisma.user.findUnique({
        where: { id: body.doctorId },
      });

      if (!doctor || doctor.role !== 'doctor') {
        throw notFound('El doctor indicado no existe.');
      }

      if (!doctor.active) {
        throw badRequest('El doctor seleccionado no está activo.');
      }

      const duplicate = await prisma.appointment.findFirst({
        where: {
          doctorId: doctor.id,
          date,
          time: body.time,
          status: { notIn: ['cancelada', 'no_asistio'] },
        },
      });

      if (duplicate) {
        throw conflict(
          'El doctor ya tiene una cita activa en esa fecha y hora.',
        );
      }

      const aggregate = await prisma.appointment.aggregate({
        where: { doctorId: doctor.id, date },
        _max: { order: true },
      });

      const appointment = await prisma.appointment.create({
        data: {
          patientId: patient.id,
          doctorId: doctor.id,
          specialty:
            body.specialty?.trim() ||
            doctor.specialty ||
            'Medicina General',
          date,
          time: body.time,
          note: body.note?.trim() || undefined,
          status: 'pendiente',
          order: (aggregate._max.order ?? 0) + 1,
          createdBy: request.currentUser.id,
        },
      });

      return reply.code(201).send(toAppointmentDto(appointment));
    },
  );

  app.patch<{ Params: { id: string }; Body: UpdateStatusBody }>(
    '/appointments/:id',
    {
      preHandler: [app.authenticate],
      schema: statusSchema,
    },
    async (request, reply) => {
      const appointment = await prisma.appointment.findUnique({
        where: { id: request.params.id },
      });

      if (!appointment) {
        throw notFound('La cita indicada no existe.');
      }

      const nextStatus = request.body.status;
      const currentStatus = appointment.status as AppointmentStatus;
      const role = request.currentUser.role;

      if (role === 'doctor') {
        if (!['en_sala', 'atendida'].includes(nextStatus)) {
          throw forbidden(
            'El doctor solo puede pasar al paciente a sala o marcarlo como atendido.',
          );
        }
      }

      if (role === 'recepcion') {
        if (
          ![
            'confirmada',
            'en_sala',
            'atendida',
            'cancelada',
            'no_asistio',
          ].includes(nextStatus)
        ) {
          throw forbidden(
            'Recepción no puede asignar ese estado a la cita.',
          );
        }
      }

      if (!['admin', 'doctor', 'recepcion'].includes(role)) {
        throw forbidden();
      }

      if (!STATUS_TRANSITIONS[currentStatus]?.includes(nextStatus)) {
        throw badRequest(
          `No se puede cambiar una cita de "${currentStatus}" a "${nextStatus}".`,
        );
      }

      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { status: nextStatus },
      });

      return reply.code(204).send();
    },
  );

  app.patch<{ Params: { id: string }; Body: OrderBody }>(
    '/appointments/:id/order',
    {
      preHandler: [
        app.authenticate,
        app.requireRoles('admin', 'doctor'),
      ],
      schema: orderSchema,
    },
    async (request, reply) => {
      const appointment = await prisma.appointment.findUnique({
        where: { id: request.params.id },
      });

      if (!appointment) {
        throw notFound('La cita indicada no existe.');
      }

      const queue = await prisma.appointment.findMany({
        where: {
          doctorId: appointment.doctorId,
          date: appointment.date,
        },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      });

      const index = queue.findIndex((item) => item.id === appointment.id);
      const neighborIndex =
        request.body.direction === 'up' ? index - 1 : index + 1;
      const neighbor = queue[neighborIndex];

      if (index === -1 || !neighbor) {
        return reply.code(204).send();
      }

      await prisma.$transaction([
        prisma.appointment.update({
          where: { id: appointment.id },
          data: { order: neighbor.order },
        }),
        prisma.appointment.update({
          where: { id: neighbor.id },
          data: { order: appointment.order },
        }),
      ]);

      return reply.code(204).send();
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/appointments/:id',
    { preHandler: [app.authenticate, app.requireRoles('admin')] },
    async (request, reply) => {
      const appointment = await prisma.appointment.findUnique({
        where: { id: request.params.id },
      });

      if (!appointment) {
        throw notFound('La cita indicada no existe.');
      }

      await prisma.appointment.delete({ where: { id: appointment.id } });
      return reply.code(204).send();
    },
  );
}
