import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import routes from './routes/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Serve profile photos
app.use('/profile', express.static(path.join(__dirname, '..', 'uploads', 'profilePhoto')));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '..', 'public')));

// Add this after other middleware but before error handling
app.use('/api', routes);

export default app;
