# Clínica Dr. Francisco Hidalgo — Backend

API REST para el sistema interno de gestión de citas médicas. Administra
cuentas por rol, pacientes, agenda, disponibilidad de doctores y notificaciones
entre doctores y recepción.

## Stack

- **Node.js 20+** y **TypeScript**.
- **Fastify 5** como servidor HTTP.
- **Prisma 6.19.3** (versión fijada para evitar conflictos de desarrollo).
- **SQLite** por defecto, sin necesidad de instalar un servidor de base de datos.
- **JWT** en cookie `httpOnly` con `@fastify/jwt`.
- **bcryptjs** para el hash de contraseñas.
- **CORS** con credenciales para el frontend en `http://localhost:4321`.
- **Helmet** y **rate limit** para endurecer la API.

## Inicio rápido

```bash
npm install
copy .env.example .env
npm run db:migrate
npm run db:seed
npm run dev
```

La API queda disponible en `http://localhost:4000/api` y el health check en
`http://localhost:4000/api/health`.

> En PowerShell se usa `copy`; en bash/macOS/Linux, `cp .env.example .env`.
>
> `npm run db:migrate` aplica las migraciones incluidas en el repositorio y
> ejecuta el seed automáticamente. Si prefieres hacerlo por separado, usa
> `npm run db:deploy` y luego `npm run db:seed`.

### Cuenta administrativa inicial

Se crea/actualiza con `npm run db:seed` usando las variables `SEED_ADMIN_*` del
archivo `.env`:

```text
Correo:     admin@clinica.hidalgo
Contraseña: Admin1234!
```

Cambia la contraseña y el secreto JWT antes de desplegar en producción.

## Scripts

| Comando               | Descripción                                       |
| --------------------- | ------------------------------------------------- |
| `npm run dev`         | Servidor en modo desarrollo con recarga (tsx).    |
| `npm run build`       | Compila TypeScript a `dist/`.                     |
| `npm start`           | Ejecuta el build compilado.                       |
| `npm run check`       | Verificación de tipos sin emitir archivos.        |
| `npm run db:migrate`  | Crea/aplica migraciones en desarrollo.            |
| `npm run db:deploy`   | Aplica migraciones existentes (producción).       |
| `npm run db:push`     | Sincroniza el esquema sin crear migración.        |
| `npm run db:seed`     | Crea/actualiza la cuenta administrativa inicial.  |
| `npm run db:studio`   | Abre Prisma Studio.                               |
| `npm run db:reset`    | Reinicia la base y vuelve a ejecutar el seed.     |

## Estructura

```text
Clinica-Backend/
├── prisma/
│   ├── schema.prisma       # Modelos User, Patient, Appointment...
│   ├── seed.ts             # Cuenta administrativa inicial
│   └── migrations/         # Migraciones SQLite versionadas
├── src/
│   ├── app.ts              # Plugins, CORS, JWT, manejador de errores
│   ├── index.ts            # Arranque y cierre ordenado
│   ├── env.ts              # Variables de entorno
│   ├── lib/
│   │   ├── constants.ts    # Roles, estados y transiciones
│   │   ├── http-errors.ts  # Errores HTTP reutilizables
│   │   ├── prisma.ts       # Cliente Prisma singleton
│   │   ├── serializers.ts  # DTOs sin passwordHash y fechas YYYY-MM-DD
│   │   └── validation.ts   # Fechas, horas y edad
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── users.routes.ts
│   │   ├── doctors.routes.ts
│   │   ├── patients.routes.ts
│   │   ├── appointments.routes.ts
│   │   └── notifications.routes.ts
│   └── types/fastify.d.ts  # Tipos de JWT y request.currentUser
└── docs/api.http           # Colección de peticiones de ejemplo
```

## Autenticación

1. `POST /api/auth/login` recibe `{ email, password }`.
2. Valida la contraseña con bcrypt y firma un JWT con `sub` y `role`.
3. Devuelve `{ user, token }` y establece la cookie `clinica_token`
   (`httpOnly`, `sameSite`, `secure` según `.env`).
4. El frontend usa `credentials: 'include'`; no necesita manipular el token.
5. `POST /api/auth/logout` limpia la cookie. Envía `{}` como cuerpo JSON.
6. `GET /api/auth/me` devuelve `{ user }` y valida que la cuenta siga activa.

Cada ruta protegida vuelve a consultar el usuario en la base de datos, por lo
que desactivar una cuenta invalida su acceso de inmediato.

## Roles y permisos

| Rol        | Capacidades                                                                 |
| ---------- | --------------------------------------------------------------------------- |
| `admin`    | Todo: cuentas, pacientes, citas, eliminación, notificaciones y estados.     |
| `doctor`   | Ver agenda/pacientes, ordenar su cola, disponibilidad propia, avisos.       |
| `recepcion`| Registrar pacientes, confirmar asistencia, pasar a sala, ver avisos.        |

- Solo `admin` crea cuentas y registra/elimina citas.
- Solo `admin` y `recepcion` registran pacientes.
- Un doctor solo cambia su propia disponibilidad.
- Las notificaciones de un doctor solo las ve él; recepción y admin ven todas.
- Las transiciones de estado están validadas:
  `pendiente → confirmada → en_sala → atendida`, con cancelación o
  `no_asistio` desde estados activos.

## Endpoints

Base: `/api`. Todas las respuestas son JSON salvo los `204 No Content`.

### Autenticación

| Método | Ruta             | Acceso        | Descripción                    |
| ------ | ---------------- | ------------- | ------------------------------ |
| POST   | `/auth/login`    | Público       | Inicia sesión y crea la cookie |
| POST   | `/auth/logout`   | Público       | Limpia la cookie               |
| GET    | `/auth/me`       | Autenticado   | Usuario de la sesión           |
| GET    | `/health`        | Público       | Estado del servicio            |

### Cuentas y doctores

| Método | Ruta                       | Acceso                  | Descripción                       |
| ------ | -------------------------- | ----------------------- | --------------------------------- |
| GET    | `/users`                   | Admin                   | Lista todas las cuentas           |
| POST   | `/users`                   | Admin                   | Crea doctor o recepción           |
| PATCH  | `/users/:id`               | Admin                   | Activa/desactiva una cuenta       |
| GET    | `/doctors`                 | Autenticado             | Lista doctores activos            |
| GET    | `/doctors/status`          | Autenticado             | Disponibilidad de doctores        |
| PATCH  | `/doctors/:id/status`      | Doctor propio / Admin / Recepción | Cambia disponibilidad    |

### Pacientes

| Método | Ruta              | Acceso            | Descripción                    |
| ------ | ----------------- | ----------------- | ------------------------------ |
| GET    | `/patients`       | Autenticado       | Lista pacientes                |
| POST   | `/patients`       | Admin / Recepción | Registra paciente              |
| DELETE | `/patients/:id`   | Admin             | Elimina paciente y sus citas   |

### Citas

| Método | Ruta                          | Acceso            | Descripción                          |
| ------ | ----------------------------- | ----------------- | ------------------------------------ |
| GET    | `/appointments`               | Autenticado       | Lista citas (filtros opcionales)     |
| POST   | `/appointments`               | Admin             | Registra una cita                    |
| PATCH  | `/appointments/:id`           | Autenticado       | Cambia el estado                     |
| PATCH  | `/appointments/:id/order`     | Admin / Doctor    | Sube o baja el turno                 |
| DELETE | `/appointments/:id`           | Admin             | Elimina la cita                      |

Filtros de `GET /appointments`: `?date=YYYY-MM-DD`, `?doctorId=...`,
`?status=pendiente|confirmada|en_sala|atendida|cancelada|no_asistio`.

### Notificaciones

| Método | Ruta                        | Acceso          | Descripción                          |
| ------ | --------------------------- | --------------- | ------------------------------------ |
| GET    | `/notifications`            | Autenticado     | Doctor: propias. Admin/Recepción: todas |
| POST   | `/notifications`            | Admin / Doctor  | Crea aviso para recepción            |
| PATCH  | `/notifications/read-all`   | Autenticado     | Marca todas como leídas              |
| PATCH  | `/notifications/:id`        | Autenticado     | Marca una como leída                 |

## Formatos de datos

- Fechas de agenda y nacimiento: `YYYY-MM-DD`.
- Hora de cita: `HH:mm` (24 horas).
- Fechas de creación/actualización: ISO 8601.
- `passwordHash` nunca se expone en las respuestas.
- Los campos opcionales vacíos se omiten o se devuelven como `null` según el
  modelo (`birthDate` usa `null`).

## CORS y cookies

El frontend de desarrollo corre en `http://localhost:4321`:

```env
CORS_ORIGIN="http://localhost:4321"
COOKIE_SECURE=false
COOKIE_SAME_SITE="lax"
```

Para varios orígenes:

```env
CORS_ORIGIN="http://localhost:4321,https://clinica.example.com"
```

En producción con HTTPS y frontend en otro dominio:

```env
COOKIE_SECURE=true
COOKIE_SAME_SITE="none"
```

`Access-Control-Allow-Credentials` se activa automáticamente; por eso el origen
no puede ser `*`.

## Base de datos

### SQLite (por defecto)

El archivo se crea en `prisma/dev.db` (ignorado por Git):

```env
DATABASE_URL="file:./dev.db"
```

### Cambiar a PostgreSQL

1. Instala/levanta PostgreSQL y crea la base de datos.
2. Cambia el provider en `prisma/schema.prisma`:

   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```

3. Configura `DATABASE_URL`:

   ```env
   DATABASE_URL="postgresql://usuario:clave@localhost:5432/clinica?schema=public"
   ```

4. Elimina las migraciones SQLite y genera las nuevas:

   ```bash
   rm -r prisma/migrations
   npx prisma migrate dev --name init_postgres
   npm run db:seed
   ```

Los campos de estado y rol son `String` con validación en la API, así que no
necesitas cambiar los modelos al migrar de motor.

## Pruebas rápidas

Con el servidor en marcha:

```bash
curl -i -c cookies.txt -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@clinica.hidalgo","password":"Admin1234!"}'

curl -b cookies.txt http://localhost:4000/api/auth/me
curl -b cookies.txt http://localhost:4000/api/patients
```

En PowerShell:

```powershell
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Invoke-RestMethod -Uri "http://localhost:4000/api/auth/login" -Method Post `
  -Body (@{ email = "admin@clinica.hidalgo"; password = "Admin1234!" } | ConvertTo-Json) `
  -ContentType "application/json" -WebSession $session

Invoke-RestMethod -Uri "http://localhost:4000/api/auth/me" -WebSession $session
```

También puedes usar `docs/api.http` desde VS Code (extensión REST Client) o
IntelliJ.

## Seguridad y despliegue

- Cambia `JWT_SECRET` y `SEED_ADMIN_PASSWORD` antes de publicar.
- Usa HTTPS y `COOKIE_SECURE=true` en producción.
- Ajusta `CORS_ORIGIN` al dominio real del frontend.
- El login tiene rate limit (10 intentos por minuto por IP).
- El backend valida roles en cada endpoint; el guard del frontend es solo UX.
- `SameSite=Lax` protege contra CSRF en el escenario same-site. Si despliegas
  frontend y backend en sitios distintos con `SameSite=None`, agrega un token
  CSRF o cambia a autenticación por header `Authorization`.
- No subas `.env` ni `prisma/dev.db` al repositorio.
- Para producción: `npm run build`, `npm run db:deploy`, `npm start`.

### Nota sobre Prisma 6.19.3

La versión está fijada en **6.19.3** por compatibilidad con el entorno de
desarrollo. `npm audit` reporta una vulnerabilidad en `deepmerge-ts`, una
dependencia del CLI de Prisma; la corrección automática implica saltar a Prisma
7 (cambio mayor). No afecta al runtime de la API y se puede planificar la
actualización más adelante.

## Conexión con el frontend

En `Clinica-Frontend/.env`:

```env
PUBLIC_API_URL=http://localhost:4000/api
```

El frontend ya no contiene datos demo ni modo mock: todas las pantallas
consumen esta API. El CORS del backend debe incluir el origen del frontend
(`http://localhost:4321` en desarrollo).
