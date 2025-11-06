const { contextBridge, ipcRenderer } = require('electron')

// Expose a tiny API for high-score storage and fullscreen toggle
contextBridge.exposeInMainWorld('electronAPI', {
  getHighScore: () => {
    // This part runs in the secure, isolated context of the renderer
    // (though note: localStorage is a renderer-side feature)
    try {
      const raw = localStorage.getItem('brick_high')
      return raw ? parseInt(raw, 10) : 0
    } catch (e) {
      return 0
    }
  },
  setHighScore: (v) => {
    try {
      localStorage.setItem('brick_high', String(v))
    } catch (e) {}
  },
  // This sends the message to the Main Process
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen') 
})