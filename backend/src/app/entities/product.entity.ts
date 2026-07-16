import { Entity, Column, PrimaryGeneratedColumn, Check, Index, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { ColumnNumericTransformer } from '../utils/numeric-transformer';
import { CategoryEntity } from './category.entity';
import { SupplierEntity } from './supplier.entity';
import { ProductWarehouseStockEntity } from './product-warehouse-stock.entity';
import { ProductStatus } from './enums';

@Entity('products')
@Check('quantity >= 0')
export class ProductEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  sku: string;

  @Index()
  @Column()
  category: string; // Slug for category lookup

  @ManyToOne(() => CategoryEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'categoryId' })
  categoryEntity?: CategoryEntity;

  @Column({ nullable: true })
  categoryId?: string;

  @Column('decimal', { precision: 10, scale: 2, transformer: new ColumnNumericTransformer() })
  price: number;

  @Column('int')
  quantity: number;

  @Column('int')
  minQuantity: number;

  @Column({ type: 'varchar', default: ProductStatus.IN_STOCK })
  status: ProductStatus | string;

  @Column({ default: 'Adet' })
  unit: string;

  @Index()
  @Column({ default: false })
  isDeleted: boolean;

  @Index()
  @Column({ nullable: true })
  supplierId: string;

  @ManyToOne(() => SupplierEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'supplierId' })
  supplier?: SupplierEntity;

  @Column({ nullable: true })
  imageUrl: string;

  @Column('json', { nullable: true })
  warehouses: Record<string, number> | null;

  @OneToMany(() => ProductWarehouseStockEntity, (pws) => pws.product, { cascade: true })
  warehouseStocks: ProductWarehouseStockEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
