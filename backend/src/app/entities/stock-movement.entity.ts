import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('stock_movements')
export class StockMovementEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  productId: string;

  @Column()
  productName: string;

  @Index()
  @Column()
  type: string; // 'IN' | 'OUT' | 'ORDER' | 'RETURN' | 'ADJUSTMENT'

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

  @Column()
  performedBy: string;

  @Index()
  @CreateDateColumn()
  createdAt: Date;
}
