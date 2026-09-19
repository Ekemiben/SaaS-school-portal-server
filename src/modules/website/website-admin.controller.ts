import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { WebsiteService } from './website.service.js';
import {
  UpdateWebsiteConfigDto,
  CreatePublicPageDto,
  UpdatePublicPageDto,
  CreatePublicNewsDto,
  UpdatePublicNewsDto,
  CreatePublicEventDto,
  UpdatePublicEventDto,
  CreatePublicAnnouncementDto,
  UpdatePublicAnnouncementDto,
  CreateGalleryMediaDto,
  UpdateInquiryStatusDto,
} from './dto/website.dto.js';

@Controller(['admin/website', 'api/v1/admin/website'])
export class WebsiteAdminController {
  constructor(private readonly websiteService: WebsiteService) {}

  private getTenantId(req: any): string {
    const user = req.user;
    const tenantId = user?.tenantId || req.tenantId || req.tenantContext?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant context is required to access website administration');
    }
    return tenantId;
  }

  // --- Website Configuration ---
  @Get('config')
  async getConfig(@Req() req: any) {
    const tenantId = this.getTenantId(req);
    return this.websiteService.getAdminConfig(tenantId);
  }

  @Put('config')
  async updateConfig(@Req() req: any, @Body() dto: UpdateWebsiteConfigDto) {
    const tenantId = this.getTenantId(req);
    return this.websiteService.updateAdminConfig(tenantId, dto);
  }

  // --- Pages ---
  @Get('pages')
  async getPages(@Req() req: any) {
    const tenantId = this.getTenantId(req);
    return this.websiteService.getAdminPages(tenantId);
  }

  @Post('pages')
  async createPage(@Req() req: any, @Body() dto: CreatePublicPageDto) {
    const tenantId = this.getTenantId(req);
    return this.websiteService.createAdminPage(tenantId, dto);
  }

  @Patch('pages/:id')
  async updatePage(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdatePublicPageDto,
  ) {
    const tenantId = this.getTenantId(req);
    return this.websiteService.updateAdminPage(tenantId, id, dto);
  }

  @Delete('pages/:id')
  async deletePage(@Req() req: any, @Param('id') id: string) {
    const tenantId = this.getTenantId(req);
    return this.websiteService.deleteAdminPage(tenantId, id);
  }

  // --- News ---
  @Get('news')
  async getNews(@Req() req: any) {
    const tenantId = this.getTenantId(req);
    return this.websiteService.getAdminNews(tenantId);
  }

  @Post('news')
  async createNews(@Req() req: any, @Body() dto: CreatePublicNewsDto) {
    const tenantId = this.getTenantId(req);
    return this.websiteService.createAdminNews(tenantId, dto);
  }

  @Patch('news/:id')
  async updateNews(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdatePublicNewsDto,
  ) {
    const tenantId = this.getTenantId(req);
    return this.websiteService.updateAdminNews(tenantId, id, dto);
  }

  @Delete('news/:id')
  async deleteNews(@Req() req: any, @Param('id') id: string) {
    const tenantId = this.getTenantId(req);
    return this.websiteService.deleteAdminNews(tenantId, id);
  }

  // --- Events ---
  @Get('events')
  async getEvents(@Req() req: any) {
    const tenantId = this.getTenantId(req);
    return this.websiteService.getAdminEvents(tenantId);
  }

  @Post('events')
  async createEvent(@Req() req: any, @Body() dto: CreatePublicEventDto) {
    const tenantId = this.getTenantId(req);
    return this.websiteService.createAdminEvent(tenantId, dto);
  }

  @Patch('events/:id')
  async updateEvent(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdatePublicEventDto,
  ) {
    const tenantId = this.getTenantId(req);
    return this.websiteService.updateAdminEvent(tenantId, id, dto);
  }

  @Delete('events/:id')
  async deleteEvent(@Req() req: any, @Param('id') id: string) {
    const tenantId = this.getTenantId(req);
    return this.websiteService.deleteAdminEvent(tenantId, id);
  }

  // --- Announcements ---
  @Get('announcements')
  async getAnnouncements(@Req() req: any) {
    const tenantId = this.getTenantId(req);
    return this.websiteService.getAdminAnnouncements(tenantId);
  }

  @Post('announcements')
  async createAnnouncement(@Req() req: any, @Body() dto: CreatePublicAnnouncementDto) {
    const tenantId = this.getTenantId(req);
    return this.websiteService.createAdminAnnouncement(tenantId, dto);
  }

  @Patch('announcements/:id')
  async updateAnnouncement(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdatePublicAnnouncementDto,
  ) {
    const tenantId = this.getTenantId(req);
    return this.websiteService.updateAdminAnnouncement(tenantId, id, dto);
  }

  @Delete('announcements/:id')
  async deleteAnnouncement(@Req() req: any, @Param('id') id: string) {
    const tenantId = this.getTenantId(req);
    return this.websiteService.deleteAdminAnnouncement(tenantId, id);
  }

  // --- Gallery ---
  @Get('gallery')
  async getGallery(@Req() req: any) {
    const tenantId = this.getTenantId(req);
    return this.websiteService.getAdminGallery(tenantId);
  }

  @Post('gallery')
  async createGallery(@Req() req: any, @Body() dto: CreateGalleryMediaDto) {
    const tenantId = this.getTenantId(req);
    return this.websiteService.createAdminGallery(tenantId, dto);
  }

  @Delete('gallery/:id')
  async deleteGallery(@Req() req: any, @Param('id') id: string) {
    const tenantId = this.getTenantId(req);
    return this.websiteService.deleteAdminGallery(tenantId, id);
  }

  // --- Inquiries ---
  @Get('inquiries')
  async getInquiries(@Req() req: any) {
    const tenantId = this.getTenantId(req);
    return this.websiteService.getAdminInquiries(tenantId);
  }

  @Patch('inquiries/:id')
  async updateInquiryStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateInquiryStatusDto,
  ) {
    const tenantId = this.getTenantId(req);
    return this.websiteService.updateAdminInquiryStatus(tenantId, id, dto);
  }
}
