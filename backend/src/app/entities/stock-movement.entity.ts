import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { CompanyEntity } from './company.entity';
import { ProductEntity } from './product.entity';
import { StockMovementType } from './enums';
import { WarehouseEntity } from './warehouse.entity';

@Entity('stock_movements')
@Index('IDX_stock_movements_companyId', ['companyId'])
export class StockMovementEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  companyId: string;

  @ManyToOne(() => CompanyEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'companyId', foreignKeyConstraintName: 'FK_stock_movements_company' })
  company?: CompanyEntity;

  @Index()
  @Column()
  productId: string;

  @ManyToOne(() => ProductEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product?: ProductEntity;

  @Column()
  productName: string;

  @Index()
  @Column({ type: 'varchar' })
  type: StockMovementType | string;

  @Column('int')
  quantity: number;

  @Column('int')
  previousQuantity: number;

  @Column('int')
  newQuantity: number;

  @Index('IDX_stock_movements_warehouseId')
  @Column({ type: 'varchar', length: 36, nullable: true })
  warehouseId?: string | null;

  @ManyToOne(() => WarehouseEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'warehouseId', foreignKeyConstraintName: 'FK_stock_movements_warehouse' })
  warehouse?: WarehouseEntity | null;

  @Column({ nullable: true })
  referenceId: string;

  @Column({ nullable: true })
  referenceType: string;

  @Column({ nullable: true })
  note: string;

  @Column({ nullable: true })
  performedBy: string;

  @Index()
  @CreateDateColumn()
  createdAt: Date;
}
