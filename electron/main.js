const { app, BrowserWindow, Tray, Menu, screen, nativeImage } = require('electron')
const path = require('path')

// Base URL — your Next.js dev server or production URL
const BASE_URL = process.env.TC_URL || 'http://localhost:3000'

let mainWindow = null
let mascotWindow = null
let tray = null

function createMainWindow() {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize

  mainWindow = new BrowserWindow({
    width: Math.min(1400, screenW - 100),
    height: Math.min(900, screenH - 100),
    titleBarStyle: 'hiddenInset', // macOS: sleek title bar with traffic lights inset
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.loadURL(BASE_URL)

  // Intercept window.open() calls — if it's the mascot pop-out, make it transparent
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('/pop/mascot')) {
      // Create the transparent mascot window ourselves
      createMascotWindow()
      return { action: 'deny' } // don't let Chrome handle it
    }
    // All other pop-outs open normally
    return { action: 'allow' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    // Close mascot when main app closes
    if (mascotWindow) {
      mascotWindow.close()
      mascotWindow = null
    }
  })
}

function createMascotWindow() {
  // If already open, just focus it
  if (mascotWindow && !mascotWindow.isDestroyed()) {
    mascotWindow.show()
    return
  }

  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize

  mascotWindow = new BrowserWindow({
    width: 280,
    height: 360,
    x: screenW - 300,
    y: screenH - 380,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mascotWindow.loadURL(`${BASE_URL}/pop/mascot`)
  mascotWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  mascotWindow.on('closed', () => {
    mascotWindow = null
  })
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'public', 'icon-192.png')
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 18, height: 18 })
  tray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show App',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        } else {
          createMainWindow()
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Show Mascot',
      click: () => createMascotWindow(),
    },
    {
      label: 'Hide Mascot',
      click: () => mascotWindow?.hide(),
    },
    {
      label: 'Always on Top',
      type: 'checkbox',
      checked: true,
      click: (menuItem) => {
        mascotWindow?.setAlwaysOnTop(menuItem.checked)
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit(),
    },
  ])

  tray.setToolTip('Trade Companion')
  tray.setContextMenu(contextMenu)
}

app.whenReady().then(() => {
  createTray()
  createMainWindow()
})

app.on('window-all-closed', (e) => {
  // macOS: keep running in tray
  if (process.platform === 'darwin') {
    e.preventDefault()
  }
})

app.on('activate', () => {
  if (!mainWindow) createMainWindow()
})
