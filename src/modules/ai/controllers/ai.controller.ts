import {
  Controller,
  Post,
  Body,
  Req,
  Query,
} from '@nestjs/common';
import { Permissions } from '../../../common/decorators/permissions.decorator.js';
import { AiService } from '../services/ai.service.js';
import { AiPromptDto, AiSummarizeDto } from '../dto/ai-request.dto.js';

@Controller('api/v1/ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('assistant')
  @Permissions('academics.view')
  async promptAssistant(
    @Req() req: any,
    @Body() dto: AiPromptDto,
    @Query('provider') provider?: string,
  ) {
    const tenantId = req.tenantContext?.tenantId || req.tenantId || req.user?.tenantId;
    const userId = req.user?.id || req.user?.sub;
    return this.aiService.generateCompletion(tenantId, userId, dto, provider);
  }

  @Post('summarize')
  @Permissions('reports.view')
  async summarizeText(
    @Req() req: any,
    @Body() dto: AiSummarizeDto,
    @Query('provider') provider?: string,
  ) {
    const tenantId = req.tenantContext?.tenantId || req.tenantId || req.user?.tenantId;
    const userId = req.user?.id || req.user?.sub;
    return this.aiService.summarizeReport(tenantId, userId, dto, provider);
  }
}
