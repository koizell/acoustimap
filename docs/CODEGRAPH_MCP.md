# Codegraph MCP global en OpenCode

Herramienta local de desarrollo, separada de AcoustiMap. Fuente solicitada:
[websines/codegraph-mcp](https://github.com/websines/codegraph-mcp), revisión
`5e2b37cc58c3d0b0bf7f21edae0fd97519eef6b2`. No sustituye las instrucciones de
AGENTS.md ni las pruebas; no forma parte de `dist/`.

## Instalación verificada en este equipo

- Rust instalado con rustup, perfil mínimo, sin modificar el PATH de los shells.
  Los ejecutables viven en `~/.cargo/bin/`; se pueden invocar por ruta absoluta.
- Binario instalado en `~/.cargo/bin/codegraph`, compilado con `Cargo.lock`.
- Configuración **global** en `~/.config/opencode/opencode.json`, preservando
  los MCP y plugins existentes. No hay `opencode.json` nuevo en el proyecto.
- Skill global adaptada para OpenCode en
  `~/.config/opencode/skills/codegraph/SKILL.md`: catálogo real de Code Mode,
  seguridad, permisos del harness, memoria local y validación del grafo.
- Configuración sin `cwd` fijo: OpenCode inicia el servidor en el workspace
  correspondiente. Cada proyecto conserva su propio estado y grafo; no se
  indexa todo el directorio personal de forma automática.

La entrada global usa el formato de
[OpenCode V2](https://opencode.ai/v2/docs/mcp-servers):

```json
"codegraph": {
  "type": "local",
  "command": ["/ruta/absoluta/a/.cargo/bin/codegraph"],
  "environment": { "RUST_LOG": "warn" }
}
```

La instalación se registró con `opencode mcp add codegraph --global --
/ruta/absoluta/a/codegraph`. `opencode mcp list` lo mostró **connected** y el
catálogo de esta revisión ofrece **28 herramientas**, no las 26 que anuncia
el README del proveedor. OpenCode recargó la conexión y detectó la skill sin
reiniciar todo su servicio ni interrumpir otros MCP.

También se comprobó por API una segunda ubicación de OpenCode, distinta de
AcoustiMap: la configuración cargada proviene del mismo archivo global y
Codegraph aparece conectado. No se indexó ese segundo proyecto. Para verificar
una ubicación explícita, el contrato V2 usa el parámetro
`location[directory]`; un primer `mcp list` de una ubicación todavía no cargada
puede mostrar una lista vacía antes de inicializar sus servicios.

## Corrección local necesaria

La versión del repositorio elegido conecta, pero la consulta
`src/code/queries/javascript-references.scm` no compila contra su gramática
tree-sitter: `class_heritage` no admite el campo `value`. El servidor solo
registraba advertencias y su resultado parecía una indexación correcta aunque
no hubiese símbolos JavaScript.

Se corrigió **solo la copia de construcción local**, sin modificar el remoto:

```diff
 (class_declaration
   (class_heritage
-    value: (identifier) @superclass
+    (identifier) @superclass
   )
 ) @extends
```

El parche reproducible y las notas de instalación quedan junto a la skill global
en `references/`. Una actualización del proveedor puede requerir revisar si el
parche sigue siendo necesario; no actualizar a ciegas.

Con esa corrección: **100 pruebas del binario aprobadas** con
`cargo test --locked --release --bin codegraph`. La suite completa del proveedor
**no** se da por aprobada: su prueba de integración `mcp_integration` invoca
`Server::with_dependencies`, que ya no existe. No se cambió esa prueba para
ocultar el fallo.

## Uso y privacidad

Antes de indexar se excluyeron en `.codegraph/config.toml` las credenciales de
`js/config.local.js`, artefactos, dependencias, salida de Graphify y estado local.
`.codegraph/` está ignorado por Git. Los parámetros `exclude` son componentes
de ruta exactos, **no globs**; revisar secretos JS/Python de cada proyecto antes
de su primera indexación. No guardar tokens ni datos privados en la memoria.

La indexación inicial comprobada analizó 60 archivos y extrajo **2.192 símbolos /
5.791 relaciones**. `search_symbols` encontró `loadChallengeProgress` y
`get_neighbors` mostró sus relaciones con `getLocalChallengeMeasurements`,
`coHour`, `coDayKey` y `reportChallengeProgress`. La configuración local secreta
no tiene símbolos indexados.

El grafo es aproximado: hay referencias sin resolver y nombres ambiguos que
pueden enlazarse a un símbolo homónimo de pruebas. Los scripts clásicos de esta
app no importan módulos y HTML/CSS/SQL no están plenamente representados. Usar
el grafo para orientarse y comprobar las conclusiones en fuente y con
`npm run check`; no interpretar cada relación como resolución de tipos real.

Las bases se ubican en `~/.cache/codegraph/<hash-del-proyecto>/store.db` y
`<proyecto>/.codegraph/learning.db`. Para retomar trabajo se consultan
`smart_context`, `recall_failures` y `suggest_approach`. Si todavía no hay sesión,
`smart_context` responde «No active session»: crearla con `start_session`.
Luego registrar contexto/decisiones y actualizar el índice incrementalmente.

Los permisos del agente siguen vigentes. `bash_compressed` ejecuta comandos:
no se usa para saltarse restricciones del modo Plan o comandos destructivos.
