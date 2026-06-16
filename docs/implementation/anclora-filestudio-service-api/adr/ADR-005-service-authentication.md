# ADR-005: Service Authentication

## Estado: Aceptado

## Contexto

FileStudio Service es una API privada consumida por aplicaciones del ecosistema Anclora (Nexus,
etc.). Necesita autenticación sin compartir secretos en el repositorio y con soporte para
rotación de claves sin downtime.

## Decisión

**JWT asimétrico (EdDSA / Ed25519)** como mecanismo principal.

Cada cliente de servicio (e.g. Nexus) tiene un par de claves:
- Clave privada: gestionada por el cliente, nunca enviada a FileStudio.
- Clave pública: registrada en `service_client_keys` de FileStudio.

FileStudio valida los JWTs sin necesidad de llamar a ningún IdP externo.

**Librería:** `jose` (MIT, W3C standard, sin dependencias, compatible con Node.js y Edge).

## Flujo

```
Cliente → genera JWT con su clave privada → FileStudio valida con clave pública registrada
```

## Rotación sin downtime

- Cada cliente puede tener hasta 2 claves activas (campo `kid` en JWT header).
- Para rotar: registrar nueva clave → actualizar cliente para emitir con nueva clave → revocar clave antigua.
- FileStudio intenta validar con todas las claves activas del cliente.

## Consecuencias

**Positivo:**
- Sin secretos compartidos.
- Rotación de claves sin downtime.
- Sin dependencia de IdP externo en runtime.
- Compatible con infraestructura privada sin acceso a Internet.

**Negativo:**
- Revocación de tokens individuales requiere blacklist en Redis (por `jti`). En MVP,
  la revocación es por cliente (suspender `service_client`), no por token individual.
  Ventana máxima de exposición: TTL del token (1h).

## Alternativas descartadas

- **API Keys (secretos compartidos):** No permiten rotación sin downtime ni claims ricos.
- **mTLS:** Más complejo de gestionar en VPS; reservado para futuras versiones.
- **OAuth 2.0 client credentials:** Require IdP — overhead innecesario para integración privada.
