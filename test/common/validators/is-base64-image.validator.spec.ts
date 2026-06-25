import { validate } from 'class-validator';
import { IsBase64Image, Base64ImageOptions } from '../../../src/common/validators/is-base64-image.validator';

// ── Tiny valid images (1x1 pixel) ──
const PNG_1X1_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const JPEG_1X1_HEX =
  'ffd8ffe000104a46494600010101004800480000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc400b5100002010303020403050504040000017d01020300041105122131410613516107227114328191a1082342b1c11552d1f02433627282090a161718191a25262728292a3435363738393a434445464748494a535455565758595a636465666768696a737475767778797a838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3c4d5e6f7f8f9faffc4001f0100030101010101010101010000000000000102030405060708090a0bffc400b51100020102030403040705040400010277000102031104052131061241510761711322328108144291a1b1c109233352f0156272d10a162434e125f11718191a262728292a35363738393a434445464748494a535455565758595a636465666768696a737475767778797a82838485868788898a92939495969798999aa2a3a4a5a6a7a8a9aab2b3c4d5e6f7f8f9faffda000c03010002110311003f00f8effd9';
const JPEG_1X1_BASE64 = 'data:image/jpeg;base64,' + Buffer.from(JPEG_1X1_HEX, 'hex').toString('base64');
const WEBP_1X1_BASE64 =
  'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';

describe('IsBase64Image', () => {
  function build(prop: string, value: unknown, options?: Base64ImageOptions) {
    class TestClass {
      @IsBase64Image(options)
      [prop]: unknown = value;
    }
    return new TestClass();
  }

  describe('validate', () => {
    it('should accept a valid 1×1 PNG', async () => {
      const obj = build('avatar', PNG_1X1_BASE64);
      const errors = await validate(obj);
      expect(errors).toHaveLength(0);
    });

    it('should accept a valid 1×1 JPEG', async () => {
      const obj = build('avatar', JPEG_1X1_BASE64);
      const errors = await validate(obj);
      expect(errors).toHaveLength(0);
    });

    it('should accept a valid 1×1 WEBP', async () => {
      const obj = build('avatar', WEBP_1X1_BASE64);
      const errors = await validate(obj);
      expect(errors).toHaveLength(0);
    });

    it('should reject non-string values', async () => {
      for (const val of [123, null, undefined, [], {}, true]) {
        const obj = build('avatar', val);
        const errors = await validate(obj);
        expect(errors).toHaveLength(1);
      }
    });

    it('should reject strings without the data:image prefix', async () => {
      const testValues = [
        'iVBORw0KGgo...',
        'data:image/gif;base64,R0lGODlh...',
        'data:image/svg+xml;base64,...',
        '',
        'not a base64 image',
        'data:image/png;base64,',
      ];
      for (const val of testValues) {
        const obj = build('avatar', val);
        const errors = await validate(obj);
        expect(errors).toHaveLength(1);
      }
    });

    it('should reject invalid base64 content', async () => {
      const obj = build('avatar', 'data:image/png;base64,!!!invalid!!!');
      const errors = await validate(obj);
      expect(errors).toHaveLength(1);
    });

    it('should reject images larger than maxSizeKb', async () => {
      // maxSizeKb: 0.05 means ~50 bytes, our 70-byte PNG should fail
      const obj = build('avatar', PNG_1X1_BASE64, { maxSizeKb: 0.05 });
      const errors = await validate(obj);
      expect(errors).toHaveLength(1);
    });

    it('should accept images within a generous size limit', async () => {
      const obj = build('avatar', PNG_1X1_BASE64, { maxSizeKb: 500 });
      const errors = await validate(obj);
      expect(errors).toHaveLength(0);
    });

    it('should reject images wider than maxWidth', async () => {
      // 1×1 PNG is 1px wide; maxWidth: 0 should reject it
      const obj = build('avatar', PNG_1X1_BASE64, { maxWidth: 0, maxHeight: 512 });
      const errors = await validate(obj);
      expect(errors).toHaveLength(1);
    });

    it('should reject images taller than maxHeight', async () => {
      const obj = build('avatar', PNG_1X1_BASE64, { maxWidth: 512, maxHeight: 0 });
      const errors = await validate(obj);
      expect(errors).toHaveLength(1);
    });

    it('should accept images within custom dimension limits', async () => {
      // 1×1 fits within 1×1
      const obj = build('avatar', PNG_1X1_BASE64, { maxWidth: 1, maxHeight: 1 });
      const errors = await validate(obj);
      expect(errors).toHaveLength(0);
    });

    it('should use default 512×512 / 500KB when no options given', async () => {
      const obj = build('avatar', PNG_1X1_BASE64);
      const errors = await validate(obj);
      expect(errors).toHaveLength(0);
    });

    it('should reject data that decodes to a non-image buffer', async () => {
      const junk = 'data:image/png;base64,' + Buffer.from('not an image at all').toString('base64');
      const obj = build('avatar', junk);
      const errors = await validate(obj);
      expect(errors).toHaveLength(1);
    });
  });

  describe('defaultMessage', () => {
    it('should include default limits in the error message', async () => {
      const obj = build('avatar', '', {});
      const errors = await validate(obj);
      if (errors.length > 0) {
        const msg = Object.values(errors[0].constraints ?? {}).join(' ');
        expect(msg).toContain('512');
        expect(msg).toContain('500');
      }
    });

    it('should include custom limits in the error message', async () => {
      const obj = build('avatar', '', { maxWidth: 256, maxHeight: 256, maxSizeKb: 100 });
      const errors = await validate(obj);
      if (errors.length > 0) {
        const msg = Object.values(errors[0].constraints ?? {}).join(' ');
        expect(msg).toContain('256');
        expect(msg).toContain('100');
      }
    });
  });
});
