export const ROLES = ['admin', 'doctor', 'recepcion'] as const;
export type Role = (typeof ROLES)[number];

export const CREATABLE_ROLES = ['doctor', 'recepcion'] as const;
export type CreatableRole = (typeof CREATABLE_ROLES)[number];

export const APPOINTMENT_STATUSES = [
  'pendiente',
  'confirmada',
  'en_sala',
  'atendida',
  'cancelada',
  'no_asistio',
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const NOTIFICATION_TYPES = [
  'asistencia',
  'cambio_orden',
  'general',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const DOCTOR_AVAILABILITIES = [
  'disponible',
  'en_consulta',
  'ausente',
] as const;
export type DoctorAvailability = (typeof DOCTOR_AVAILABILITIES)[number];

export const ACTIVE_APPOINTMENT_STATUSES: AppointmentStatus[] = [
  'pendiente',
  'confirmada',
  'en_sala',
];

/**
 * Transiciones permitidas para mantener la coherencia de la agenda.
 */
export const STATUS_TRANSITIONS: Record<
  AppointmentStatus,
  AppointmentStatus[]
> = {
  pendiente: ['confirmada', 'cancelada', 'no_asistio'],
  confirmada: ['en_sala', 'cancelada', 'no_asistio'],
  en_sala: ['atendida', 'cancelada', 'no_asistio'],
  atendida: [],
  cancelada: [],
  no_asistio: [],
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Historias Médicas',
  doctor: 'Doctor',
  recepcion: 'Recepción',
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function isAppointmentStatus(
  value: unknown,
): value is AppointmentStatus {
  return (
    typeof value === 'string' &&
    (APPOINTMENT_STATUSES as readonly string[]).includes(value)
  );
}

export function isNotificationType(
  value: unknown,
): value is NotificationType {
  return (
    typeof value === 'string' &&
    (NOTIFICATION_TYPES as readonly string[]).includes(value)
  );
}

export function isDoctorAvailability(
  value: unknown,
): value is DoctorAvailability {
  return (
    typeof value === 'string' &&
    (DOCTOR_AVAILABILITIES as readonly string[]).includes(value)
  );
}
