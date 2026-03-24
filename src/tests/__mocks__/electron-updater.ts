export const autoUpdater = {
  autoDownload:         false,
  autoInstallOnAppQuit: false,
  on:             jest.fn(),
  once:           jest.fn(),
  checkForUpdates:jest.fn().mockResolvedValue(null),
  downloadUpdate: jest.fn().mockResolvedValue(null),
  quitAndInstall: jest.fn(),
}
