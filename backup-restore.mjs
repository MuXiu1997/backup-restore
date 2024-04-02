#!/usr/bin/env zx
import {createClient} from 'webdav'


// region config
const xdgConfigHome = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config')
const backupMethod = process.env.BACKUP_METHOD
const availableBackupMethods = ['rclone', 'webdav']
if (!backupMethod || !availableBackupMethods.includes(backupMethod)) {
    console.error(chalk.red(`required env var BACKUP_METHOD not set or invalid, must be one of: ${availableBackupMethods.join(', ')}`))
    process.exit(1)
}
const rcloneConfigContent = process.env.RCLONE_CONFIG_CONTENT
const rcloneRemote = process.env.RCLONE_REMOTE
const webdavUrl = process.env.WEBDAV_URL
const webdavUsername = process.env.WEBDAV_USERNAME
const webdavPassword = process.env.WEBDAV_PASSWORD
const backupName = process.env.BACKUP_NAME
if (!backupName) {
    console.error(chalk.red('required env var BACKUP_NAME not set'))
    process.exit(1)
}
const remoteBackupDir = process.env.REMOTE_BACKUP_DIR
if (!remoteBackupDir) {
    console.error(chalk.red('required env var REMOTE_BACKUP_DIR not set'))
    process.exit(1)
}
const globToBeBackedUp = (process.env.GLOB_TO_BE_BACKED_UP)?.split(/\r\n|\r|\n/) ?? []
const maxBackups = +(process.env.MAX_BACKUPS ?? '0')
// endregion config

const commandBackup = 'backup'
const commandRestore = 'restore'
const availableCommands = [commandBackup, commandRestore]

/**
 * @typedef {Object} BackupAdapter
 * @property {(backupFilename: string, remoteBackupDir: string) => Promise<void>} backup
 * @property {(backupFilename: string, remoteBackupDir: string) => Promise<void>} restore
 * @property {(backupFilenames: Array<string>, remoteBackupDir: string) => Promise<void>} delete
 * @property {(backupName: string, remoteBackupDir: string) => Promise<string[]>} getRemoteBackupFiles
 */

/**
 * @implements {BackupAdapter}
 */
class RcloneAdapter {
    constructor(xdgConfigHome, configContent, remote) {
        this.xdgConfigHome = xdgConfigHome
        this.configContent = configContent
        this.remote = remote
        this.init = this.writeRcloneConfig()
    }

    writeRcloneConfig = async () => {
        console.log('setting up rclone config...')
        if (!this.configContent) {
            console.log('no rclone config content found, skipping')
            return
        }
        await fs.mkdir(path.join(this.xdgConfigHome, 'rclone'), {recursive: true})
        await fs.writeFile(path.join(this.xdgConfigHome, 'rclone', 'rclone.conf'), this.configContent)
        console.log('rclone config set up')
    }

    backup = async (backupFilename, remoteBackupDir) => {
        await this.init
        await $`rclone sync ${backupFilename} ${this.remote}:${remoteBackupDir}`
    }

    restore = async (backupFilename, remoteBackupDir) => {
        await this.init
        await $`rclone sync ${this.remote}:${path.join(remoteBackupDir, backupFilename)} .`
    }

    delete = async (backupFilenames, remoteBackupDir) => {
        await this.init
        await $`rclone delete ${backupFilenames.map(f => ['--include', f]).flat()} ${this.remote}:${remoteBackupDir}`
    }

    getRemoteBackupFiles = async (backupName, remoteBackupDir) => {
        await this.init
        const remoteBackupDirFilesJson = (await $`rclone lsjson ${this.remote}:${remoteBackupDir}`).stdout
        console.log('\n')
        const remoteBackupDirFiles = JSON.parse(remoteBackupDirFilesJson)
        return remoteBackupDirFiles.map(f => f.Name)
    }
}

/**
 * @implements {BackupAdapter}
 */
class WebdavAdapter {
    constructor(url, username, password) {
        this.url = url
        this.username = username
        this.password = password
        this.client = createClient(
            this.url,
            {
                username: this.username,
                password: this.password,
            }
        )
    }

    backup = async (backupFilename, remoteBackupDir) => {
        await this.client.createDirectory(remoteBackupDir, {recursive: true})
        await this.client.putFileContents(
            path.join(remoteBackupDir, backupFilename),
            fs.createReadStream(backupFilename)
        )
    }

    restore = async (backupFilename, remoteBackupDir) => {
        const buffer = await this.client.getFileContents(path.join(remoteBackupDir, backupFilename))
        await fs.writeFile(backupFilename, buffer)
    }

    delete = async (backupFilenames, remoteBackupDir) => {
        await Promise.all(backupFilenames.map(f => this.client.deleteFile(path.join(remoteBackupDir, f))))
    }

    getRemoteBackupFiles = async (backupName, remoteBackupDir) => {
        const remoteBackupDirFiles = await this.client.getDirectoryContents(remoteBackupDir, {glob: `${backupName}-*.tar.gz`})
        return remoteBackupDirFiles
            .filter(f => f.basename.match(new RegExp(`^${backupName}-\\d{14}.tar.gz$`)))
            .map(f => f.basename)
    }
}

/**
 * @param {BackupAdapter} backupAdapter
 * @returns {Promise<void>}
 */
async function backup(backupAdapter) {
    console.log('backing up files...')

    const backupFilename = `${backupName}-${formatDate(new Date())}.tar.gz`

    const filesToBeBackedUp = await glob(globToBeBackedUp)
    if (filesToBeBackedUp.length === 0) {
        console.log('no files to be backed up, skipping')
        return
    }
    console.log(`files to be backed up:\n${filesToBeBackedUp.map(f => "- " + f).join('\n')}`)

    await $`tar -czf ${backupFilename} ${filesToBeBackedUp}`
    console.log(`backup file created: ${backupFilename}`)

    await backupAdapter.backup(backupFilename, remoteBackupDir)
    console.log(`backup file uploaded`)
    await fs.rm(backupFilename)

    await cleanupBackupFiles(backupAdapter)
}

/**
 * @param {BackupAdapter} backupAdapter
 * @returns {Promise<void>}
 */
async function restore(backupAdapter) {
    console.log('restoring files...')

    const remoteBackupFiles = await backupAdapter.getRemoteBackupFiles(backupName, remoteBackupDir)
    if (remoteBackupFiles.length === 0) {
        console.error(chalk.red('no backups found, aborting'))
        process.exit(1)
    }
    const latestBackup = remoteBackupFiles.sort().pop()
    console.log(`latest backup: ${latestBackup}`)

    await backupAdapter.restore(latestBackup, remoteBackupDir)
    console.log(`backup file downloaded`)

    await $`tar -xzf ${latestBackup}`
    console.log(`backup file extracted`)
    await fs.rm(latestBackup)
}

/**
 * @param {BackupAdapter} backupAdapter
 * @returns {Promise<void>}
 */
async function cleanupBackupFiles(backupAdapter) {
    if (maxBackups === 0) {
        console.log('max backups set to 0, skipping cleanup')
        return
    }

    const remoteBackupFiles = await backupAdapter.getRemoteBackupFiles(backupName, remoteBackupDir)
    if (remoteBackupFiles.length <= maxBackups) {
        console.log('no backups to be deleted, skipping cleanup')
        return
    }
    const remoteBackupFilesToDelete = remoteBackupFiles
        .sort()
        .slice(0, remoteBackupFiles.length - maxBackups)
    console.log(`backups to be deleted:\n${remoteBackupFilesToDelete.map(f => '- ' + f).join('\n')}`)
    await backupAdapter.delete(remoteBackupFilesToDelete, remoteBackupDir)
}

function formatDate(date) {
    const pad = (n) => n.toString().padStart(2, '0')
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

async function main() {
    if (argv._.length === 0 || !availableCommands.includes(argv._[0])) {
        console.log(`Usage: ${availableCommands.join(' | ')}`)
        process.exit(1)
    }

    const backupAdapter = backupMethod === 'rclone'
        ? new RcloneAdapter(xdgConfigHome, rcloneConfigContent, rcloneRemote)
        : new WebdavAdapter(webdavUrl, webdavUsername, webdavPassword)

    switch (argv._[0]) {
        case commandBackup:
            await backup(backupAdapter)
            return
        case commandRestore:
            await restore(backupAdapter)
            return
    }
}

await main()
