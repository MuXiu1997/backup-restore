Backup Restore

| Env Var                 | Default  | Description                                                        |
|-------------------------|----------|--------------------------------------------------------------------|
| `BACKUP_METHOD`         | required | Backup method, `rclone` or `webdav`                                |
| `RCLONE_CONFIG_CONTENT` | `""`     | Content of rclone config file                                      |
| `RCLONE_REMOTE`         | `""`     | Remote name in rclone config file                                  |
| `WEBDAV_URL`            | `""`     | WebDAV URL                                                         |
| `WEBDAV_USERNAME`       | `""`     | WebDAV username                                                    |
| `WEBDAV_PASSWORD`       | `""`     | WebDAV password                                                    |
| `BACKUP_NAME`           | required | Name of backup                                                     |
| `REMOTE_BACKUP_DIR`     | required | Remote backup directory, example: `/backup`                        |
| `GLOB_TO_BE_BACKED_UP`  | `""`     | Newline-delimited globs of files to be backed up, example: `*.txt` |
| `MAX_BACKUPS`           | `0`      | Maximum number of backups to keep, 0 for unlimited                 |
