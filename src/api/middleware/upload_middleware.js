const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const popupDir = path.join(uploadsDir, 'popups');
        if (!fs.existsSync(popupDir)) {
            fs.mkdirSync(popupDir, { recursive: true });
        }
        cb(null, popupDir);
    },
    filename: function (req, file, cb) {
        // Generate unique filename with timestamp
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'popup-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// Enhanced file filter that checks both MIME type and file extension
const fileFilter = (req, file, cb) => {
    const allowedMimeTypes = [
        'image/jpeg',
        'image/jpg', 
        'image/png',
        'image/gif',
        'image/webp'
    ];
    
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    
    // Check MIME type first
    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
        return;
    }
    
    // If MIME type is application/octet-stream, check file extension
    if (file.mimetype === 'application/octet-stream') {
        const fileExtension = path.extname(file.originalname).toLowerCase();
        if (allowedExtensions.includes(fileExtension)) {
            // Allow the file but log a warning
            console.warn(`File ${file.originalname} has MIME type application/octet-stream but valid extension ${fileExtension}. Allowing upload.`);
            cb(null, true);
            return;
        }
    }
    
    // If neither MIME type nor extension is valid, reject
    cb(new Error(`File type ${file.mimetype} with extension ${path.extname(file.originalname)} is not allowed. Allowed types: ${allowedMimeTypes.join(', ')}`), false);
};

// Configure multer
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    }
});

// Error handling wrapper
const uploadWithErrorHandling = (fieldName) => {
    return (req, res, next) => {
        upload.single(fieldName)(req, res, (err) => {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({
                        success: false,
                        message: 'File too large. Maximum size is 5MB.'
                    });
                }
                return res.status(400).json({
                    success: false,
                    message: `Upload error: ${err.message}`
                });
            } else if (err) {
                return res.status(400).json({
                    success: false,
                    message: err.message
                });
            }
            next();
        });
    };
};

module.exports = { upload, uploadWithErrorHandling };