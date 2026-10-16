import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';

/** bcrypt (cost 10) hash of a random string nobody knows; only used for constant-time rejection. */
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);

@Injectable()
export class StockHelperService {
  calculateStatus(quantity: number, minQuantity: number): string {
    if (quantity <= 0) return 'Out of stock';
    if (quantity <= minQuantity) return 'Low stock';
    return 'In stock';
  }

  slugify(text: string): string {
    const trMap: Record<string, string> = {
      'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u',
      'Ç': 'c', 'Ğ': 'g', 'İ': 'i', 'Ö': 'o', 'Ş': 's', 'Ü': 'u',
    };
    for (const key in trMap) {
      text = text.replace(new RegExp(key, 'g'), trMap[key]);
    }
    return text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]+/g, '')
      .replace(/-+/g, '-');
  }

  hashPassword(password: string): string {
    return bcrypt.hashSync(password, 10);
  }

  /**
   * Runs one bcrypt comparison against a fixed dummy hash and discards the result: sign-in paths
   * that reject without checking a real hash (unknown user, locked account) take as long as a
   * wrong password, so timing does not reveal whether an account exists.
   */
  burnPasswordCheck(password: string): void {
    bcrypt.compareSync(String(password ?? ''), DUMMY_HASH);
  }

  async verifyPassword(password: string, userHash: string, onMigrationRequired?: (newHash: string) => Promise<void>): Promise<boolean> {
    const isSha256 = userHash.length === 64 && !userHash.startsWith('$2');
    if (isSha256) {
      const sha256Hashed = crypto.createHash('sha256').update(password).digest('hex');
      if (userHash === sha256Hashed) {
        if (onMigrationRequired) {
          await onMigrationRequired(password);
        }
        return true;
      }
      return false;
    }
    return bcrypt.compareSync(password, userHash);
  }
}
