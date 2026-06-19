import { Entity, Column, PrimaryGeneratedColumn, Check, Index } from 'typeorm';
import { ColumnNumericTransformer } from '../utils/numeric-transformer';

@Entity('products')
@Check('"quantity" >= 0')
export class ProductEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  sku: string;

  @Index()
  @Column()
  category: string;

  @Column('decimal', { precision: 10, scale: 2, transformer: new ColumnNumericTransformer() })
  price: number;

  @Column('int')
  quantity: number;

  @Column('int')
  minQuantity: number;

  @Column()
  status: string;

  @Column({ default: 'Adet' })
  unit: string;

  @Index()
  @Column({ default: false })
  isDeleted: boolean;

  @Index()
  @Column({ nullable: true })
  supplierId: string;

  @Column({ nullable: true })
  imageUrl: string;
}
