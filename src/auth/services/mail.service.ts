import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Mailjet from 'node-mailjet';

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

  constructor(private readonly configService: ConfigService) {
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

    try {
      await this.sendEmail([
        {
          From: { Email: senderEmail, Name: senderName },
          To: [{ Email: email, Name: businessName }],
          Subject: 'Verify your TakTip account',
          TextPart: `Your verification code is: ${otp}. This code expires in 15 minutes.`,
          HTMLPart: `
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
        },
      ]);

      this.logger.log(`OTP email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send OTP email to ${email}:`, error);
      throw error;
    }
  }

  /**
   * Send welcome email after successful verification
   */
  async sendWelcomeEmail(email: string, businessName: string): Promise<void> {
    const senderEmail = this.configService.get<string>('MAILJET_SENDER_EMAIL', 'noreply@taktip.io');
    const senderName = this.configService.get<string>('MAILJET_SENDER_NAME', 'TakTip');

    try {
      await this.sendEmail([
        {
          From: { Email: senderEmail, Name: senderName },
          To: [{ Email: email, Name: businessName }],
          Subject: 'Welcome to TakTip!',
          TextPart: `Welcome ${businessName}! Your TakTip account has been verified. You can now start accepting tips.`,
          HTMLPart: `
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
        },
      ]);

      this.logger.log(`Welcome email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send welcome email to ${email}:`, error);
      // Don't throw - welcome email failure shouldn't block registration
    }
  }
}
