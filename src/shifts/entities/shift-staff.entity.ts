import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Shift } from './shift.entity';
import { StaffProfile } from '../../staff/entities/staff-profile.entity';
import { ShiftStaffStatus } from '../enums/shift-staff-status.enum';

@Entity('shift_staff')
@Index(['shiftId'])
@Index(['staffProfileId'])
export class ShiftStaff {
  @PrimaryColumn({ type: 'uuid' })
  shiftId: string;

  @ManyToOne(() => Shift)
  @JoinColumn({ name: 'shiftId' })
  shift: Shift;

  @PrimaryColumn({ type: 'uuid' })
  staffProfileId: string;

  @ManyToOne(() => StaffProfile)
  @JoinColumn({ name: 'staffProfileId' })
  staffProfile: StaffProfile;

  @Column({ type: 'timestamp', nullable: true })
  clockedInAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  clockedOutAt: Date | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  tipsEarned: string | null;

  @Column({ type: 'integer', default: ShiftStaffStatus.ASSIGNED })
  status: ShiftStaffStatus;
}
