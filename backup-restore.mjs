#!/usr/bin/env zx

// region config
const xdgConfigHome = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config')
const rcloneConfigContent = process.env.RCLONE_CONFIG_CONTENT
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
//endregion config

const commandBackup = 'backup'
const commandRestore = 'restore'
const availableCommands = [commandBackup, commandRestore]

async function writeRcloneConfig() {
    console.log('setting up rclone config...')
    if (!rcloneConfigContent) {
        console.log('no rclone config content found, skipping')
        return
    }
    await fs.mkdir(path.join(xdgConfigHome, 'rclone'), {recursive: true})
    await fs.writeFile(path.join(xdgConfigHome, 'rclone', 'rclone.conf'), rcloneConfigContent)
    console.log('rclone config set up')
}

async function backup() {
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

    await $`rclone sync ${backupFilename} ${remoteBackupDir}`
    console.log(`backup file uploaded`)
    await fs.rm(backupFilename)

    await cleanupBackupFiles()
}

async function restore() {
    console.log('restoring files...')

    const remoteBackupFiles = await getRemoteBackupFiles()
    if (remoteBackupFiles.length === 0) {
        console.error(chalk.red('no backups found, aborting'))
        process.exit(1)
    }
    const latestBackup = remoteBackupFiles.sort().pop()
    console.log(`latest backup: ${latestBackup}`)

    await $`rclone sync ${path.join(remoteBackupDir, latestBackup)} .`
    console.log(`backup file downloaded`)

    await $`tar -xzf ${latestBackup}`
    console.log(`backup file extracted`)
    await fs.rm(latestBackup)
}

async function cleanupBackupFiles() {
    if (maxBackups === 0) {
        console.log('max backups set to 0, skipping cleanup')
        return
    }

    const remoteBackupFiles = await getRemoteBackupFiles()
    if (remoteBackupFiles.length <= maxBackups) {
        console.log('no backups to be deleted, skipping cleanup')
        return
    }
    const remoteBackupFilesToDelete = remoteBackupFiles
        .sort()
        .slice(0, remoteBackupFiles.length - maxBackups)
    console.log(`backups to be deleted:\n${remoteBackupFilesToDelete.map(f => '- ' + f).join('\n')}`)
    await $`rclone delete ${remoteBackupFilesToDelete.map(f => ['--include', f]).flat()} ${remoteBackupDir}`
}

async function getRemoteBackupFiles() {
    const remoteBackupDirFilesJson = (await $`rclone lsjson ${remoteBackupDir}`).stdout
    console.log('\n')
    const remoteBackupDirFiles = JSON.parse(remoteBackupDirFilesJson)
    return remoteBackupDirFiles
        .filter(f => f.Name.match(new RegExp(`^${backupName}-\\d{14}.tar.gz$`)))
        .map(f => f.Name)
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
    await writeRcloneConfig()
    switch (argv._[0]) {
        case commandBackup:
            await backup()
            return
        case commandRestore:
            await restore()
            return
    }
}

await main()
