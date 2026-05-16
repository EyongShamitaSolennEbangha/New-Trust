const nodemailer = require('nodemailer');
const logger = require('../config/logger');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Core send function
 */
const sendEmail = async ({ to, subject, html, text }) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to,
      subject,
      html,
      text,
    });
    logger.info(`Email sent to ${to}: ${subject}`);
  } catch (err) {
    logger.error(`Email failed to ${to}: ${err.message}`);
    throw err;
  }
};

// ── Email Templates ────────────────────────────────────────────────────────────

exports.sendWelcomeEmail = async (user) => {
  await sendEmail({
    to: user.email,
    subject: 'Welcome to TrustLedger 🎉',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#1a56db">Welcome to TrustLedger, ${user.firstName}!</h2>
        <p>Your account has been created. You can now create and track financial agreements with confidence.</p>
        <p>Start by verifying your identity to unlock all features.</p>
        <a href="${process.env.CLIENT_URL}/dashboard" style="background:#1a56db;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:16px">Go to Dashboard</a>
      </div>
    `,
  });
};

exports.sendEmailVerification = async (user, token) => {
  const url = `${process.env.CLIENT_URL}/verify-email/${token}`;
  await sendEmail({
    to: user.email,
    subject: 'Verify your TrustLedger email',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#1a56db">Verify Your Email</h2>
        <p>Hi ${user.firstName}, click the button below to verify your email address. This link expires in 24 hours.</p>
        <a href="${url}" style="background:#1a56db;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:16px">Verify Email</a>
        <p style="margin-top:16px;color:#666;font-size:12px">If you didn't create an account, ignore this email.</p>
      </div>
    `,
  });
};

exports.sendPasswordResetEmail = async (user, token) => {
  const url = `${process.env.CLIENT_URL}/reset-password/${token}`;
  await sendEmail({
    to: user.email,
    subject: 'TrustLedger Password Reset Request',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#1a56db">Reset Your Password</h2>
        <p>Hi ${user.firstName}, you requested a password reset. Click below (expires in 30 minutes):</p>
        <a href="${url}" style="background:#dc2626;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:16px">Reset Password</a>
        <p style="margin-top:16px;color:#666;font-size:12px">If you didn't request this, your account may be at risk — please contact support immediately.</p>
      </div>
    `,
  });
};

exports.sendAgreementCreatedEmail = async (creditor, debtor, agreement) => {
  // Notify creditor
  await sendEmail({
    to: creditor.email,
    subject: `Agreement ${agreement.agreementId} Created`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#1a56db">Agreement Created</h2>
        <p>Hi ${creditor.firstName}, your agreement <strong>${agreement.agreementId}</strong> with ${debtor.fullName} has been created.</p>
        <p><strong>Amount:</strong> ${agreement.currency} ${agreement.principalAmount.toLocaleString()}</p>
        <p><strong>Due Date:</strong> ${new Date(agreement.dueDate).toLocaleDateString()}</p>
        <a href="${process.env.CLIENT_URL}/agreements/${agreement._id}" style="background:#1a56db;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:16px">View Agreement</a>
      </div>
    `,
  });
  // Notify debtor
  await sendEmail({
    to: debtor.email,
    subject: `New Agreement Request from ${creditor.fullName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#1a56db">New Agreement Request</h2>
        <p>Hi ${debtor.firstName}, <strong>${creditor.fullName}</strong> has created a financial agreement with you.</p>
        <p><strong>Amount:</strong> ${agreement.currency} ${agreement.principalAmount.toLocaleString()}</p>
        <p><strong>Due Date:</strong> ${new Date(agreement.dueDate).toLocaleDateString()}</p>
        <p>Please verify and sign the agreement to activate it.</p>
        <a href="${process.env.CLIENT_URL}/agreements/${agreement._id}" style="background:#1a56db;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:16px">Review Agreement</a>
      </div>
    `,
  });
};

exports.sendRemoteVerificationLink = async (debtor, agreement, link) => {
  await sendEmail({
    to: debtor.email,
    subject: `Action Required: Verify & Sign Agreement ${agreement.agreementId}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#1a56db">Agreement Verification Required</h2>
        <p>Hi ${debtor.firstName}, please complete identity verification to activate your agreement.</p>
        <p><strong>Agreement:</strong> ${agreement.agreementId}</p>
        <p><strong>Amount:</strong> ${agreement.currency} ${agreement.principalAmount.toLocaleString()}</p>
        <p style="color:#dc2626"><strong>⏰ This link expires in 24 hours.</strong></p>
        <a href="${link}" style="background:#059669;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:16px">Verify & Sign Now</a>
      </div>
    `,
  });
};

exports.sendPaymentReceivedEmail = async (creditor, debtor, payment, agreement) => {
  await sendEmail({
    to: creditor.email,
    subject: `Payment Received — ${agreement.agreementId}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#059669">Payment Received ✅</h2>
        <p>Hi ${creditor.firstName}, ${debtor.fullName} has recorded a payment of <strong>${payment.currency} ${payment.amount.toLocaleString()}</strong>.</p>
        <p>Please confirm receipt in your dashboard within 48 hours.</p>
        <a href="${process.env.CLIENT_URL}/agreements/${agreement._id}" style="background:#1a56db;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:16px">Confirm Payment</a>
      </div>
    `,
  });
};

exports.sendPaymentReminderEmail = async (debtor, agreement, daysUntilDue) => {
  const urgency = daysUntilDue <= 0 ? '🚨 OVERDUE' : daysUntilDue === 1 ? '⚠️ Due Tomorrow' : `📅 Due in ${daysUntilDue} days`;
  await sendEmail({
    to: debtor.email,
    subject: `Payment Reminder ${urgency} — ${agreement.agreementId}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
        <h2 style="color:${daysUntilDue <= 0 ? '#dc2626' : '#d97706'}">Payment Reminder ${urgency}</h2>
        <p>Hi ${debtor.firstName}, your payment for agreement <strong>${agreement.agreementId}</strong> is ${daysUntilDue <= 0 ? 'overdue' : `due in ${daysUntilDue} day(s)`}.</p>
        <p><strong>Outstanding Balance:</strong> ${agreement.currency} ${agreement.remainingBalance?.toLocaleString()}</p>
        <a href="${process.env.CLIENT_URL}/agreements/${agreement._id}" style="background:#1a56db;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:16px">Make Payment</a>
      </div>
    `,
  });
};

exports.sendDefaulterListingEmail = async (user, agreement) => {
  await sendEmail({
    to: user.email,
    subject: '⚠️ TrustLedger: Default Notice',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#dc2626">Default Notice</h2>
        <p>Hi ${user.firstName}, your agreement <strong>${agreement.agreementId}</strong> has been marked as defaulted.</p>
        <p>Your profile may be listed on the public defaulter registry if this is not resolved.</p>
        <p>Please contact the creditor or raise a dispute immediately.</p>
        <a href="${process.env.CLIENT_URL}/disputes/new?agreement=${agreement._id}" style="background:#dc2626;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:16px">Raise Dispute</a>
      </div>
    `,
  });
};
