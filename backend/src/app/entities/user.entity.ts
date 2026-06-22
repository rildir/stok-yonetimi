import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  username: string;

  @Column()
  password: string;

  @Column()
  role: string; // 'admin' | 'manager' | 'viewer'

  @Column()
  fullName: string;

  @Column()
  email: string;

  @Column({ nullable: true })
  department: string;

  @Column('longtext', { nullable: true })
  avatar: string;

  @Column({ default: 0 })
  tokenVersion: number;

  @Column({ default: 'standard' })
  subscriptionPlan: string; // 'standard' | 'professional' | 'ultra'

  @Column({ nullable: true })
  subscriptionExpiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
