# ADR-006: Hybrid Local Agent

## Estado: Aceptado

## Contexto

Algunos documentos sensibles no pueden salir del equipo del usuario. Sin embargo, Nexus necesita
orquestar la conversión sin conectarse directamente al equipo corporativo (no hay VPN garantizada,
no hay IP estática, firewall corporativo).

## Decisión

**Local Agent con polling HTTPS saliente.**

El agente se instala en el equipo local y:
- No abre ningún puerto entrante.
- Solo hace conexiones HTTPS salientes a FileStudio Service.
- Usa long-polling para recibir trabajos asignados.
- Descarga el input mediante token temporal.
- Convierte localmente usando los mismos motores del Desktop.
- Sube el resultado.
- Confirma el hash.
- Elimina los temporales.

El consentimiento del usuario es explícito. No hay ejecución silenciosa por defecto.

## Justificación del polling vs. WebSocket

- WebSockets requieren mantener conexión persistente — más frágil en redes corporativas con
  firewalls y proxies que cierran conexiones idle.
- Long-polling (timeout 30s) es más robusto en entornos corporativos.
- HTTP/2 SSE también es opción futura, pero long-polling es suficiente para MVP.

## Consecuencias

**Positivo:**
- Funciona detrás de firewalls corporativos estrictos.
- Sin exposición de puertos en el equipo local.
- El archivo sensible nunca sale del equipo.
- Compatible con Windows y Linux sin Docker.

**Negativo:**
- Latencia adicional de polling (máx. 30s desde asignación hasta inicio).
- El equipo debe estar encendido y con el agente activo.

## Alternativas descartadas

- **WebSocket push:** Más eficiente pero frágil en redes corporativas.
- **SSH tunnel:** Complejo de gestionar, requiere acceso a claves SSH.
- **Peer-to-peer (WebRTC):** Excesivamente complejo para este caso de uso.
