import type { FastifyInstance } from 'fastify';
import type { NotificationType } from '../lib/constants.js';
import {
  badRequest,
  forbidden,
  notFound,
} from '../lib/http-errors.js';
import { prisma } from '../lib/prisma.js';
import { toNotificationDto } from '../lib/serializers.js';

interface CreateNotificationBody {
  doctorId?: string;
  appointmentId?: string;
  message: string;
  type?: NotificationType;
}

interface UpdateNotificationBody {
  read?: boolean;
}

const createSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['message'],
    properties: {
      doctorId: { type: 'string' },
      appointmentId: { type: 'string' },
      message: { type: 'string', minLength: 1, maxLength: 500 },
      type: {
        type: 'string',
        enum: ['asistencia', 'cambio_orden', 'general'],
      },
    },
  },
} as const;

const updateSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      read: { type: 'boolean' },
    },
  },
} as const;

export async function notificationsRoutes(app: FastifyInstance) {
  app.get(
    '/notifications',
    { preHandler: [app.authenticate] },
    async (request) => {
      const notifications = await prisma.notification.findMany({
        where:
          request.currentUser.role === 'doctor'
            ? { doctorId: request.currentUser.id }
            : {},
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      return notifications.map(toNotificationDto);
    },
  );

  app.post<{ Body: CreateNotificationBody }>(
    '/notifications',
    {
      preHandler: [
        app.authenticate,
        app.requireRoles('admin', 'doctor'),
      ],
      schema: createSchema,
    },
    async (request, reply) => {
      const body = request.body;
      const doctorId =
        request.currentUser.role === 'doctor'
          ? request.currentUser.id
          : body.doctorId;

      if (!doctorId) {
        throw badRequest('Debes indicar el doctor que envía la notificación.');
      }

      const doctor = await prisma.user.findUnique({ where: { id: doctorId } });
      if (!doctor || doctor.role !== 'doctor' || !doctor.active) {
        throw badRequest('El doctor indicado no es válido o está inactivo.');
      }

      if (body.appointmentId) {
        const appointment = await prisma.appointment.findUnique({
          where: { id: body.appointmentId },
        });

        if (!appointment) {
          throw notFound('La cita indicada no existe.');
        }

        if (appointment.doctorId !== doctorId) {
          throw badRequest('La cita no pertenece al doctor indicado.');
        }
      }

      const notification = await prisma.notification.create({
        data: {
          doctorId,
          appointmentId: body.appointmentId,
          message: body.message.trim(),
          type: body.type ?? 'general',
        },
      });

      return reply.code(201).send(toNotificationDto(notification));
    },
  );

  app.patch(
    '/notifications/read-all',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      await prisma.notification.updateMany({
        where: {
          read: false,
          ...(request.currentUser.role === 'doctor'
            ? { doctorId: request.currentUser.id }
            : {}),
        },
        data: { read: true },
      });

      return reply.code(204).send();
    },
  );

  app.patch<{
    Params: { id: string };
    Body: UpdateNotificationBody;
  }>(
    '/notifications/:id',
    {
      preHandler: [app.authenticate],
      schema: updateSchema,
    },
    async (request, reply) => {
      const notification = await prisma.notification.findUnique({
        where: { id: request.params.id },
      });

      if (!notification) {
        throw notFound('La notificación indicada no existe.');
      }

      if (
        request.currentUser.role === 'doctor' &&
        notification.doctorId !== request.currentUser.id
      ) {
        throw forbidden('No puedes modificar notificaciones de otro doctor.');
      }

      await prisma.notification.update({
        where: { id: notification.id },
        data: { read: request.body.read ?? true },
      });

      return reply.code(204).send();
    },
  );
}
