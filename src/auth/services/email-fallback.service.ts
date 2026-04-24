import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

interface EmailMessage {
  to: string;
  toName?: string;
  subject: string;
  text: string;
  html: string;
}

@Injectable()
export class EmailFallbackService {
  private readonly logger = new Logger(EmailFallbackService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST', 'smtp.gmail.com'),
      port: this.configService.get<number>('SMTP_PORT', 587),
      secure: this.configService.get<boolean>('SMTP_SECURE', false),
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASS'),
      },
    });
  }

  /**
   * Send email via nodemailer (fallback)
   */
  async sendEmail(message: EmailMessage): Promise<void> {
    const fromEmail = this.configService.get<string>('SMTP_FROM', 'noreply@taktip.io');
    const fromName = this.configService.get<string>('MAILJET_SENDER_NAME', 'TakTip');

    try {
      await this.transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: message.toName ? `"${message.toName}" <${message.to}>` : message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });

      this.logger.log(`Fallback email sent to ${message.to}`);
    } catch (error) {
      this.logger.error(`Failed to send fallback email to ${message.to}:`, error);
      throw error;
    }
  }
}