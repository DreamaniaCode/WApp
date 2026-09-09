# WApp Manager - Windows App Instructions

This project has been configured to run as a standalone Windows application using Electron.

## Prerequisites

- Node.js (v18 or later recommended)
- All project dependencies installed (`npm install`)

## Development Mode

To run the application in development mode with Electron:

```bash
npm run electron:dev
```

This will:
1. Start the Next.js development server (port 3000)
2. Start the WhatsApp backend (port 3001)
3. Launch the Electron window

## Building for Windows

To create a production installer (`.exe`):

```bash
npm run electron:build
```

The resulting installer will be in the `dist` folder.

## Troubleshooting

- **QR Code not showing**: Ensure the backend is running. Check the terminal for "QR RECEIVED".
- **Authentication**: Authentication data is stored in your user's AppData folder (`%APPDATA%/WApp Manager/.wwebjs_auth`).
