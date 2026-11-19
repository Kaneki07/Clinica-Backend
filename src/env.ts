import 'dotenv/config';

function required(name: string, fallback: string): string {
  const value = process.env[name]?.trim() || fallback;
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}.`);
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const jwtSecret = required(
  'JWT_SECRET',
  'dev-secret-change-me-in-production',
);

if (nodeEnv === 'production' && jwtSecret === 'dev-secret-change-me-in-production') {
  throw new Error(
    'JWT_SECRET debe configurarse con un valor seguro en producción.',
  );
}

const sameSite = (process.env.COOKIE_SAME_SITE ?? 'lax') as
  | 'lax'
  | 'strict'
  | 'none';

export const env = {
  NODE_ENV: nodeEnv,
  isProduction: nodeEnv === 'production',
  HOST: process.env.HOST ?? '0.0.0.0',
  PORT: Number(process.env.PORT ?? 4000),
  DATABASE_URL: required('DATABASE_URL', ''),
  JWT_SECRET: jwtSecret,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '8h',
  COOKIE_NAME: process.env.COOKIE_NAME ?? 'clinica_token',
  COOKIE_SECURE:
    process.env.COOKIE_SECURE === 'true' ||
    (nodeEnv === 'production' && sameSite === 'none'),
  COOKIE_SAME_SITE: sameSite,
  COOKIE_MAX_AGE_SECONDS: Number(process.env.COOKIE_MAX_AGE_SECONDS ?? 28_800),
  CORS_ORIGIN: (process.env.CORS_ORIGIN ?? 'http://localhost:4321')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
} as const;

export type Env = typeof env;
