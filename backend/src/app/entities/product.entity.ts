import { Entity, Column, PrimaryGeneratedColumn, Check } from 'typeorm';
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

  @Column({ default: false })
  isDeleted: boolean;
}
