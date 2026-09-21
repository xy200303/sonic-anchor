import log from 'electron-log/main'

log.initialize()

log.transports.file.maxSize = 10 * 1024 * 1024
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}'

if (process.env.NODE_ENV === 'development') {
  log.transports.console.format = '[{level}] {text}'
} else {
  log.transports.console.level = false
}

export { log }
