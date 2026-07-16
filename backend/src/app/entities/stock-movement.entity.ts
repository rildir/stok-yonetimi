import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { ProductEntity } from './product.entity';
import { StockMovementType } from './enums';

@Entity('stock_movements')
export class StockMovementEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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
