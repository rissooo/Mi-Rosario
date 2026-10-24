# Límite de reportes

Reservado para el change aparte de `feature/reports-backend`. Esta carpeta no contiene ninguna implementación de persistencia.

Los futuros `service.ts`, `repository.ts`, `photos.ts` y `publication.ts` se encargan de orquestar los reportes, el mapeo a la base de datos, el Storage privado de originales, las versiones seguras para ver, la idempotencia, los reintentos y la limpieza. Reutilizá los clientes existentes con alcance de sesión de `utils/supabase/`; no modifiques la autenticación con Google como parte de esta base.

El backend se encarga de validar las categorías activas, del umbral inicial de 3 confirmaciones válidas de cuentas distintas que no sean el autor, de las actualizaciones atómicas de etapa, de la elegibilidad, de la consulta privada de la confirmación de la cuenta actual y de la autorización. Los permisos de RLS y de columnas y las políticas de Storage se tienen que probar directamente en el change funcional posterior; los validadores puros no son un mecanismo de seguridad.

Las escrituras en Storage y en la base de datos necesitan recuperación porque no comparten una transacción. No se sube ningún original hasta la publicación explícita. Los roles y las acciones municipales quedan fuera del MVP. Leé `../../docs/contracts.md` antes de escribir specs de ejecución o migraciones.
