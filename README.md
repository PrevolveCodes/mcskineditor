# SkinForge

Browser-based Minecraft skin editor for GitHub Pages.

The repository contains a functional editor foundation: responsive UI, 64x64 PNG import/export, pixel painting, eraser, fill, eyedropper, magic-wand color selection, mirror painting, undo/redo, IndexedDB local persistence, offline status, and a Three.js 3D preview.

GitHub Pages: Settings -> Pages -> deploy the `main` branch/root. All project assets use relative `./` paths.

Cloud note: GitHub Pages cannot provide private per-user storage by itself. A production cloud library must use a separately configured Firebase or Supabase project. Never commit admin, service-account, or service-role credentials. Database/storage rules must enforce authenticated user ownership.

Advanced work that remains to be implemented includes exact Minecraft UV face mapping and direct 3D surface painting, complete custom brush/selection/transform systems, palette formats, pose persistence, reference layers, Firebase authentication/sync/version history/conflict handling, and complete animation export controls. These are intentionally not represented as fake completed features.