import { access, copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const sourcePath = path.resolve('staticwebapp.config.json')
const distDir = path.resolve('dist')
const destinationPath = path.join(distDir, 'staticwebapp.config.json')

async function ensureDistExists(directory) {
  try {
    await access(directory)
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      await mkdir(directory, { recursive: true })
      return
    }

    throw error
  }
}

async function copyConfig() {
  await ensureDistExists(distDir)
  await copyFile(sourcePath, destinationPath)
  console.log('staticwebapp.config.json copied to dist')
}

copyConfig().catch((error) => {
  console.error('Failed to copy staticwebapp.config.json into dist:', error)
  process.exitCode = 1
})
