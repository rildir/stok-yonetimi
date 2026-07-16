import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { UserRole, SubscriptionPlan } from './enums';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  username: string;

  @Column()
  password: string;

  @Column({ type: 'varchar', default: UserRole.VIEWER })
  role: UserRole | string;

  @Column()
  fullName: string;

  @Column({ unique: true, nullable: true })
  email: string;

  @Column({ nullable: true })
  department: string;

  @Column('longtext', { nullable: true })
  avatar: string;

  @Column({ default: 0 })
  tokenVersion: number;

  @Column({ type: 'varchar', default: SubscriptionPlan.STANDARD })
  subscriptionPlan: SubscriptionPlan | string;

  @Column({ nullable: true })
  subscriptionExpiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
