import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Mailjet from 'node-mailjet';
import { EmailFallbackService } from './email-fallback.service';

interface MailjetMessage {
  From: { Email: string; Name: string };
  To: Array<{ Email: string; Name: string }>;
  Subject: string;
  TextPart: string;
  HTMLPart: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mailjet: any;

  constructor(
    private readonly configService: ConfigService,
    private readonly emailFallbackService: EmailFallbackService,
  ) {
    const apiKey = this.configService.get<string>('MAILJET_API_KEY') || '';
    const apiSecret = this.configService.get<string>('MAILJET_API_SECRET') || '';

    this.mailjet = Mailjet.apiConnect(apiKey, apiSecret);
  }

  private async sendEmail(messages: MailjetMessage[]): Promise<void> {
    /* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
    await this.mailjet.post('send', { version: 'v3.1' }).request({ Messages: messages });
    /* eslint-enable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
  }

  /**
   * Send OTP verification email
   */
  async sendOtpEmail(email: string, otp: string, businessName: string): Promise<void> {
    const senderEmail = this.configService.get<string>('MAILJET_SENDER_EMAIL', 'noreply@taktip.io');
    const senderName = this.configService.get<string>('MAILJET_SENDER_NAME', 'TakTip');

    const emailContent = {
      to: email,
      toName: businessName,
      subject: 'Verify your TakTip account',
      text: `Your verification code is: ${otp}. This code expires in 15 minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Verify your TakTip account</h2>
          <p>Hello ${businessName},</p>
          <p>Thank you for registering with TakTip. Please use the following code to verify your email address:</p>
          <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 32px; letter-spacing: 8px; margin: 20px 0;">
            <strong>${otp}</strong>
          </div>
          <p style="color: #666; font-size: 14px;">This code expires in <strong>15 minutes</strong>.</p>
          <p style="color: #666; font-size: 12px;">If you didn't request this code, please ignore this email.</p>
        </div>
      `,
    };

    try {
      await this.sendEmail([
        {
          From: { Email: senderEmail, Name: senderName },
          To: [{ Email: email, Name: businessName }],
          Subject: emailContent.subject,
          TextPart: emailContent.text,
          HTMLPart: emailContent.html,
        },
      ]);

      this.logger.log(`OTP email sent to ${email} via MailJet`);
    } catch (mailjetError) {
      this.logger.warn(`MailJet failed for ${email}, using fallback:`, mailjetError);

      try {
        await this.emailFallbackService.sendEmail(emailContent);
        this.logger.log(`OTP email sent to ${email} via fallback (nodemailer)`);
      } catch (fallbackError) {
        this.logger.error(`All email services failed for ${email}:`, fallbackError);
        throw fallbackError;
      }
    }
  }

  /**
   * Send password reset email with reset link
   */
  async sendPasswordResetEmail(email: string, resetToken: string, userName: string): Promise<void> {
    const senderEmail = this.configService.get<string>('MAILJET_SENDER_EMAIL', 'noreply@taktip.io');
    const senderName = this.configService.get<string>('MAILJET_SENDER_NAME', 'TakTip');
    const appUrl = this.configService.get<string>('APP_URL', 'https://app.taktip.io');

    const emailContent = {
      to: email,
      toName: userName,
      subject: 'Reset your TakTip password',
      text: `You requested a password reset. Click the link to reset your password: ${appUrl}/reset-password?token=${resetToken}. This link expires in 1 hour. If you didn't request this, please ignore this email.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Reset your TakTip password</h2>
          <p>Hello ${userName},</p>
          <p>We received a request to reset your password. Click the button below to set a new password:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${appUrl}/reset-password?token=${resetToken}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-size: 16px;">Reset Password</a>
          </div>
          <p style="color: #666; font-size: 14px;">This link expires in <strong>1 hour</strong>.</p>
          <p style="color: #666; font-size: 14px;">If you didn't request a password reset, please ignore this email. Your password will remain unchanged.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">TakTip - Digital Tipping Platform</p>
        </div>
      `,
    };

    try {
      await this.sendEmail([
        {
          From: { Email: senderEmail, Name: senderName },
          To: [{ Email: email, Name: userName }],
          Subject: emailContent.subject,
          TextPart: emailContent.text,
          HTMLPart: emailContent.html,
        },
      ]);

      this.logger.log(`Password reset email sent to ${email} via MailJet`);
    } catch (mailjetError) {
      this.logger.warn(`MailJet failed for ${email}, using fallback:`, mailjetError);

      try {
        await this.emailFallbackService.sendEmail(emailContent);
        this.logger.log(`Password reset email sent to ${email} via fallback (nodemailer)`);
      } catch (fallbackError) {
        this.logger.error(`All email services failed for ${email}:`, fallbackError);
        throw fallbackError;
      }
    }
  }

  /**
   * Send welcome email after successful verification
   */
  async sendWelcomeEmail(email: string, businessName: string): Promise<void> {
    const senderEmail = this.configService.get<string>('MAILJET_SENDER_EMAIL', 'noreply@taktip.io');
    const senderName = this.configService.get<string>('MAILJET_SENDER_NAME', 'TakTip');

    const emailContent = {
      to: email,
      toName: businessName,
      subject: 'Welcome to TakTip!',
      text: `Welcome ${businessName}! Your TakTip account has been verified. You can now start accepting tips.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Welcome to TakTip!</h2>
          <p>Hello ${businessName},</p>
          <p>Your account has been successfully verified. You can now:</p>
          <ul>
            <li>Create QR codes for your business</li>
            <li>Invite staff members</li>
            <li>Start accepting digital tips</li>
          </ul>
          <p>Visit your dashboard to get started!</p>
        </div>
      `,
    };

    try {
      await this.sendEmail([
        {
          From: { Email: senderEmail, Name: senderName },
          To: [{ Email: email, Name: businessName }],
          Subject: emailContent.subject,
          TextPart: emailContent.text,
          HTMLPart: emailContent.html,
        },
      ]);

      this.logger.log(`Welcome email sent to ${email} via MailJet`);
    } catch (mailjetError) {
      this.logger.warn(`MailJet failed for ${email}, using fallback:`, mailjetError);

      try {
        await this.emailFallbackService.sendEmail(emailContent);
        this.logger.log(`Welcome email sent to ${email} via fallback (nodemailer)`);
      } catch (fallbackError) {
        this.logger.error(`All email services failed for ${email}:`, fallbackError);
        // Don't throw - welcome email failure shouldn't block registration
      }
    }
  }
}