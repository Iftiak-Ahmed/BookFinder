import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;

  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
  return transporter;
}

/** True once GMAIL_USER/GMAIL_APP_PASSWORD are set in .env. */
export function isMailConfigured() {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

export async function sendPasswordResetEmail({ to, name, resetUrl }) {
  const t = getTransporter();
  if (!t) throw new Error('Email is not configured on the server (GMAIL_USER / GMAIL_APP_PASSWORD missing)');

  await t.sendMail({
    from: `"BookFinder" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Reset your BookFinder password',
    text: `Hi ${name},\n\nSomeone requested a password reset for your BookFinder account. If this was you, set a new password here:\n\n${resetUrl}\n\nThis link expires in 30 minutes. If you didn't request this, you can ignore this email.`,
    html: `
      <p>Hi ${name},</p>
      <p>Someone requested a password reset for your BookFinder account. If this was you, set a new password here:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>This link expires in 30 minutes. If you didn't request this, you can ignore this email.</p>
    `,
  });
}
