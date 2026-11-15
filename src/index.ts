import { buildApp } from './app.js';
import { env } from './env.js';
import { prisma } from './lib/prisma.js';

const app = await buildApp();

async function shutdown(signal: string) {
  app.log.info(`${signal} recibido. Cerrando servidor...`);
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

try {
  await app.listen({ host: env.HOST, port: env.PORT });
  app.log.info(
    `API disponible en http://localhost:${env.PORT}/api (entorno: ${env.NODE_ENV})`,
  );
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
