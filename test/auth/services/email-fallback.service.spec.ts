import { EmailFallbackService } from '@/auth/services/email-fallback.service';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

// Mock nodemailer module
jest.mock('nodemailer', () => ({
  createTransport: jest.fn().mockReturnValue({
    sendMail: jest.fn(),
  }),
}));

describe('EmailFallbackService', () => {
  let emailFallbackService: EmailFallbackService;
  let mockConfigService: jest.Mocked<Partial<ConfigService>>;
  let mockTransporter: { sendMail: jest.Mock };

  beforeEach(() => {
    mockTransporter = {
      sendMail: jest.fn().mockResolvedValue({ messageId: 'test-message-id' }),
    };
    (nodemailer.createTransport as jest.Mock).mockReturnValue(mockTransporter);

    mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: unknown) => {
        const config: Record<string, unknown> = {
          SMTP_HOST: 'smtp.test.com',
          SMTP_PORT: 587,
          SMTP_SECURE: false,
          SMTP_USER: 'test-user',
          SMTP_PASS: 'test-pass',
          SMTP_FROM: 'fallback@taktip.io',
          MAILJET_SENDER_NAME: 'TakTip',
        };
        return config[key] ?? defaultValue;
      }),
    };

    emailFallbackService = new EmailFallbackService(
      mockConfigService as ConfigService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create nodemailer transporter with correct config', () => {
      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        host: 'smtp.test.com',
        port: 587,
        secure: false,
        auth: {
          user: 'test-user',
          pass: 'test-pass',
        },
      });
    });

    it('should use default SMTP config when not provided', () => {
      const emptyConfigService = {
        get: jest.fn().mockImplementation((key: string, defaultValue?: unknown) => {
          const defaults: Record<string, unknown> = {
            SMTP_HOST: 'smtp.gmail.com',
            SMTP_PORT: 587,
            SMTP_SECURE: false,
          };
          return defaults[key] ?? defaultValue;
        }),
      };

      new EmailFallbackService(
        emptyConfigService as unknown as ConfigService,
      );

      expect(nodemailer.createTransport).toHaveBeenCalledWith({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
          user: undefined,
          pass: undefined,
        },
      });
    });
  });

  describe('sendEmail', () => {
    const testEmailMessage = {
      to: 'recipient@example.com',
      toName: 'Test Recipient',
      subject: 'Test Subject',
      text: 'Test plain text content',
      html: '<p>Test HTML content</p>',
    };

    it('should send email with correct nodemailer options', async () => {
      await emailFallbackService.sendEmail(testEmailMessage);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: '"TakTip" <fallback@taktip.io>',
        to: '"Test Recipient" <recipient@example.com>',
        subject: 'Test Subject',
        text: 'Test plain text content',
        html: '<p>Test HTML content</p>',
      });
    });

    it('should handle email without recipient name', async () => {
      const messageWithoutName = {
        ...testEmailMessage,
        toName: undefined,
      };

      await emailFallbackService.sendEmail(messageWithoutName);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: '"TakTip" <fallback@taktip.io>',
        to: 'recipient@example.com',
        subject: 'Test Subject',
        text: 'Test plain text content',
        html: '<p>Test HTML content</p>',
      });
    });

    it('should throw error when nodemailer fails', async () => {
      const smtpError = new Error('SMTP connection failed');
      mockTransporter.sendMail.mockRejectedValue(smtpError);

      await expect(emailFallbackService.sendEmail(testEmailMessage)).rejects.toThrow(
        'SMTP connection failed',
      );
    });

    it('should use custom from email and name from config', async () => {
      mockConfigService.get = jest.fn().mockImplementation((key: string, defaultValue?: unknown) => {
        const config: Record<string, unknown> = {
          SMTP_HOST: 'smtp.test.com',
          SMTP_PORT: 587,
          SMTP_SECURE: false,
          SMTP_USER: 'test-user',
          SMTP_PASS: 'test-pass',
          SMTP_FROM: 'custom@taktip.io',
          MAILJET_SENDER_NAME: 'Custom App',
        };
        return config[key] ?? defaultValue;
      });

      const service = new EmailFallbackService(mockConfigService as ConfigService);

      await service.sendEmail(testEmailMessage);

      expect(mockTransporter.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '"Custom App" <custom@taktip.io>',
        }),
      );
    });
  });
});