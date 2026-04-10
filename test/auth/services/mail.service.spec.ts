import { MailService } from '@/auth/services/mail.service';
import { ConfigService } from '@nestjs/config';

describe('MailService', () => {
  let mailService: MailService;
  let mockConfigService: jest.Mocked<Partial<ConfigService>>;
  let mockMailjet: { post: jest.Mock; request: jest.Mock };

  beforeEach(() => {
    mockMailjet = {
      post: jest.fn().mockReturnThis(),
      request: jest.fn().mockResolvedValue({ response: { status: 200 } }),
    };

    mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          MAILJET_API_KEY: 'test-api-key',
          MAILJET_API_SECRET: 'test-api-secret',
          MAILJET_SENDER_EMAIL: 'noreply@taktip.io',
          MAILJET_SENDER_NAME: 'TakTip',
        };
        return config[key] ?? defaultValue;
      }),
    };

    // Create service instance manually
    mailService = new MailService(mockConfigService as ConfigService);
    // Replace the mailjet client with our mock
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    (mailService as any).mailjet = mockMailjet;
  });

  describe('sendOtpEmail', () => {
    it('should send OTP email successfully', async () => {
      await expect(
        mailService.sendOtpEmail('test@example.com', '123456', 'Test Business'),
      ).resolves.not.toThrow();
    });
  });

  describe('sendWelcomeEmail', () => {
    it('should send welcome email successfully', async () => {
      await expect(
        mailService.sendWelcomeEmail('test@example.com', 'Test Business'),
      ).resolves.not.toThrow();
    });
  });
});
