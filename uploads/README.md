# Uploads Directory

This directory contains files uploaded by users through the application.

## Purpose

The uploads directory stores:
- **Profile photos** for user avatars
- **Document uploads** for various features
- **Temporary files** during processing
- **Generated files** like reports and exports
- **Backup files** for data recovery

## Structure

```
uploads/
├── profilePhoto/              # User profile pictures
│   ├── 1234567890-avatar.jpg  # User profile photos
│   └── 1234567891-avatar.png  # User profile photos
├── documents/                 # Document uploads
│   ├── contracts/            # Contract documents
│   ├── invoices/              # Invoice files
│   └── reports/               # Generated reports
├── temp/                     # Temporary files
│   ├── processing/           # Files being processed
│   └── cache/                 # Cached files
├── exports/                  # Data exports
│   ├── csv/                  # CSV exports
│   ├── excel/                # Excel exports
│   └── pdf/                  # PDF exports
└── backups/                  # Backup files
    ├── database/             # Database backups
    └── files/                # File backups
```

## File Types

### Profile Photos
- **Formats**: JPEG, PNG, GIF, WebP
- **Size Limit**: 5MB per file
- **Dimensions**: Auto-resized to 300x300px
- **Naming**: `{userId}-{timestamp}.{ext}`

### Documents
- **Formats**: PDF, DOC, DOCX, TXT
- **Size Limit**: 50MB per file
- **Security**: Virus scanning enabled
- **Naming**: `{type}-{timestamp}.{ext}`

### Images
- **Formats**: JPEG, PNG, GIF, WebP, SVG
- **Size Limit**: 10MB per file
- **Processing**: Auto-optimization enabled
- **Naming**: `{category}-{timestamp}.{ext}`

### Exports
- **Formats**: CSV, Excel, PDF
- **Size Limit**: 100MB per file
- **Retention**: 30 days automatic cleanup
- **Naming**: `{type}-{date}.{ext}`

## File Upload Process

### 1. **Upload Validation**
```javascript
// File type validation
const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
if (!allowedTypes.includes(file.mimetype)) {
    throw new Error('Invalid file type');
}

// File size validation
const maxSize = 5 * 1024 * 1024; // 5MB
if (file.size > maxSize) {
    throw new Error('File too large');
}
```

### 2. **File Processing**
```javascript
// Generate unique filename
const filename = `${userId}-${Date.now()}.${ext}`;
const uploadPath = path.join('uploads', 'profilePhoto', filename);

// Save file
await file.mv(uploadPath);

// Update database record
user.profilePhoto = filename;
await userRepo.save(user);
```

### 3. **File Serving**
```javascript
// Serve uploaded files
app.use('/uploads', express.static('uploads'));

// Access file: http://localhost:5001/uploads/profilePhoto/1234567890-avatar.jpg
```

## Security Considerations

### File Validation
- **MIME type checking** to prevent file type spoofing
- **File extension validation** for additional security
- **Virus scanning** for uploaded files
- **Content inspection** for malicious files

### Access Control
- **Authentication required** for file uploads
- **Authorization checks** for file access
- **Private file storage** for sensitive documents
- **Public file serving** for profile photos

### File Sanitization
- **Filename sanitization** to prevent path traversal
- **Content validation** for uploaded files
- **Automatic file cleanup** for temporary files
- **Secure file storage** with proper permissions

## File Management

### Automatic Cleanup
```javascript
// Clean up temporary files older than 24 hours
const cleanupTempFiles = async () => {
    const tempDir = path.join('uploads', 'temp');
    const files = await fs.readdir(tempDir);
    
    for (const file of files) {
        const filePath = path.join(tempDir, file);
        const stats = await fs.stat(filePath);
        const age = Date.now() - stats.mtime.getTime();
        
        if (age > 24 * 60 * 60 * 1000) { // 24 hours
            await fs.unlink(filePath);
        }
    }
};
```

### File Compression
```javascript
// Compress large files
const compressFile = async (filePath) => {
    const compressed = await sharp(filePath)
        .resize(800, 600, { fit: 'inside' })
        .jpeg({ quality: 80 })
        .toBuffer();
    
    await fs.writeFile(filePath, compressed);
};
```

### File Backup
```javascript
// Backup important files
const backupFile = async (filePath) => {
    const backupPath = path.join('uploads', 'backups', path.basename(filePath));
    await fs.copyFile(filePath, backupPath);
};
```

## Performance Optimization

### File Caching
- **Browser caching** for static files
- **CDN integration** for global file delivery
- **Compression** for large files
- **Lazy loading** for image galleries

### Storage Optimization
- **File deduplication** for identical files
- **Automatic compression** for large files
- **Thumbnail generation** for images
- **Progressive loading** for large files

## Monitoring and Analytics

### File Usage Metrics
- **Upload volume** per day/week/month
- **File type distribution** across categories
- **Storage usage** by file type
- **User upload patterns** and behavior

### Performance Monitoring
- **Upload success rates** and failure analysis
- **File processing times** for different types
- **Storage I/O performance** metrics
- **CDN performance** for file delivery

## Backup and Recovery

### Backup Strategy
- **Daily backups** of critical files
- **Incremental backups** for large datasets
- **Offsite storage** for disaster recovery
- **Version control** for important documents

### Recovery Procedures
- **File restoration** from backups
- **Data integrity checks** after recovery
- **User notification** of file availability
- **Audit logging** of recovery operations

## Troubleshooting

### Common Issues

1. **Upload Failures**
   - Check file size limits
   - Verify file type permissions
   - Review disk space availability
   - Check network connectivity

2. **File Access Issues**
   - Verify file permissions
   - Check authentication status
   - Review authorization rules
   - Validate file paths

3. **Performance Issues**
   - Monitor disk I/O performance
   - Check network bandwidth
   - Review file processing times
   - Optimize file compression

### Debug Commands
```bash
# Check upload directory permissions
ls -la uploads/

# Monitor disk usage
du -sh uploads/*

# Check file integrity
find uploads/ -type f -exec md5sum {} \;

# Clean up temporary files
find uploads/temp/ -type f -mtime +1 -delete
```

## Best Practices

### File Organization
1. **Use descriptive directory names** for different file types
2. **Implement consistent naming conventions** for files
3. **Organize files by date** for easier management
4. **Use subdirectories** for large file collections

### Security Measures
1. **Validate all file uploads** before processing
2. **Implement virus scanning** for uploaded files
3. **Use secure file storage** with proper permissions
4. **Monitor file access** for suspicious activity

### Performance Optimization
1. **Implement file caching** for frequently accessed files
2. **Use CDN** for global file delivery
3. **Compress files** to reduce storage and bandwidth
4. **Monitor storage usage** and implement cleanup

### Maintenance
1. **Regular cleanup** of temporary files
2. **Monitor disk usage** and implement alerts
3. **Backup important files** regularly
4. **Update security measures** as needed
