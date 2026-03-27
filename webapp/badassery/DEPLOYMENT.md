# Deployment Guide for Badassery Platform

## Prerequisites

1. Install Firebase CLI globally:
```bash
npm install -g firebase-tools
```

2. Login to Firebase:
```bash
firebase login
```

## Deploy Web App (Firebase Hosting)

1. Build the production app:
```bash
npm run build
```

2. Deploy to Firebase Hosting:
```bash
firebase deploy --only hosting
```

3. Access your app at: **https://brooklynn-61dc8.web.app**

## Deploy Cloud Functions (Email SMTP)

1. Navigate to functions directory:
```bash
cd functions
```

2. Install dependencies:
```bash
npm install
```

3. Configure Gmail credentials:
```bash
firebase functions:config:set gmail.user="neil.benhamou@gmail.com" gmail.password="cxglvlcxpkzkrkvj"
```

Note: The app password should be entered without spaces.

4. Deploy functions:
```bash
firebase deploy --only functions
```

## Deploy Everything

```bash
# Build app
npm run build

# Deploy hosting + functions
firebase deploy
```

## Test Mode for Emails

By default, emails are sent in TEST MODE:
- All emails redirect to `dletayf@gmail.com`
- The subject includes `[TEST - To: original@email.com]`

To disable test mode, update Settings in the app.

## Troubleshooting

### "Missing Firestore index" error
Click the link in the Firebase Console error message to create the required index.

### "Cloud Function not deployed" error
```bash
cd functions
npm install
firebase deploy --only functions
```

### Build fails
```bash
npm install
npm run build
```
