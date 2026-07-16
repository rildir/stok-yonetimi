import { Injectable, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class StockHelperService {
  calculateStatus(quantity: number, minQuantity: number): string {
    if (quantity <= 0) return 'Out of stock';
    if (quantity <= minQuantity) return 'Low stock';
    return 'In stock';
  }

  deductStockFromWarehouses(
    warehouses: Record<string, number> | null,
    quantityToSubtract: number,
    activeWarehouseNames: string[]
  ): Record<string, number> {
    const wh = { ...(warehouses || {}) };
    let remaining = quantityToSubtract;

    for (const name of activeWarehouseNames) {
      if (remaining <= 0) break;
      const currentQty = wh[name] || 0;
      if (currentQty > 0) {
        const toSubtract = Math.min(currentQty, remaining);
        wh[name] = currentQty - toSubtract;
        remaining -= toSubtract;
      }
    }

    if (remaining > 0) {
      throw new BadRequestException(
        `Depo bazında yeterli stok bulunamadı. Eksik: ${remaining} adet.`
      );
    }

    return wh;
  }

  addStockToWarehouses(
    warehouses: Record<string, number> | null,
    quantityToAdd: number,
    activeWarehouseNames: string[]
  ): Record<string, number> {
    const wh = { ...(warehouses || {}) };
    if (activeWarehouseNames.length > 0) {
      const firstWhName = activeWarehouseNames[0];
      wh[firstWhName] = (wh[firstWhName] || 0) + quantityToAdd;
    }
    return wh;
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
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-');
  }

  hashPassword(password: string): string {
    return bcrypt.hashSync(password, 10);
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
