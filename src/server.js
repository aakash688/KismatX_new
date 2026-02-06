// Load environment variables FIRST, before any other imports
import dotenv from "dotenv";
dotenv.config();

import "reflect-metadata";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";
import fileUpload from "express-fileupload";
import apiRouter from "./routes/routes.js";
import morgan from "morgan";
import { logger } from "./utils/logger/logger.js";
import { httpRequestDurationMicroseconds, register } from "./utils/logger/metrics.js";
import statusMonitor from "express-status-monitor";
import errorHandler from "./middleware/errorHandler.js";
import notFoundHandler from "./middleware/notFoundHandler.js";
import { AppDataSource } from "./config/typeorm.config.js";
import path from "path";
import { fileURLToPath } from 'url';
import {formatDatesMiddleware} from "./middleware/formatDates.js";

const app = express();
const PORT = process.env.PORT || 5001;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Go up from src to project root
const projectRoot = path.resolve(__dirname, '..');

// Define path to public folder
const publicPath = path.join(projectRoot, 'public');

// ------------------ Middlewares ------------------ //

// 🛡️ CORS setup
app.use(
  cors(
  // {
  //   origin: "*",
  //   credentials: true,
  //   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  //   allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  //   exposedHeaders: ['Set-Cookie']
  // }
)
);

// Body Parser and Cookies
app.use(bodyParser.json());
app.use(cookieParser());
app.use(fileUpload({
    createParentPath: true,
    limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024 }, // 50MB max file size
    abortOnLimit: true,
    responseOnLimit: "File size limit has been reached",
    useTempFiles: true,
    tempFileDir: '/tmp/'
}));

// logging setup (Morgan)
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }))

// ------------------ 📺 Monitoring and metrics setup ------------------ //

// request duration tracking
app.use((req, res, next) => {
  const end = httpRequestDurationMicroseconds.startTimer();
  res.on('finish', () => {
    end({ method: req.method, route: req.originalUrl, status: res.statusCode });
  });
  next();
});

// express status monitor
app.use(statusMonitor());

// Expose Prometheus metrics
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// ------------------ 🛣️ Static Content ------------------ //
app.get("/api", (req, res) => {
  res.sendFile(path.join(publicPath, "api_page.html"));
});

// API Documentation
app.get("/public/api_documentation.html", (req, res) => {
  res.sendFile(path.join(publicPath, "api_documentation.html"));
});

app.use('/profile', express.static(path.join(__dirname,'..', 'uploads', 'profilePhoto')));

// ------------------ 🛣️ Routes ------------------ //
app.use("/api", apiRouter)

// ------------------ ❌ Error Handling ------------------ //

// 404 Handler
app.use(notFoundHandler)

// Global ErrorHandler
app.use(errorHandler)

// ------------------ 🏃‍➡️ Start server after DB connection ------------------ //

AppDataSource.initialize()
  .then(async () => {
    console.log("✅ Database connected successfully");
    
    // Check if tables exist and create them if needed
    try {
      console.log("🔍 Checking database schema...");
      
      // Get all entity metadata
      const entities = AppDataSource.entityMetadatas;
      console.log(`📋 Found ${entities.length} entities to sync`);
      
      // Run schema synchronization
      await AppDataSource.synchronize();
      console.log("✅ Database schema synchronized successfully");
      
      // Check if we need to create initial data
      const userRepository = AppDataSource.getRepository("User");
      const userCount = await userRepository.count();
      
      if (userCount === 0) {
        console.log("🌱 No users found, database is ready for initial setup");
        console.log("💡 Use the API documentation to create your first admin user");
      } else {
        console.log(`👥 Found ${userCount} existing users in database`);
      }
      
    } catch (syncError) {
      console.log("⚠️ Schema sync warning:", syncError.message);
      console.log("🔄 Continuing with existing schema...");
    }

    // Initialize cron schedulers (only in non-test environment)
    if (process.env.NODE_ENV !== 'test') {
      try {
        const { initializeSchedulers } = await import('./schedulers/gameScheduler.js');
        initializeSchedulers();
      } catch (schedulerError) {
        console.error("❌ Failed to initialize schedulers:", schedulerError);
        console.log("⚠️ Continuing without schedulers...");
      }
    }

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📚 API Documentation: http://localhost:${PORT}/public/api_documentation.html`);
      //console.log(`📮 Postman Collection: http://localhost:${PORT}/api/postman-collection`);
      console.log(`🎮 KismatX Gaming Platform API Ready!`);
    });
  })
  .catch((err) => {
    console.error("❌ Database connection failed", err);
    
    // Provide helpful error messages
    if (err.code === 'ER_ACCESS_DENIED_ERROR') {
      console.log("💡 Database access denied. Please check:");
      console.log("   - Database credentials in .env file");
      console.log("   - MySQL/MariaDB is running");
      console.log("   - User has proper permissions");
    } else if (err.code === 'ER_BAD_DB_ERROR') {
      console.log("💡 Database not found. Please create the database:");
      console.log("   CREATE DATABASE KismatX;");
    } else if (err.code === 'ECONNREFUSED') {
      console.log("💡 Cannot connect to database. Please check:");
      console.log("   - MySQL/MariaDB is running");
      console.log("   - Host and port are correct");
    }
    
    // Start server anyway for development
    if (process.env.NODE_ENV === "development") {
      console.log("⚠️ Starting server in development mode without database...");
      app.listen(PORT, () => {
        console.log(`🚀 Server running on port ${PORT} (without database)`);
        console.log(`📚 API Documentation: http://localhost:${PORT}/public/api_documentation.html`);
        console.log("⚠️ Some features may not work without database connection");
      });
    }
  });
