import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import config from '../config';
import logger from '../utils/logger';

class AuthService {
  /**
   * Generate a secure API key
   * Format: sk_live_<random_hex>
   */
  generateApiKey(): string {
    const randomBytes = crypto.randomBytes(32);
    const apiKey = `sk_live_${randomBytes.toString('hex')}`;
    logger.debug('API key generated', { length: apiKey.length });
    return apiKey;
  }

  /**
   * Generate a unique feeder ID
   * Format: feeder_<random_hex>
   */
  generateFeederId(): string {
    const randomBytes = crypto.randomBytes(12);
    const feederId = `feeder_${randomBytes.toString('hex')}`;
    return feederId;
  }

  /**
   * Hash an API key using bcrypt
   */
  async hashApiKey(apiKey: string): Promise<string> {
    try {
      const hash = await bcrypt.hash(apiKey, config.security.bcryptRounds);
      return hash;
    } catch (error) {
      const err = error as Error;
      logger.error('Error hashing API key', { error: err.message });
      throw new Error('Failed to hash API key');
    }
  }

  /**
   * Verify an API key against its hash
   */
  async verifyApiKey(apiKey: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(apiKey, hash);
    } catch (error) {
      const err = error as Error;
      logger.error('Error verifying API key', { error: err.message });
      return false;
    }
  }

  /**
   * Extract bearer token from Authorization header
   */
  extractBearerToken(authHeader: string | undefined): string | null {
    if (!authHeader || typeof authHeader !== 'string') {
      return null;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }

    return parts[1];
  }

  /**
   * Validate API key format
   */
  validateApiKeyFormat(apiKey: string | undefined): boolean {
    if (!apiKey || typeof apiKey !== 'string') {
      return false;
    }

    // Format: sk_live_<64 hex characters>
    const apiKeyRegex = /^sk_live_[0-9a-fA-F]{64}$/;
    return apiKeyRegex.test(apiKey);
  }
}

export default new AuthService();

