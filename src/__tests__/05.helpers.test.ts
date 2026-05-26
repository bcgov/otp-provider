import { generateOtp } from '../utils/helpers';

describe('helpers', () => {
  it('always generates a 6-digit OTP', () => {
    for (let i = 0; i < 100000; i++) {
      const otp = generateOtp();
      expect(otp).toMatch(/^\d{6}$/);
    }
  });
});
