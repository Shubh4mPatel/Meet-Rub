const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const moment = require('moment');
const cron = require('node-cron');
const { getIndianDate } = require('../utils/logger');
const { logger } = require('../utils/logger');

// Function to add a folder to the zip
function addFolderToZip(zipFolder, folderPath) {
    const files = fs.readdirSync(folderPath);

    files.forEach((file) => {
        const fullPath = path.join(folderPath, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            const folderZip = zipFolder.folder(file);
            addFolderToZip(folderZip, fullPath);
        } else {
            const fileData = fs.readFileSync(fullPath);
            zipFolder.file(file, fileData);
        }
    });
}

// Function to check if the folder is older than 15 days
function isFolderOlderThan15Days(folderDate) {
    const currentDate = moment();
    const folderMoment = moment(folderDate, 'DD-MM-YYYY');
    const diffInDays = currentDate.diff(folderMoment, 'days');
    return diffInDays > 15;
}

// Function to delete folders after successful zip
function deleteFolders(sourceDir, foldersToDelete) {
    let deletedCount = 0;
    let failedCount = 0;

    foldersToDelete.forEach((folder) => {
        try {
            const folderPath = path.join(sourceDir, folder);
            fs.rmSync(folderPath, { recursive: true, force: true });
            deletedCount++;
            logger.info(`Deleted folder: ${folder}`);
        } catch (err) {
            failedCount++;
            logger.error(`Failed to delete folder ${folder}:`, err);
        }
    });

    logger.info(`Deletion summary: ${deletedCount} folders deleted, ${failedCount} failed`);
}

// Function to zip folders that are older than 15 days
function zipOldFolders(sourceDir, outputZipPath) {
    const zip = new JSZip();
    const folders = fs.readdirSync(sourceDir);

    const foldersToZip = folders.filter((folder) => {
        const folderPath = path.join(sourceDir, folder);
        
        try {
            const stat = fs.statSync(folderPath);
            
            // Only process directories, skip existing zip files
            if (stat.isDirectory() && !folder.startsWith('logs_backups_')) {
                return isFolderOlderThan15Days(folder);
            }
        } catch (err) {
            logger.error(`Error checking folder ${folder}:`, err);
        }
        
        return false;
    });

    if (foldersToZip.length > 0) {
        logger.info(`Found ${foldersToZip.length} folders older than 15 days to zip: ${foldersToZip.join(', ')}`);
        const zipFolder = zip.folder('zipped_folders');
        
        foldersToZip.forEach((folder) => {
            const folderPath = path.join(sourceDir, folder);
            addFolderToZip(zipFolder, folderPath);
        });

        zip
            .generateNodeStream({ type: 'nodebuffer', streamFiles: true })
            .pipe(fs.createWriteStream(outputZipPath))
            .on('finish', function () {
                logger.info('Zip file created successfully: ' + outputZipPath);
                
                // Delete old folders after successful zip
                logger.info('Starting deletion of zipped folders...');
                deleteFolders(sourceDir, foldersToZip);
            })
            .on('error', function (err) {
                logger.error('Error creating zip file:', err);
                logger.warn('Skipping folder deletion due to zip error');
            });
    } else {
        logger.info('No folders older than 15 days to zip.');
    }
}

const manageLogFiles = () => {
    try {
        const currentDir = __dirname;
        const parentDir = path.resolve(currentDir, '../logs');
        
        // Check if logs directory exists
        if (!fs.existsSync(parentDir)) {
            logger.warn(`Logs directory does not exist: ${parentDir}`);
            return;
        }
        
        logger.info('Running daily log zipping task');
        
        const dateStr = getIndianDate();
        const outputPath = path.join(parentDir, `logs_backups_${dateStr}.zip`);
        
        zipOldFolders(parentDir, outputPath);
    } catch (error) {
        logger.error('Error in manageLogFiles:', error);
    }
};

let cronJob = null;

// Export function to start cron job
const startLoggerCron = () => {
    if (cronJob) {
        logger.warn('Logger cron job already running');
        return;
    }

    logger.info('Starting logger cron job (runs daily at midnight)');
    
    // Schedule for midnight every day (IST)
    cronJob = cron.schedule('0 0 * * *', () => {
        manageLogFiles();
    }, {
        scheduled: true,
        timezone: "Asia/Kolkata"
    });
};

// Export function to stop cron job
const stopLoggerCron = () => {
    if (cronJob) {
        cronJob.stop();
        logger.info('Logger cron job stopped');
        cronJob = null;
    }
};

module.exports = {
    startLoggerCron,
    stopLoggerCron,
    manageLogFiles // Export for manual testing
};