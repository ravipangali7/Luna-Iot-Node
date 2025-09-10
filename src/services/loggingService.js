const fs = require('fs');
const path = require('path');

class LoggingService {
  constructor() {
    this.logDir = path.join(__dirname, '../../logs');
    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  getLogFileName(service) {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.logDir, `${service}_${date}.log`);
  }

  formatLogMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      data
    };
    return JSON.stringify(logEntry) + '\n';
  }

  log(service, level, message, data = null) {
    const logFile = this.getLogFileName(service);
    const logMessage = this.formatLogMessage(level, message, data);
    
    fs.appendFile(logFile, logMessage, (err) => {
      if (err) {
        console.error('Failed to write to log file:', err);
      }
    });
    
    // Also log to console
    console.log(`[${service}] ${level.toUpperCase()}: ${message}`, data ? data : '');
  }

  info(service, message, data = null) {
    this.log(service, 'info', message, data);
  }

  error(service, message, data = null) {
    this.log(service, 'error', message, data);
  }

  warn(service, message, data = null) {
    this.log(service, 'warn', message, data);
  }

  debug(service, message, data = null) {
    this.log(service, 'debug', message, data);
  }
}

module.exports = new LoggingService();
