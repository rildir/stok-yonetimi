import { Entity, PrimaryColumn, Column, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';

/**
 * Head of a company's stock movement hash chain. WarehouseStockService locks this
 * row (SELECT ... FOR UPDATE) for every stock-changing transaction, which serialises
 * movement numbering per company (no gaps, no duplicates).
 */
@Entity('stock_movement_chains')
export class StockMovementChainEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_stock_movement_chains_company' })
  company?: CompanyEntity;

  @Column({ type: 'bigint', default: 0, transformer: { to: (v: number) => v, from: (v: string | number) => Number(v) } })
  lastSequenceNo: number;

  @Column({ type: 'char', length: 64 })
  lastHash: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
