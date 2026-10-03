import { Module } from '@nestjs/common';
import { TeachersController } from './teachers.controller.js';
import { DepartmentsController } from './controllers/departments.controller.js';
import { DesignationsController } from './controllers/designations.controller.js';
import { StaffRoomsController } from './controllers/staff-rooms.controller.js';
import { TeachersService } from './teachers.service.js';
import { StaffMasterDataService } from './services/staff-master-data.service.js';

@Module({
  controllers: [
    TeachersController,
    DepartmentsController,
    DesignationsController,
    StaffRoomsController,
  ],
  providers: [TeachersService, StaffMasterDataService],
  exports: [TeachersService, StaffMasterDataService],
})
export class TeachersModule {}
