// Email Service Utilities
// Handles email sending and template processing

import nodemailer from 'nodemailer';
import path from 'path';
import fs from 'fs';

// Email configuration
const emailConfig = {
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT) || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
};

// Create transporter
const transporter = nodemailer.createTransport(emailConfig);

/**
 * Send password reset email
 * @param {Object} user - User object
 * @param {string} resetLink - Password reset link
 * @returns {Promise} Email sending result
 */
export const sendResetPasswordEmail = async (user, resetLink) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@yourcompany.com',
      to: user.email,
      subject: 'Password Reset Request',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Password Reset Request</h2>
          <p>Hello ${user.fname} ${user.lname},</p>
          <p>You have requested to reset your password. Click the link below to reset your password:</p>
          <p><a href="${resetLink}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reset Password</a></p>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this password reset, please ignore this email.</p>
          <p>Best regards,<br>Your Company Team</p>
        </div>
      `
    };

    return await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw error;
  }
};

/**
 * Send welcome email
 * @param {Object} user - User object
 * @returns {Promise} Email sending result
 */
export const sendWelcomeEmail = async (user) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@yourcompany.com',
      to: user.email,
      subject: 'Welcome to Our Platform',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Welcome to Our Platform!</h2>
          <p>Hello ${user.fname} ${user.lname},</p>
          <p>Your account has been successfully created. You can now log in using your credentials:</p>
          <p><strong>User ID:</strong> ${user.userid}</p>
          <p>Please keep your login credentials secure and don't share them with anyone.</p>
          <p>If you have any questions, please contact our support team.</p>
          <p>Best regards,<br>Your Company Team</p>
        </div>
      `
    };

    return await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending welcome email:', error);
    throw error;
  }
};

/**
 * Send account approval email
 * @param {Object} user - User object
 * @returns {Promise} Email sending result
 */
export const sendApprovalEmail = async (user) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@yourcompany.com',
      to: user.email,
      subject: 'Account Approved',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Account Approved</h2>
          <p>Hello ${user.fname} ${user.lname},</p>
          <p>Your account has been approved by an administrator. You can now log in and access the platform.</p>
          <p>If you have any questions, please contact our support team.</p>
          <p>Best regards,<br>Your Company Team</p>
        </div>
      `
    };

    return await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending approval email:', error);
    throw error;
  }
};

/**
 * Send custom email
 * @param {Object} options - Email options
 * @returns {Promise} Email sending result
 */
export const sendCustomEmail = async (options) => {
  try {
    const { to, subject, html, text } = options;
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@yourcompany.com',
      to,
      subject,
      html: html || text,
      text: text || html
    };

    return await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Error sending custom email:', error);
    throw error;
  }
};

/**
 * Send bulk email
 * @param {Array} recipients - List of email addresses
 * @param {string} subject - Email subject
 * @param {string} html - Email HTML content
 * @returns {Promise} Email sending results
 */
export const sendBulkEmail = async (recipients, subject, html) => {
  try {
    const results = [];
    
    for (const recipient of recipients) {
      try {
        const result = await sendCustomEmail({
          to: recipient,
          subject,
          html
        });
        results.push({ recipient, success: true, result });
      } catch (error) {
        results.push({ recipient, success: false, error: error.message });
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error sending bulk email:', error);
    throw error;
  }
};

/**
 * Verify email configuration
 * @returns {Promise} Verification result
 */
export const verifyEmailConfig = async () => {
  try {
    await transporter.verify();
    return { success: true, message: 'Email configuration is valid' };
  } catch (error) {
    return { success: false, message: 'Email configuration is invalid', error: error.message };
  }
};
