# BaseCamp Channels

A multi-file Firebase collaboration hub with:

- Firebase email/password authentication
- Persistent user profiles
- Groups
- Group messages
- Personal one-to-one conversations
- Firestore Security Rules
- Responsive dark interface

## 1. Create a Firebase project

1. Open https://console.firebase.google.com/
2. Create a project.
3. Add a Web App.
4. Copy the Firebase configuration.
5. Paste the values into `firebase-config.js`.

## 2. Enable Authentication

Firebase Console -> Build -> Authentication -> Sign-in method -> Email/Password -> Enable.

## 3. Create Firestore

Firebase Console -> Build -> Firestore Database -> Create database.

Deploy `firestore.rules` using Firebase CLI or paste the rules into the Firestore Rules editor.

## 4. Run locally

Because this project uses ES modules, use a local web server rather than opening index.html directly.

Examples:

Python:
```bash
python -m http.server 5500
```

Then open:
http://localhost:5500

VS Code:
- Install Live Server.
- Right-click index.html.
- Select Open with Live Server.

## 5. Deploy

You can deploy with Firebase Hosting or upload the frontend to a static host.

Before public release:
- Review Firestore Rules.
- Add stronger group invite validation.
- Add rate limiting and abuse protection.
- Add pagination for large message histories.
- Avoid exposing privileged admin operations in client-only code.
- Consider Cloud Functions for trusted server-side moderation and role changes.

## Important limitation

The current implementation is a functional starter application, not a complete production-grade chat service. It does not yet include end-to-end encryption, push notifications, file storage, message pagination, or a complete administrator management console.
