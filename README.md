Backup Restore

| Env Var                 | Default  | Description                                                        |
|-------------------------|----------|--------------------------------------------------------------------|
| `RCLONE_CONFIG_CONTENT` | `""`     | Content of rclone config file                                      |
| `BACKUP_NAME`           | required | Name of backup                                                     |
| `REMOTE_BACKUP_DIR`     | required | Remote backup directory, example: `dropbox:/backup`                |
| `GLOB_TO_BE_BACKED_UP`  | `""`     | Newline-delimited globs of files to be backed up, example: `*.txt` |
| `MAX_BACKUPS`           | `0`      | Maximum number of backups to keep, 0 for unlimited                 |
