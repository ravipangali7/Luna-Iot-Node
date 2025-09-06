const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const emailService = require('./email_service');

class DatabaseBackupService {
    constructor() {
        this.backupDirectory = './backups';
        this.databaseConfig = {
            host: 'localhost',
            port: '3306',
            user: 'root',
            password: '214fa86d5dfe4729',
            database: 'luna_iot'
        };
        this.recipientEmails = ['lunatracking@gmail.com'];
        
        this.ensureBackupDirectory();
    }

    ensureBackupDirectory() {
        if (!fs.existsSync(this.backupDirectory)) {
            fs.mkdirSync(this.backupDirectory, { recursive: true });
            console.log(`Created backup directory: ${this.backupDirectory}`);
        }
    }

    async createDatabaseBackup() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
            const backupFileName = `${this.databaseConfig.database}_backup_${timestamp}.sql`;
            const backupFilePath = path.join(this.backupDirectory, backupFileName);

            // Create mysqldump command
            const mysqldumpCommand = `mysqldump -h ${this.databaseConfig.host} -P ${this.databaseConfig.port} -u ${this.databaseConfig.user} -p${this.databaseConfig.password} ${this.databaseConfig.database} > "${backupFilePath}"`;

            console.log('Creating database backup...');
            
            return new Promise((resolve, reject) => {
                exec(mysqldumpCommand, (error, stdout, stderr) => {
                    if (error) {
                        console.error('Database backup error:', error);
                        reject(error);
                        return;
                    }

                    if (stderr) {
                        console.warn('Database backup warning:', stderr);
                    }

                    // Check if backup file was created and has content
                    if (fs.existsSync(backupFilePath)) {
                        const stats = fs.statSync(backupFilePath);
                        if (stats.size > 0) {
                            console.log(`Database backup created successfully: ${backupFilePath} (${stats.size} bytes)`);
                            resolve({
                                success: true,
                                filePath: backupFilePath,
                                fileName: backupFileName,
                                size: stats.size
                            });
                        } else {
                            reject(new Error('Backup file is empty'));
                        }
                    } else {
                        reject(new Error('Backup file was not created'));
                    }
                });
            });
        } catch (error) {
            console.error('Database backup creation failed:', error);
            throw error;
        }
    }

    async sendBackupViaEmail() {
        try {
            if (this.recipientEmails.length === 0) {
                console.log('No recipient emails configured for backup notifications');
                return { success: false, error: 'No recipient emails configured' };
            }

            const backupResult = await this.createDatabaseBackup();
            
            if (!backupResult.success) {
                throw new Error('Failed to create database backup');
            }

            // Send email to all recipients
            const emailPromises = this.recipientEmails.map(async (email) => {
                const result = await emailService.sendDatabaseBackupEmail(
                    email.trim(),
                    backupResult.filePath,
                    this.databaseConfig.database
                );
                return { email: email.trim(), result };
            });

            const emailResults = await Promise.all(emailPromises);
            
            console.log('Backup email results:', emailResults);
            
            return {
                success: true,
                backupResult,
                emailResults
            };
        } catch (error) {
            console.error('Error sending backup via email:', error);
            return { success: false, error: error.message };
        }
    }

    async cleanupOldBackups(daysToKeep = 7) {
        try {
            const files = fs.readdirSync(this.backupDirectory);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

            let deletedCount = 0;
            
            for (const file of files) {
                if (file.endsWith('.sql')) {
                    const filePath = path.join(this.backupDirectory, file);
                    const stats = fs.statSync(filePath);
                    
                    if (stats.mtime < cutoffDate) {
                        fs.unlinkSync(filePath);
                        deletedCount++;
                        console.log(`Deleted old backup: ${file}`);
                    }
                }
            }

            console.log(`Cleaned up ${deletedCount} old backup files`);
            return { success: true, deletedCount };
        } catch (error) {
            console.error('Error cleaning up old backups:', error);
            return { success: false, error: error.message };
        }
    }

    // Run backup and email process
    async runBackupProcess() {
        try {
            console.log('Starting scheduled database backup process...');
            
            const result = await this.sendBackupViaEmail();
            
            if (result.success) {
                console.log('Database backup and email process completed successfully');
                
                // Clean up old backups after successful backup
                await this.cleanupOldBackups();
            } else {
                console.error('Database backup process failed:', result.error);
            }
            
            return result;
        } catch (error) {
            console.error('Database backup process error:', error);
            return { success: false, error: error.message };
        }
    }

    // Start the backup scheduler
    startBackupScheduler(intervalHours = 24) {
        console.log(`Starting database backup scheduler - running every ${intervalHours} hours`);
        
        // Run immediately on start
        this.runBackupProcess();
        
        // Then run on schedule
        setInterval(async () => {
            await this.runBackupProcess();
        }, intervalHours * 60 * 1000); // Convert hours to milliseconds
    }
}

module.exports = new DatabaseBackupService();