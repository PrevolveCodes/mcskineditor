# SkinForge

Browser-based Minecraft skin editor for GitHub Pages.

The repository contains a functional editor foundation with responsive UI, 64x64 PNG import/export, pixel painting, IndexedDB local persistence, offline status, and a Three.js 3D preview.

## GitHub Pages

Deploy the `main` branch from the repository root in GitHub Pages. All project assets use relative paths.

## Firebase cloud setup

SkinForge now includes Firebase Authentication and Cloud Firestore cloud saving. Firebase Storage is intentionally not used, so the editor does not require a Storage bucket for cloud skins.

1. Create or open the Firebase project for the editor.
2. Register the GitHub Pages web app.
3. Enable Authentication -> Email/Password.
4. Create a Firestore database.
5. Add `prevolvecodes.github.io` to Authentication -> Settings -> Authorized domains.
6. Deploy the rules in `firestore.rules` to the Firestore database.

The browser Firebase configuration in `js/cloud.js` contains the public web-app configuration. Never add a Firebase service-account private key, Admin SDK credential, or other server secret to this repository.

Cloud data is stored under each authenticated user's UID. The Firestore rules only allow a signed-in user to read and write documents beneath their own UID.

## Current cloud features

- Email/password account creation and login
- Password reset
- Logout
- Private per-user Firestore skin library
- Cloud PNG skin storage inside Firestore documents
- Skin version numbers and version snapshots
- Load and delete cloud skins
- Local IndexedDB editing remains available without an account

## Remaining editor work

The project is intentionally not presented as a complete PMCSkin3D replacement yet. Advanced work still includes exact Minecraft UV face mapping and direct 3D surface painting, complete selection/transform systems, custom brush serialization, palette formats, pose persistence, reference layers, conflict-aware cross-device sync, and complete animation/video export controls. These are not represented as fake completed features.
