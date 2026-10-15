import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * WP2 review round 2: maker-checker requests that are not about a single product.
 *
 *  - `COMPANY_CONTROL`: loosening a stock control (moving the stock lock date back /
 *    clearing it, raising / switching off the approval threshold) waits for a second
 *    administrator. Such a request has no product, so productId / productName become
 *    nullable. (Stock-count lines above the threshold are product requests of kind
 *    `COUNT` and need no schema change.)
 *
 * MODIFY COLUMN does not fire the request triggers; existing rows keep their values.
 */
export class MakerCheckerControlRequests1784274131000 implements MigrationInterface {
  name = 'MakerCheckerControlRequests1784274131000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `stock_adjustment_requests` MODIFY `productId` varchar(36) NULL, MODIFY `productName` varchar(255) NULL');
  }

  public async down(q: QueryRunner): Promise<void> {
    // Development only: fails while COMPANY_CONTROL requests (no product) exist; they are frozen by trigger.
    await q.query('ALTER TABLE `stock_adjustment_requests` MODIFY `productId` varchar(36) NOT NULL, MODIFY `productName` varchar(255) NOT NULL');
  }
}
