import type {
  Appointment,
  DoctorStatus,
  Notification,
  Patient,
  User,
} from '@prisma/client';

export interface UserDto {
  id: string;
  ci: string;
  name: string;
  lastName: string;
  email: string;
  role: string;
  specialty?: string;
  area?: string;
  phone?: string;
  active: boolean;
  createdAt: string;
}

export function toUserDto(user: User): UserDto {
  const { passwordHash: _passwordHash, ...rest } = user;
  return {
    ...rest,
    specialty: rest.specialty ?? undefined,
    area: rest.area ?? undefined,
    phone: rest.phone ?? undefined,
    createdAt: rest.createdAt.toISOString(),
  };
}

export function toPatientDto(patient: Patient) {
  return {
    ...patient,
    birthDate: patient.birthDate
      ? patient.birthDate.toISOString().slice(0, 10)
      : null,
    guardianName: patient.guardianName ?? undefined,
    guardianCi: patient.guardianCi ?? undefined,
    phone: patient.phone ?? undefined,
    createdAt: patient.createdAt.toISOString(),
  };
}

export function toAppointmentDto(appointment: Appointment) {
  return {
    ...appointment,
    date: appointment.date.toISOString().slice(0, 10),
    note: appointment.note ?? undefined,
    createdAt: appointment.createdAt.toISOString(),
    updatedAt: appointment.updatedAt.toISOString(),
  };
}

export function toNotificationDto(notification: Notification) {
  return {
    ...notification,
    appointmentId: notification.appointmentId ?? undefined,
    createdAt: notification.createdAt.toISOString(),
  };
}

export function toDoctorStatusDto(status: DoctorStatus) {
  return {
    ...status,
    updatedAt: status.updatedAt.toISOString(),
  };
}
