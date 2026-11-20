import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@clinica.hidalgo')
  .trim()
  .toLowerCase();
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin1234!';
const adminName = process.env.SEED_ADMIN_NAME ?? 'Lucía';
const adminLastName = process.env.SEED_ADMIN_LASTNAME ?? 'Herrera';
const adminCi = process.env.SEED_ADMIN_CI ?? '12345678';
const forceUpdate = process.env.SEED_ADMIN_FORCE_UPDATE === 'true';

async function main() {
  const existing = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existing && !forceUpdate) {
    console.log(`La cuenta administrativa ya existe: ${existing.email}`);
    return;
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12);
  const data = {
    ci: adminCi,
    name: adminName,
    lastName: adminLastName,
    passwordHash,
    role: 'admin',
    area: 'Historias Médicas',
    active: true,
  };

  const admin = existing
    ? await prisma.user.update({ where: { email: adminEmail }, data })
    : await prisma.user.create({ data: { ...data, email: adminEmail } });

  console.log(
    `Cuenta administrativa ${existing ? 'actualizada' : 'creada'}: ${admin.email} (${admin.id})`,
  );
  console.log(
    'La contraseña se configura con SEED_ADMIN_PASSWORD. Para forzar el cambio en un admin existente, usa SEED_ADMIN_FORCE_UPDATE=true.',
  );
}

main()
  .catch((error) => {
    console.error('Error ejecutando el seed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
