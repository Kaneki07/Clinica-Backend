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

async function main() {
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      ci: adminCi,
      name: adminName,
      lastName: adminLastName,
      passwordHash,
      role: 'admin',
      area: 'Historias Médicas',
      active: true,
    },
    create: {
      ci: adminCi,
      name: adminName,
      lastName: adminLastName,
      email: adminEmail,
      passwordHash,
      role: 'admin',
      area: 'Historias Médicas',
      active: true,
    },
  });

  console.log(`Cuenta administrativa lista: ${admin.email} (${admin.id})`);
  console.log(
    'La contraseña inicial se configura con SEED_ADMIN_PASSWORD en el archivo .env.',
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
