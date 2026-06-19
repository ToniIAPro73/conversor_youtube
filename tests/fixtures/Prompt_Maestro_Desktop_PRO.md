# Prompt Maestro Desktop PRO

## Descripción General

Este documento contiene las instrucciones maestras para el sistema **Desktop PRO** de Anclora FileStudio.

## Configuración del Sistema

### Requisitos

- Windows 10/11 x64
- Node.js runtime (incluido en portable)
- FFmpeg, Pandoc, 7-Zip (incluidos en tools/)

### Variables de Entorno

| Variable                         | Descripción            | Obligatoria   |
| -------------------------------- | ---------------------- | ------------- |
| `ANCLORA_FILESTUDIO_PANDOC_PATH` | Ruta al binario Pandoc | Sí (portable) |
| `ANCLORA_FILESTUDIO_TEMP_DIR`    | Directorio temporal    | Sí            |

## Flujo de Conversión

1. El usuario sube un archivo `.md`
2. Se analiza con el detector universal
3. Se genera el descriptor (`UniversalFileDescriptor`)
4. Se resuelven las capacidades del motor
5. Se ejecuta la conversión

### Ejemplo de código

```typescript
const result = await engine.execute(plan, onProgress);
if (!result.success) {
  throw createAppError("ENGINE_EXECUTE_FAILED", result.error);
}
```

## Notas Importantes

> La conversión Markdown → DOCX utiliza Pandoc como motor principal.
> El formato DOCX es un contenedor ZIP con estructura Office Open XML.

### Fórmulas y caracteres especiales

- Símbolo de euro: €
- Símbolo de copyright: ©
- Comillas tipográficas: «ejemplo»
- Guión largo: —

---

_Documento de prueba para validación de conversión markdown→docx_
