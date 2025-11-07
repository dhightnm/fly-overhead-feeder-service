import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import config from '../config';
import logger from '../utils/logger';

class AuthService {
  generateApiKey(): string {
    const randomBytes = crypto.randomBytes(32);
    return `sk_live_${randomBytes.toString('hex')}`;
  }

  generateFeederId(): string {
    const randomBytes = crypto.randomBytes(12);
    return `feeder_${randomBytes.toString('hex')}`;
  }

  async hashApiKey(apiKey: string): Promise<string> {
    try {
      return await bcrypt.hash(apiKey, config.security.bcryptRounds);
    } catch (error) {
      const err = error as Error;
      logger.error('Error hashing API key', { error: err.message });
      throw new Error('Failed to hash API key');
    }
  }

  async verifyApiKey(apiKey: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(apiKey, hash);
    } catch (error) {
      return false;
    }
  }

  extractBearerToken(authHeader: string | undefined): string | null {
    if (!authHeader || typeof authHeader !== 'string') return null;
    const parts = authHeader.split(' ');
    return parts.length === 2 && parts[0] === 'Bearer' ? parts[1] : null;
  }

  validateApiKeyFormat(apiKey: string | undefined): boolean {
    if (!apiKey || typeof apiKey !== 'string') return false;
    return /^sk_live_[0-9a-fA-F]{64}$/.test(apiKey);
  }
}

export default new AuthService();

