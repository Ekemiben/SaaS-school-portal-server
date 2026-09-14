import { Module } from '@nestjs/common';
import { DisciplineIncidentsController } from './controllers/discipline-incidents.controller.js';
import { DisciplineActionsController } from './controllers/discipline-actions.controller.js';
import { MeritAwardsController } from './controllers/merit-awards.controller.js';
import { DisciplineIncidentService } from './services/discipline-incident.service.js';
import { DisciplinaryActionService } from './services/disciplinary-action.service.js';
import { DetentionService } from './services/detention.service.js';
import { MeritAwardService } from './services/merit-award.service.js';
import { ConductProfileService } from './services/conduct-profile.service.js';
import { PrismaModule } from '../../database/prisma.module.js';
import { QueuesModule } from '../../jobs/queues.module.js';

@Module({
  imports: [PrismaModule, QueuesModule],
  controllers: [
    DisciplineIncidentsController,
    DisciplineActionsController,
    MeritAwardsController,
  ],
  providers: [
    DisciplineIncidentService,
    DisciplinaryActionService,
    DetentionService,
    MeritAwardService,
    ConductProfileService,
  ],
  exports: [
    DisciplineIncidentService,
    DisciplinaryActionService,
    DetentionService,
    MeritAwardService,
    ConductProfileService,
  ],
})
export class DisciplineModule {}
