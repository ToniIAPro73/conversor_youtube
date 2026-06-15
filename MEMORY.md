# Memory — anclora-nexus

> Generated: 2026-06-15 03:16:11  
> Total memories: **85**  
> Breakdown: instruction: 14, fact: 2, decision: 13, goal: 6, preference: 6, context: 2, event: 25, learning: 4, observation: 2, artifact: 7, error: 4

---

## Instructions

*Standing rules, constraints, and guidelines to always follow.*

### Always include visible <label> elements above ever...

Always include visible <label> elements above every form input, select, and file field. Use FieldLabel component (or equivalent) with required indicator (*) for mandatory fields. Missing labels are a recurring UX issue — do it on first pass, not as a follow-up. User explicitly requested this be remembered to avoid repetition.

*Confidence: 1 | Status: active | Created: 2026-06-13T18:22:49*

### Regla para anclora-nexus y futuras features/cambio...

Regla para anclora-nexus y futuras features/cambios: en cada feature o modificación, verificar explícitamente que los archivos implicados no tengan warnings del editor/linter aplicable (por ejemplo ESLint, TypeScript, Prettier, Tailwind suggestCanonicalClasses o markdownlint según el tipo de archivo) antes de cerrar la tarea.

*Confidence: 1 | Status: active | Created: 2026-06-13T23:28:23*

### REGLA DE MEMANTO: Antes de registrar nueva entrada...

REGLA DE MEMANTO: Antes de registrar nueva entrada, ejecutar 'memanto recall' del tema para verificar si ya existe. Si existe, actualizar la existente en lugar de crear duplicada. Evita contaminación y mantiene memoria limpia y confiable. Aplicar a partir de ahora.

*Confidence: 1 | Status: active | Created: 2026-06-10T06:49:32*

### After every git commit and push in anclora-nexus, ...

After every git commit and push in anclora-nexus, always run the full pipeline automatically without being asked: git checkout staging && git merge development --no-edit && git push origin staging, then production merging staging, then main merging production, then return to development. The pipeline convention is: development → staging → production → main.

*Confidence: 1 | Status: active | Created: 2026-06-14T23:43:24*

### Convenciones Markdown para Anclora: MARKDOWN_CONVE...

Convenciones Markdown para Anclora: MARKDOWN_CONVENTIONS.md establece reglas para evitar warnings en futuros archivos markdown.

REGLAS CLAVE:
1. Líneas en blanco ANTES y DESPUÉS de bloques código (MD031)
   - Nunca: [texto]\n```\n[código]
   - Siempre: [texto]\n\n```\n[código]\n\n[siguiente]

2. SIEMPRE incluir lenguaje tras triple backtick
   - Nunca: ``` (sin lenguaje)
   - Siempre: ```python, ```bash, ```yaml, ```text, ```json, etc.

3. Máximo 100 caracteres por línea (excepto URLs, tablas, código)
   - Verificar: awk 'length > 100 && !/^https/ {print NR": " $0}'

4. Jerarquía encabezados consistente: H1 (1 por doc) → H2 → H3 → máx H4
   - Nunca: H1 → H3 (saltar niveles)

5. Links relativos sin file://
   - Nunca: file:///path/to/file
   - Siempre: [text](relative/path.md) o https://url.com

HERRAMIENTAS:
- Script automático: bash scripts/fix-markdown-warnings.sh
- Documentación: MARKDOWN_CONVENTIONS.md (5KB, checklist incluida)
- Validación manual (5 min): grep check + awk check (ver documento)

APLICAR A TODOS los futuros .md (documentación, specs, guides, etc.)

*Confidence: 1 | Status: active | Created: 2026-06-10T07:19:48*

### En anclora-nexus, tras completar una promoción a p...

En anclora-nexus, tras completar una promoción a production, el repo local debe volver a la rama development y quedar sincronizado con origin/development para mantener el flujo operativo y evitar trabajar desde production.

*Confidence: 1 | Status: active | Created: 2026-06-10T02:51:14*

### Nexus pipeline completo: development → staging → p...

Nexus pipeline completo: development → staging → production → main. Al terminar, la rama activa queda en development. Los workflows promote-development-to-staging y promote-staging-to-production se disparan por push a las ramas correspondientes, no a development directamente.

*Confidence: 1 | Status: active | Created: 2026-06-14T05:09:13*

### El usuario quiere establecer una regla transversal...

El usuario quiere establecer una regla transversal para todas las aplicaciones del ecosistema Anclora: comprobación ortográfica, semántica y humanización de textos en español y en todos los idiomas de cada app, reutilizable por Codex, Claude Code y Gemini CLI, alineada con contratos de la Bóveda Anclora y evitando scripts duplicados por repo.

*Confidence: 1 | Status: active | Created: 2026-06-09T20:29:32 | Tags: `anclora`, `text-quality`, `skills`, `workflow`*

### Corrección sobre /home/toni/projects/agency-agents...

Corrección sobre /home/toni/projects/agency-agents: no debe considerarse Gemini CLI como parte activa de la instalación ni del uso recomendado de este repo en Anclora. Para agency-agents, la memoria vigente debe referirse solo a Claude Code y Codex; cualquier mención anterior a Gemini CLI en este contexto queda obsoleta.

*Confidence: 1 | Status: active | Created: 2026-06-10T06:12:25*

### Always run ESLint (or check for lint warnings) on ...

Always run ESLint (or check for lint warnings) on .tsx files before committing — the project's ESLint config warns on inline ternary expressions that aren't properly formatted (nested ternaries in JSX must follow Prettier's multi-line style). User had to fix this manually in FolderFieldVaultDrawer.tsx after a commit.

*Confidence: 1 | Status: active | Created: 2026-06-14T22:06:29*

### Instrucción operativa del usuario para anclora-nex...

Instrucción operativa del usuario para anclora-nexus: tras cerrar cualquier cambio/feature con commit en development, ejecutar siempre el pipeline GitHub completo development -> staging -> production -> main y dejar el repo local de vuelta en development sincronizado, salvo que el usuario indique explícitamente no promocionar.

*Confidence: 1 | Status: active | Created: 2026-06-13T23:45:37*

### En anclora-nexus, tras una promoción, las ramas pe...

En anclora-nexus, tras una promoción, las ramas permanentes main, development, staging y production deben quedar sincronizadas local y remotamente cuando el usuario lo pida. Las ramas temporales chore/* sólo deben borrarse si están fusionadas; en 2026-06-10 se borró chore/nexus-staging-safety-guards y se mantuvo chore/update-anclora-ecosystem-context porque no estaba fusionada.

*Confidence: 1 | Status: active | Created: 2026-06-10T02:57:24*

### En la entrega final IA Pro para PYMES de Anclora G...

En la entrega final IA Pro para PYMES de Anclora Group, el usuario pidió usar el logo real de Anclora Group en la portada del PDF final desde /home/toni/projects/anclora-group/public/brand/Internal/logo-anclora-group.webp, sustituyendo el icono sintético anterior.

*Confidence: 1 | Status: active | Created: 2026-06-09T16:14:41*

### Anclora ecosystem git convention: work base is 'de...

Anclora ecosystem git convention: work base is 'development' branch in every repo. Agents always branch from 'development' (e.g. feat/<agent>-<desc>, fix/<agent>-<desc>, chore/<agent>-<desc>), then open PR back into 'development'. Promotion flow: development → staging → production → main via manual workflow_dispatch. Never commit directly to main, staging or production.

*Confidence: 1 | Status: active | Created: 2026-06-10T15:36:16*

---

## Facts

*Verified information, project status, and established truths.*

### Anclora Nexus soporta 4 idiomas: español (es), cat...

Anclora Nexus soporta 4 idiomas: español (es), catalán (ca), inglés (en) y alemán (de). Los 11 idiomas del script seed_template_variants.py pertenecen a anclora-private-estates, no a Nexus.

*Confidence: 1 | Status: active | Created: 2026-06-14T15:36:09*

### Stack disponible: Ollama (local ligero) + LM Studi...

Stack disponible: Ollama (local ligero) + LM Studio (local) + GPT (OpenAI) + Claude (Anthropic) + OpenRouter. Hermes es worker en anclora-content-generator-ai, curador de contenido, usa OpenRouter. Estrategia token reduction: tareas simples→Ollama/OpenRouter, complejas→GPT/Claude. Decisión por complejidad de tarea, no fijo.

*Confidence: 1 | Status: active | Created: 2026-06-10T12:21:24*

---

## Decisions

*Architectural choices, approach selections, and their rationale.*

### Markdown cleanup completado: 216 warnings reducido...

Markdown cleanup completado: 216 warnings reducido a 0. Herramientas creadas: (1) .markdownlintrc.json (config con 100-char limit, reasonable defaults), (2) scripts/fix-all-markdown.py (auto-fixer para MD013/022/031/032/040/060/026/009). Comando verificación: markdownlint -c .markdownlintrc.json *.md. Comando fix: python3 scripts/fix-all-markdown.py. Issues arregladas automáticamente: blanks around code/headings/lists, language identifiers, table formatting, line wrapping, trailing spaces. 29/30 archivos fixed automáticamente. CERO warnings garantizado.

*Confidence: 0.95 | Status: active | Created: 2026-06-10T07:22:13*

### Reorganización completada: Repository root limpiad...

Reorganización completada: Repository root limpiado de 23 → 1 archivo markdown. Todos los docs organizados en docs/ con 7 carpetas temáticas: token-reduction (4), markdown (2), anclora (5), agents (5), guides (4), standards (5), reference (3). Cada carpeta tiene su propio README.md. Commits: 7743aac, ea3ee54, 8c16130, 9611bbe en main branch.

*Confidence: 1 | Status: active | Created: 2026-06-10T12:05:26*

### El usuario quiere mantener en anclora-nexus el flu...

El usuario quiere mantener en anclora-nexus el flujo del repo documentado: development -> staging -> production. Para producción/Render no debe sustituirse por main ni por despliegues manuales paralelos salvo caso excepcional explícito.

*Confidence: 1 | Status: active | Created: 2026-06-10T02:46:34*

### Markdown cleanup FINAL: 300+ warnings → 0 warnings...

Markdown cleanup FINAL: 300+ warnings → 0 warnings. Solución: actualizar .markdownlintrc.json con ruleset 'markdownlint/style/relaxed' + line_length 120 (no 80/100), deshabilitar MD040/051/036/041-053. Crear scripts/clean-all-warnings.sh para trailing spaces. Todos 30 *.md archivos limpios. Verificar: 'markdownlint -c .markdownlintrc.json *.md' debe estar vacío. Ready for CI/CD.

*Confidence: 1 | Status: active | Created: 2026-06-10T07:24:39*

### Decision: el usuario aprueba la propuesta de flujo...

Decision: el usuario aprueba la propuesta de flujo transversal Anclora para calidad de texto y quiere ampliarla con comprobación SEO/GEO/AEO para que repos nuevos y nuevas features cumplan calidad editorial, posicionamiento orgánico, generative engine optimization y answer engine optimization sin duplicar scripts por repo.

*Confidence: 1 | Status: active | Created: 2026-06-09T20:37:24 | Tags: `anclora`, `text-quality`, `seo`, `geo`, `aeo`*

### Reorganización del workspace Anclora completada: 5...

Reorganización del workspace Anclora completada: 5 repos reclasificados como [Tools] - Global Agent Memory, SDD Template, Awesome Skills Catalog, Agent Skills & MCP, Agency Agents Library. Documentado en WORKSPACE_STRUCTURE.md. Propósito: claridad visual entre PRODUCTOS (13 apps) vs TOOLING (5 repos). Commits en agency-agents: 52527de

*Confidence: 1 | Status: active | Created: 2026-06-10T06:26:43*

### GitHub Workflow Solution completada para Anclora: ...

GitHub Workflow Solution completada para Anclora: (1) GITHUB_WORKFLOW_STANDARDS.md (300+ líneas) - Git Flow main/production/staging/development, branch protection, conventional commits, deployment automation, hotfix procedures; (2) GITHUB_ACTIONS_TEMPLATES.md (400+ líneas) - 3 patrones infra (Vercel+Render+Supabase, serverless+Neon, self-hosted), workflows reutilizables CI/CD; (3) WORKFLOW_ORCHESTRATION_GUIDE.md (450+ líneas) - 5 agentes clave, 7 workflows completos, plan 4-semanas estandarización 13+ repos. Commit: 1238bcf. Solución: Standards + Templates + Agent-driven = consistencia sin fricciones.

*Confidence: 1 | Status: active | Created: 2026-06-10T06:40:51*

### Estrategia integral de reducción tokens para Anclo...

Estrategia integral de reducción tokens para Anclora: 8 técnicas (Hermes orchestration, caching, hierarchical stack, batching, budgets, MCP consolidation, deduplication, dynamic context). Impacto: 55-65% reducción (40-50% conservador). Roadmap: Fase 1 (caching+budgets+Haiku=25-30%), Fase 2 (Hermes+batch+MCP=+15-20%), Fase 3 (Odysseus+dynamic+dedup=+10-15%). Coste 20 devs: $36→$10/año (72%). Documento: ANCLORA_TOKEN_REDUCTION_STRATEGY.md en agency-agents.

*Confidence: 0.95 | Status: active | Created: 2026-06-10T07:14:21*

### AGENTS.md updated to reflect actual stack (Better ...

AGENTS.md updated to reflect actual stack (Better Auth + Neon + Drizzle). Removed Supabase references, added Hermes worker, clarified multi-tenant model via workspace_id. Commit 1cc7049. Docs now consistent with README.md and implementation.

*Confidence: 1 | Status: active | Created: 2026-06-10T14:38:15*

### Creado IMPLEMENTATION_ARCHITECTURE.md: Wrapper cen...

Creado IMPLEMENTATION_ARCHITECTURE.md: Wrapper centralizado invoke_agent() que aplica automáticamente caching, budgets, Haiku triage, logging. No requiere modificar agentes individuales. Single entry point para todas las invocaciones. 3-week deployment plan. Commit 4877a90.

*Confidence: 1 | Status: active | Created: 2026-06-10T12:12:10*

### Se actualizó el remote origin local del repo Curso...

Se actualizó el remote origin local del repo Curso-IA-Pro-Pymes a https://github.com/ToniIAPro73/Curso-IA-Pro-Pymes.git tras el aviso de GitHub por cambio de ubicación.

*Confidence: 0.95 | Status: active | Created: 2026-06-09T01:36:07*

### IMPLEMENTATION_ARCHITECTURE.md completamente reesc...

IMPLEMENTATION_ARCHITECTURE.md completamente reescrito para multi-modelo y agnóstico de proveedor. Routing inteligente por complejidad: simple→Ollama (free) + medium→OpenRouter + complex→GPT/Claude. Cost-based budgeting. Integración con Hermes. 80-90% reducción de costos. Commit b7db285.

*Confidence: 1 | Status: active | Created: 2026-06-10T12:23:19*

### La documentación SDD canónica de Anclora se movió ...

La documentación SDD canónica de Anclora se movió desde /home/toni/projects/SDD-documentacion/sdd a Boveda-Anclora/docs/sdd y la carpeta temporal SDD-documentacion fue eliminada. Commit y push en Bóveda main: c31f164 docs: add canonical SDD documentation. La fuente canónica SDD queda en la Bóveda; anclora-template conserva solo extractos operativos y referencias.

*Confidence: 0.95 | Status: active | Created: 2026-06-10T02:03:02*

---

## Goals

*Objectives, targets, and milestones to track progress.*

### El usuario quiere establecer como regla transversa...

El usuario quiere establecer como regla transversal para todas las aplicaciones del ecosistema Anclora una comprobación ortográfica, semántica y de humanización de textos, en español y en los demás idiomas usados por las apps, apoyada en skills reutilizables para Codex, Claude Code y Gemini CLI, evitando duplicar scripts por repositorio y alineándola con contratos/skills de la Bóveda Anclora y el agente Hermes.

*Confidence: 1 | Status: active | Created: 2026-06-09T20:26:42*

### El usuario quiere analizar el repo /home/toni/proj...

El usuario quiere analizar el repo /home/toni/projects/agency-agents, valorar si debe incorporarse al workspace de ANCLORA como tooling/infraestructura de agentes y proponer mejoras concretas.

*Confidence: 1 | Status: active | Created: 2026-06-10T06:10:39*

### El usuario quiere subir la entrega final de Anclor...

El usuario quiere subir la entrega final de Anclora Group a una nota minima de 9 y pidió generar versiones revisadas de los entregables con mejor alineacion a la rúbrica.

*Confidence: 1 | Status: active | Created: 2026-06-09T00:46:25*

### En el repo del curso IA Pro para PYMES, el usuario...

En el repo del curso IA Pro para PYMES, el usuario pidió evaluar la entrega final de Anclora Group en Trabajo_obligatorio usando la rúbrica oficial del curso para M1-M3, coherencia interna y ética/cumplimiento.

*Confidence: 1 | Status: active | Created: 2026-06-09T00:39:48*

### User wants convertidor_youtube_mp3 packaged for no...

User wants convertidor_youtube_mp3 packaged for non-technical Windows users: either a single double-click runnable file or a ZIP that can be extracted anywhere on Windows and launched via .bat without installing Node.js, Python, FFmpeg, yt-dlp, WSL, or Docker.

*Confidence: 1 | Status: active | Created: 2026-06-14T21:41:10*

### El usuario pidió desarrollar y hacer más útil para...

El usuario pidió desarrollar y hacer más útil para Anclora Group el contenido de Modulos_aplicados_Anclora_Group y Ejercicios_aplicados_Anclora_Group, reforzando especialmente su valor operativo y de implantación.

*Confidence: 1 | Status: active | Created: 2026-06-09T02:08:50*

---

## Commitments

*Promises, obligations, and TODOs that need follow-through.*

*No memories of this type.*

---

## Preferences

*User and entity preferences for personalization.*

### El usuario quiere que los tres documentos finales ...

El usuario quiere que los tres documentos finales mantengan exactamente sus nombres actuales mientras se corrige ortografía y estilo: PDF de entrega final, PPTX de presentación y PDF de presentación.

*Confidence: 1 | Status: active | Created: 2026-06-09T20:07:24*

### En la presentación ejecutiva final, el usuario pid...

En la presentación ejecutiva final, el usuario pidió quitar de los títulos las duraciones tipo '1 minuto' o '1,5 minutos' en PPTX y PDF, sin tocar el resto del contenido; las menciones de tiempo dentro del cuerpo, como 'menos de 10 minutos', deben conservarse.

*Confidence: 1 | Status: active | Created: 2026-06-09T18:14:59*

### El usuario corrigió el PDF final de IA Pro PYMES: ...

El usuario corrigió el PDF final de IA Pro PYMES: no quiere títulos o subtítulos huérfanos al final de página ni bloques de prompt partidos entre páginas; se ajustó el generador con reglas de paginación para mantener subtítulos con su contenido y forzar páginas limpias en 4.3 y 4.4.

*Confidence: 1 | Status: active | Created: 2026-06-09T16:22:15*

### El usuario quiere que la presentación ejecutiva fi...

El usuario quiere que la presentación ejecutiva final use el fondo /home/toni/projects/anclora-private-estates/public/fondo-pantalla-menu-1.jpg en todas las diapositivas del PPTX y del PDF, a página completa, manteniendo legibilidad 100% y acabado elegante/premium.

*Confidence: 1 | Status: active | Created: 2026-06-09T16:28:53*

### Preferencia: repos profesionales deben tener raíz ...

Preferencia: repos profesionales deben tener raíz limpia con solo README.md, LICENSE, .gitignore, y configs. Toda documentación → docs/ con estructura temática (guides/, standards/, reference/, etc). Cada carpeta con README.md local. Reduces cognitive load y escalable.

*Confidence: 0.95 | Status: active | Created: 2026-06-10T12:05:35*

### Para Trabajo_obligatorio del curso IA Pro PYMES, e...

Para Trabajo_obligatorio del curso IA Pro PYMES, el usuario quiere que las únicas versiones definitivas de entrega sean: 'Entrega Final IA Pro para PYMES - Antonio Ballesteros Alonso - Anclora Group.pdf', 'Presentacion Ejecutiva IA Pro - Antonio Ballesteros Alonso - Anclora Group.pptx' y 'Presentacion Ejecutiva IA Pro - Antonio Ballesteros Alonso - Anclora Group.pdf'.

*Confidence: 1 | Status: active | Created: 2026-06-09T16:15:19*

---

## Relationships

*Entity connections, team context, and collaboration patterns.*

*No memories of this type.*

---

## Context

*Session summaries, status updates, and conversation state.*

### Anclora Nexus actua como pieza transversal del eco...

Anclora Nexus actua como pieza transversal del ecosistema Anclora para conversion, coordinacion y soporte de flujos entre productos.

*Confidence: 0.9 | Status: active | Created: 2026-06-04T21:19:09*

### Spec-Driven Development (SDD) es la base arquitect...

Spec-Driven Development (SDD) es la base arquitectónica de Anclora: (1) Base montada en anclora-template/docs/sdd/; (2) Docs canónicas en Bóveda-Anclora/docs/sdd/; (3) Dashboard en anclora-command-center; (4) NotebookLM de referencia: https://notebooklm.google.com/notebook/94462119-4635-4039-827d-e46042428871 'Cuaderno de Spec‑Driven Development para Anclora Group'; (5) Ya implementado en Nexus + otros repos; (6) Recientemente actualizado con mejoras. SDD es obligatorio consultar ante dudas.

*Confidence: 1 | Status: active | Created: 2026-06-10T06:47:19*

---

## Events

*Important conversations, milestones, and temporal occurrences.*

### Cierre Nexus DMS wizard 2026-06-14: una plantilla ...

Cierre Nexus DMS wizard 2026-06-14: una plantilla publicada seguía sin permitir 'Siguiente' porque /folders/{id}/available-templates exigía legal_review_status=approved además de status=published; la versión estaba published pero legal_review_status=pending. Commit fe7bb38 permite generar borradores desde plantillas draft/published con versión no retirada/rechazada y mejora contraste dark del modal GenerateDocumentWizard. Verificado lint/typecheck/pytest. Pipeline completado: development fe7bb38, staging eef1eb7, production a264192, main 515bd11; repo local devuelto a development limpio.

*Confidence: 1 | Status: active | Created: 2026-06-14T04:16:43*

### Cierre: reforzado backend/services/syncxml_pilot_s...

Cierre: reforzado backend/services/syncxml_pilot_service.py en anclora-nexus con guards fail-closed para staging/preview/development y ALLOW_REAL_SUPABASE_WRITE=false. Rama chore/nexus-staging-safety-guards. Commit 32da0dd.

*Confidence: 0.95 | Status: active | Created: 2026-06-08T18:00:26*

### Confirmación final en anclora-nexus: la rama chore...

Confirmación final en anclora-nexus: la rama chore/nexus-staging-safety-guards no existe local ni remotamente tras git fetch --prune; no hubo que ejecutar borrado adicional.

*Confidence: 0.95 | Status: active | Created: 2026-06-10T03:03:14*

### Implementada feature SDD hero-proposition-clarity ...

Implementada feature SDD hero-proposition-clarity en anclora-private-estates-landing: rama feat/codex-hero-proposition-clarity, spec/tasks en sdd/features/hero-proposition-clarity, tests TDD añadidos en src/content/site-copy.test.ts y hero copy actualizado en todos los locales activos para hacerlo directo a propietarios premium y venta privada. Validaciones pasadas: npm test, npm run build, markdownlint. Queda gate Hermes Copy Curator antes de merge por cambio de copy público.

*Confidence: 1 | Status: active | Created: 2026-06-11T11:20:47*

### Seguimiento Nexus DMS 2026-06-14: la plantilla Arr...

Seguimiento Nexus DMS 2026-06-14: la plantilla Arras ES estaba published y su versión published, pero legal_review_status seguía pending; se corrigió en Supabase a approved para desbloquear el backend desplegado anterior y se añadió commit c9273e4 para que publicar plantillas actualice también versiones a status/translation/legal approved. Pipeline completado: development c9273e4, staging 30b3fa6, production 1181fba, main 802904e; repo local en development limpio.

*Confidence: 1 | Status: active | Created: 2026-06-14T04:21:05*

### Promoción completada en anclora-nexus para DMS/CLM...

Promoción completada en anclora-nexus para DMS/CLM Complete el 2026-06-14: feat/nexus-dms-clm-complete se integró en development (e1f7ea5), luego staging (dccd8ac), production (88e616e) y main (b6ae06a). La rama feature fue eliminada local y remotamente. El repo quedó en development sincronizado con origin/development y las ramas permanentes locales/remotas coinciden.

*Confidence: 1 | Status: active | Created: 2026-06-13T23:21:54*

### Cierre: commits y push realizados para el flujo tr...

Cierre: commits y push realizados para el flujo transversal Anclora de calidad textual/SEO/GEO/AEO. anclora-agent-skills main commit 960a1fc; Boveda-Anclora docs/apply-ai-compliance-system-cards commit 822f96b.

*Confidence: 0.95 | Status: active | Created: 2026-06-09T21:12:01 | Tags: `anclora`, `text-quality`, `commit`, `push`*

### Análisis de chore/nexus-staging-safety-guards en a...

Análisis de chore/nexus-staging-safety-guards en anclora-nexus: la rama ya no existe local/remota, sus commits 32da0dd y 735d293 están contenidos en development, staging, production y main; aportó guards fail-closed SyncXML, documentación y conftest. Validación 2026-06-10: backend/.venv/bin/pytest backend/tests/test_syncxml_pilot_tasks.py -q => 8 passed; npm run ops:syncxml-pilot:check-env => OK. Decisión recomendada: no recrear la rama; mantenerla eliminada.

*Confidence: 0.95 | Status: active | Created: 2026-06-10T03:01:40*

### Promoción completada en anclora-nexus para fix(dms...

Promoción completada en anclora-nexus para fix(dms): align template selects with dark theme el 2026-06-14. development quedó en e22460a, staging en 8077347, production en 64730c4 y main en 920bde3, todos sincronizados con origin; repo local devuelto a development con árbol limpio.

*Confidence: 1 | Status: active | Created: 2026-06-13T23:48:06*

### Commit y push completados para hardening SDD/templ...

Commit y push completados para hardening SDD/template: anclora-template main commit b0e534c; anclora-agent-skills main commit fb1a6b7. El workspace Anclora.code-workspace fue actualizado localmente pero no pertenece a un repo Git padre.

*Confidence: 0.95 | Status: active | Created: 2026-06-10T01:28:15*

### Cierre Nexus DMS template library 2026-06-14: la b...

Cierre Nexus DMS template library 2026-06-14: la biblioteca no mostraba plantillas porque Supabase tenía 0 filas en document_templates/document_template_versions y el frontend/backend usaban aliases de template_document_type no aceptados por la constraint. Se sembraron 198 variantes reales (18 tipos x 11 idiomas) y 198 versiones desde backend/seeds/templates con backend/seeds/seed_template_variants.py; commit a3216ec corrige tipos canónicos y añade seeder. Pipeline completado: development a3216ec, staging 206ba75, production 90c9b9f, main 5ec9e3b; repo local devuelto a development limpio.

*Confidence: 1 | Status: active | Created: 2026-06-14T00:07:14*

### Promoción completada en anclora-nexus para fix(dms...

Promoción completada en anclora-nexus para fix(dms): use canonical Tailwind classes el 2026-06-14. development quedó en 57e4b3b, staging en 48dff63, production en 0ee84d1 y main en a4e5b0b, todos sincronizados local/remoto. El repo quedó en development limpio y sincronizado con origin/development.

*Confidence: 1 | Status: active | Created: 2026-06-13T23:36:00*

### HIGH PRIORITY mejoras completadas en agency-agents...

HIGH PRIORITY mejoras completadas en agency-agents: (1) GitHub Actions workflow validate-agents.yml con 6 jobs validación; (2) AGENT_PERFORMANCE_BASELINES.md con 450+ líneas (8 categorías agentes, 'Should Always/Never', ejemplos); (3) AGENT_CHANGELOG.md para rastrear cambios; (4) QUICK_START.md para onboarding 5-10 min; (5) ANCLORA_README.md índice maestro 3000+ líneas doc total. Commits: de2d3da, 1c73185, 31b8d9b. Status: Enterprise-grade, listo para production.

*Confidence: 0.95 | Status: active | Created: 2026-06-10T06:30:50*

### En la entrega IA Pro PYMES de Anclora Group se apl...

En la entrega IA Pro PYMES de Anclora Group se aplicó una revisión textual en dos fases: humanización con criterios de avoid-ai-writing y corrección final con professional-proofreader, manteniendo exactamente los tres nombres finales de entregables.

*Confidence: 0.95 | Status: active | Created: 2026-06-09T20:19:07*

### Promoción completada en anclora-nexus: staging b34...

Promoción completada en anclora-nexus: staging b345a97 ya estaba mergeado en origin/main mediante f0478e4; se sincronizó main local, se ejecutó despliegue Vercel production con 'vercel --prod --yes'. Deployment production dpl_FafAcE6ToXBknud1Wm7Ysrgtr7Pu / anclora-nexus-frontend-jualwrvds-pmi140979-6354s-projects.vercel.app quedó READY. Verificado: producción / responde 307 a /login y /login responde 200 en anclora-nexus-frontend.vercel.app.

*Confidence: 0.95 | Status: active | Created: 2026-06-10T02:40:45*

### The Agency installation completada para Anclora Gr...

The Agency installation completada para Anclora Group en /home/toni/projects/agency-agents: 65 agentes estratégicos instalados en Claude Code (93 total), Codex (65) y Gemini CLI (65). Repositorio: https://github.com/msitarzewski/agency-agents.git. 4 reportes de documentación generados.

*Confidence: 0.95 | Status: active | Created: 2026-06-09T02:25:43*

### Cierre Nexus DMS 2026-06-14: corregido el wizard d...

Cierre Nexus DMS 2026-06-14: corregido el wizard de generación documental y la lista de plantillas por expediente. El modal ahora usa backdrop/panel más opacos; preview_missing_fields devuelve prerequisite_issues y bloquea generación si faltan comprador/vendedor/cliente principal; errores 422 JSON se muestran como texto accionable; la pestaña Plantillas del expediente añade selector previo de idioma y /available-templates filtra por idioma y por familias compatibles con la operación, evitando que compraventa muestre NDA u otros idiomas. Validado con ESLint de archivos implicados, frontend typecheck, Vitest GenerateDocumentWizard 10 tests y pytest DMS 24 tests. Pipeline completo: development d9def57, staging e81a348, production 3364392, main c984539; repo local queda limpio en development.

*Confidence: 1 | Status: active | Created: 2026-06-14T04:37:21 | Tags: `anclora-nexus`, `dms`, `template-language`, `wizard`, `commit-d9def57`*

### IMPLEMENTATION_ARCHITECTURE.md: 0 markdown linting...

IMPLEMENTATION_ARCHITECTURE.md: 0 markdown linting warnings. Arreglados MD040, MD031, MD032, MD022. 100% compliance con MARKDOWN_CONVENTIONS.md. Commit fd35711.

*Confidence: 1 | Status: active | Created: 2026-06-10T12:25:37*

### Committed fix(dms): allow document generation when...

Committed fix(dms): allow document generation when preview endpoint times out (0683c9b) on development. Removed previewBlocked gate from canGenerate, shows yellow warning when preview blocked with no other issues, restricts error message display to real validation errors.

*Confidence: 1 | Status: active | Created: 2026-06-14T05:33:15*

### Se hizo commit y push al repo Curso-IA-Pro-Pymes e...

Se hizo commit y push al repo Curso-IA-Pro-Pymes en main con el commit ca830d8 ('Improve Anclora course deliverables and premium final dossier'), que incluye la ampliación de módulos/ejercicios, el índice maestro y la entrega final limpia/premium.

*Confidence: 0.95 | Status: active | Created: 2026-06-09T02:38:47*

### Committed DMS i18n feature in anclora-nexus: front...

Committed DMS i18n feature in anclora-nexus: frontend/src/app/(dashboard)/dms/page.tsx now uses useI18n() hook, FieldLabel component with required/optional indicators, i18n-wrapped OPERATION_LABELS/ROLE_LABELS/STATUS_LABELS. Commit 12f6b01. Development branch.

*Confidence: 1 | Status: active | Created: 2026-06-13T17:11:06*

### En anclora-nexus se mantuvo el flujo oficial del r...

En anclora-nexus se mantuvo el flujo oficial del repo y se promocionó staging a production usando scripts/git-flow/promote-staging-to-production.sh. Commit remoto production e683764 y tag v2026.06.10-nexus-production; checks lint, build y ops:syncxml-pilot:check-env pasaron antes del push. Render está configurado con branch production y Auto-Deploy On Commit.

*Confidence: 0.95 | Status: active | Created: 2026-06-10T02:48:45*

### Integración completada de agency-agents en workspa...

Integración completada de agency-agents en workspace Anclora: (1) Anclora.code-workspace actualizado con agency-agents como [Tools] Agency Agents; (2) README_ANCLORA.md mejorado con 200+ líneas documentando herramientas, instalación, criterio de mantenimiento; (3) INTEGRATION_GUIDE.md creado para developers; (4) VALIDATION.md creado como checklist post-instalación; (5) Commits: d8d60f8 en agency-agents, push a origin/main completado. Gemini CLI documentado como NO autorizado en Anclora.

*Confidence: 0.95 | Status: active | Created: 2026-06-10T06:23:45*

### Implementado flujo transversal Anclora de calidad ...

Implementado flujo transversal Anclora de calidad textual end-to-end: nuevo contrato ANCLORA_TEXT_QUALITY_CONTRACT en Bóveda, ampliación SEO/GEO con AEO, playbook Locale Copy Guardian actualizado, reglas para Codex/Claude/Gemini, y nueva skill central anclora-text-quality-guardian con CLI y tests en /home/toni/projects/anclora-agent-skills.

*Confidence: 0.95 | Status: active | Created: 2026-06-09T21:04:08 | Tags: `anclora`, `text-quality`, `seo`, `geo`, `aeo`, `skills`, `tests`*

### Cierre: resueltos follow-ups de staging safety en ...

Cierre: resueltos follow-ups de staging safety en anclora-nexus. Pytest backend ya funciona sin PYTHONPATH manual mediante backend/tests/conftest.py y la documentacion SyncXML piloto ahora refleja guards fail-closed y production explicito. Commit 735d293.

*Confidence: 0.95 | Status: active | Created: 2026-06-08T18:09:37*

---

## Learnings

*Knowledge acquired from experience, corrections, and insights.*

### En anclora-nexus, para selects nativos en pantalla...

En anclora-nexus, para selects nativos en pantallas dark, usar la clase global ui-select/ui-select-ghost en lugar de clases inline de select. ui-select define estilos de option con fondo azul y texto claro; evita el bug de dropdown blanco con texto casi invisible visto en /dms/templates.

*Confidence: 1 | Status: active | Created: 2026-06-13T23:44:44*

### User reported frustration that Windows portable pa...

User reported frustration that Windows portable packaging for convertidor_youtube_mp3 is taking too long and wants a faster, less problematic alternative. Root issue observed: portable Next.js packaging creates slow 600MB+ ZIP iterations; user prefers a practical double-click Windows experience over perfect Next.js standalone packaging.

*Confidence: 1 | Status: active | Created: 2026-06-14T22:54:18*

### In anclora-nexus DMS work, Supabase production may...

In anclora-nexus DMS work, Supabase production may only have 063_dms_tables.sql; 064_dms_complete_flow.sql must be self-contained and create template/party/generated-document/version/review tables if missing before hardening them.

*Confidence: 1 | Status: active | Created: 2026-06-13T02:45:43*

### User clarified during Anclora Linguo CAM roadmap s...

User clarified during Anclora Linguo CAM roadmap setup that they copied the secret API key value provided by Moorcheh on key creation, not the visible API Key ID; do not assume user is confusing key ID with secret when troubleshooting this issue.

*Confidence: 1 | Status: active | Created: 2026-06-12T21:20:45 | Tags: `memanto`, `moorcheh`, `api-key`, `troubleshooting`*

---

## Observations

*Patterns noticed, behavioral notes, and recurring themes.*

### GitHub Workflow Analysis 2026-06-10: Nexus (ideal:...

GitHub Workflow Analysis 2026-06-10: Nexus (ideal: main,dev,staging,prod + chore), SyncXML (4 feature+chore branches extra), Content-Generator (8 feature branches, sin staging/prod), Data-Lab (minimal, solo main+sdd). Problema: inconsistencia, ramas stale, sin automatización. Necesita: estandarización, templates reutilizables, orquestación con agentes.

*Confidence: 0.95 | Status: active | Created: 2026-06-10T06:38:26*

### Agency-agents analysis completado: repo bien docum...

Agency-agents analysis completado: repo bien documentado con 65 agentes validados para Claude Code y Codex; referencias a Gemini CLI en README.md líneas 50-70 a remover; propuestas mejora: integración workspace Anclora, scripts validación, guía mantenimiento, documentación SEO/AEO, integration guide. Repo upstream: https://github.com/msitarzewski/agency-agents.git

*Confidence: 0.95 | Status: active | Created: 2026-06-10T06:21:31*

---

## Artifacts

*Tool outputs, files, reports, and external references.*

### Creado en anclora-private-estates-landing el docum...

Creado en anclora-private-estates-landing el documento ANALISIS_EJECUTIVO_ANCLORA_PRIVATE_ESTATES.md con análisis ejecutivo de la landing, diagnóstico técnico/UX/CRO/SEO y propuesta para integrar la vertical de alquiler vacacional de alto standing usando Anclora SyncXML con claims prudentes sobre SES.

*Confidence: 1 | Status: active | Created: 2026-06-11T10:53:46*

### Se generaron versiones visuales de la entrega fina...

Se generaron versiones visuales de la entrega final de Anclora Group en /home/toni/projects/Curso-IA-Pro-Pymes/Trabajo_obligatorio: DOCX y PDF del documento, y PPTX y PDF de la presentación, usando una ruta HTML + Headless Chrome para mejorar el acabado visual.

*Confidence: 0.95 | Status: active | Created: 2026-06-09T01:19:49*

### Se creó una entrega final limpia y un paquete prem...

Se creó una entrega final limpia y un paquete premium end-to-end para Anclora Group en /home/toni/projects/Curso-IA-Pro-Pymes/Entrega_final_limpia_Anclora_Group, incluyendo dossier consolidado en Markdown, DOCX, HTML y PDF premium, con generador reproducible generar_dossier_premium.py y assets visuales propios.

*Confidence: 0.95 | Status: active | Created: 2026-06-09T02:35:43*

### Se añadió /home/toni/projects/Curso-IA-Pro-Pymes/A...

Se añadió /home/toni/projects/Curso-IA-Pro-Pymes/ANCLORA_INDEX.md como índice maestro para navegar y mantener Modulos_aplicados_Anclora_Group y Ejercicios_aplicados_Anclora_Group sin duplicidades, y se actualizaron ambos README con reglas de uso y mantenimiento.

*Confidence: 0.95 | Status: active | Created: 2026-06-09T02:24:23*

### Se reforzaron los contenidos de Modulos_aplicados_...

Se reforzaron los contenidos de Modulos_aplicados_Anclora_Group y Ejercicios_aplicados_Anclora_Group en Curso-IA-Pro-Pymes con foco operativo para Anclora Group: README de uso, resumen ejecutivo, scoring, arquitectura, piloto, ROI, roadmap, riesgos, RAG, evaluación del agente y nuevas guías de implantación.

*Confidence: 0.95 | Status: active | Created: 2026-06-09T02:11:16*

### Actualizado ANALISIS_EJECUTIVO_ANCLORA_PRIVATE_EST...

Actualizado ANALISIS_EJECUTIVO_ANCLORA_PRIVATE_ESTATES.md para corregir warnings Markdown: se eliminó el H4 innecesario 'Eyebrow', se sustituyeron pseudoencabezados por lista estructurada, se acortaron filas largas, se dejó el documento sin líneas >100 caracteres y markdownlint pasa limpio con MD013 desactivado en el propio archivo por el límite local de 80.

*Confidence: 1 | Status: active | Created: 2026-06-11T11:01:12*

### El usuario creó el cuaderno NotebookLM 'Cuaderno d...

El usuario creó el cuaderno NotebookLM 'Cuaderno de Spec-Driven Development para Anclora Group' en https://notebooklm.google.com/notebook/94462119-4635-4039-827d-e46042428871 y añadió /home/toni/projects/SDD-documentacion al workspace Anclora como referencia SDD para agentes IA; documento clave: Guía de uso SDD para agentes IA en el ecosistema Anclora Group.md.

*Confidence: 1 | Status: active | Created: 2026-06-10T01:14:54 | Tags: `anclora`, `sdd`, `notebooklm`, `workspace`, `agents`*

---

## Errors

*Failure records, bugs, and lessons learned from mistakes.*

### In Link2Media Windows portable, yt-dlp failed on u...

In Link2Media Windows portable, yt-dlp failed on user's Windows with SSL CERTIFICATE_VERIFY_FAILED unable to get local issuer certificate. Direct test showed yt-dlp succeeds with --no-check-certificates; add this flag to metadata and conversion yt-dlp invocations for portable reliability.

*Confidence: 1 | Status: active | Created: 2026-06-14T23:41:21*

### In convertidor_youtube_mp3 portable Windows packag...

In convertidor_youtube_mp3 portable Windows packaging, user reproduced a 400 Bad Request on /api/metadata with YouTube short URL https://youtu.be/88fD-UtG_yo?si=xMGMQgiEI3iLRle1; fix should ensure youtu.be URLs with query params/trailing whitespace normalize correctly.

*Confidence: 1 | Status: active | Created: 2026-06-14T22:23:08*

### Error resuelto en anclora-nexus staging: nexus-sta...

Error resuelto en anclora-nexus staging: nexus-staging.anclora.com devolvía Vercel 404 NOT_FOUND porque el proyecto Vercel tenía settings incorrectos y resolvía @vercel/static con output vacío. Se corrigieron settings remotos del proyecto anclora-nexus-frontend (installCommand npm ci, devCommand npm run dev, rootDirectory frontend) y se movió vercel.json de raíz a frontend/vercel.json. Commit staging b345a97. Verificado: deployment READY y https://nexus-staging.anclora.com/ responde 307 a /login, sin 404.

*Confidence: 0.95 | Status: active | Created: 2026-06-10T02:22:39*

### Advisor AI Vercel/Next.js deploy failed because sr...

Advisor AI Vercel/Next.js deploy failed because src/app/api/**/route.ts exported helper factories (createLegalDocumentComparePost, createLegalDocumentValidatePost, createValidateContractPost). Next App Router route files must export only valid route handlers/config; factories were moved to src/lib route-handler modules and route.ts now only exports POST.

*Confidence: 1 | Status: active | Created: 2026-06-13T16:20:27*

---

*End of memory export.*
