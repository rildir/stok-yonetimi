import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { ProductEntity } from './product.entity';
import { WarehouseEntity } from './warehouse.entity';

@Entity('product_warehouse_stocks')
@Unique(['productId', 'warehouseId'])
export class ProductWarehouseStockEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  productId: string;

  @ManyToOne(() => ProductEntity, (p) => p.warehouseStocks, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: ProductEntity;

  @Column()
  warehouseId: string;

  @ManyToOne(() => WarehouseEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'warehouseId' })
  warehouse: WarehouseEntity;

  @Column('int', { default: 0 })
  quantity: number;
}
