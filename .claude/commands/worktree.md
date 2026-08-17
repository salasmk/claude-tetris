---
description: Crea un git worktree aislado en .tree/[nombre] y ejecuta en él las instrucciones recibidas
argument-hint: <instrucciones de la tarea>
---

El usuario ha invocado `/worktree` con las siguientes instrucciones:

$ARGUMENTS

Sigue estos pasos:

1. A partir de las instrucciones anteriores, determina un nombre corto en kebab-case que describa la tarea (por ejemplo `fix-scoring-bug`, `add-hold-piece`, `refactor-render`). Este será `[nombre]`.
2. Verifica el estado del repo con `git status` para asegurarte de que no hay conflictos evidentes antes de crear el worktree.
3. Crea una rama y el worktree aislado en `.tree/[nombre]`:
   ```
   git worktree add .tree/[nombre] -b [nombre]
   ```
   Si la carpeta `.tree/` no existe, se creará automáticamente al ejecutar el comando.
4. Cambia tu contexto de trabajo a esa ruta (`D:\Cursos\curso-claude-code\03-tetris\.tree\[nombre]`) y ejecuta ahí, de forma aislada del código principal, las instrucciones recibidas del usuario. No modifiques archivos fuera de ese worktree.
5. Al finalizar, informa al usuario el nombre del worktree creado, la rama asociada, y un resumen de lo realizado dentro de ese worktree — incluyendo cómo revisarlo (`cd .tree/[nombre]`) o integrarlo (merge/PR) cuando esté listo.

No hagas merge ni push automáticamente salvo que el usuario lo pida explícitamente.
