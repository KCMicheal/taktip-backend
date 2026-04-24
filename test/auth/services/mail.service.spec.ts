import { MailService } from '@/auth/services/mail.service';
import { EmailFallbackService } from '@/auth/services/email-fallback.service';
import { ConfigService } from '@nestjs/config';

describe('MailService', () => {
  let mailService: MailService;
  let mockConfigService: jest.Mocked<Partial<ConfigService>>;
  let mockMailjet: { post: jest.Mock; request: jest.Mock };
  let mockEmailFallbackService: { sendEmail: jest.Mock };

  beforeEach(() => {
    mockMailjet = {
      post: jest.fn().mockReturnThis(),
      request: jest.fn().mockResolvedValue({ response: { status: 200 } }),
    };

    mockEmailFallbackService = {
      sendEmail: jest.fn().mockResolvedValue(undefined),
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
    mailService = new MailService(
      mockConfigService as ConfigService,
      mockEmailFallbackService as unknown as EmailFallbackService,
    );
    // Replace the mailjet client with our mock
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    (mailService as any).mailjet = mockMailjet;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sendOtpEmail', () => {
    const testEmail = 'test@example.com';
    const testOtp = '123456';
    const testBusinessName = 'Test Business';

    it('should send OTP email successfully via MailJet', async () => {
      await expect(
        mailService.sendOtpEmail(testEmail, testOtp, testBusinessName),
      ).resolves.not.toThrow();

      expect(mockMailjet.post).toHaveBeenCalledWith('send', { version: 'v3.1' });
      expect(mockMailjet.request).toHaveBeenCalledWith({
        Messages: expect.arrayContaining([
          expect.objectContaining({
            From: { Email: 'noreply@taktip.io', Name: 'TakTip' },
            To: [{ Email: testEmail, Name: testBusinessName }],
            Subject: 'Verify your TakTip account',
          }),
        ]),
      });
      expect(mockEmailFallbackService.sendEmail).not.toHaveBeenCalled();
    });

    it('should fallback to nodemailer when MailJet fails', async () => {
      const mailjetError = new Error('MailJet API error');
      mockMailjet.request.mockRejectedValue(mailjetError);

      await expect(
        mailService.sendOtpEmail(testEmail, testOtp, testBusinessName),
      ).resolves.not.toThrow();

      // Verify fallback was called
      expect(mockEmailFallbackService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: testEmail,
          toName: testBusinessName,
          subject: 'Verify your TakTip account',
        }),
      );
    });

    it('should throw error when both MailJet and fallback fail', async () => {
      const mailjetError = new Error('MailJet API error');
      const fallbackError = new Error('SMTP error');
      mockMailjet.request.mockRejectedValue(mailjetError);
      mockEmailFallbackService.sendEmail.mockRejectedValue(fallbackError);

      await expect(
        mailService.sendOtpEmail(testEmail, testOtp, testBusinessName),
      ).rejects.toThrow('SMTP error');
    });

    it('should construct email content with correct OTP and business name', async () => {
      await mailService.sendOtpEmail(testEmail, testOtp, testBusinessName);

      expect(mockMailjet.request).toHaveBeenCalledWith({
        Messages: expect.arrayContaining([
          expect.objectContaining({
            TextPart: expect.stringContaining(testOtp),
            HTMLPart: expect.stringContaining(testBusinessName),
          }),
        ]),
      });
    });
  });

  describe('sendPasswordResetEmail', () => {
    const testEmail = 'test@example.com';
    const testResetToken = 'test-reset-token';
    const testUserName = 'testuser';

    it('should send password reset email successfully via MailJet', async () => {
      await expect(
        mailService.sendPasswordResetEmail(testEmail, testResetToken, testUserName),
      ).resolves.not.toThrow();

      expect(mockMailjet.request).toHaveBeenCalledWith({
        Messages: expect.arrayContaining([
          expect.objectContaining({
            Subject: 'Reset your TakTip password',
          }),
        ]),
      });
      expect(mockEmailFallbackService.sendEmail).not.toHaveBeenCalled();
    });

    it('should fallback to nodemailer when MailJet fails', async () => {
      mockMailjet.request.mockRejectedValue(new Error('MailJet API error'));

      await expect(
        mailService.sendPasswordResetEmail(testEmail, testResetToken, testUserName),
      ).resolves.not.toThrow();

      expect(mockEmailFallbackService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: testEmail,
          toName: testUserName,
          subject: 'Reset your TakTip password',
        }),
      );
    });
  });

  describe('sendWelcomeEmail', () => {
    const testEmail = 'test@example.com';
    const testBusinessName = 'Test Business';

    it('should send welcome email successfully via MailJet', async () => {
      await expect(
        mailService.sendWelcomeEmail(testEmail, testBusinessName),
      ).resolves.not.toThrow();

      expect(mockMailjet.request).toHaveBeenCalledWith({
        Messages: expect.arrayContaining([
          expect.objectContaining({
            Subject: 'Welcome to TakTip!',
          }),
        ]),
      });
      expect(mockEmailFallbackService.sendEmail).not.toHaveBeenCalled();
    });

    it('should fallback to nodemailer when MailJet fails', async () => {
      mockMailjet.request.mockRejectedValue(new Error('MailJet API error'));

      await expect(
        mailService.sendWelcomeEmail(testEmail, testBusinessName),
      ).resolves.not.toThrow();

      expect(mockEmailFallbackService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: testEmail,
          toName: testBusinessName,
          subject: 'Welcome to TakTip!',
        }),
      );
    });

    it('should not throw error when both MailJet and fallback fail', async () => {
      mockMailjet.request.mockRejectedValue(new Error('MailJet API error'));
      mockEmailFallbackService.sendEmail.mockRejectedValue(new Error('SMTP error'));

      // Welcome email failure should not throw (graceful degradation)
      await expect(
        mailService.sendWelcomeEmail(testEmail, testBusinessName),
      ).resolves.not.toThrow();
    });
  });

  describe('fallback behavior', () => {
    it('should not call fallback when MailJet succeeds', async () => {
      await mailService.sendOtpEmail('test@example.com', '123456', 'Business');

      expect(mockEmailFallbackService.sendEmail).not.toHaveBeenCalled();
    });

    it('should use correct sender configuration', async () => {
      await mailService.sendOtpEmail('test@example.com', '123456', 'Business');

      expect(mockMailjet.request).toHaveBeenCalledWith({
        Messages: expect.arrayContaining([
          expect.objectContaining({
            From: { Email: 'noreply@taktip.io', Name: 'TakTip' },
          }),
        ]),
      });
    });

    it('should use custom sender configuration when provided', async () => {
      mockConfigService.get = jest.fn().mockImplementation((key: string, defaultValue?: string) => {
        const config: Record<string, string> = {
          MAILJET_API_KEY: 'test-api-key',
          MAILJET_API_SECRET: 'test-api-secret',
          MAILJET_SENDER_EMAIL: 'custom@taktip.io',
          MAILJET_SENDER_NAME: 'Custom App',
        };
        return config[key] ?? defaultValue;
      });

      const service = new MailService(
        mockConfigService as ConfigService,
        mockEmailFallbackService as unknown as EmailFallbackService,
      );
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (service as any).mailjet = mockMailjet;

      await service.sendOtpEmail('test@example.com', '123456', 'Business');

      expect(mockMailjet.request).toHaveBeenCalledWith({
        Messages: expect.arrayContaining([
          expect.objectContaining({
            From: { Email: 'custom@taktip.io', Name: 'Custom App' },
          }),
        ]),
      });
    });

    it('should correctly transform email content for fallback service', async () => {
      mockMailjet.request.mockRejectedValue(new Error('MailJet error'));

      await mailService.sendOtpEmail('merchant@test.com', '789012', 'My Restaurant');

      const mockCalls = mockEmailFallbackService.sendEmail.mock.calls as Array<Array<unknown>>;
      const fallbackCall = mockCalls[0]?.[0] as Record<string, unknown> | undefined;
      
      expect(fallbackCall).toEqual(
        expect.objectContaining({
          to: 'merchant@test.com',
          toName: 'My Restaurant',
          subject: 'Verify your TakTip account',
          text: expect.stringContaining('789012'),
          html: expect.stringContaining('My Restaurant'),
        }),
      );
    });
  });
});